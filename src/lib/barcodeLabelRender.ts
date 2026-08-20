import {
  type BarcodeLabelTemplate,
  type LabelElement,
  type LabelPrintContext,
  jsBarcodeFormat,
  resolveBarcodeValue,
  resolveElementText,
  validateBarcodeValue,
} from '../../shared/barcodeLabelTemplate';
import { esc } from './billTemplates';

const MM_TO_PX = 3.7795275591;

export function mmToPx(mm: number, scale = 1): number {
  return mm * MM_TO_PX * scale;
}

export async function generateBarcodeImageDataUrl(
  value: string,
  type: string,
  width = 2,
  height = 40,
): Promise<string> {
  const canvas = document.createElement('canvas');
  try {
    const JsBarcode = (await import('jsbarcode')).default;
    JsBarcode(canvas, value, {
      format: type,
      width,
      height,
      displayValue: false,
      margin: 0,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

export async function generateQrImageDataUrl(value: string, size = 120): Promise<string> {
  try {
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' });
  } catch {
    return '';
  }
}

function elementStyle(el: LabelElement, scale: number): string {
  const left = mmToPx(el.xMm, scale);
  const top = mmToPx(el.yMm, scale);
  const w = mmToPx(el.widthMm, scale);
  const h = mmToPx(el.heightMm, scale);
  const rot = el.rotation ? `transform:rotate(${el.rotation}deg);transform-origin:top left;` : '';
  return `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;overflow:hidden;${rot}`;
}

async function renderElementHtml(el: LabelElement, ctx: LabelPrintContext, scale: number): Promise<string> {
  if (!el.visible) return '';
  const p = el.properties || {};
  const base = elementStyle(el, scale);

  if (el.type === 'rect') {
    return `<div style="${base}border:${mmToPx(p.strokeWidthMm || 0.2, scale)}px solid ${esc(p.strokeColor || '#000')};background:${esc(p.fillColor || 'transparent')};box-sizing:border-box;"></div>`;
  }
  if (el.type === 'line') {
    return `<div style="${base}border-top:${mmToPx(p.strokeWidthMm || 0.3, scale)}px solid ${esc(p.strokeColor || '#000')};height:0;"></div>`;
  }
  if (el.type === 'logo' || el.type === 'image') {
    const src = el.type === 'logo' ? ctx.company.logo || p.imageBase64 : p.imageBase64;
    if (!src || !String(src).startsWith('data:image/')) return '';
    const fit = p.fit === 'cover' ? 'cover' : 'contain';
    return `<div style="${base}"><img src="${esc(String(src))}" alt="" style="width:100%;height:100%;object-fit:${fit};" /></div>`;
  }
  if (el.type === 'barcode') {
    let barcodeType = p.barcodeType || 'CODE128';
    const value = resolveBarcodeValue(el, ctx);
    let err = validateBarcodeValue(barcodeType, value);
    // Stock codes are internal alphanumeric (e.g. BAY250001) — fall back when retail symbology fails.
    if (err && barcodeType !== 'CODE128') {
      barcodeType = 'CODE128';
      err = validateBarcodeValue(barcodeType, value);
    }
    if (err) {
      return `<div style="${base}color:#b91c1c;font-size:8px;display:flex;align-items:center;justify-content:center;text-align:center;padding:2px;">${esc(err)}</div>`;
    }
    const sym = jsBarcodeFormat(barcodeType);
    const img = await generateBarcodeImageDataUrl(value, sym, 2, mmToPx(el.heightMm * 0.7, scale));
    if (!img) return '';
    const hr =
      p.showHumanReadable !== false
        ? `<div style="font-size:${p.humanReadableFontSizePt || 6}pt;font-family:monospace;text-align:center;">${esc(value)}</div>`
        : '';
    return `<div style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;"><img src="${img}" alt="${esc(value)}" style="max-width:100%;max-height:75%;object-fit:contain;" />${hr}</div>`;
  }
  if (el.type === 'qr') {
    const value = resolveBarcodeValue(el, ctx) || ctx.product.barcode || ctx.product.name;
    const img = await generateQrImageDataUrl(value, Math.round(mmToPx(Math.min(el.widthMm, el.heightMm), scale)));
    if (!img) return '';
    return `<div style="${base}"><img src="${img}" alt="QR" style="width:100%;height:100%;object-fit:contain;" /></div>`;
  }

  const text = resolveElementText(el, ctx);
  const align = p.textAlign || 'left';
  const weight = p.fontWeight === 'bold' ? 'bold' : 'normal';
  const style = p.fontStyle === 'italic' ? 'italic' : 'normal';
  const deco = p.textDecoration === 'underline' ? 'underline' : 'none';
  const size = p.fontSizePt || 8;
  const color = p.color || '#111';
  const lh = p.lineHeight || 1.2;
  const wrap = p.wrap ? 'normal' : 'nowrap';
  return `<div style="${base}font-size:${size}pt;font-weight:${weight};font-style:${style};text-decoration:${deco};text-align:${align};color:${esc(color)};line-height:${lh};white-space:${wrap};word-break:break-word;">${esc(text)}</div>`;
}

export async function renderLabelHtml(
  template: Pick<BarcodeLabelTemplate, 'widthMm' | 'heightMm' | 'elements'>,
  ctx: LabelPrintContext,
  opts?: { scale?: number; copies?: number },
): Promise<string> {
  const scale = opts?.scale ?? 1;
  const copies = Math.max(1, Math.min(500, opts?.copies ?? 1));
  const sorted = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  const inner = await Promise.all(sorted.map(el => renderElementHtml(el, ctx, scale)));
  const labelBody = `<div class="label-sheet" style="position:relative;width:${mmToPx(template.widthMm, scale)}px;height:${mmToPx(template.heightMm, scale)}px;background:#fff;box-sizing:border-box;">${inner.join('')}</div>`;
  const labels = Array.from({ length: copies }, () => labelBody).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label Print</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page { size: ${template.widthMm}mm ${template.heightMm}mm; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f3f4f6; }
  .print-grid { display:flex; flex-wrap:wrap; gap:0; }
  .label-sheet { page-break-inside:avoid; border:0.2mm solid #e5e7eb; margin:0; }
  @media print {
    body { background:#fff; }
    .label-sheet { border:none; }
    .no-print { display:none !important; }
  }
</style></head><body>
<div class="print-grid">${labels}</div>
</body></html>`;
}

export async function renderLabelPreviewDataUrl(
  template: Pick<BarcodeLabelTemplate, 'widthMm' | 'heightMm' | 'elements'>,
  ctx: LabelPrintContext,
): Promise<string> {
  const html = await renderLabelHtml(template, ctx, { scale: 2, copies: 1 });
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return '';
  }
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise(r => setTimeout(r, 120));
  const sheet = doc.querySelector('.label-sheet') as HTMLElement | null;
  if (!sheet) {
    document.body.removeChild(iframe);
    return '';
  }
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff' });
    const url = canvas.toDataURL('image/png');
    document.body.removeChild(iframe);
    return url;
  } catch {
    document.body.removeChild(iframe);
    return '';
  }
}
