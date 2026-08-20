/** Barcode & label template designer — shared schema, validation, dynamic fields. */

export const LABEL_SIZE_PRESETS = [
  { id: '38x25', label: '38 × 25 mm', widthMm: 38, heightMm: 25 },
  { id: '50x25', label: '50 × 25 mm', widthMm: 50, heightMm: 25 },
  { id: '50x30', label: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { id: '60x40', label: '60 × 40 mm', widthMm: 60, heightMm: 40 },
  { id: '100x50', label: '100 × 50 mm', widthMm: 100, heightMm: 50 },
] as const;

export const MAX_LABEL_WIDTH_MM = 200;
export const MAX_LABEL_HEIGHT_MM = 150;
export const MIN_LABEL_DIM_MM = 10;
export const MAX_ELEMENTS = 100;

export type BarcodeSymbology = 'CODE128' | 'EAN13' | 'EAN8' | 'CODE39' | 'UPC' | 'UPCE';

export type LabelElementType = 'text' | 'barcode' | 'qr' | 'logo' | 'image' | 'rect' | 'line' | 'field';

export type LabelTemplateStatus = 'active' | 'draft' | 'archived';

export type LabelDynamicFieldKey =
  | 'product.name'
  | 'product.barcode'
  | 'product.price'
  | 'product.hsn'
  | 'product.gstRate'
  | 'product.batchNumber'
  | 'company.name'
  | 'company.logo'
  | 'company.gstin'
  | 'company.phone'
  | 'company.address';

export const LABEL_DYNAMIC_FIELDS: {
  key: LabelDynamicFieldKey;
  label: string;
  group: 'product' | 'company';
}[] = [
  { key: 'product.name', label: 'Product name', group: 'product' },
  { key: 'product.barcode', label: 'Product barcode', group: 'product' },
  { key: 'product.price', label: 'Price / MRP', group: 'product' },
  { key: 'product.hsn', label: 'HSN code', group: 'product' },
  { key: 'product.gstRate', label: 'GST %', group: 'product' },
  { key: 'product.batchNumber', label: 'Batch number', group: 'product' },
  { key: 'company.name', label: 'Company name', group: 'company' },
  { key: 'company.logo', label: 'Company logo', group: 'company' },
  { key: 'company.gstin', label: 'Company GSTIN', group: 'company' },
  { key: 'company.phone', label: 'Company phone', group: 'company' },
  { key: 'company.address', label: 'Company address', group: 'company' },
];

export type LabelElementProperties = {
  staticText?: string;
  fieldKey?: LabelDynamicFieldKey;
  prefix?: string;
  suffix?: string;
  fontSizePt?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  wrap?: boolean;
  barcodeType?: BarcodeSymbology;
  barcodeValueSource?: 'product.barcode' | 'custom';
  customBarcodeValue?: string;
  showHumanReadable?: boolean;
  humanReadableFontSizePt?: number;
  humanReadablePosition?: 'bottom' | 'top';
  quietZoneMm?: number;
  fit?: 'contain' | 'cover';
  imageBase64?: string;
  strokeWidthMm?: number;
  fillColor?: string;
  strokeColor?: string;
};

export type LabelElement = {
  id: string;
  type: LabelElementType;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  properties: LabelElementProperties;
};

export type BarcodeLabelTemplate = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  widthMm: number;
  heightMm: number;
  orientation: 'landscape' | 'portrait';
  status: LabelTemplateStatus;
  isDefault: boolean;
  version: number;
  elements: LabelElement[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
};

export type LabelPrintContext = {
  product: {
    name: string;
    barcode: string;
    price: number;
    hsn?: string;
    gstRate?: number;
    batchNumber?: string;
  };
  company: {
    name: string;
    logo?: string | null;
    gstin?: string | null;
    phone?: string | null;
    address?: string | null;
  };
};

export const SAMPLE_LABEL_CONTEXT: LabelPrintContext = {
  product: {
    name: 'DG-Product-Alpha',
    barcode: '8901234567890',
    price: 999,
    hsn: '8471',
    gstRate: 18,
    batchNumber: 'BATCH-2026-01',
  },
  company: {
    name: 'NEXUS CORP',
    gstin: '24AABCU9603R1ZM',
    phone: '9876543210',
    address: 'Ahmedabad, Gujarat',
  },
};

export function roundMm(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampMm(n: number, min = 0, max = MAX_LABEL_WIDTH_MM): number {
  return roundMm(Math.min(max, Math.max(min, n)));
}

export function validateEan13Checksum(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]);
}

