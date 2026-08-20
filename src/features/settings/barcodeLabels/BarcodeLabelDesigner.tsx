import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowLeft, Layers, Plus, Printer, Redo2, Save, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../../../api';
import { useToast } from '../../../components/ui';
import { cn, openPrintWindow, printBillInWindow, PRINT_POPUP_BLOCKED } from '../../../lib/utils';
import {
  LABEL_DYNAMIC_FIELDS,
  LABEL_SIZE_PRESETS,
  type BarcodeLabelTemplate,
  type LabelElement,
  type LabelElementType,
  type LabelPrintContext,
  SAMPLE_LABEL_CONTEXT,
  defaultStarterTemplate,
  jsBarcodeFormat,
  resolveBarcodeValue,
  resolveElementText,
  roundMm,
  validateBarcodeValue,
} from '../../../../shared/barcodeLabelTemplate';
import {
  generateBarcodeImageDataUrl,
  generateQrImageDataUrl,
  mmToPx,
  renderLabelHtml,
} from '../../../lib/barcodeLabelRender';
import { useEscapeKey } from '../../../lib/useEscapeKey';

const CANVAS_SCALE = 4;

type EditorState = {
  template: Omit<BarcodeLabelTemplate, 'tenantId'>;
  selectedId: string | null;
  past: Omit<BarcodeLabelTemplate, 'tenantId'>[];
  future: Omit<BarcodeLabelTemplate, 'tenantId'>[];
};

type EditorAction =
  | { type: 'patch'; patch: Partial<Omit<BarcodeLabelTemplate, 'tenantId'>> }
  | { type: 'select'; id: string | null }
  | { type: 'updateElement'; id: string; patch: Partial<LabelElement> }
  | { type: 'addElement'; element: LabelElement }
  | { type: 'deleteSelected' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; template: Omit<BarcodeLabelTemplate, 'tenantId'> };

function reducer(state: EditorState, action: EditorAction): EditorState {
  const pushPast = (next: Omit<BarcodeLabelTemplate, 'tenantId'>) => ({
    template: next,
    selectedId: state.selectedId,
    past: [...state.past, state.template].slice(-40),
    future: [],
  });
  switch (action.type) {
    case 'patch':
      return pushPast({ ...state.template, ...action.patch });
    case 'select':
      return { ...state, selectedId: action.id };
    case 'updateElement':
      return pushPast({
        ...state.template,
        elements: state.template.elements.map(el =>
          el.id === action.id
            ? { ...el, ...action.patch, properties: { ...el.properties, ...action.patch.properties } }
            : el,
        ),
      });
    case 'addElement':
      return pushPast({ ...state.template, elements: [...state.template.elements, action.element] });
    case 'deleteSelected':
      if (!state.selectedId) return state;
      return pushPast({
        ...state.template,
        elements: state.template.elements.filter(el => el.id !== state.selectedId),
      });
    case 'undo':
      if (!state.past.length) return state;
      return {
        template: state.past[state.past.length - 1],
        selectedId: state.selectedId,
        past: state.past.slice(0, -1),
        future: [state.template, ...state.future].slice(0, 40),
      };
    case 'redo':
      if (!state.future.length) return state;
      return {
        template: state.future[0],
        selectedId: state.selectedId,
        past: [...state.past, state.template],
        future: state.future.slice(1),
      };
    case 'replace':
      return { template: action.template, selectedId: null, past: [], future: [] };
    default:
      return state;
  }
}

function newElement(type: LabelElementType, z: number): LabelElement {
  const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const base = {
    id,
    type,
    xMm: 2,
    yMm: 2,
    widthMm: 20,
    heightMm: 6,
    rotation: 0,
    zIndex: z,
    visible: true,
    properties: {},
  };
  if (type === 'barcode')
    return {
      ...base,
      heightMm: 12,
      widthMm: 34,
      properties: { barcodeType: 'CODE128', barcodeValueSource: 'product.barcode', showHumanReadable: true },
    };
  if (type === 'qr') return { ...base, widthMm: 12, heightMm: 12, properties: {} };
  if (type === 'logo') return { ...base, type: 'logo', widthMm: 10, heightMm: 8, properties: { fit: 'contain' } };
  if (type === 'image') return { ...base, type: 'image', widthMm: 12, heightMm: 12, properties: { fit: 'contain' } };
  if (type === 'field') return { ...base, type: 'field', properties: { fieldKey: 'product.name', fontSizePt: 8 } };
  if (type === 'text') return { ...base, type: 'text', properties: { staticText: 'Text', fontSizePt: 8 } };
  return base;
}

