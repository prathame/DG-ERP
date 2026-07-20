import { describe, it, expect, vi } from 'vitest';
import type { Product, Vendor } from '../../src/types';
import {
  cell,
  normalizeImportRows,
  groupDocumentRows,
  resolveProduct,
  resolveVendor,
  buildDocumentsFromRows,
  importQuotationsFromRows,
  importOrdersFromRows,
  MAX_DOCUMENT_IMPORT,
} from '../../src/lib/documentImport';

const products: Product[] = [
  {
    id: 'P1',
    name: 'Widget A',
    barcode: 'BC-100',
    price: 100,
    stock: 10,
    warrantyMonths: 12,
  },
  {
    id: 'P2',
    name: 'Widget B',
    barcode: 'BC-200',
    price: 200,
    stock: 5,
    warrantyMonths: 6,
  },
];

const vendors: Vendor[] = [
  { id: 'V1', name: 'Acme Corp' },
  { id: 'V2', name: 'Beta Traders' },
];

describe('cell', () => {
  it('reads case/spacing-insensitive keys', () => {
    expect(cell({ 'Product Name': 'X' }, 'productName')).toBe('X');
    expect(cell({ group_id: 'g1' }, 'groupId')).toBe('g1');
  });
});

describe('normalizeImportRows + groupDocumentRows', () => {
  it('groups rows with the same groupId', () => {
    const rows = normalizeImportRows([
      { groupId: 'Q1', productName: 'Widget A', quantity: '2' },
      { groupId: 'Q1', productName: 'Widget B', quantity: '1' },
      { groupId: 'Q2', productName: 'Widget A', quantity: '3' },
    ]);
    const groups = groupDocumentRows(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows).toHaveLength(1);
  });

  it('treats blank groupId as one document per row', () => {
    const rows = normalizeImportRows([
      { productName: 'Widget A', quantity: '1' },
      { productName: 'Widget B', quantity: '2' },
    ]);
    expect(groupDocumentRows(rows)).toHaveLength(2);
  });
});

describe('resolveProduct / resolveVendor', () => {
  it('matches product by name then barcode', () => {
    expect(resolveProduct(products, 'widget a', '')?.id).toBe('P1');
    expect(resolveProduct(products, '', 'bc-200')?.id).toBe('P2');
    expect(resolveProduct(products, 'Missing', 'BC-100')?.id).toBe('P1');
  });

  it('matches vendor by name', () => {
    expect(resolveVendor(vendors, 'acme corp')?.id).toBe('V1');
    expect(resolveVendor(vendors, 'Nobody')).toBeUndefined();
  });
});

describe('buildDocumentsFromRows', () => {
  it('builds a multi-line quotation document', () => {
    const { documents, errors } = buildDocumentsFromRows(
      [
        {
          groupId: '1',
          vendorName: 'Acme Corp',
          customerName: 'Walk-in',
          productName: 'Widget A',
          quantity: '2',
          price: '90',
        },
        { groupId: '1', barcode: 'BC-200', quantity: '1' },
      ],
      { products, vendors },
    );
    expect(errors).toEqual([]);
    expect(documents).toHaveLength(1);
    expect(documents[0].vendorId).toBe('V1');
    expect(documents[0].items).toHaveLength(2);
    expect(documents[0].items[0]).toMatchObject({ productId: 'P1', quantity: 2, customPrice: 90 });
    expect(documents[0].items[1]).toMatchObject({ productId: 'P2', quantity: 1 });
  });

  it('allows custom lines when enabled', () => {
    const { documents, errors } = buildDocumentsFromRows(
      [{ productName: 'Custom service', quantity: '1', price: '500' }],
      { products, vendors, allowCustomLines: true },
    );
    expect(errors).toEqual([]);
    expect(documents[0].items[0]).toMatchObject({
      description: 'Custom service',
      customPrice: 500,
      quantity: 1,
    });
  });

  it('errors when product missing and custom lines disabled', () => {
    const { documents, errors } = buildDocumentsFromRows([{ productName: 'Unknown', quantity: '1', price: '10' }], {
      products,
      vendors,
      requireProduct: true,
    });
    expect(documents).toHaveLength(0);
    expect(errors[0]).toMatch(/Product "Unknown" not found/);
  });

  it('rejects too many documents', () => {
    const rows = Array.from({ length: MAX_DOCUMENT_IMPORT + 1 }, (_, i) => ({
      productName: 'Widget A',
      quantity: '1',
      groupId: `g${i}`,
    }));
    const { errors } = buildDocumentsFromRows(rows, { products, vendors });
    expect(errors[0]).toMatch(/Too many documents/);
  });
});

describe('importQuotationsFromRows / importOrdersFromRows', () => {
  it('posts one body per quotation group', async () => {
    const post = vi.fn().mockResolvedValue({});
    const result = await importQuotationsFromRows(
      [
        { groupId: 'A', productName: 'Widget A', quantity: '1', vendorName: 'Acme Corp' },
        { groupId: 'A', productName: 'Widget B', quantity: '2' },
        { productName: 'Widget A', quantity: '1' },
      ],
      { products, vendors, post },
    );
    expect(result.success).toBe(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][0].items).toHaveLength(2);
    expect(post.mock.calls[1][0].items).toHaveLength(1);
  });

  it('posts orders with product ids only', async () => {
    const post = vi.fn().mockResolvedValue({});
    const result = await importOrdersFromRows(
      [{ productName: 'Widget A', quantity: '3', customerGstNumber: '29AAAAA0000A1Z5' }],
      { products, vendors, post },
    );
    expect(result.success).toBe(1);
    expect(post.mock.calls[0][0]).toMatchObject({
      customerGstNumber: '29AAAAA0000A1Z5',
      items: [{ productId: 'P1', quantity: 3 }],
    });
  });

  it('collects post failures without aborting later docs', async () => {
    const post = vi.fn().mockRejectedValueOnce(new Error('server down')).mockResolvedValueOnce({});
    const result = await importQuotationsFromRows(
      [
        { productName: 'Widget A', quantity: '1' },
        { productName: 'Widget B', quantity: '1' },
      ],
      { products, vendors, post },
    );
    expect(result.success).toBe(1);
    expect(result.errors.some(e => e.includes('server down'))).toBe(true);
  });
});