export function validateBarcodeValue(type: BarcodeSymbology, value: string): string | null {
  const v = String(value || '').trim();
  if (!v) return 'Barcode value is required';
  if (type === 'EAN13') {
    if (!/^\d{13}$/.test(v)) return 'EAN-13 must be exactly 13 digits';
    if (!validateEan13Checksum(v)) return 'EAN-13 checksum is invalid';
    return null;
  }
  if (type === 'EAN8') {
    if (!/^\d{8}$/.test(v)) return 'EAN-8 must be exactly 8 digits';
    return null;
  }
  if (type === 'UPC') {
    if (!/^\d{12}$/.test(v)) return 'UPC-A must be exactly 12 digits';
    return null;
  }
  if (type === 'UPCE') {
    if (!/^\d{6,8}$/.test(v)) return 'UPC-E must be 6–8 digits';
    return null;
  }
  if (type === 'CODE39') {
    if (!/^[0-9A-Z\-.\ \$\/\+\%]+$/.test(v)) return 'CODE-39 contains invalid characters';
    return null;
  }
  if (v.length > 80) return 'Barcode value is too long';
  return null;
}

export function jsBarcodeFormat(type: BarcodeSymbology): string {
  if (type === 'UPC') return 'UPC';
  if (type === 'UPCE') return 'UPC';
  if (type === 'EAN13') return 'EAN13';
  if (type === 'EAN8') return 'EAN8';
  if (type === 'CODE39') return 'CODE39';
  return 'CODE128';
}

