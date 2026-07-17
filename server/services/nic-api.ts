/**
 * NIC GST API client — E-invoice (IRN) + E-way Bill
 *
 * Modes:
 *   mock       → instant fake IRNs, no network (dev/demo only)
 *   sandbox    → NIC sandbox — requires GSTN_SANDBOX_PUBLIC_KEY PEM + tenant creds
 *   production → live IRP — requires GSTN_PRODUCTION_PUBLIC_KEY PEM + tenant creds
 *
 * Live crypto: RSA/PKCS1 for AppKey; AES-256-ECB for payloads (NIC FAQ).
 * Mock never needs network keys.
 */

import crypto from 'crypto';
import { decryptSecret } from '../utils/secret-crypto';
import { isValidGstin } from '../utils/helpers';
import { logger } from '../utils/logger';

const SLOW_EXTERNAL_MS = Number(process.env.SLOW_EXTERNAL_MS || 3000);

/** Outbound HTTP with duration / status logging. Never logs credentials or bodies. */
async function loggedFetch(url: string, init: RequestInit & { signal?: AbortSignal }, op: string): Promise<Response> {
  const started = Date.now();
  const method = (init.method || 'GET').toUpperCase();
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    logger.error('External API request failed', {
      op,
      method,
      url,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
  const durationMs = Date.now() - started;
  const ctx = { op, method, url, statusCode: res.status, durationMs };
  if (!res.ok) {
    logger.error('External API error response', ctx);
  } else if (durationMs >= SLOW_EXTERNAL_MS) {
    logger.warn('Slow external API request', { ...ctx, thresholdMs: SLOW_EXTERNAL_MS });
  } else {
    logger.info('External API request', ctx);
  }
  return res;
}

export type GstApiMode = 'mock' | 'sandbox' | 'production';

export interface GstApiCredentials {
  mode: GstApiMode;
  gstin: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export interface IrnResult {
  irn: string;
  ackNo: string;
  ackDt: string;
  qrCode: string;
  signedQrCode?: string;
  ewbNo?: string;
}

export interface EwbResult {
  ewbNo: string;
  ewbDt: string;
  ewbValidTill: string;
  qrCode?: string;
}

const SANDBOX_BASE = 'https://einv-apisandbox.nic.in';
const PRODUCTION_BASE = 'https://einvoice1.gst.gov.in';
const SANDBOX_EWB = 'https://gsp.adaequare.com/test';
const PRODUCTION_EWB = 'https://gsp.adaequare.com';

/** Load GSTN public key PEM from env. Fail closed for live modes. */
export function getGstnPublicKey(mode: GstApiMode): string {
  if (mode === 'mock') return '';
  const pem =
    (mode === 'production' ? process.env.GSTN_PRODUCTION_PUBLIC_KEY : process.env.GSTN_SANDBOX_PUBLIC_KEY) ||
    process.env.GSTN_PUBLIC_KEY ||
    '';
  if (!pem.includes('BEGIN PUBLIC KEY') && !pem.includes('BEGIN RSA PUBLIC KEY')) {
    throw new Error(
      `GST API crypto not configured for ${mode}. Set ${mode === 'production' ? 'GSTN_PRODUCTION_PUBLIC_KEY' : 'GSTN_SANDBOX_PUBLIC_KEY'} (PEM from NIC portal), or use mode=mock.`,
    );
  }
  try {
    crypto.createPublicKey(pem);
  } catch {
    throw new Error(`Invalid GSTN public key PEM for ${mode}. Download a fresh key from the NIC portal.`);
  }
  return pem;
}

/** AES-256-ECB (NIC: AES/ECB/PKCS5Padding). No IV. */
function aesEncrypt(data: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('GST API AES key must be 32 bytes (base64)');
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  return Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt(encData: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('GST API AES key must be 32 bytes (base64)');
  const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(Buffer.from(encData, 'base64')), decipher.final()]).toString('utf8');
}

export function isValidPin(pin: string | undefined | null): boolean {
  return /^\d{6}$/.test(String(pin || '').trim());
}

/** B2B if buyer has valid GSTIN; else B2C. */
export function resolveSupplyType(buyerGstin: string | undefined): 'B2B' | 'B2C' {
  return buyerGstin && isValidGstin(buyerGstin) ? 'B2B' : 'B2C';
}

export function buildIrnPayload(opts: {
  sellerGstin: string;
  sellerName: string;
  sellerAddr: string;
  sellerPin: string;
  buyerGstin?: string;
  buyerName: string;
  buyerAddr: string;
  buyerPin: string;
  invoiceNo: string;
  invoiceDate: string;
  items: {
    hsnCode: string;
    productName: string;
    qty: number;
    unitPrice: number;
    gstRate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  supplyType?: string;
  docType?: string;
}) {
  const buyerGst = opts.buyerGstin && isValidGstin(opts.buyerGstin) ? opts.buyerGstin : 'URP';
  const supply = opts.supplyType || resolveSupplyType(opts.buyerGstin);
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: supply, RegRev: 'N', EcmGstin: null, IgstOnIntra: 'N' },
    DocDtls: { Typ: opts.docType || 'INV', No: opts.invoiceNo, Dt: opts.invoiceDate },
    SellerDtls: {
      Gstin: opts.sellerGstin,
      LglNm: opts.sellerName,
      Addr1: opts.sellerAddr.substring(0, 100),
      Loc: opts.sellerAddr.substring(0, 50),
      Pin: Number(opts.sellerPin),
      Stcd: opts.sellerGstin.substring(0, 2),
    },
    BuyerDtls: {
      Gstin: buyerGst,
      LglNm: opts.buyerName,
      Pos: (buyerGst !== 'URP' ? buyerGst : opts.sellerGstin).substring(0, 2),
      Addr1: opts.buyerAddr.substring(0, 100),
      Loc: opts.buyerAddr.substring(0, 50),
      Pin: Number(opts.buyerPin),
      Stcd: (buyerGst !== 'URP' ? buyerGst : opts.sellerGstin).substring(0, 2),
    },
    ItemList: opts.items.map((it, i) => ({
      SlNo: String(i + 1),
      PrdDesc: it.productName.substring(0, 300),
      IsServc: 'N',
      HsnCd: it.hsnCode || '9999',
      Qty: it.qty,
      Unit: 'NOS',
      UnitPrice: it.unitPrice,
      TotAmt: it.taxable,
      Discount: 0,
      AssAmt: it.taxable,
      GstRt: it.gstRate,
      IgstAmt: it.igst,
      CgstAmt: it.cgst,
      SgstAmt: it.sgst,
      TotItemVal: it.total,
    })),
    ValDtls: {
      AssVal: opts.totalTaxable,
      CgstVal: opts.totalCgst,
      SgstVal: opts.totalSgst,
      IgstVal: opts.totalIgst,
      TotInvVal: opts.grandTotal,
      RndOffAmt: 0,
    },
  };
}

export function buildEwbPayload(opts: {
  supplyType: string;
  subSupplyType: string;
  docType: string;
  docNo: string;
  docDate: string;
  sellerGstin: string;
  sellerName: string;
  sellerAddr: string;
  sellerPin: string;
  buyerGstin: string;
  buyerName: string;
  buyerAddr: string;
  buyerPin: string;
  items: {
    productName: string;
    hsnCode: string;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  vehicleNo: string;
  vehicleType?: string;
  transportMode?: string;
  transporterId?: string;
  transporterName?: string;
  distance: number;
}) {
  const sellerPin = Number(opts.sellerPin);
  const buyerPin = Number(opts.buyerPin);
  return {
    supplyType: opts.supplyType,
    subSupplyType: opts.subSupplyType,
    docType: opts.docType,
    docNo: opts.docNo,
    docDate: opts.docDate,
    fromGstin: opts.sellerGstin,
    fromTrdName: opts.sellerName,
    fromAddr1: opts.sellerAddr,
    fromPlace: opts.sellerAddr,
    fromPincode: sellerPin,
    fromStateCode: Number(opts.sellerGstin.substring(0, 2)) || 24,
    actFromStateCode: Number(opts.sellerGstin.substring(0, 2)) || 24,
    toGstin: opts.buyerGstin || 'URP',
    toTrdName: opts.buyerName,
    toAddr1: opts.buyerAddr,
    toPlace: opts.buyerAddr,
    toPincode: buyerPin,
    toStateCode: Number((opts.buyerGstin || opts.sellerGstin).substring(0, 2)) || 24,
    actToStateCode: Number((opts.buyerGstin || opts.sellerGstin).substring(0, 2)) || 24,
    totalValue: opts.grandTotal,
    cgstValue: opts.totalCgst,
    sgstValue: opts.totalSgst,
    igstValue: opts.totalIgst,
    cessValue: 0,
    transporterId: opts.transporterId || '',
    transporterName: opts.transporterName || '',
    transDocNo: '',
    transDocDate: '',
    transMode: opts.transportMode || '1',
    distance: opts.distance,
    vehicleNo: opts.vehicleNo,
    vehicleType: opts.vehicleType || 'R',
    itemList: opts.items.map((it, i) => ({
      itemNo: i + 1,
      productName: it.productName.substring(0, 300),
      productDesc: it.productName.substring(0, 300),
      hsnCode: it.hsnCode || '9999',
      quantity: it.qty,
      qtyUnit: 'NOS',
      taxableAmount: it.taxable,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
    })),
  };
}

export class NicApiClient {
  constructor(private creds: GstApiCredentials) {}

  private get baseUrl() {
    return this.creds.mode === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
  }

  private mockIrn(invoiceNo: string): IrnResult {
    const irn = crypto.createHash('sha256').update(`${this.creds.gstin}${invoiceNo}${Date.now()}`).digest('hex');
    const ackNo = String(Date.now()).substring(0, 13);
    const ackDt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const qrPayload = `${this.creds.gstin}|URP|${invoiceNo}|${new Date().toISOString().slice(0, 10)}|INV|0|${irn}|${ackNo}|${ackDt}`;
    return { irn, ackNo, ackDt, qrCode: Buffer.from(qrPayload).toString('base64'), signedQrCode: qrPayload };
  }

  private mockEwb(_docNo: string): EwbResult {
    const ewbNo = String(Math.floor(100000000000 + Math.random() * 900000000000));
    return {
      ewbNo,
      ewbDt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ewbValidTill: new Date(Date.now() + 24 * 3600 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };
  }

  private async authenticate(): Promise<{ authToken: string; sek: string }> {
    const pubKey = getGstnPublicKey(this.creds.mode);
    const url = `${this.baseUrl}/eivital/dec/v1.03/user/auth`;
    // NIC: 32-byte AppKey, RSA/PKCS1 (not OAEP)
    const appKeyRaw = crypto.randomBytes(32);
    const appKey = appKeyRaw.toString('base64');
    const encAppKey = crypto
      .publicEncrypt({ key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING }, appKeyRaw)
      .toString('base64');
    const encPassword = aesEncrypt(this.creds.password, appKey);
    const body = { action: 'ACCESSTOKEN', username: this.creds.username, password: encPassword, appkey: encAppKey };
    const res = await loggedFetch(
      url,
      {
        method: 'POST',
        headers: {
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
          'Content-Type': 'application/json',
          Gstin: this.creds.gstin,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
      'nic.auth',
    );
    if (!res.ok) throw new Error(`NIC auth failed: ${res.status}`);
    const data = (await res.json()) as { Status: number; Data?: string };
    if (data.Status !== 1 || !data.Data) throw new Error('NIC auth error');
    let authToken: string;
    let sekB64: string;
    try {
      const decrypted = JSON.parse(aesDecrypt(data.Data, appKey)) as { AuthToken?: string; Sek?: string };
      authToken = decrypted.AuthToken || '';
      sekB64 = decrypted.Sek || '';
    } catch {
      throw new Error('NIC auth: could not decrypt session key');
    }
    if (!authToken || !sekB64) throw new Error('NIC auth: missing token or SEK');
    return { authToken, sek: sekB64 };
  }

  async generateIrn(payload: ReturnType<typeof buildIrnPayload>): Promise<IrnResult> {
    if (this.creds.mode === 'mock') return this.mockIrn(payload.DocDtls.No);
    getGstnPublicKey(this.creds.mode); // fail closed early

    const { authToken, sek } = await this.authenticate();
    const encPayload = aesEncrypt(JSON.stringify(payload), sek);
    const url = `${this.baseUrl}/eicore/v1.03/Invoice`;
    const res = await loggedFetch(
      url,
      {
        method: 'POST',
        headers: {
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
          user_name: this.creds.username,
          authtoken: authToken,
          Gstin: this.creds.gstin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Data: encPayload }),
        signal: AbortSignal.timeout(20000),
      },
      'nic.generateIrn',
    );
    if (!res.ok) throw new Error(`IRN generation failed: ${res.status}`);
    const data = (await res.json()) as { Status: number; Data?: string };
    if (data.Status !== 1 || !data.Data) throw new Error('IRN generation rejected by GST portal');
    const result = JSON.parse(aesDecrypt(data.Data, sek));
    return {
      irn: result.Irn,
      ackNo: result.AckNo,
      ackDt: result.AckDt,
      qrCode: result.QRCode || result.SignedQRCode,
      signedQrCode: result.SignedQRCode,
      ewbNo: result.EwbNo,
    };
  }

  async generateEwb(payload: ReturnType<typeof buildEwbPayload>): Promise<EwbResult> {
    if (this.creds.mode === 'mock') return this.mockEwb(payload.docNo);
    getGstnPublicKey(this.creds.mode);

    const { authToken, sek } = await this.authenticate();
    const encPayload = aesEncrypt(JSON.stringify(payload), sek);
    const baseEwb = this.creds.mode === 'production' ? PRODUCTION_EWB : SANDBOX_EWB;
    const res = await loggedFetch(
      `${baseEwb}/ewb/apip/ewbgenerate`,
      {
        method: 'POST',
        headers: {
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
          user_name: this.creds.username,
          authtoken: authToken,
          Gstin: this.creds.gstin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'GENEWAYBILL', Data: encPayload }),
        signal: AbortSignal.timeout(20000),
      },
      'nic.generateEwb',
    );
    if (!res.ok) throw new Error(`EWB generation failed: ${res.status}`);
    const data = (await res.json()) as { Status: number; Data?: string };
    if (data.Status !== 1 || !data.Data) throw new Error('EWB generation rejected by GST portal');
    const result = JSON.parse(aesDecrypt(data.Data, sek));
    return { ewbNo: String(result.ewayBillNo), ewbDt: result.ewayBillDate, ewbValidTill: result.validUpto };
  }

  async cancelIrn(irn: string, cancelReason: 1 | 2 | 3 | 4, cancelRemark: string): Promise<void> {
    if (this.creds.mode === 'mock') return;
    getGstnPublicKey(this.creds.mode);
    const { authToken, sek } = await this.authenticate();
    const encPayload = aesEncrypt(JSON.stringify({ Irn: irn, CnlRsn: cancelReason, CnlRem: cancelRemark }), sek);
    const res = await loggedFetch(
      `${this.baseUrl}/eicore/v1.03/Invoice/Cancel`,
      {
        method: 'POST',
        headers: {
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
          user_name: this.creds.username,
          authtoken: authToken,
          Gstin: this.creds.gstin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Data: encPayload }),
        signal: AbortSignal.timeout(15000),
      },
      'nic.cancelIrn',
    );
    if (!res.ok) throw new Error(`Cancel IRN failed: ${res.status}`);
  }
}

/**
 * Resolve tenant GST API credentials.
 * - mock: always allowed (no client_id required) — explicit mode only
 * - sandbox/production: require client_id + username + password
 */
export async function loadGstCredentials(
  pool: import('pg').Pool,
  tenantId: string,
): Promise<{ ok: true; creds: GstApiCredentials } | { ok: false; error: string }> {
  const row = (
    await pool.query(
      'SELECT gst_api_mode, gst_api_gstin, gst_api_username, gst_api_password, gst_api_client_id, gst_api_client_secret, gst_api_seller_pin FROM bill_settings WHERE tenant_id = $1',
      [tenantId],
    )
  ).rows[0] as Record<string, string> | undefined;

  const mode = (row?.gst_api_mode as GstApiMode) || 'mock';
  if (mode === 'mock') {
    return {
      ok: true,
      creds: {
        mode: 'mock',
        gstin: row?.gst_api_gstin || '',
        username: '',
        password: '',
        clientId: 'mock',
        clientSecret: '',
      },
    };
  }

  if (!row?.gst_api_client_id || !row?.gst_api_username) {
    return {
      ok: false,
      error: 'GST API not configured. Go to Settings → GST API (sandbox/production need credentials).',
    };
  }
  try {
    getGstnPublicKey(mode);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  return {
    ok: true,
    creds: {
      mode,
      gstin: row.gst_api_gstin || '',
      username: row.gst_api_username || '',
      password: decryptSecret(row.gst_api_password || ''),
      clientId: row.gst_api_client_id || '',
      clientSecret: decryptSecret(row.gst_api_client_secret || ''),
    },
  };
}

export async function loadSellerPin(pool: import('pg').Pool, tenantId: string): Promise<string> {
  const row = (await pool.query('SELECT gst_api_seller_pin FROM bill_settings WHERE tenant_id = $1', [tenantId]))
    .rows[0] as { gst_api_seller_pin?: string } | undefined;
  return row?.gst_api_seller_pin || '';
}
