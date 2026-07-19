import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { session } from './session';

/** Fetch an image URL and return a base64 data URL — ensures it's embedded inline in PDFs */
export async function fetchImageAsDataUrl(url: string, timeoutMs = 4000): Promise<string> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return url;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

const BIZ_LABELS: Record<string, string> = {
  manufacturer: 'Manufacturer',
  dealer: 'Dealer / Wholesaler',
  retail: 'Retail Shop',
  service: 'Service / Consulting',
};

/** Display label for a business type — custom shows "Custom (CompanyName)" */
export function bizTypeLabel(type: string | null | undefined, companyName?: string): string {
  if (!type) return 'Manufacturer';
  if (type === 'custom') return companyName ? `Custom (${companyName})` : 'Custom';
  return BIZ_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/** Returns the super-admin-renamed label for a tab, falling back to the provided default. */
export function useTabLabel(tabId: string, defaultLabel: string): string {
  try {
    const user = session.getUser() as Record<string, unknown> | null;
    const tabConfig = user?.tabConfig as Record<string, { label?: string }> | undefined;
    return tabConfig?.[tabId]?.label || defaultLabel;
  } catch {
    return defaultLabel;
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Prefer SignedQRCode / stored irnQr; fall back to decoding base64 mock qrCode. */
export function resolveIrnQrPayload(r: {
  qrCode?: string | null;
  signedQrCode?: string | null;
  irnQr?: string | null;
}): string {
  const candidate = r.signedQrCode || r.irnQr || r.qrCode || '';
  if (!candidate) return '';
  if (candidate.includes('|') || candidate.startsWith('eyJ')) return candidate;
  try {
    const decoded = atob(candidate);
    if (decoded.includes('|') || /^[\x20-\x7E\n\r]+$/.test(decoded)) return decoded;
  } catch {
    /* not base64 */
  }
  return candidate;
}

/** Shown when print/PDF preview could not open. */
export const PRINT_POPUP_BLOCKED = 'Could not open print preview — try again';

function isNativeCapacitor(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * Offline Mobile / Capacitor: window.open is blocked and window.print() is a no-op
 * in WebView — use in-app overlay preview + explicit Download PDF. Cloud desktop keeps classic print.
 */
function needsNativePrintPath(): boolean {
  if (isNativeCapacitor()) return true;
  try {
    return (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined) === 'service-mobile';
  } catch {
    return false;
  }
}

const PRINT_OVERLAY_ID = 'dg-print-overlay';
const PRINT_FRAME_ID = 'dg-print-frame';
const PRINT_JOB_ATTR = 'data-print-job';

function escapeHtmlLite(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safePdfFilename(filename?: string): string {
  const base = (filename || 'Document').replace(/[^\w.\- ()#]+/g, '_').slice(0, 80);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
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

/** Capacitor: write PDF to cache and open native share/save sheet (WebView download is a no-op). */
async function sharePdfNative(blob: Blob, safeName: string): Promise<boolean> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    const path = `pdfs/${safeName}`;
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({
      title: safeName,
      url: uri,
      dialogTitle: 'Save or share PDF',
    });
    return true;
  } catch (err) {
    const name = (err as { name?: string })?.name || '';
    const msg = String((err as Error)?.message || err || '');
    // User dismissed the sheet
    if (name === 'AbortError' || /cancel|dismiss|share canceled/i.test(msg)) return true;
    return false;
  }
}

/** Native print dialog for HTML bills (Capacitor). */
export async function printHtmlNative(html: string, name = 'Document'): Promise<boolean> {
  if (!isNativeCapacitor()) return false;
  try {
    const { Printer } = await import('@capgo/capacitor-printer');
    await Printer.printHtml({ name: name.replace(/\.pdf$/i, '') || 'Document', html: withPrintPagination(html) });
    return true;
  } catch {
    return false;
  }
}

async function waitForImages(root: ParentNode, timeoutMs = 3000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, timeoutMs);
        }),
    ),
  );
}

/** html2canvas blanks elements at left:-10000px — keep capture target on-screen (opacity 0). */
function createOnscreenPdfHost(): HTMLDivElement {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-pdf-capture-host', '1');
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:210mm',
    'min-height:297mm',
    'max-width:100vw',
    'padding:0',
    'margin:0',
    'background:#fff',
    'color:#111',
    'opacity:0',
    'pointer-events:none',
    'z-index:2147483001',
    'overflow:visible',
  ].join(';');
  return host;
}