export function resolveDynamicField(key: LabelDynamicFieldKey, ctx: LabelPrintContext): string {
  switch (key) {
    case 'product.name':
      return ctx.product.name;
    case 'product.barcode':
      return ctx.product.barcode;
    case 'product.price':
      return `₹${Number(ctx.product.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'product.hsn':
      return ctx.product.hsn || '';
    case 'product.gstRate':
      return ctx.product.gstRate != null ? `${ctx.product.gstRate}%` : '';
    case 'product.batchNumber':
      return ctx.product.batchNumber || '';
    case 'company.name':
      return ctx.company.name;
    case 'company.gstin':
      return ctx.company.gstin || '';
    case 'company.phone':
      return ctx.company.phone || '';
    case 'company.address':
      return ctx.company.address || '';
    case 'company.logo':
      return ctx.company.logo || '';
    default:
      return '';
  }
}

export function resolveElementText(el: LabelElement, ctx: LabelPrintContext): string {
  const p = el.properties || {};
  const prefix = p.prefix || '';
  const suffix = p.suffix || '';
  if (p.staticText) return `${prefix}${p.staticText}${suffix}`;
  if (p.fieldKey) return `${prefix}${resolveDynamicField(p.fieldKey, ctx)}${suffix}`;
  return '';
}

export function resolveBarcodeValue(el: LabelElement, ctx: LabelPrintContext): string {
  const p = el.properties || {};
  if (p.barcodeValueSource === 'custom' && p.customBarcodeValue) return p.customBarcodeValue.trim();
  return ctx.product.barcode || '';
}

export function normalizeLabelElement(raw: unknown, index: number): LabelElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as LabelElementType;
  const allowed: LabelElementType[] = ['text', 'barcode', 'qr', 'logo', 'image', 'rect', 'line', 'field'];
  if (!allowed.includes(type)) return null;
  const props = (r.properties && typeof r.properties === 'object' ? r.properties : {}) as LabelElementProperties;
  return {
    id: String(r.id || `el-${index}`),
    type,
    xMm: clampMm(Number(r.xMm) || 0, 0, MAX_LABEL_WIDTH_MM),
    yMm: clampMm(Number(r.yMm) || 0, 0, MAX_LABEL_HEIGHT_MM),
    widthMm: clampMm(Number(r.widthMm) || 10, 0.5, MAX_LABEL_WIDTH_MM),
    heightMm: clampMm(Number(r.heightMm) || 5, 0.5, MAX_LABEL_HEIGHT_MM),
    rotation: Number(r.rotation) || 0,
    zIndex: Number(r.zIndex) || index,
    visible: r.visible !== false,
    properties: props,
  };
}

export function validateLabelTemplateInput(input: {
  name?: string;
  widthMm?: number;
  heightMm?: number;
  elements?: unknown[];
}): string | null {
  const name = String(input.name || '').trim();
  if (!name) return 'Template name is required';
  if (name.length > 120) return 'Template name is too long';
  const w = Number(input.widthMm);
  const h = Number(input.heightMm);
  if (!Number.isFinite(w) || w < MIN_LABEL_DIM_MM || w > MAX_LABEL_WIDTH_MM)
    return `Width must be between ${MIN_LABEL_DIM_MM} and ${MAX_LABEL_WIDTH_MM} mm`;
  if (!Number.isFinite(h) || h < MIN_LABEL_DIM_MM || h > MAX_LABEL_HEIGHT_MM)
    return `Height must be between ${MIN_LABEL_DIM_MM} and ${MAX_LABEL_HEIGHT_MM} mm`;
  const elements = Array.isArray(input.elements) ? input.elements : [];
  if (elements.length > MAX_ELEMENTS) return `Maximum ${MAX_ELEMENTS} elements allowed`;
  for (const el of elements) {
    const norm = normalizeLabelElement(el, 0);
    if (!norm) return 'Invalid element in template';
    if (norm.type === 'barcode') {
      const type = norm.properties.barcodeType || 'CODE128';
      const sample = norm.properties.customBarcodeValue || '8901234567890';
      const err = validateBarcodeValue(type, sample);
      if (err && type === 'EAN13' && norm.properties.barcodeValueSource !== 'custom') {
        // dynamic product barcode validated at print time
      } else if (err && norm.properties.barcodeValueSource === 'custom') return err;
    }
  }
  return null;
}

export function defaultStarterTemplate(name = 'Product Label 38×25mm'): Omit<BarcodeLabelTemplate, 'id' | 'tenantId'> {
  return {
    name,
    description: null,
    widthMm: 38,
    heightMm: 25,
    orientation: 'landscape',
    status: 'draft',
    isDefault: false,
    version: 1,
    elements: [
      {
        id: 'el-logo',
        type: 'logo',
        xMm: 2,
        yMm: 1.5,
        widthMm: 8,
        heightMm: 6,
        rotation: 0,
        zIndex: 1,
        visible: true,
        properties: { fit: 'contain' },
      },
      {
        id: 'el-company',
        type: 'field',
        xMm: 11,
        yMm: 1.5,
        widthMm: 11,
        heightMm: 3,
        rotation: 0,
        zIndex: 2,
        visible: true,
        properties: { fieldKey: 'company.name', fontSizePt: 5.5, fontWeight: 'bold' },
      },
      {
        id: 'el-mrp',
        type: 'field',
        xMm: 22,
        yMm: 1.5,
        widthMm: 14,
        heightMm: 3,
        rotation: 0,
        zIndex: 3,
        visible: true,
        properties: {
          prefix: 'MRP: ',
          fieldKey: 'product.price',
          fontSizePt: 5.5,
          textAlign: 'right',
        },
      },
      {
        id: 'el-name',
        type: 'field',
        xMm: 2,
        yMm: 5,
        widthMm: 34,
        heightMm: 4,
        rotation: 0,
        zIndex: 4,
        visible: true,
        properties: { fieldKey: 'product.name', fontSizePt: 7, fontWeight: 'bold' },
      },
      {
        id: 'el-barcode',
        type: 'barcode',
        xMm: 2,
        yMm: 10,
        widthMm: 34,
        heightMm: 12,
        rotation: 0,
        zIndex: 5,
        visible: true,
        properties: {
          barcodeType: 'EAN13',
          barcodeValueSource: 'product.barcode',
          showHumanReadable: true,
          humanReadableFontSizePt: 6,
        },
      },
    ],
  };
}

export type LabelSampleTemplate = {
  id: string;
  name: string;
  description: string;
  template: Omit<BarcodeLabelTemplate, 'id' | 'tenantId'>;
};

/** Built-in layouts tenants can clone when creating a new template. */
export const LABEL_SAMPLE_TEMPLATES: LabelSampleTemplate[] = [
  {
    id: 'product-38x25',
    name: 'Product label 38×25 mm',
    description: 'Logo, company name, MRP, product name, and EAN-13 barcode.',
    template: defaultStarterTemplate('Product Label 38×25mm'),
  },
  {
    id: 'jewellery-50x25',
    name: 'Jewellery tag 50×25 mm',
    description: 'Wider tag with logo, product name, MRP, and CODE-128 barcode.',
    template: {
      name: 'Jewellery Tag 50×25mm',
      description: 'Jewellery / silver casting tag layout',
      widthMm: 50,
      heightMm: 25,
      orientation: 'landscape',
      status: 'draft',
      isDefault: false,
      version: 1,
      elements: [
        {
          id: 'el-logo',
          type: 'logo',
          xMm: 2,
          yMm: 2,
          widthMm: 10,
          heightMm: 8,
          rotation: 0,
          zIndex: 1,
          visible: true,
          properties: { fit: 'contain' },
        },
        {
          id: 'el-name',
          type: 'field',
          xMm: 14,
          yMm: 2,
          widthMm: 34,
          heightMm: 4,
          rotation: 0,
          zIndex: 2,
          visible: true,
          properties: { fieldKey: 'product.name', fontSizePt: 8, fontWeight: 'bold' },
        },
        {
          id: 'el-mrp',
          type: 'field',
          xMm: 14,
          yMm: 7,
          widthMm: 34,
          heightMm: 3,
          rotation: 0,
          zIndex: 3,
          visible: true,
          properties: { prefix: 'MRP: ', fieldKey: 'product.price', fontSizePt: 6 },
        },
        {
          id: 'el-hsn',
          type: 'field',
          xMm: 14,
          yMm: 11,
          widthMm: 16,
          heightMm: 3,
          rotation: 0,
          zIndex: 4,
          visible: true,
          properties: { prefix: 'HSN: ', fieldKey: 'product.hsn', fontSizePt: 5.5 },
        },
        {
          id: 'el-barcode',
          type: 'barcode',
          xMm: 2,
          yMm: 14,
          widthMm: 46,
          heightMm: 9,
          rotation: 0,
          zIndex: 5,
          visible: true,
          properties: {
            barcodeType: 'CODE128',
            barcodeValueSource: 'product.barcode',
            showHumanReadable: true,
            humanReadableFontSizePt: 5.5,
          },
        },
      ],
    },
  },
  {
    id: 'shelf-100x50',
    name: 'Shelf label 100×50 mm',
    description: 'Large shelf sticker with branding, product details, and EAN-13 barcode.',
    template: {
      name: 'Shelf Label 100×50mm',
      description: 'Large format shelf / box label',
      widthMm: 100,
      heightMm: 50,
      orientation: 'landscape',
      status: 'draft',
      isDefault: false,
      version: 1,
      elements: [
        {
          id: 'el-logo',
          type: 'logo',
          xMm: 3,
          yMm: 3,
          widthMm: 18,
          heightMm: 14,
          rotation: 0,
          zIndex: 1,
          visible: true,
          properties: { fit: 'contain' },
        },
        {
          id: 'el-company',
          type: 'field',
          xMm: 24,
          yMm: 3,
          widthMm: 40,
          heightMm: 5,
          rotation: 0,
          zIndex: 2,
          visible: true,
          properties: { fieldKey: 'company.name', fontSizePt: 10, fontWeight: 'bold' },
        },
        {
          id: 'el-gstin',
          type: 'field',
          xMm: 24,
          yMm: 9,
          widthMm: 40,
          heightMm: 4,
          rotation: 0,
          zIndex: 3,
          visible: true,
          properties: { prefix: 'GSTIN: ', fieldKey: 'company.gstin', fontSizePt: 7 },
        },
        {
          id: 'el-name',
          type: 'field',
          xMm: 3,
          yMm: 20,
          widthMm: 94,
          heightMm: 8,
          rotation: 0,
          zIndex: 4,
          visible: true,
          properties: { fieldKey: 'product.name', fontSizePt: 12, fontWeight: 'bold' },
        },
        {
          id: 'el-mrp',
          type: 'field',
          xMm: 3,
          yMm: 30,
          widthMm: 30,
          heightMm: 5,
          rotation: 0,
          zIndex: 5,
          visible: true,
          properties: { prefix: 'MRP: ', fieldKey: 'product.price', fontSizePt: 9, fontWeight: 'bold' },
        },
        {
          id: 'el-batch',
          type: 'field',
          xMm: 35,
          yMm: 30,
          widthMm: 30,
          heightMm: 5,
          rotation: 0,
          zIndex: 6,
          visible: true,
          properties: { prefix: 'Batch: ', fieldKey: 'product.batchNumber', fontSizePt: 7 },
        },
        {
          id: 'el-barcode',
          type: 'barcode',
          xMm: 3,
          yMm: 37,
          widthMm: 60,
          heightMm: 10,
          rotation: 0,
          zIndex: 7,
          visible: true,
          properties: {
            barcodeType: 'EAN13',
            barcodeValueSource: 'product.barcode',
            showHumanReadable: true,
            humanReadableFontSizePt: 8,
          },
        },
      ],
    },
  },
  {
    id: 'compact-qr-38x25',
    name: 'Compact QR 38×25 mm',
    description: 'Small label with product name, MRP, and QR code.',
    template: {
      name: 'Compact QR 38×25mm',
      description: 'QR-based compact label',
      widthMm: 38,
      heightMm: 25,
      orientation: 'landscape',
      status: 'draft',
      isDefault: false,
      version: 1,
      elements: [
        {
          id: 'el-name',
          type: 'field',
          xMm: 2,
          yMm: 2,
          widthMm: 22,
          heightMm: 5,
          rotation: 0,
          zIndex: 1,
          visible: true,
          properties: { fieldKey: 'product.name', fontSizePt: 7, fontWeight: 'bold', wrap: true },
        },
        {
          id: 'el-mrp',
          type: 'field',
          xMm: 2,
          yMm: 8,
          widthMm: 22,
          heightMm: 3,
          rotation: 0,
          zIndex: 2,
          visible: true,
          properties: { prefix: 'MRP ', fieldKey: 'product.price', fontSizePt: 6 },
        },
        {
          id: 'el-qr',
          type: 'qr',
          xMm: 26,
          yMm: 2,
          widthMm: 10,
          heightMm: 10,
          rotation: 0,
          zIndex: 3,
          visible: true,
          properties: { barcodeValueSource: 'product.barcode' },
        },
      ],
    },
  },
  {
    id: 'qr-product-50x25',
    name: 'QR product label 50×25 mm',
    description: 'Logo, product name, MRP, and a large scannable QR code (no linear barcode).',
    template: {
      name: 'QR Product Label 50×25mm',
      description: 'QR-only retail product label',
      widthMm: 50,
      heightMm: 25,
      orientation: 'landscape',
      status: 'draft',
      isDefault: false,
      version: 1,
      elements: [
        {
          id: 'el-logo',
          type: 'logo',
          xMm: 2,
          yMm: 2,
          widthMm: 8,
          heightMm: 7,
          rotation: 0,
          zIndex: 1,
          visible: true,
          properties: { fit: 'contain' },
        },
        {
          id: 'el-name',
          type: 'field',
          xMm: 11,
          yMm: 2,
          widthMm: 22,
          heightMm: 5,
          rotation: 0,
          zIndex: 2,
          visible: true,
          properties: { fieldKey: 'product.name', fontSizePt: 7.5, fontWeight: 'bold', wrap: true },
        },
        {
          id: 'el-mrp',
          type: 'field',
          xMm: 11,
          yMm: 8,
          widthMm: 22,
          heightMm: 3,
          rotation: 0,
          zIndex: 3,
          visible: true,
          properties: { prefix: 'MRP: ', fieldKey: 'product.price', fontSizePt: 6 },
        },
        {
          id: 'el-barcode-text',
          type: 'field',
          xMm: 11,
          yMm: 12,
          widthMm: 22,
          heightMm: 3,
          rotation: 0,
          zIndex: 4,
          visible: true,
          properties: { prefix: 'Code: ', fieldKey: 'product.barcode', fontSizePt: 5.5 },
        },
        {
          id: 'el-qr',
          type: 'qr',
          xMm: 35,
          yMm: 2,
          widthMm: 13,
          heightMm: 13,
          rotation: 0,
          zIndex: 5,
          visible: true,
          properties: { barcodeValueSource: 'product.barcode' },
        },
      ],
    },
  },
  {
    id: 'qr-jewellery-50x25',
    name: 'QR jewellery tag 50×25 mm',
    description: 'Jewellery tag with product details and QR code instead of linear barcode.',
    template: {
      name: 'QR Jewellery Tag 50×25mm',
      description: 'Jewellery tag with QR encoding',
      widthMm: 50,
      heightMm: 25,
      orientation: 'landscape',
      status: 'draft',
      isDefault: false,
      version: 1,
      elements: [
        {
          id: 'el-logo',
          type: 'logo',
          xMm: 2,
          yMm: 2,
          widthMm: 9,
          heightMm: 8,
          rotation: 0,
          zIndex: 1,
          visible: true,
          properties: { fit: 'contain' },
        },
        {
          id: 'el-name',
          type: 'field',
          xMm: 12,
          yMm: 2,
          widthMm: 22,
          heightMm: 4,
          rotation: 0,
          zIndex: 2,
          visible: true,
          properties: { fieldKey: 'product.name', fontSizePt: 7, fontWeight: 'bold' },
        },
        {
          id: 'el-mrp',
          type: 'field',
          xMm: 12,
          yMm: 7,
          widthMm: 22,
          heightMm: 3,
          rotation: 0,
          zIndex: 3,
          visible: true,
          properties: { prefix: 'MRP: ', fieldKey: 'product.price', fontSizePt: 6 },
        },
        {
          id: 'el-hsn',
          type: 'field',
          xMm: 12,
          yMm: 11,
          widthMm: 22,
          heightMm: 3,
          rotation: 0,
          zIndex: 4,
          visible: true,
          properties: { prefix: 'HSN: ', fieldKey: 'product.hsn', fontSizePt: 5.5 },
        },
        {
          id: 'el-qr',
          type: 'qr',
          xMm: 36,
          yMm: 2,
          widthMm: 12,
          heightMm: 12,
          rotation: 0,
          zIndex: 5,
          visible: true,
          properties: { barcodeValueSource: 'product.barcode' },
        },
      ],
    },
  },
  {
    id: 'qr-shelf-50x30',
    name: 'QR shelf label 50×30 mm',
    description: 'Medium shelf sticker with branding, MRP, and a prominent QR code.',
    template: {
      name: 'QR Shelf Label 50×30mm',
      description: 'Shelf label optimized for QR scanning',
      widthMm: 50,
      heightMm: 30,
      orientation: 'landscape',
      status: 'draft',
      isDefault: false,
      version: 1,
      elements: [
        {
          id: 'el-logo',
          type: 'logo',
          xMm: 2,
          yMm: 2,
          widthMm: 10,
          heightMm: 8,
          rotation: 0,
          zIndex: 1,
          visible: true,
          properties: { fit: 'contain' },
        },
        {
          id: 'el-company',
          type: 'field',
          xMm: 14,
          yMm: 2,
          widthMm: 20,
          heightMm: 4,
          rotation: 0,
          zIndex: 2,
          visible: true,
          properties: { fieldKey: 'company.name', fontSizePt: 6.5, fontWeight: 'bold' },
        },
        {
          id: 'el-name',
          type: 'field',
          xMm: 2,
          yMm: 11,
          widthMm: 32,
          heightMm: 5,
          rotation: 0,
          zIndex: 3,
          visible: true,
          properties: { fieldKey: 'product.name', fontSizePt: 8, fontWeight: 'bold' },
        },
        {
          id: 'el-mrp',
          type: 'field',
          xMm: 2,
          yMm: 17,
          widthMm: 18,
          heightMm: 4,
          rotation: 0,
          zIndex: 4,
          visible: true,
          properties: { prefix: 'MRP: ', fieldKey: 'product.price', fontSizePt: 7, fontWeight: 'bold' },
        },
        {
          id: 'el-batch',
          type: 'field',
          xMm: 2,
          yMm: 22,
          widthMm: 18,
          heightMm: 3,
          rotation: 0,
          zIndex: 5,
          visible: true,
          properties: { prefix: 'Batch: ', fieldKey: 'product.batchNumber', fontSizePt: 5.5 },
        },
        {
          id: 'el-qr',
          type: 'qr',
          xMm: 36,
          yMm: 10,
          widthMm: 12,
          heightMm: 12,
          rotation: 0,
          zIndex: 6,
          visible: true,
          properties: { barcodeValueSource: 'product.barcode' },
        },
      ],
    },
  },
];

export function getLabelSampleTemplate(id: string): LabelSampleTemplate | undefined {
  return LABEL_SAMPLE_TEMPLATES.find(s => s.id === id);
}
