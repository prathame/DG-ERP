/**
 * NIC GST API client — E-invoice (IRN) + E-way Bill
 *
 * Modes:
 *   mock       → instant fake IRNs, no network (default for dev)
 *   sandbox    → NIC sandbox (einv-apisandbox.nic.in) with test credentials
 *   production → live IRP (einvoice1.gst.gov.in)
 *
 * Each tenant stores their own credentials in bill_settings.gst_api_*.
 * The IRN flow: authenticate → get SEK → encrypt payload → POST → decrypt response.
 */

import crypto from 'crypto';
import { decryptSecret } from '../utils/secret-crypto';

export type GstApiMode = 'mock' | 'sandbox' | 'production';

export interface GstApiCredentials {
  mode: GstApiMode;
  gstin: string;          // seller GSTIN
  username: string;       // NIC portal username
  password: string;       // NIC portal password (stored encrypted in DB)
  clientId: string;       // from NIC sandbox/production registration
  clientSecret: string;
}

export interface IrnResult {
  irn: string;
  ackNo: string;
  ackDt: string;
  qrCode: string;         // base64 QR image or raw QR string
  signedQrCode?: string;
  ewbNo?: string;         // if EWB auto-generated (for consignment value > 50K)
}

export interface EwbResult {
  ewbNo: string;
  ewbDt: string;
  ewbValidTill: string;
  qrCode?: string;
}

// ── Sandbox / Production base URLs ───────────────────────────────────────────
const SANDBOX_BASE    = 'https://einv-apisandbox.nic.in';
const PRODUCTION_BASE = 'https://einvoice1.gst.gov.in';
const SANDBOX_EWB     = 'https://gsp.adaequare.com/test';
const PRODUCTION_EWB  = 'https://gsp.adaequare.com';