async function renderElementToPdfBlob(element: HTMLElement, safeName: string): Promise<Blob | null> {
  // Force layout before capture (WebView often needs a paint)
  element.getBoundingClientRect();
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await waitForImages(element);

  const html2pdf = (await import('html2pdf.js')).default;
  const worker = html2pdf().set({
    margin: [6, 6, 6, 6],
    filename: safeName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 794,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      // Avoid 0×0 capture when parent scrolls / transforms
      onclone: (clonedDoc: Document) => {
        const cloned = clonedDoc.querySelector('[data-pdf-capture-host], body') as HTMLElement | null;
        if (cloned) {
          cloned.style.opacity = '1';
          cloned.style.transform = 'none';
          cloned.style.left = '0';
          cloned.style.top = '0';
        }
      },
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    ...({ pagebreak: { mode: ['css', 'legacy'] } } as object),
  });

  const blob = (await worker.from(element).outputPdf('blob')) as Blob;
  if (!(blob instanceof Blob) || blob.size < 500) return null;
  return blob;
}

async function deliverPdfBlob(blob: Blob, safeName: string): Promise<boolean> {
  if (isNativeCapacitor()) {
    const shared = await sharePdfNative(blob, safeName);
    if (shared) return true;
    if (typeof navigator.share === 'function' && typeof File !== 'undefined') {
      try {
        const file = new File([blob], safeName, { type: 'application/pdf' });
        const payload = { files: [file], title: safeName };
        if (!navigator.canShare || navigator.canShare(payload)) {
          await navigator.share(payload);
          return true;
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return true;
      }
    }
    return false;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/**
 * Prefer the visible print-preview iframe (same pixels the user sees).
 * Off-screen hosts often yield empty PDFs in Android WebView / html2canvas.
 */
async function pdfBlobFromOverlayFrame(safeName: string): Promise<Blob | null> {
  const frame = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null;
  const doc = frame?.contentDocument;
  const body = doc?.body;
  if (!frame || !doc || !body || body.childElementCount === 0) return null;

  const prev = {
    opacity: body.style.opacity,
    background: body.style.background,
    width: body.style.width,
    minHeight: body.style.minHeight,
  };
  try {
    body.style.opacity = '1';
    body.style.background = '#fff';
    body.style.width = '210mm';
    body.style.minHeight = '297mm';
    body.setAttribute('data-pdf-capture-host', '1');
    return await renderElementToPdfBlob(body, safeName);
  } finally {
    body.style.opacity = prev.opacity;
    body.style.background = prev.background;
    body.style.width = prev.width;
    body.style.minHeight = prev.minHeight;
    body.removeAttribute('data-pdf-capture-host');
  }
}

/**
 * Render bill/quote/invoice HTML to a PDF and download (web) or share/save (Capacitor).
 */
export async function downloadHtmlAsPdf(html: string, filename?: string): Promise<boolean> {
  const safeName = safePdfFilename(filename);

  try {
    // 1) Overlay preview already painted → capture that (fixes empty download)
    const fromPreview = await pdfBlobFromOverlayFrame(safeName);
    if (fromPreview) return deliverPdfBlob(fromPreview, safeName);

    // 2) Fallback: on-screen invisible host (never left:-10000px — blank canvas on WebView)
    const host = createOnscreenPdfHost();
    document.body.appendChild(host);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(withPrintPagination(html), 'text/html');
      // Apply body styles to the host so layout matches print (selectors target `body`)
      const bodyStyle = doc.body.getAttribute('style') || '';
      host.style.cssText += `;${bodyStyle}`;
      for (const node of Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
        host.appendChild(document.importNode(node, true));
      }
      // Rewrite body{} rules onto the capture host so typography/spacing apply
      for (const styleEl of Array.from(host.querySelectorAll('style'))) {
        const css = styleEl.textContent || '';
        if (css.includes('body')) {
          styleEl.textContent = css
            .replace(/\bhtml\s*,\s*body\b/g, '[data-pdf-capture-host]')
            .replace(/\bbody\b/g, '[data-pdf-capture-host]');
        }
      }
      while (doc.body.firstChild) {
        host.appendChild(document.importNode(doc.body.firstChild, true));
      }
      const blob = await renderElementToPdfBlob(host, safeName);
      if (!blob) return false;
      return deliverPdfBlob(blob, safeName);
    } finally {
      try {
        host.remove();
      } catch {
        /* ignore */
      }
    }
  } catch {
    return false;
  }
}

/** Close the in-app PDF overlay (Capacitor / popup-blocked fallback). */
export function closePrintOverlay(): void {
  try {
    document.getElementById(PRINT_OVERLAY_ID)?.remove();
  } catch {
    /* ignore */
  }
}

function readOverlayPrintHtml(): { html: string; name: string } | null {
  const host = document.getElementById(PRINT_OVERLAY_ID);
  const frame = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null;
  const doc = frame?.contentDocument;
  if (!doc?.documentElement) return null;
  const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  const name = host?.getAttribute(PRINT_JOB_ATTR) || doc.title || 'Document';
  return { html, name };
}

function setOverlayDownloadBusy(busy: boolean, label = 'Download PDF'): void {
  const btn = document.querySelector(`#${PRINT_OVERLAY_ID} [data-pdf-download]`) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? 'Downloading…' : label;
}

async function triggerOverlayDownload(): Promise<boolean> {
  const payload = readOverlayPrintHtml();
  if (!payload) return false;
  setOverlayDownloadBusy(true);
  // downloadHtmlAsPdf prefers capturing the visible preview iframe (avoids empty PDF)
  const ok = await downloadHtmlAsPdf(payload.html, payload.name);
  // Keep preview open until the user taps Close (including cancelled share / AbortError).
  setOverlayDownloadBusy(false, ok ? 'Download PDF' : 'Retry download');
  return ok;
}

async function triggerOverlayNativePrint(): Promise<void> {
  const payload = readOverlayPrintHtml();
  if (!payload) return;
  const btn = document.querySelector(`#${PRINT_OVERLAY_ID} [data-pdf-print]`) as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Printing…';
  }
  const ok = await printHtmlNative(payload.html, payload.name);
  if (btn) {
    btn.disabled = false;
    btn.textContent = ok ? 'Print' : 'Retry print';
  }
}

/** Cloud popup-blocked overlay: classic browser print (Save as PDF via print dialog). */
async function triggerOverlayPrint(): Promise<void> {
  const frame = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null;
  const w = frame?.contentWindow;
  if (!w) return;
  try {
    w.focus();
    w.print();
  } catch {
    /* ignore */
  }
}

export type OpenPrintWindowOpts = {
  /**
   * Hide html2pdf "Download PDF" on Capacitor overlay.
   * Use for Tax Invoice / bordered bills — canvas capture collapses tables and borders.
   * Prefer system Print → Save as PDF instead.
   */
  hidePdfDownload?: boolean;
};

/**
 * Fullscreen in-app overlay when window.open is unavailable.
 * Offline Mobile / Capacitor → preview + Print (optional Download PDF); cloud popup-blocked → classic Print / PDF.
 * Returns the iframe's contentWindow so existing printBillInWindow() callers keep working.
 */
function openPrintOverlay(placeholder = 'Preparing…', opts?: OpenPrintWindowOpts): Window | null {
  closePrintOverlay();
  const nativePdf = needsNativePrintPath();
  const hideDownload = !!opts?.hidePdfDownload;
  const host = document.createElement('div');
  host.id = PRINT_OVERLAY_ID;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', nativePdf ? 'Print preview' : 'Print preview');
  if (hideDownload) host.setAttribute('data-hide-pdf-download', '1');
  host.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0f172a;';

  const bar = document.createElement('div');
  bar.className = 'no-print';
  bar.style.cssText =
    'display:flex;align-items:center;gap:8px;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));background:#111827;color:#fff;flex-shrink:0;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'padding:8px 12px;border-radius:8px;border:1px solid #374151;background:#1f2937;color:#fff;font-weight:600;font-size:13px;';
  closeBtn.onclick = () => closePrintOverlay();

  const title = document.createElement('div');
  title.textContent = nativePdf ? 'Preview' : 'Print / PDF';
  title.style.cssText = 'flex:1;font-weight:700;font-size:13px;text-align:center;line-height:1.2;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

  if (nativePdf) {
    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.setAttribute('data-pdf-print', '1');
    printBtn.textContent = 'Print';
    printBtn.style.cssText =
      'padding:8px 12px;border-radius:8px;border:0;background:#F27D26;color:#fff;font-weight:700;font-size:13px;';
    printBtn.onclick = () => {
      void triggerOverlayNativePrint();
    };
    actions.appendChild(printBtn);

    // html2pdf canvas capture breaks bordered Tax Invoice tables — omit for invoices
    if (!hideDownload) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.setAttribute('data-pdf-download', '1');
      actionBtn.textContent = 'Download PDF';
      actionBtn.style.cssText =
        'padding:8px 12px;border-radius:8px;border:1px solid #374151;background:#1f2937;color:#fff;font-weight:700;font-size:13px;';
      actionBtn.onclick = () => {
        void triggerOverlayDownload();
      };
      actions.appendChild(actionBtn);
    }
  } else {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.textContent = 'Print / PDF';
    actionBtn.style.cssText =
      'padding:8px 12px;border-radius:8px;border:0;background:#F27D26;color:#fff;font-weight:700;font-size:13px;';
    actionBtn.onclick = () => {
      void triggerOverlayPrint();
    };
    actions.appendChild(actionBtn);
  }

  bar.appendChild(closeBtn);
  bar.appendChild(title);
  bar.appendChild(actions);

  const iframe = document.createElement('iframe');
  iframe.id = PRINT_FRAME_ID;
  iframe.title = nativePdf ? 'PDF preview' : 'Print preview';
  iframe.style.cssText = 'flex:1;width:100%;border:0;background:#fff;';

  host.appendChild(bar);
  host.appendChild(iframe);
  document.body.appendChild(host);

  const win = iframe.contentWindow;
  if (!win) return null;
  try {
    win.document.open();
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nativePdf ? 'PDF' : 'Print'}</title></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#999;margin:0"><p>${escapeHtmlLite(placeholder)}</p></body></html>`,
    );
    win.document.close();
  } catch {
    /* ignore */
  }
  return win;
}

