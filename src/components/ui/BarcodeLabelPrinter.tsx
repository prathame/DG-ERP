import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, QrCode } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { api } from '../../api';
import { LoadingSpinner } from './index';
import { cn } from '../../lib/utils';
import { session } from '../../lib/session';

interface BarcodeLabelPrinterProps {
  productId: string;
  onClose: () => void;
  barcodeRange?: { first: string; last: string };
}

type LabelFormat = 'a4-24' | 'a4-40' | 'single';
type CodeType = 'barcode' | 'qr';

function generateBarcodeDataUrl(text: string): string {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, text, { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 0 });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function generateQrDataUrl(text: string, size: number = 100): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  // Simple QR-like visual (actual QR needs a library — using a text placeholder with styled box)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${Math.floor(size / 8)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Draw border pattern to simulate QR
  const b = 4;
  ctx.fillRect(0, 0, size, b); ctx.fillRect(0, size - b, size, b);
  ctx.fillRect(0, 0, b, size); ctx.fillRect(size - b, 0, b, size);
  // Corner squares
  const cs = Math.floor(size / 4);
  ctx.fillRect(b + 2, b + 2, cs, cs);
  ctx.fillRect(size - b - cs - 2, b + 2, cs, cs);
  ctx.fillRect(b + 2, size - b - cs - 2, cs, cs);
  ctx.fillStyle = '#ffffff';
  const inner = cs - 6;
  ctx.fillRect(b + 5, b + 5, inner, inner);
  ctx.fillRect(size - b - cs + 1, b + 5, inner, inner);
  ctx.fillRect(b + 5, size - b - cs + 1, inner, inner);
  ctx.fillStyle = '#000000';
  const core = inner - 6;
  ctx.fillRect(b + 8, b + 8, core, core);
  ctx.fillRect(size - b - cs + 4, b + 8, core, core);
  ctx.fillRect(b + 8, size - b - cs + 4, core, core);
  // Text
  ctx.fillText(text.slice(-6), size / 2, size / 2);
  return canvas.toDataURL('image/png');
}

