import type { Product, Vendor } from '../types';

export const MAX_DOCUMENT_IMPORT = 100;

export type NormalizedDocRow = {
  /** Spreadsheet row number (header = 1, first data row = 2). */
  sourceRow: number;
  groupId: string;
  vendorName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerGstNumber: string;
  date: string;
  validUntil: string;
  requiredDate: string;
  notes: string;
  productName: string;
  barcode: string;
  quantity: number;
  price: string;
  discountPercent: number;
  withGst: boolean;
};

export type DocumentGroup = {
  groupKey: string;
  rows: NormalizedDocRow[];
};

function normKey(k: string): string {
  return k.toLowerCase().replace(/[\s_-]+/g, '');
}

/** Read a cell by canonical key or aliases (case/spacing insensitive). */
export function cell(row: Record<string, string>, ...keys: string[]): string {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normKey(k), String(v ?? '').trim());
  }
  for (const key of keys) {
    const v = map.get(normKey(key));
    if (v) return v;
  }
  return '';
}

function parseBool(raw: string, defaultValue = true): boolean {
  if (!raw.trim()) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  return defaultValue;
}

function parseQty(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeImportRows(rows: Record<string, string>[]): NormalizedDocRow[] {
  return rows.map((row, i) => {
    const qtyRaw = cell(row, 'quantity', 'qty', 'qty.');
    return {
      sourceRow: i + 2,
      groupId: cell(row, 'groupId', 'group', 'group_id'),
      vendorName: cell(row, 'vendorName', 'vendor', 'clientName', 'client'),
      customerName: cell(row, 'customerName', 'customer', 'party'),
      customerPhone: cell(row, 'customerPhone', 'phone', 'mobile'),
      customerEmail: cell(row, 'customerEmail', 'email'),
      customerGstNumber: cell(row, 'customerGstNumber', 'gstNumber', 'gstin', 'gst'),
      date: cell(row, 'date', 'quotationDate', 'orderDate'),
      validUntil: cell(row, 'validUntil', 'valid_until', 'expiry'),
      requiredDate: cell(row, 'requiredDate', 'required_date', 'dueDate'),
      notes: cell(row, 'notes', 'note', 'remarks'),
      productName: cell(row, 'productName', 'product', 'item', 'description'),
      barcode: cell(row, 'barcode', 'sku', 'code'),
      quantity: parseQty(qtyRaw),
      price: cell(row, 'price', 'customPrice', 'rate', 'unitPrice'),
      discountPercent: Number(cell(row, 'discountPercent', 'discount', 'disc') || '0') || 0,
      withGst: parseBool(cell(row, 'withGst', 'gst'), true),
    };
  });
}

/** Group by groupId; blank groupId → each row is its own document. */
export function groupDocumentRows(rows: NormalizedDocRow[]): DocumentGroup[] {
  const groups: DocumentGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const row of rows) {
    const key = row.groupId ? `g:${row.groupId}` : `r:${row.sourceRow}`;
    const existing = indexByKey.get(key);
    if (existing != null) {
      groups[existing].rows.push(row);
    } else {
      indexByKey.set(key, groups.length);
      groups.push({ groupKey: key, rows: [row] });
    }
  }
  return groups;
}

export function resolveProduct(products: Product[], productName: string, barcode: string): Product | undefined {
  if (productName) {
    const byName = products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    if (byName) return byName;
  }
  if (barcode) {
    const code = barcode.toLowerCase();
    return products.find(p => (p.barcode || '').toLowerCase() === code);
  }
  return undefined;
}

export function resolveVendor(vendors: Vendor[], vendorName: string): Vendor | undefined {
  if (!vendorName) return undefined;
  return vendors.find(v => v.name.toLowerCase() === vendorName.toLowerCase());
}

export type LineItemPayload = {
  productId?: string;
  description?: string;
  quantity: number;
  customPrice?: number;
  discountPercent?: number;
  withGst: boolean;
};

export type BuiltDocument = {
  firstSourceRow: number;
  vendorId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstNumber?: string;
  date?: string;
  validUntil?: string;
  requiredDate?: string;
  notes?: string;
  items: LineItemPayload[];
};

export type BuildDocsOptions = {
  products: Product[];
  vendors: Vendor[];
  /** When true, unmatched productName + price becomes a custom free-text line. */
  allowCustomLines?: boolean;
  /** Require every line to resolve to a catalog product (orders). */
  requireProduct?: boolean;
};