// ── GSTN public key for RSA encryption (sandbox) ─────────────────────────────
// Download production key from: https://einvoice1.gst.gov.in/Others/PublicKey
// Sandbox key is public and hardcoded here for convenience
const SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5PmB5BAoRIOZt3X5Mg
Cv/3PLQR7Q9nVCYN3ZS4y8yblbXJ7GsDl+kQN58xR+Ux4uI3AjD8rYyZoNFM
bN5ik5sxpIBhyuGq5h0zNHBo4rFbFbMPloxLQHq7xLIAP0/+K4HPP9AAAAAAA
AQAB
-----END PUBLIC KEY-----`;

// ── AES helpers ───────────────────────────────────────────────────────────────
function aesEncrypt(data: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const iv  = Buffer.from(keyBase64.substring(0, 16));  // NIC uses first 16 chars of SEK as IV
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  return Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt(encData: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(Buffer.from(encData, 'base64')), decipher.final()]).toString('utf8');
}

// ── IRN payload builder (GSTN schema 1.1) ────────────────────────────────────
export function buildIrnPayload(opts: {
  sellerGstin: string; sellerName: string; sellerAddr: string;
  buyerGstin?: string; buyerName: string; buyerAddr: string;
  invoiceNo: string; invoiceDate: string;  // DD/MM/YYYY
  items: { hsnCode: string; productName: string; qty: number; unitPrice: number; gstRate: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }[];
  totalTaxable: number; totalCgst: number; totalSgst: number; totalIgst: number; grandTotal: number;
  supplyType?: string; docType?: string;
}) {
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: opts.supplyType || 'B2B', RegRev: 'N', EcmGstin: null, IgstOnIntra: 'N' },
    DocDtls: { Typ: opts.docType || 'INV', No: opts.invoiceNo, Dt: opts.invoiceDate },
    SellerDtls: { Gstin: opts.sellerGstin, LglNm: opts.sellerName, Addr1: opts.sellerAddr.substring(0, 100), Loc: opts.sellerAddr.substring(0, 50), Pin: '380001', Stcd: opts.sellerGstin.substring(0, 2) },
    BuyerDtls: { Gstin: opts.buyerGstin || 'URP', LglNm: opts.buyerName, Pos: opts.buyerGstin?.substring(0, 2) || opts.sellerGstin.substring(0, 2), Addr1: opts.buyerAddr.substring(0, 100), Loc: opts.buyerAddr.substring(0, 50), Pin: '380001', Stcd: opts.buyerGstin?.substring(0, 2) || opts.sellerGstin.substring(0, 2) },
    ItemList: opts.items.map((it, i) => ({
      SlNo: String(i + 1), PrdDesc: it.productName.substring(0, 300),
      IsServc: 'N', HsnCd: it.hsnCode || '9999',
      Qty: it.qty, Unit: 'NOS', UnitPrice: it.unitPrice,
      TotAmt: it.taxable, Discount: 0, AssAmt: it.taxable,
      GstRt: it.gstRate, IgstAmt: it.igst, CgstAmt: it.cgst, SgstAmt: it.sgst,
      TotItemVal: it.total,
    })),
    ValDtls: {
      AssVal: opts.totalTaxable, CgstVal: opts.totalCgst, SgstVal: opts.totalSgst,
      IgstVal: opts.totalIgst, TotInvVal: opts.grandTotal,
      RndOffAmt: 0,
    },
  };
}

// ── E-way bill payload builder ────────────────────────────────────────────────
export function buildEwbPayload(opts: {
  supplyType: string; subSupplyType: string;
  docType: string; docNo: string; docDate: string;
  sellerGstin: string; sellerName: string; sellerAddr: string; sellerPin: string;
  buyerGstin: string;  buyerName: string;  buyerAddr: string;  buyerPin: string;
  items: { productName: string; hsnCode: string; qty: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }[];
  totalTaxable: number; totalCgst: number; totalSgst: number; totalIgst: number; grandTotal: number;
  vehicleNo: string; vehicleType?: string; transportMode?: string; transporterId?: string; transporterName?: string; distance: number;
}) {
  return {
    supplyType: opts.supplyType, subSupplyType: opts.subSupplyType,
    docType: opts.docType, docNo: opts.docNo, docDate: opts.docDate,
    fromGstin: opts.sellerGstin, fromTrdName: opts.sellerName, fromAddr1: opts.sellerAddr, fromPlace: opts.sellerAddr, fromPincode: Number(opts.sellerPin) || 380001, fromStateCode: Number(opts.sellerGstin.substring(0, 2)) || 24, actFromStateCode: Number(opts.sellerGstin.substring(0, 2)) || 24,
    toGstin: opts.buyerGstin || 'URP',   toTrdName: opts.buyerName,  toAddr1: opts.buyerAddr,  toPlace: opts.buyerAddr,  toPincode: Number(opts.buyerPin) || 380001,  toStateCode: Number((opts.buyerGstin || opts.sellerGstin).substring(0, 2)) || 24, actToStateCode: Number((opts.buyerGstin || opts.sellerGstin).substring(0, 2)) || 24,
    totalValue: opts.grandTotal, cgstValue: opts.totalCgst, sgstValue: opts.totalSgst, igstValue: opts.totalIgst, cessValue: 0,
    transporterId: opts.transporterId || '', transporterName: opts.transporterName || '', transDocNo: '', transDocDate: '',
    transMode: opts.transportMode || '1', distance: opts.distance,
    vehicleNo: opts.vehicleNo, vehicleType: opts.vehicleType || 'R',
    itemList: opts.items.map((it, i) => ({
      itemNo: i + 1, productName: it.productName.substring(0, 300), productDesc: it.productName.substring(0, 300),
      hsnCode: it.hsnCode || '9999', quantity: it.qty, qtyUnit: 'NOS',
      taxableAmount: it.taxable, cgstRate: 0, sgstRate: 0, igstRate: 0,
    })),
  };
}

// ── Main API client ───────────────────────────────────────────────────────────
export class NicApiClient {
  constructor(private creds: GstApiCredentials) {}

  private get baseUrl() {
    return this.creds.mode === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
  }

  // ── Mock mode ─────────────────────────────────────────────────────────────
  private mockIrn(invoiceNo: string): IrnResult {
    const irn = crypto.createHash('sha256')
      .update(`${this.creds.gstin}${invoiceNo}${Date.now()}`)
      .digest('hex');
    const ackNo = String(Date.now()).substring(0, 13);
    const ackDt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    // QR payload format: Seller GSTIN|Buyer GSTIN|Doc No|Doc Date|Doc Type|Total|IRN|Ack No|Ack Dt
    const qrPayload = `${this.creds.gstin}|URP|${invoiceNo}|${new Date().toISOString().slice(0,10)}|INV|0|${irn}|${ackNo}|${ackDt}`;
    return { irn, ackNo, ackDt, qrCode: Buffer.from(qrPayload).toString('base64'), signedQrCode: qrPayload };
  }

  private mockEwb(docNo: string): EwbResult {
    const ewbNo = String(Math.floor(100000000000 + Math.random() * 900000000000));
    return {
      ewbNo,
      ewbDt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ewbValidTill: new Date(Date.now() + 24 * 3600 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };
  }

  // ── Authenticate with NIC portal → returns auth token + SEK ─────────────
  private async authenticate(): Promise<{ authToken: string; sek: string }> {
    const url = `${this.baseUrl}/eivital/dec/v1.03/user/auth`;
    const appKey = crypto.randomBytes(32).toString('base64');
    // Encrypt appKey with GSTN public key (RSA OAEP)
    const pubKey = SANDBOX_PUBLIC_KEY;
    const encAppKey = crypto.publicEncrypt({ key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(appKey)).toString('base64');
    const encPassword = aesEncrypt(this.creds.password, appKey);
    const body = { action: 'ACCESSTOKEN', username: this.creds.username, password: encPassword, appkey: encAppKey };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'client_id': this.creds.clientId, 'client_secret': this.creds.clientSecret, 'Content-Type': 'application/json', 'Gstin': this.creds.gstin },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`NIC auth failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { Status: number; Data?: string };
    if (data.Status !== 1 || !data.Data) throw new Error(`NIC auth error: ${JSON.stringify(data)}`);
    const decrypted = JSON.parse(aesDecrypt(data.Data, appKey));
    return { authToken: decrypted.AuthToken, sek: decrypted.Sek };
  }

  // ── Generate IRN ──────────────────────────────────────────────────────────
  async generateIrn(payload: ReturnType<typeof buildIrnPayload>): Promise<IrnResult> {
    if (this.creds.mode === 'mock') return this.mockIrn(payload.DocDtls.No);

    const { authToken, sek } = await this.authenticate();
    const encPayload = aesEncrypt(JSON.stringify(payload), sek);
    const url = `${this.baseUrl}/eicore/v1.03/Invoice`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'client_id': this.creds.clientId, 'client_secret': this.creds.clientSecret, 'user_name': this.creds.username, 'authtoken': authToken, 'Gstin': this.creds.gstin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Data: encPayload }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`IRN generation failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { Status: number; Data?: string; ErrorDetails?: unknown[] };
    if (data.Status !== 1 || !data.Data) throw new Error(`IRN error: ${JSON.stringify(data.ErrorDetails || data)}`);
    const result = JSON.parse(aesDecrypt(data.Data, sek));
    return { irn: result.Irn, ackNo: result.AckNo, ackDt: result.AckDt, qrCode: result.QRCode || result.SignedQRCode, signedQrCode: result.SignedQRCode, ewbNo: result.EwbNo };
  }

  // ── Generate E-way bill ───────────────────────────────────────────────────
  async generateEwb(payload: ReturnType<typeof buildEwbPayload>): Promise<EwbResult> {
    if (this.creds.mode === 'mock') return this.mockEwb(payload.docNo);

    const { authToken, sek } = await this.authenticate();
    const encPayload = aesEncrypt(JSON.stringify(payload), sek);
    const baseEwb = this.creds.mode === 'production' ? PRODUCTION_EWB : SANDBOX_EWB;
    const res = await fetch(`${baseEwb}/ewb/apip/ewbgenerate`, {
      method: 'POST',
      headers: { 'client_id': this.creds.clientId, 'client_secret': this.creds.clientSecret, 'user_name': this.creds.username, 'authtoken': authToken, 'Gstin': this.creds.gstin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'GENEWAYBILL', Data: encPayload }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`EWB generation failed: ${res.status}`);
    const data = await res.json() as { Status: number; Data?: string };
    if (data.Status !== 1 || !data.Data) throw new Error(`EWB error: ${JSON.stringify(data)}`);
    const result = JSON.parse(aesDecrypt(data.Data, sek));
    return { ewbNo: String(result.ewayBillNo), ewbDt: result.ewayBillDate, ewbValidTill: result.validUpto };
  }

  // ── Cancel IRN ────────────────────────────────────────────────────────────
  async cancelIrn(irn: string, cancelReason: 1 | 2 | 3 | 4, cancelRemark: string): Promise<void> {
    if (this.creds.mode === 'mock') return;
    const { authToken, sek } = await this.authenticate();
    const encPayload = aesEncrypt(JSON.stringify({ Irn: irn, CnlRsn: cancelReason, CnlRem: cancelRemark }), sek);
    const res = await fetch(`${this.baseUrl}/eicore/v1.03/Invoice/Cancel`, {
      method: 'POST',
      headers: { 'client_id': this.creds.clientId, 'client_secret': this.creds.clientSecret, 'user_name': this.creds.username, 'authtoken': authToken, 'Gstin': this.creds.gstin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Data: encPayload }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Cancel IRN failed: ${res.status}`);
  }
}

// ── Load tenant credentials from bill_settings ────────────────────────────────
export async function loadGstCredentials(pool: import('pg').Pool, tenantId: string): Promise<GstApiCredentials | null> {
  const row = (await pool.query(
    'SELECT gst_api_mode, gst_api_gstin, gst_api_username, gst_api_password, gst_api_client_id, gst_api_client_secret FROM bill_settings WHERE tenant_id = $1',
    [tenantId]
  )).rows[0] as Record<string, string> | undefined;
  if (!row?.gst_api_client_id) return null;
  return {
    mode: (row.gst_api_mode as GstApiMode) || 'mock',
    gstin: row.gst_api_gstin || '',
    username: row.gst_api_username || '',
    password: decryptSecret(row.gst_api_password || ''),
    clientId: row.gst_api_client_id || '',
    clientSecret: decryptSecret(row.gst_api_client_secret || ''),
  };
}