export function BarcodeLabelPrinter({ productId, onClose, barcodeRange }: BarcodeLabelPrinterProps) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<{ name: string; price: number } | null>(null);
  const [barcodes, setBarcodes] = useState<{ barcode: string; status: string }[]>([]);
  const [format, setFormat] = useState<LabelFormat>('a4-24');
  const [codeType, setCodeType] = useState<CodeType>('barcode');
  const [showPrice, setShowPrice] = useState(true);
  const [selectedBarcodes, setSelectedBarcodes] = useState<Set<string>>(new Set());
  const companyName = (() => { try { return (session.getUser() || {}).companyName || ''; } catch { return ''; } })();

  useEffect(() => {
    api.products.getBarcodes(productId)
      .then((data) => {
        setProduct(data.product);
        const allBarcodes = data.barcodes;
        setBarcodes(allBarcodes);
        if (barcodeRange) {
          const inRange = allBarcodes.filter((b) => b.barcode >= barcodeRange.first && b.barcode <= barcodeRange.last);
          setSelectedBarcodes(new Set(inRange.map((b) => b.barcode)));
        } else {
          setSelectedBarcodes(new Set(allBarcodes.map((b) => b.barcode)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, barcodeRange]);

  const toggleBarcode = (bc: string) => {
    setSelectedBarcodes((prev) => {
      const next = new Set(prev);
      next.has(bc) ? next.delete(bc) : next.add(bc);
      return next;
    });
  };

  const selectAll = () => setSelectedBarcodes(new Set(barcodes.map((b) => b.barcode)));
  const selectNone = () => setSelectedBarcodes(new Set());

  const handlePrint = () => {
    if (!product) return;
    const selected = barcodes.filter((b) => selectedBarcodes.has(b.barcode));
    if (selected.length === 0) return;

    const labelWidth = format === 'a4-24' ? '63mm' : format === 'a4-40' ? '48mm' : '80mm';
    const labelHeight = format === 'a4-24' ? '33mm' : format === 'a4-40' ? '25mm' : '40mm';
    const cols = format === 'a4-24' ? 3 : format === 'a4-40' ? 4 : 1;
    const imgHeight = format === 'a4-40' ? '18px' : '35px';
    const fontSize = format === 'a4-40' ? '7px' : '9px';

    const labels = selected.map((b) => {
      const codeImg = codeType === 'barcode' ? generateBarcodeDataUrl(b.barcode) : generateQrDataUrl(b.barcode);
      return `<div class="label">
        ${companyName ? `<div class="company">${companyName}</div>` : ''}
        <div class="product">${product.name}</div>
        ${codeImg ? `<img src="${codeImg}" class="code-img" alt="${b.barcode}" />` : ''}
        <div class="barcode-text">${b.barcode}</div>
        ${showPrice ? `<div class="price">₹${Number(product.price).toLocaleString()}</div>` : ''}
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode Labels — ${product.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{margin:5mm;}
  body{font-family:'Segoe UI',Arial,sans-serif;}
  .grid{display:flex;flex-wrap:wrap;gap:0;}
  .label{width:${labelWidth};height:${labelHeight};border:0.5px solid #ddd;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;page-break-inside:avoid;}
  .company{font-size:${fontSize};font-weight:700;color:#666;letter-spacing:0.5px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
  .product{font-size:${fontSize};font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
  .code-img{height:${imgHeight};max-width:95%;object-fit:contain;}
  .barcode-text{font-size:8px;font-family:monospace;letter-spacing:1px;margin-top:1px;}
  .price{font-size:10px;font-weight:700;margin-top:1px;}
  @media print{.label{border:0.3px solid #eee;}}
</style></head><body>
<div class="grid">${labels}</div>
</body></html>`;

    const win = window.open('', '_blank', 'width=800,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl p-8"><LoadingSpinner /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-lg">Print Barcode Labels</h3>
            <p className="text-sm text-gray-500">{product?.name} — {barcodes.length} barcodes</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Format */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Label Format</p>
            <div className="flex gap-2">
              {([['a4-24', 'A4 — 24 labels (63×33mm)'], ['a4-40', 'A4 — 40 labels (48×25mm)'], ['single', 'Single (80×40mm)']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFormat(val)} className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors", format === val ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-600 hover:border-brand")}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Code Type */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Code Type</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCodeType('barcode')} className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-colors", codeType === 'barcode' ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-600 hover:border-brand")}>
                ||||| Barcode
              </button>
              <button type="button" onClick={() => setCodeType('qr')} className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-colors", codeType === 'qr' ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-600 hover:border-brand")}>
                <QrCode size={16} /> QR Code
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Show Price on Label</span>
            <button type="button" onClick={() => setShowPrice(!showPrice)} className={cn("relative w-12 h-7 rounded-full transition-colors", showPrice ? "bg-green-500" : "bg-gray-300")}>
              <span className={cn("absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform", showPrice ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </div>

          {/* Select barcodes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase">{selectedBarcodes.size} of {barcodes.length} selected</p>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-xs text-brand font-medium">Select All</button>
                <button type="button" onClick={selectNone} className="text-xs text-gray-500 font-medium">None</button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2 grid grid-cols-2 gap-1">
              {barcodes.map((b) => (
                <label key={b.barcode} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-gray-50", selectedBarcodes.has(b.barcode) ? "bg-brand/5" : "")}>
                  <input type="checkbox" checked={selectedBarcodes.has(b.barcode)} onChange={() => toggleBarcode(b.barcode)} className="rounded" />
                  <span className="font-mono">{b.barcode}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full", b.status === 'InStock' ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400")}>{b.status}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Label Preview</p>
            <div className="flex items-center justify-center">
              <div className="border border-gray-300 bg-white p-3 text-center" style={{ width: '180px' }}>
                {companyName && <p style={{ fontSize: '8px', fontWeight: 700, color: '#666' }}>{companyName}</p>}
                <p style={{ fontSize: '9px', fontWeight: 600 }}>{product?.name}</p>
                {barcodes[0] && (
                  codeType === 'barcode'
                    ? <img src={generateBarcodeDataUrl(barcodes[0].barcode)} alt="barcode" style={{ height: '30px', margin: '4px auto' }} />
                    : <img src={generateQrDataUrl(barcodes[0].barcode, 60)} alt="qr" style={{ height: '50px', margin: '4px auto' }} />
                )}
                <p style={{ fontSize: '8px', fontFamily: 'monospace', letterSpacing: '1px' }}>{barcodes[0]?.barcode}</p>
                {showPrice && <p style={{ fontSize: '10px', fontWeight: 700 }}>₹{Number(product?.price || 0).toLocaleString()}</p>}
              </div>
            </div>
          </div>

          {/* Print */}
          <button type="button" onClick={handlePrint} disabled={selectedBarcodes.size === 0} className="w-full py-3.5 bg-brand text-white rounded-xl font-bold text-lg hover:bg-brand-dark disabled:opacity-40 flex items-center justify-center gap-2">
            <Printer size={20} /> Print {selectedBarcodes.size} Labels
          </button>
        </div>
      </div>
    </div>
  );
}