export function buildDocumentsFromRows(
  rawRows: Record<string, string>[],
  options: BuildDocsOptions,
): { documents: BuiltDocument[]; errors: string[] } {
  const normalized = normalizeImportRows(rawRows);
  const groups = groupDocumentRows(normalized);
  const errors: string[] = [];
  const documents: BuiltDocument[] = [];

  if (groups.length > MAX_DOCUMENT_IMPORT) {
    return {
      documents: [],
      errors: [`Too many documents (${groups.length}). Maximum is ${MAX_DOCUMENT_IMPORT} per import.`],
    };
  }

  for (const group of groups) {
    const header = group.rows[0];
    const vendor = resolveVendor(options.vendors, header.vendorName);
    if (header.vendorName && !vendor) {
      errors.push(`Row ${header.sourceRow}: Vendor "${header.vendorName}" not found`);
      continue;
    }

    const items: LineItemPayload[] = [];
    let lineError = false;

    for (const row of group.rows) {
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
        errors.push(`Row ${row.sourceRow}: Quantity must be a positive number`);
        lineError = true;
        break;
      }
      if (!row.productName && !row.barcode) {
        errors.push(`Row ${row.sourceRow}: productName or barcode is required`);
        lineError = true;
        break;
      }

      const product = resolveProduct(options.products, row.productName, row.barcode);
      const priceNum = row.price ? Number(row.price.replace(/,/g, '')) : NaN;
      const hasPrice = Number.isFinite(priceNum) && priceNum >= 0;

      if (product) {
        items.push({
          productId: product.id,
          quantity: row.quantity,
          customPrice: hasPrice ? priceNum : undefined,
          discountPercent: row.discountPercent > 0 ? row.discountPercent : undefined,
          withGst: row.withGst,
        });
      } else if (options.allowCustomLines && row.productName && hasPrice && priceNum > 0) {
        items.push({
          description: row.productName,
          quantity: row.quantity,
          customPrice: priceNum,
          discountPercent: row.discountPercent > 0 ? row.discountPercent : undefined,
          withGst: row.withGst,
        });
      } else if (options.requireProduct || !options.allowCustomLines) {
        const label = row.productName || row.barcode;
        errors.push(`Row ${row.sourceRow}: Product "${label}" not found`);
        lineError = true;
        break;
      } else {
        errors.push(
          `Row ${row.sourceRow}: Product "${row.productName || row.barcode}" not found (add price for custom line)`,
        );
        lineError = true;
        break;
      }
    }

    if (lineError || items.length === 0) continue;

    documents.push({
      firstSourceRow: header.sourceRow,
      vendorId: vendor?.id,
      customerName: header.customerName || header.vendorName || undefined,
      customerPhone: header.customerPhone || undefined,
      customerEmail: header.customerEmail || undefined,
      customerGstNumber: header.customerGstNumber || undefined,
      date: header.date || undefined,
      validUntil: header.validUntil || undefined,
      requiredDate: header.requiredDate || undefined,
      notes: header.notes || undefined,
      items,
    });
  }

  return { documents, errors };
}

export type ImportResult = { success: number; errors: string[] };

export async function importQuotationsFromRows(
  rawRows: Record<string, string>[],
  options: BuildDocsOptions & {
    post: (body: Record<string, unknown>) => Promise<unknown>;
    gstRate?: number;
  },
): Promise<ImportResult> {
  const { documents, errors } = buildDocumentsFromRows(rawRows, {
    products: options.products,
    vendors: options.vendors,
    allowCustomLines: options.allowCustomLines,
    requireProduct: false,
  });
  if (errors.length > 0 && documents.length === 0) {
    return { success: 0, errors };
  }

  let success = 0;
  const postErrors = [...errors];

  for (const doc of documents) {
    try {
      await options.post({
        vendorId: doc.vendorId,
        customerName: doc.customerName,
        customerPhone: doc.customerPhone,
        customerEmail: doc.customerEmail,
        quotationDate: doc.date,
        validUntil: doc.validUntil,
        gstRate: options.gstRate ?? 18,
        notes: doc.notes,
        items: doc.items,
      });
      success += 1;
    } catch (err) {
      postErrors.push(
        `Row ${doc.firstSourceRow}: ${err instanceof Error ? err.message : 'Failed to create quotation'}`,
      );
    }
  }

  return { success, errors: postErrors };
}

export async function importOrdersFromRows(
  rawRows: Record<string, string>[],
  options: BuildDocsOptions & {
    post: (body: Record<string, unknown>) => Promise<unknown>;
    gstRate?: number;
  },
): Promise<ImportResult> {
  const { documents, errors } = buildDocumentsFromRows(rawRows, {
    products: options.products,
    vendors: options.vendors,
    allowCustomLines: false,
    requireProduct: true,
  });
  if (errors.length > 0 && documents.length === 0) {
    return { success: 0, errors };
  }

  let success = 0;
  const postErrors = [...errors];

  for (const doc of documents) {
    try {
      await options.post({
        vendorId: doc.vendorId,
        customerName: doc.customerName,
        customerPhone: doc.customerPhone,
        customerGstNumber: doc.customerGstNumber,
        orderDate: doc.date,
        requiredDate: doc.requiredDate,
        gstRate: options.gstRate ?? 18,
        notes: doc.notes,
        items: doc.items,
      });
      success += 1;
    } catch (err) {
      postErrors.push(`Row ${doc.firstSourceRow}: ${err instanceof Error ? err.message : 'Failed to create order'}`);
    }
  }

  return { success, errors: postErrors };
}

/** Column defs for CsvImport templates. */
export const QUOTATION_IMPORT_COLUMNS = [
  { key: 'groupId', label: 'Group ID' },
  { key: 'vendorName', label: 'Vendor / Client' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerPhone', label: 'Customer Phone' },
  { key: 'customerEmail', label: 'Customer Email' },
  { key: 'date', label: 'Date' },
  { key: 'validUntil', label: 'Valid Until' },
  { key: 'productName', label: 'Product Name' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'price', label: 'Price' },
  { key: 'discountPercent', label: 'Discount %' },
  { key: 'withGst', label: 'With GST' },
  { key: 'notes', label: 'Notes' },
] as const;

export const ORDER_IMPORT_COLUMNS = [
  { key: 'groupId', label: 'Group ID' },
  { key: 'vendorName', label: 'Vendor / Client' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerPhone', label: 'Customer Phone' },
  { key: 'customerGstNumber', label: 'Customer GSTIN' },
  { key: 'date', label: 'Date' },
  { key: 'requiredDate', label: 'Required Date' },
  { key: 'productName', label: 'Product Name' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'price', label: 'Price' },
  { key: 'discountPercent', label: 'Discount %' },
  { key: 'withGst', label: 'With GST' },
  { key: 'notes', label: 'Notes' },
] as const;
