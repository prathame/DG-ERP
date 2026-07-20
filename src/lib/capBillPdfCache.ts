/**
 * Cap: bake bill PDF on Invoice/Quotation Save under Documents/Dhandho/invoices/.
 * WhatsApp reuses the file when contentKey matches; bake failure never fails Save.
 * Rebuild/overwrite on next successful save (same id, new contentKey).
 */

import { api } from '../api';
import { invoiceHasGst } from './billSettingsFlags';
import { dhandhoRelativePath, isNativeCapacitor, saveDhandhoFile } from './dhandhoFiles';
import { session } from './session';
import { buildStandaloneInvoicePdfBlob, type StandaloneInvoicePdfOptions } from './standaloneInvoicePdf';
import type { BillDocType, StandaloneInvoicePrint } from './billTemplates';

export type CapBillPdfCacheDoc = StandaloneInvoicePrint & {
  id: string;
  grandTotal?: number;
};

type CacheMeta = { contentKey: string; invoiceNumber?: string; bakedAt: string };

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function billSettingsFingerprint(bs: Record<string, unknown>): string {
  const logo = typeof bs.logoBase64 === 'string' ? bs.logoBase64.length : 0;
  const sig = typeof bs.signatureBase64 === 'string' ? bs.signatureBase64.length : 0;
  return [
    bs.primaryColor,
    bs.footerText,
    bs.tagline,
    bs.termsAndConditions,
    bs.invoicePrefix,
    bs.signatoryName,
    bs.signatoryDesignation,
    bs.bankAccountName,
    bs.bankAccountNumber,
    bs.bankName,
    bs.bankBranch,
    bs.bankIfsc,
    bs.bankUpiId,
    `L${logo}`,
    `S${sig}`,
  ].join('|');
}

/** Fingerprint of PDF-relevant invoice/quote fields (+ template). Stale if any change. */
export function billPdfContentKey(
  inv: StandaloneInvoicePrint & { id?: string },
  docType: BillDocType = 'invoice',
  billSettings: Record<string, unknown> = {},
): string {
  const lines = (inv.items || [])
    .map(it => `${it.description}|${it.qty}|${it.rate}|${it.gstPercent}|${it.discountPercent || 0}|${it.total}`)
    .join(';');
  const raw = [
    docType,
    inv.id || '',
    inv.invoiceNumber,
    inv.invoiceDate,
    inv.dueDate || '',
    inv.customerName,
    inv.customerPhone || '',
    inv.customerAddress || '',
    inv.customerGstin || '',
    inv.status,
    inv.subtotal,
    inv.taxTotal,
    inv.grandTotal,
    inv.paidAmount ?? '',
    inv.advanceApplied ?? '',
    inv.outstanding ?? '',
    inv.gstEnabled === true ? '1' : '0',
    lines,
    billSettingsFingerprint(billSettings),
  ].join('\0');
  return fnv1a(raw);
}

function cacheBasenames(docType: BillDocType, id: string): { pdf: string; meta: string } {
  const stem = `${docType}-${id}`;
  return { pdf: `${stem}.pdf`, meta: `${stem}.meta.json` };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readDhandhoUtf8(filename: string): Promise<string | null> {
  if (!isNativeCapacitor()) return null;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const path = dhandhoRelativePath('invoices', filename);
    const res = await Filesystem.readFile({ path, directory: Directory.Documents, encoding: Encoding.UTF8 });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

async function readDhandhoPdfBase64(filename: string): Promise<string | null> {
  if (!isNativeCapacitor()) return null;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const path = dhandhoRelativePath('invoices', filename);
    const res = await Filesystem.readFile({ path, directory: Directory.Documents });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Build + write PDF (+ meta) under Documents/Dhandho/invoices/.
 * No-op off Cap. Throws only on build/write errors (callers should catch).
 */
export async function bakeCapBillPdfCache(
  inv: CapBillPdfCacheDoc,
  options?: StandaloneInvoicePdfOptions,
): Promise<{ path: string; contentKey: string } | null> {
  if (!isNativeCapacitor() || !inv.id) return null;

  const docType = options?.docType || 'invoice';
  const billSettings =
    options?.billSettings ||
    ((await api.settings.getBillSettings().catch(() => ({}))) as Record<string, unknown>) ||
    {};
  const contentKey = billPdfContentKey(inv, docType, billSettings);
  const names = cacheBasenames(docType, inv.id);

  const user = (session.getUser() || {}) as {
    companyName?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
  };

  const blob = await buildStandaloneInvoicePdfBlob(
    inv,
    {
      companyName: user.companyName,
      address: user.address,
      phone: user.phone,
      email: user.email,
      gstNumber: user.gstNumber,
    },
    {
      hasGst: options?.hasGst ?? invoiceHasGst(inv),
      billSettings,
      docType,
    },
  );

  const base64 = await blobToBase64(blob);
  const saved = await saveDhandhoFile({
    subdir: 'invoices',
    filename: names.pdf,
    data: base64,
    encoding: 'base64',
  });

  const meta: CacheMeta = {
    contentKey,
    invoiceNumber: inv.invoiceNumber,
    bakedAt: new Date().toISOString(),
  };
  await saveDhandhoFile({
    subdir: 'invoices',
    filename: names.meta,
    data: JSON.stringify(meta),
    encoding: 'utf8',
  }).catch(() => {
    /* PDF alone is enough; share will rebuild if meta missing */
  });

  return { path: saved.relativePath, contentKey };
}

/** Fire-and-forget bake after Save — never rejects (Save UI must stay reliable). */
export function scheduleBakeCapBillPdfCache(inv: CapBillPdfCacheDoc, options?: StandaloneInvoicePdfOptions): void {
  if (!isNativeCapacitor() || !inv?.id) return;
  void bakeCapBillPdfCache(inv, options).catch(() => {
    /* bake is best-effort */
  });
}

/** Return cached PDF blob when meta contentKey matches; else null (caller builds). */
export async function loadFreshCapBillPdfCache(
  inv: CapBillPdfCacheDoc,
  options?: StandaloneInvoicePdfOptions,
): Promise<Blob | null> {
  if (!isNativeCapacitor() || !inv.id) return null;

  const docType = options?.docType || 'invoice';
  const billSettings =
    options?.billSettings ||
    ((await api.settings.getBillSettings().catch(() => ({}))) as Record<string, unknown>) ||
    {};
  const wantKey = billPdfContentKey(inv, docType, billSettings);
  const names = cacheBasenames(docType, inv.id);

  const metaRaw = await readDhandhoUtf8(names.meta);
  if (!metaRaw) return null;
  let meta: CacheMeta;
  try {
    meta = JSON.parse(metaRaw) as CacheMeta;
  } catch {
    return null;
  }
  if (!meta?.contentKey || meta.contentKey !== wantKey) return null;

  const pdfB64 = await readDhandhoPdfBase64(names.pdf);
  if (!pdfB64) return null;
  const blob = base64ToBlob(pdfB64, 'application/pdf');
  if (blob.size < 100) return null;
  return blob;
}
