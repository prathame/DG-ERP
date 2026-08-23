/** Parsed fields from government e-invoice / e-way portal response JSON (bulk upload download). */

export type ParsedPortalResponse = {
  irn?: string;
  ackNo?: string;
  ackDt?: string;
  irnQr?: string;
  ewbNumber?: string;
  status?: string;
  docNo?: string;
};

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const want of keys) {
    const w = want.toLowerCase();
    for (const [key, val] of Object.entries(obj)) {
      if (key.toLowerCase() !== w) continue;
      if (val == null || val === '') continue;
      return String(val).trim();
    }
  }
  return '';
}

function docNoFromRecord(r: Record<string, unknown>): string {
  const doc = r.DocDtls;
  if (doc && typeof doc === 'object') {
    const no = pickStr(doc as Record<string, unknown>, 'No', 'no');
    if (no) return no;
  }
  return pickStr(r, 'DocNo', 'docNo', 'InvoiceNo', 'invoiceNo');
}

function parseOneRecord(r: Record<string, unknown>): ParsedPortalResponse | null {
  const irn = pickStr(r, 'Irn', 'irn', 'IRN');
  const irnQr = pickStr(r, 'SignedQRCode', 'SignedQrCode', 'signedQRCode', 'QRCode', 'qrCode');
  const ewbRaw = pickStr(r, 'EwbNo', 'ewbNo', 'EWBNo', 'ewayBillNo', 'EwayBillNo', 'ewbNumber');
  const ackNo = pickStr(r, 'AckNo', 'ackNo', 'ACKNo');
  const ackDt = pickStr(r, 'AckDt', 'ackDt', 'ACKDt');
  const status = pickStr(r, 'Status', 'status');
  if (!irn && !ewbRaw) return null;
  return {
    irn: irn || undefined,
    ackNo: ackNo || undefined,
    ackDt: ackDt || undefined,
    irnQr: irnQr || undefined,
    ewbNumber: ewbRaw || undefined,
    status: status || undefined,
    docNo: docNoFromRecord(r) || undefined,
  };
}

function flattenRecords(raw: unknown, depth = 0): Record<string, unknown>[] {
  if (!raw || depth > 6) return [];
  if (Array.isArray(raw)) return raw.flatMap(item => flattenRecords(item, depth + 1));
  if (typeof raw !== 'object') return [];

  const o = raw as Record<string, unknown>;
  const nestedKeys = [
    'Success',
    'success',
    'Data',
    'data',
    'Invoice',
    'invoice',
    'invoices',
    'Invoices',
    'Response',
    'response',
    'Result',
    'result',
    'Einvoice',
    'einvoice',
  ];
  for (const key of nestedKeys) {
    const val = o[key];
    if (val != null) {
      const inner = flattenRecords(val, depth + 1);
      if (inner.length) return inner;
    }
  }

  if (parseOneRecord(o)) return [o];
  return [];
}

/**
 * Parse portal response JSON (single invoice or bulk upload result file).
 * When matchDocNo is set, picks the entry whose document number matches.
 */
export function parsePortalResponseJson(raw: unknown, matchDocNo?: string): ParsedPortalResponse {
  const records = flattenRecords(raw);
  if (!records.length) {
    throw new Error('No IRN or E-Way Bill found in response JSON — use the file downloaded from the government portal');
  }

  const normalizedDoc = matchDocNo?.trim().toLowerCase();
  let chosen: ParsedPortalResponse | null = null;

  for (const rec of records) {
    const parsed = parseOneRecord(rec);
    if (!parsed) continue;
    if (normalizedDoc && parsed.docNo && parsed.docNo.toLowerCase() !== normalizedDoc) continue;
    chosen = parsed;
    break;
  }

  if (!chosen && normalizedDoc) {
    for (const rec of records) {
      const parsed = parseOneRecord(rec);
      if (parsed) {
        chosen = parsed;
        break;
      }
    }
  }

  if (!chosen) {
    throw new Error('No IRN or E-Way Bill found in response JSON');
  }

  if (chosen.status?.toUpperCase() === 'CNL') {
    throw new Error('Portal response shows this IRN as cancelled (CNL)');
  }

  if (!chosen.irn && !chosen.ewbNumber) {
    throw new Error('Response JSON has no IRN or E-Way Bill number');
  }

  return chosen;
}