type Props = {
  initial: BarcodeLabelTemplate | null;
  /** Unsaved layout from sample picker or blank start. */
  draft?: Omit<BarcodeLabelTemplate, 'id' | 'tenantId'> | null;
  onClose: () => void;
  onSaved: () => void;
};

function resolveCanvasImageSrc(el: LabelElement, companyLogo: string | null): string | null {
  const custom = el.properties.imageBase64;
  if (custom && String(custom).startsWith('data:image/')) return String(custom);
  if (el.type === 'logo' && companyLogo?.startsWith('data:image/')) return companyLogo;
  return null;
}

function readImageFile(file: File, onLoad: (dataUrl: string) => void, onError: (msg: string) => void) {
  if (file.size > 500 * 1024) {
    onError('Image must be under 500KB');
    return;
  }
  if (!file.type.startsWith('image/')) {
    onError('Please select an image file');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ''));
  reader.onerror = () => onError('Could not read image');
  reader.readAsDataURL(file);
}

function BarcodeCanvasPlaceholder() {
  const bars = [3, 1, 2, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3];
  let x = 3;
  return (
    <svg viewBox="0 0 88 40" className="w-full h-full block" aria-hidden>
      {bars.map((bw, i) => {
        const rect = <rect key={i} x={x} y={6} width={bw} height={24} fill="#111827" />;
        x += bw + 1.2;
        return rect;
      })}
      <text x="44" y="38" textAnchor="middle" fontSize="5" fill="#6b7280">
        barcode
      </text>
    </svg>
  );
}

function QrCanvasPlaceholder() {
  const modules = [
    '11110111',
    '10100101',
    '10111101',
    '10100101',
    '11110111',
    '00000000',
    '11010011',
    '01011010',
    '11001101',
  ];
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full block" aria-hidden>
      <rect x="1" y="1" width="46" height="46" fill="#fff" stroke="#e5e7eb" strokeWidth="0.5" />
      {[
        [2, 2],
        [32, 2],
        [2, 32],
      ].map(([ox, oy], i) => (
        <g key={i}>
          <rect x={ox} y={oy} width={14} height={14} fill="none" stroke="#111827" strokeWidth="2" />
          <rect x={ox + 3} y={oy + 3} width={8} height={8} fill="#111827" />
        </g>
      ))}
      {modules.map((row, y) =>
        row
          .split('')
          .map((cell, x) =>
            cell === '1' ? (
              <rect key={`${y}-${x}`} x={18 + x * 2.2} y={18 + y * 2.2} width={1.8} height={1.8} fill="#111827" />
            ) : null,
          ),
      )}
    </svg>
  );
}

function fieldPreviewStyle(el: LabelElement, canvasScale: number): React.CSSProperties {
  const p = el.properties || {};
  const sizePt = (p.fontSizePt || 8) * canvasScale;
  return {
    fontSize: `${sizePt}pt`,
    fontWeight: p.fontWeight === 'bold' ? 'bold' : 'normal',
    fontStyle: p.fontStyle === 'italic' ? 'italic' : 'normal',
    textDecoration: p.textDecoration === 'underline' ? 'underline' : 'none',
    textAlign: p.textAlign || 'left',
    lineHeight: p.lineHeight || 1.2,
    whiteSpace: p.wrap ? 'normal' : 'nowrap',
    wordBreak: p.wrap ? 'break-word' : 'normal',
    color: p.color || '#111827',
    width: '100%',
  };
}