/**
 * Open a print/PDF window immediately.
 * Must be called synchronously from a click handler — never after await.
 * Offline Mobile / Capacitor uses in-app preview + Print; cloud desktop uses window.open + print.
 * Popup-blocked cloud falls back to in-app Print / PDF (not forced download).
 */
export function openPrintWindow(placeholder = 'Preparing…', opts?: OpenPrintWindowOpts): Window | null {
  if (needsNativePrintPath()) {
    return openPrintOverlay(placeholder, opts);
  }

  let win: Window | null = null;
  try {
    win = window.open('', '_blank');
  } catch {
    /* ignore */
  }
  if (!win) {
    try {
      win = window.open('about:blank');
    } catch {
      /* ignore */
    }
  }
  if (win) {
    try {
      win.document.open();
      win.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#999;margin:0"><p>${escapeHtmlLite(placeholder)}</p></body></html>`,
      );
      win.document.close();
    } catch {
      /* ignore */
    }
    return win;
  }
  // Desktop pop-up blocked → in-app classic print preview
  return openPrintOverlay(placeholder, opts);
}

function applyPrintTitle(html: string, filename?: string): string {
  if (!filename) return html;
  const safeTitle = String(filename)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return html.includes('<title>')
    ? html.replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
    : html.replace(/<head([^>]*)>/i, `<head$1><title>${safeTitle}</title>`);
}