function BarcodeLivePreview({
  el,
  ctx,
  canvasScale,
}: {
  el: LabelElement;
  ctx: LabelPrintContext;
  canvasScale: number;
}) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const p = el.properties || {};
    let barcodeType = p.barcodeType || 'CODE128';
    const value = resolveBarcodeValue(el, ctx);
    let err = validateBarcodeValue(barcodeType, value);
    if (err && barcodeType !== 'CODE128') {
      barcodeType = 'CODE128';
      err = validateBarcodeValue(barcodeType, value);
    }
    if (err) {
      setSrc('');
      setError(err);
      return;
    }
    setError(null);
    void generateBarcodeImageDataUrl(
      value,
      jsBarcodeFormat(barcodeType),
      2,
      mmToPx(el.heightMm * 0.7, canvasScale),
    ).then(url => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [el, ctx, canvasScale]);

  if (error) {
    return <span className="text-[9px] text-rose-600 text-center leading-tight px-0.5">{error}</span>;
  }
  if (!src) return <BarcodeCanvasPlaceholder />;
  const value = resolveBarcodeValue(el, ctx);
  const showHr = el.properties.showHumanReadable !== false;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white">
      <img src={src} alt="" className="max-w-full max-h-[75%] object-contain" />
      {showHr && (
        <span
          className="font-mono text-center truncate w-full"
          style={{ fontSize: `${(el.properties.humanReadableFontSizePt || 6) * canvasScale * 0.85}pt` }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function QrLivePreview({ el, ctx, canvasScale }: { el: LabelElement; ctx: LabelPrintContext; canvasScale: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    const value = resolveBarcodeValue(el, ctx) || ctx.product.barcode || ctx.product.name;
    void generateQrImageDataUrl(value, Math.round(mmToPx(Math.min(el.widthMm, el.heightMm), canvasScale))).then(url => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [el, ctx, canvasScale]);
  if (!src) return <QrCanvasPlaceholder />;
  return <img src={src} alt="" className="w-full h-full object-contain bg-white" />;
}

function CanvasElementPreview({
  el,
  companyLogo,
  previewContext,
  canvasScale,
}: {
  el: LabelElement;
  companyLogo: string | null;
  previewContext: LabelPrintContext;
  canvasScale: number;
}) {
  const imgSrc = el.type === 'logo' || el.type === 'image' ? resolveCanvasImageSrc(el, companyLogo) : null;

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        className="w-full h-full"
        style={{ objectFit: el.properties.fit === 'cover' ? 'cover' : 'contain' }}
      />
    );
  }

  if (el.type === 'barcode') {
    return <BarcodeLivePreview el={el} ctx={previewContext} canvasScale={canvasScale} />;
  }

  if (el.type === 'qr') {
    return <QrLivePreview el={el} ctx={previewContext} canvasScale={canvasScale} />;
  }

  if (el.type === 'logo') {
    return <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Logo</span>;
  }

  if (el.type === 'image') {
    return <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Image</span>;
  }

  if (el.type === 'field') {
    return (
      <span className="block px-0.5 truncate" style={fieldPreviewStyle(el, canvasScale)}>
        {resolveElementText(el, previewContext)}
      </span>
    );
  }

  if (el.type === 'text') {
    return (
      <span className="block px-0.5 truncate" style={fieldPreviewStyle(el, canvasScale)}>
        {resolveElementText(el, previewContext)}
      </span>
    );
  }

  if (el.type === 'rect') {
    return <div className="w-full h-full border border-gray-800 bg-gray-50" />;
  }

  if (el.type === 'line') {
    return (
      <div className="w-full h-full flex items-center">
        <div className="w-full border-t-2 border-gray-800" />
      </div>
    );
  }

  return <span className="text-[8px] text-gray-500">{el.type}</span>;
}

function layerLabel(el: LabelElement): string {
  if (el.type === 'qr') return 'QR code';
  if (el.type === 'barcode') return `Barcode (${el.properties.barcodeType || 'CODE128'})`;
  if (el.type === 'field') {
    return LABEL_DYNAMIC_FIELDS.find(f => f.key === el.properties.fieldKey)?.label || 'Field';
  }
  if (el.type === 'text') return el.properties.staticText || 'Text';
  if (el.type === 'logo') return 'Company logo';
  if (el.type === 'image') return 'Custom image';
  return el.type;
}

export function BarcodeLabelDesigner({ initial, draft, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [state, dispatch] = useReducer(reducer, {
    template: initial
      ? {
          id: initial.id,
          name: initial.name,
          description: initial.description,
          widthMm: initial.widthMm,
          heightMm: initial.heightMm,
          orientation: initial.orientation,
          status: initial.status,
          isDefault: initial.isDefault,
          version: initial.version,
          elements: initial.elements,
          createdAt: initial.createdAt,
          updatedAt: initial.updatedAt,
        }
      : { id: '', ...(draft || defaultStarterTemplate('New label')), createdAt: undefined, updatedAt: undefined },
    selectedId: null,
    past: [],
    future: [],
  });
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [previewContext, setPreviewContext] = useState<LabelPrintContext>(SAMPLE_LABEL_CONTEXT);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);

  useEffect(() => {
    api.settings
      .getBillSettings()
      .then(s => {
        setCompanyLogo(s?.logoBase64 || null);
        setPreviewContext(ctx => ({
          ...ctx,
          company: {
            ...ctx.company,
            name: s?.companyName?.trim() || ctx.company.name,
            logo: s?.logoBase64 || ctx.company.logo,
            gstin: s?.gstin?.trim() || ctx.company.gstin,
          },
        }));
      })
      .catch(() => setCompanyLogo(null));
  }, []);

  const attachImage = (elId: string, file: File) => {
    readImageFile(
      file,
      dataUrl => {
        dispatch({
          type: 'updateElement',
          id: elId,
          patch: { properties: { imageBase64: dataUrl } },
        });
      },
      msg => toast(msg, 'error'),
    );
  };

  const selected = state.template.elements.find(el => el.id === state.selectedId) || null;
  const sorted = useMemo(
    () => [...state.template.elements].sort((a, b) => a.zIndex - b.zIndex),
    [state.template.elements],
  );

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: state.template.name,
        description: state.template.description,
        widthMm: state.template.widthMm,
        heightMm: state.template.heightMm,
        orientation: state.template.orientation,
        status: state.template.status,
        isDefault: state.template.isDefault,
        elements: state.template.elements,
      };
      if (state.template.id) {
        await api.barcodeLabelTemplates.update(state.template.id, payload);
        toast('Template saved', 'success');
      } else {
        const created = await api.barcodeLabelTemplates.create(payload);
        const { tenantId: _t, ...rest } = created;
        dispatch({ type: 'replace', template: rest });
        toast('Template created', 'success');
      }
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const printTest = async () => {
    const html = await renderLabelHtml(state.template, previewContext, { copies: 1 });
    const win = openPrintWindow('Preparing test label…');
    if (!win) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    printBillInWindow(win, html, 'Test label');
  };

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (dragRef.current) {
        const d = dragRef.current;
        const dx = (e.clientX - d.startX) / (CANVAS_SCALE * zoom * 3.7795275591);
        const dy = (e.clientY - d.startY) / (CANVAS_SCALE * zoom * 3.7795275591);
        dispatch({
          type: 'updateElement',
          id: d.id,
          patch: { xMm: roundMm(Math.max(0, d.origX + dx)), yMm: roundMm(Math.max(0, d.origY + dy)) },
        });
      }
      if (resizeRef.current) {
        const r = resizeRef.current;
        const dw = (e.clientX - r.startX) / (CANVAS_SCALE * zoom * 3.7795275591);
        const dh = (e.clientY - r.startY) / (CANVAS_SCALE * zoom * 3.7795275591);
        dispatch({
          type: 'updateElement',
          id: r.id,
          patch: {
            widthMm: roundMm(Math.max(2, r.origW + dw)),
            heightMm: roundMm(Math.max(2, r.origH + dh)),
          },
        });
      }
    },
    [zoom],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  useEffect(() => () => onPointerUp(), [onPointerUp]);

  useEscapeKey(() => {
    onClose();
    return true;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
      if (e.key === 'Delete' && state.selectedId) dispatch({ type: 'deleteSelected' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canvasW = mmToPx(state.template.widthMm, CANVAS_SCALE * zoom);
  const canvasH = mmToPx(state.template.heightMm, CANVAS_SCALE * zoom);
  const canvasScale = CANVAS_SCALE * zoom;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#0f1419] text-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 text-sm font-semibold hover:bg-white/5 shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back to templates</span>
        </button>
        <input
          value={state.template.name}
          onChange={e => dispatch({ type: 'patch', patch: { name: e.target.value } })}
          className="bg-transparent text-lg font-bold outline-none min-w-0 flex-1"
          aria-label="Template name"
        />
        <button
          type="button"
          onClick={() => dispatch({ type: 'undo' })}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'redo' })}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Zoom out"
        >
          <ZoomOut size={18} />
        </button>
        <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(2, z + 0.1))}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Zoom in"
        >
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          onClick={printTest}
          className="px-3 py-2 rounded-xl border border-white/20 text-sm font-semibold hover:bg-white/5"
        >
          <Printer size={16} className="inline mr-1" /> Print test
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold disabled:opacity-60"
        >
          <Save size={16} className="inline mr-1" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-xl border border-white/20 text-sm font-semibold hover:bg-white/5 sm:hidden"
        >
          Close
        </button>
      </header>
      <p className="px-4 py-1.5 text-[11px] text-white/45 border-b border-white/5 shrink-0">
        Full-screen editor — use <strong className="font-semibold text-white/60">Back to templates</strong> or press{' '}
        <kbd className="px-1 rounded bg-white/10">Esc</kbd> to return to Bill Settings. Save before leaving if you
        changed the layout.
      </p>

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 border-r border-white/10 p-3 space-y-2 overflow-y-auto shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Elements</p>
          {(
            [
              ['field', 'Dynamic field'],
              ['text', 'Custom text'],
              ['barcode', 'Barcode'],
              ['qr', 'QR code'],
              ['logo', 'Company logo'],
              ['image', 'Custom image'],
              ['rect', 'Rectangle'],
              ['line', 'Line'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                dispatch({
                  type: 'addElement',
                  element: newElement(type, state.template.elements.length + 1),
                })
              }
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 border border-white/10"
            >
              + {label}
            </button>
          ))}
        </aside>

        <main className="flex-1 overflow-auto p-8 flex items-center justify-center bg-[#1a2028]">
          <div
            className="relative shadow-2xl"
            style={{
              width: canvasW,
              height: canvasH,
              backgroundImage:
                'linear-gradient(#ffffff12 1px, transparent 1px), linear-gradient(90deg, #ffffff12 1px, transparent 1px)',
              backgroundSize: `${mmToPx(5, CANVAS_SCALE * zoom)}px ${mmToPx(5, CANVAS_SCALE * zoom)}px`,
            }}
          >
            <div className="absolute inset-0 bg-white text-black" style={{ width: canvasW, height: canvasH }}>
              {sorted.map(el => {
                if (!el.visible) return null;
                const active = el.id === state.selectedId;
                const left = mmToPx(el.xMm, CANVAS_SCALE * zoom);
                const top = mmToPx(el.yMm, CANVAS_SCALE * zoom);
                const w = mmToPx(el.widthMm, CANVAS_SCALE * zoom);
                const h = mmToPx(el.heightMm, CANVAS_SCALE * zoom);
                return (
                  <div
                    key={el.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={e => {
                      e.stopPropagation();
                      dispatch({ type: 'select', id: el.id });
                      dragRef.current = {
                        id: el.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: el.xMm,
                        origY: el.yMm,
                      };
                      window.addEventListener('pointermove', onPointerMove);
                      window.addEventListener('pointerup', onPointerUp);
                    }}
                    className={cn(
                      'absolute border cursor-move select-none',
                      active ? 'border-brand ring-1 ring-brand' : 'border-transparent hover:border-brand/40',
                    )}
                    style={{ left, top, width: w, height: h, zIndex: el.zIndex }}
                  >
                    <div className="w-full h-full overflow-hidden pointer-events-none">
                      <CanvasElementPreview
                        el={el}
                        companyLogo={companyLogo}
                        previewContext={previewContext}
                        canvasScale={canvasScale}
                      />
                    </div>
                    {active && (
                      <span
                        className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand rounded-sm cursor-se-resize"
                        onPointerDown={e => {
                          e.stopPropagation();
                          resizeRef.current = {
                            id: el.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            origW: el.widthMm,
                            origH: el.heightMm,
                          };
                          window.addEventListener('pointermove', onPointerMove);
                          window.addEventListener('pointerup', onPointerUp);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        <aside className="w-72 border-l border-white/10 p-4 space-y-4 overflow-y-auto shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2">Label size (mm)</p>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                value={state.template.widthMm}
                onChange={e => dispatch({ type: 'patch', patch: { widthMm: Number(e.target.value) } })}
                className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                aria-label="Width mm"
              />
              <input
                type="number"
                step="0.1"
                value={state.template.heightMm}
                onChange={e => dispatch({ type: 'patch', patch: { heightMm: Number(e.target.value) } })}
                className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                aria-label="Height mm"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {LABEL_SIZE_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => dispatch({ type: 'patch', patch: { widthMm: p.widthMm, heightMm: p.heightMm } })}
                  className="text-[10px] px-2 py-1 rounded-full border border-white/20 hover:bg-white/10"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Element</p>
              <label className="flex items-center justify-between text-sm">
                Visible
                <input
                  type="checkbox"
                  checked={selected.visible}
                  onChange={e =>
                    dispatch({ type: 'updateElement', id: selected.id, patch: { visible: e.target.checked } })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['xMm', 'yMm', 'widthMm', 'heightMm'] as const).map(k => (
                  <label key={k} className="text-xs">
                    {k}
                    <input
                      type="number"
                      step="0.1"
                      value={selected[k]}
                      onChange={e =>
                        dispatch({
                          type: 'updateElement',
                          id: selected.id,
                          patch: { [k]: Number(e.target.value) } as Partial<LabelElement>,
                        })
                      }
                      className="mt-1 w-full rounded-lg bg-white/10 px-2 py-1"
                    />
                  </label>
                ))}
              </div>
              {(selected.type === 'text' || selected.type === 'field') && (
                <>
                  {selected.type === 'text' && (
                    <input
                      value={selected.properties.staticText || ''}
                      onChange={e =>
                        dispatch({
                          type: 'updateElement',
                          id: selected.id,
                          patch: { properties: { staticText: e.target.value } },
                        })
                      }
                      placeholder="Static text"
                      className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                    />
                  )}
                  {selected.type === 'field' && (
                    <select
                      value={selected.properties.fieldKey || 'product.name'}
                      onChange={e =>
                        dispatch({
                          type: 'updateElement',
                          id: selected.id,
                          patch: { properties: { fieldKey: e.target.value as LabelElement['properties']['fieldKey'] } },
                        })
                      }
                      className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                    >
                      {LABEL_DYNAMIC_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    value={selected.properties.fontSizePt || 8}
                    onChange={e =>
                      dispatch({
                        type: 'updateElement',
                        id: selected.id,
                        patch: { properties: { fontSizePt: Number(e.target.value) } },
                      })
                    }
                    className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                    aria-label="Font size pt"
                  />
                </>
              )}
              {selected.type === 'barcode' && (
                <select
                  value={selected.properties.barcodeType || 'CODE128'}
                  onChange={e =>
                    dispatch({
                      type: 'updateElement',
                      id: selected.id,
                      patch: {
                        properties: { barcodeType: e.target.value as LabelElement['properties']['barcodeType'] },
                      },
                    })
                  }
                  className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                >
                  {['EAN13', 'EAN8', 'CODE128', 'CODE39', 'UPC'].map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              {selected.type === 'qr' && (
                <p className="text-[11px] text-white/60 leading-snug">
                  QR encodes the product barcode at print time. The canvas shows a live sample using your company and
                  sample product data.
                </p>
              )}
              {(selected.type === 'logo' || selected.type === 'image') && (
                <div className="space-y-2">
                  {selected.type === 'logo' && (
                    <p className="text-[11px] text-white/60 leading-snug">
                      Uses your Bill Settings company logo at print time. Upload below only if you want a custom logo on
                      this template.
                    </p>
                  )}
                  <label className="block text-xs text-white/70">
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-1 block w-full text-xs text-white/80"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) attachImage(selected.id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {selected.properties.imageBase64 && (
                    <button
                      type="button"
                      className="text-xs text-rose-300 underline"
                      onClick={() =>
                        dispatch({
                          type: 'updateElement',
                          id: selected.id,
                          patch: { properties: { imageBase64: undefined } },
                        })
                      }
                    >
                      Remove uploaded image
                    </button>
                  )}
                  <label className="block text-xs text-white/70">
                    Fit
                    <select
                      value={selected.properties.fit || 'contain'}
                      onChange={e =>
                        dispatch({
                          type: 'updateElement',
                          id: selected.id,
                          patch: { properties: { fit: e.target.value as 'contain' | 'cover' } },
                        })
                      }
                      className="mt-1 w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'deleteSelected' })}
                  className="flex-1 py-2 rounded-lg border border-rose-400/40 text-rose-300 text-xs"
                >
                  <Trash2 size={14} className="inline" /> Delete
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/50">Select an element on the canvas.</p>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
              <Layers size={12} /> Layers
            </p>
            <div className="space-y-1">
              {[...sorted].reverse().map(el => (
                <button
                  key={el.id}
                  type="button"
                  onClick={() => dispatch({ type: 'select', id: el.id })}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded text-xs border',
                    el.id === state.selectedId ? 'border-brand bg-brand/10' : 'border-white/10',
                  )}
                >
                  {layerLabel(el)} {!el.visible && '(hidden)'}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