/**
 * Multi-page print: keep rows intact, repeat table column headers, keep end blocks
 * (totals / bank / signature) from splitting awkwardly. Injected into every print HTML.
 */
const PRINT_PAGINATION_CSS = `
@media print {
  @page { margin: 8mm; size: A4; }
  html, body { height: auto !important; overflow: visible !important; width: 100% !important; }
  body {
    /* economy: do not force gray fills / zebra bands onto toner printers */
    -webkit-print-color-adjust: economy !important;
    print-color-adjust: economy !important;
  }
  thead { display: table-header-group !important; }
  tfoot { display: table-footer-group !important; }
  table { page-break-inside: auto; }
  tr, img, svg, .avoid-break, .print-end, .hdr, .bank-block, .sig-block, .totals-block {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  table.items tbody tr, .items tbody tr, table tbody tr {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  h1, h2, h3, .title-text, .repeat-banner {
    break-after: avoid !important;
    page-break-after: avoid !important;
  }
  .print-end {
    break-before: auto;
    page-break-before: auto;
  }
  .no-print { display: none !important; }
}
`;

export function withPrintPagination(html: string): string {
  if (!html || html.includes('id="dg-print-pagination"')) return html;
  const style = `<style id="dg-print-pagination">${PRINT_PAGINATION_CSS}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => `${m}<head>${style}</head>`);
  return `${style}${html}`;
}

function triggerPrintWhenReady(win: Window) {
  try {
    win.focus();
    let printed = false;
    const printNow = () => {
      if (printed) return;
      printed = true;
      try {
        win.print();
      } catch {
        /* ignore */
      }
    };
    const imgs = Array.from(win.document.images || []);
    if (imgs.length === 0) {
      setTimeout(printNow, 200);
      return;
    }
    let done = 0;
    const check = () => {
      if (++done >= imgs.length) setTimeout(printNow, 150);
    };
    imgs.forEach(img => {
      if (img.complete) check();
      else {
        img.onload = check;
        img.onerror = check;
      }
    });
    setTimeout(printNow, 4000); // fallback if image events never fire
  } catch {
    /* ignore */
  }
}

/** Write HTML into an already-opened print/PDF window; offline preview stays open, cloud prints. */
export function printBillInWindow(win: Window, html: string, filename?: string, opts?: { autoPrint?: boolean }) {
  const titled = withPrintPagination(applyPrintTitle(html, filename));
  try {
    win.document.open();
    win.document.write(titled);
    win.document.close();
  } catch {
    // Overlay iframe may need a tick after first write
    try {
      win.document.documentElement.innerHTML = '';
      win.document.write(titled);
      win.document.close();
    } catch {
      /* ignore */
    }
  }
  const overlay = document.getElementById(PRINT_OVERLAY_ID);
  if (overlay && filename) {
    overlay.setAttribute(PRINT_JOB_ATTR, filename);
  }
  const usingOverlay = !!overlay;
  if (opts?.autoPrint === false) {
    try {
      win.focus();
    } catch {
      /* ignore */
    }
    return;
  }
  // Overlay: Offline Mobile shows preview (Download PDF is explicit); cloud popup-blocked auto-prints.
  if (usingOverlay) {
    try {
      win.focus();
    } catch {
      /* ignore */
    }
    if (needsNativePrintPath()) {
      // Do not auto-download — user taps Download PDF on the overlay.
      return;
    }
    setTimeout(() => {
      void triggerOverlayPrint();
    }, 450);
    return;
  }
  triggerPrintWhenReady(win);
}

/** Hidden-iframe print — works when Electron/browser blocks window.open */
function printViaIframe(html: string, autoPrint = true) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(withPrintPagination(html));
  doc.close();
  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };
  if (!autoPrint) {
    // Keep briefly so user can use browser print from a visible path if needed
    setTimeout(cleanup, 60_000);
    return;
  }
  const w = iframe.contentWindow;
  if (!w) {
    cleanup();
    return;
  }
  const run = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
    setTimeout(cleanup, 1500);
  };
  // Wait a tick for layout / images
  setTimeout(run, 400);
}

/**
 * Write HTML into a print window, or iframe-fallback if pop-up was blocked.
 * Always returns true if content was handed off for print/preview.
 */
export function writePrintHtml(
  win: Window | null,
  html: string,
  options?: { filename?: string; autoPrint?: boolean },
): boolean {
  if (win) {
    printBillInWindow(win, html, options?.filename, { autoPrint: options?.autoPrint ?? true });
    return true;
  }
  printViaIframe(withPrintPagination(applyPrintTitle(html, options?.filename)), options?.autoPrint ?? true);
  return true;
}

/**
 * Save bill HTML as PDF.
 * Offline Mobile / Capacitor: direct html2pdf download/share.
 * Cloud desktop: classic print window (user chooses Save as PDF).
 * Pass `win` from openPrintWindow() when called after await.
 */
export async function saveBillAsPdf(html: string, filename?: string, win?: Window | null): Promise<boolean> {
  const titled = withPrintPagination(applyPrintTitle(html, filename));
  if (needsNativePrintPath()) {
    const ok = await downloadHtmlAsPdf(titled, filename);
    if (win) {
      try {
        if (document.getElementById(PRINT_OVERLAY_ID)) closePrintOverlay();
        else win.close();
      } catch {
        /* ignore */
      }
    }
    if (ok) return true;
    // Fallback: overlay with Download PDF button
    const w = win && !win.closed ? win : openPrintWindow('Preparing PDF…');
    if (!w) return false;
    printBillInWindow(w, titled, filename, { autoPrint: false });
    return true;
  }
  // Cloud: open preview; user saves via browser print dialog
  const w = win && !win.closed ? win : openPrintWindow('Preparing PDF…');
  if (!w) {
    printViaIframe(titled, true);
    return true;
  }
  printBillInWindow(w, titled, filename, { autoPrint: false });
  return true;
}

export function shareViaWhatsApp(phone: string, message: string) {
  let p = phone.replace(/[\s\-().+]/g, '');
  if (p.length === 10 && /^\d+$/.test(p)) p = '91' + p;
  if (p.startsWith('0')) p = '91' + p.slice(1);
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(message)}`, '_blank');
}

/** Open Gmail compose in browser (works on desktop + mobile) */
export function shareViaEmail(email: string, subject: string, body: string) {
  const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(gmailUrl, '_blank');
}

/** Format sales invoice as plain text for WhatsApp / Email */
export function formatSalesInvoiceText(bill: {
  id: string;
  barcode: string;
  productName: string;
  category?: string | null;
  salePrice: number;
  warrantyMonths: number;
  purchaseDate: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  warranty?: { expiryDate: string } | null;
  company: { name: string; phone?: string | null; address?: string | null };
  rewardPointsEarned: number;
}): string {
  const lines = [
    `📄 *SALES INVOICE*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Invoice: ${bill.id}`,
    `Date: ${bill.purchaseDate}`,
    `Company: ${bill.company.name}`,
    bill.company.address ? `Address: ${bill.company.address}` : '',
    bill.company.phone ? `Phone: ${bill.company.phone}` : '',
    ``,
    `*PRODUCT*`,
    `• ${bill.productName}`,
    `• Barcode: ${bill.barcode}`,
    bill.category ? `• Category: ${bill.category}` : '',
    `• Price: ₹${Number(bill.salePrice).toLocaleString()}`,
    ``,
    `*CUSTOMER*`,
    `• ${bill.customerName}`,
    `• Phone: ${bill.customerPhone}`,
    bill.customerEmail ? `• Email: ${bill.customerEmail}` : '',
    ``,
    `*SOLD BY*`,
    `• ${bill.vendor.name}`,
    bill.vendor.contactPerson ? `• Contact: ${bill.vendor.contactPerson}` : '',
    bill.vendor.phone ? `• Phone: ${bill.vendor.phone}` : '',
    ``,
    `*WARRANTY*: ${bill.warrantyMonths} months`,
    bill.warranty ? `• Valid till: ${bill.warranty.expiryDate}` : '',
    bill.rewardPointsEarned > 0 ? `\n🎁 Reward Points Earned: ${bill.rewardPointsEarned}` : '',
    ``,
    `Thank you for your purchase!`,
    `— ${bill.company.name} ERP`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Format distribution challan as plain text for WhatsApp / Email */
export function formatDistributionChallanText(bill: {
  challanId: string;
  distributionDate: string;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  company: { name: string; phone?: string | null; address?: string | null };
  items: { sno: number; barcode: string; productName: string }[];
  groupedItems?: {
    sno: number;
    productName: string;
    barcodeRange: string;
    quantity: number;
    netPrice: number;
    lineTotal: number;
  }[];
  totalQuantity: number;
  totalValue: number;
  ewbNumber?: string | null;
  irn?: string | null;
  irnAckNo?: string | null;
  payment?: { totalDistributedValue: number; totalPaid: number; balance: number };
}): string {
  const itemLines = bill.groupedItems
    ? bill.groupedItems.map(
        g => `${g.sno}. ${g.productName}\n   ${g.barcodeRange} × ${g.quantity} = ₹${g.lineTotal.toLocaleString()}`,
      )
    : bill.items.map(item => `${item.sno}. ${item.barcode} — ${item.productName}`);
  const lines = [
    `📦 *DISTRIBUTION CHALLAN*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Challan: ${bill.challanId}`,
    `Date: ${bill.distributionDate}`,
    bill.ewbNumber ? `E-Way Bill: ${bill.ewbNumber}` : '',
    bill.irn ? `IRN: ${bill.irn}` : '',
    bill.irnAckNo ? `Ack No: ${bill.irnAckNo}` : '',
    `From: ${bill.company.name}`,
    bill.company.address ? `Address: ${bill.company.address}` : '',
    bill.company.phone ? `Phone: ${bill.company.phone}` : '',
    ``,
    `*TO VENDOR*`,
    `• ${bill.vendor.name}`,
    bill.vendor.contactPerson ? `• ${bill.vendor.contactPerson}` : '',
    bill.vendor.phone ? `• Phone: ${bill.vendor.phone}` : '',
    ``,
    `*ITEMS (${bill.totalQuantity} units)*`,
    ...itemLines,
    ``,
    `Total Value: ₹${bill.totalValue.toLocaleString()}`,
    bill.payment
      ? `\n💰 *PAYMENT STATUS*\nTotal Owed: ₹${bill.payment.totalDistributedValue.toLocaleString()}\nPaid: ₹${bill.payment.totalPaid.toLocaleString()}\nBalance: ₹${bill.payment.balance.toLocaleString()}`
      : '',
    ``,
    `— ${bill.company.name} ERP`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Escape CSV value (wrap in quotes if contains comma, newline, or quote) */
function escapeCsv(val: unknown): string {
  const s = String(val ?? '');
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export array of objects to CSV and trigger download */
export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = [headers.map(escapeCsv).join(','), ...data.map(r => headers.map(h => escapeCsv(r[h])).join(','))];
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
