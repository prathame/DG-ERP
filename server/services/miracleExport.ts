/**
 * Miracle Accounting (RKIT) DBF export.
 *
 * Produces a ZIP with CMP0001/YR01/ containing:
 *   RKACCM01.DBF  — ledgers (vendors + suppliers + customers + system accounts)
 *   rkaccm21.dbf  — stock items (products)
 *   rkaccm29.dbf  — stock rates (sale/purchase/MRP)
 *   RKACCT41.DBF  — voucher headers (sales, purchases, payments, expenses)
 *   RKACCT01.DBF  — voucher ledger entries (Dr/Cr lines)
 *   RKACCT02.DBF  — voucher stock lines (item qty/rate)
 *   version.txt   — company info
 *
 * Voucher type codes (FIELD74):
 *   SP = Sales invoice   PU = Purchase invoice
 *   CB = Cash/Bank (receipts + payments + expenses)
 *   SE = Quotation/Estimate
 *
 * Ledger type codes (FIELD07):
 *   PR = Trading party (vendor/customer)   EX = Expense
 *   CA = Cash   IN = Income/Sales   PU = Purchase account
 */

import AdmZip from 'adm-zip';
import type { Pool } from 'pg';
import { writeDbf, type DbfWriteField } from '../utils/dbf';

// ── Field schema definitions ─────────────────────────────────────────────────

const LEDGER_FIELDS: DbfWriteField[] = [
  { name: 'FIELD01', type: 'C', length: 20 }, // external ref / code
  { name: 'FIELD02', type: 'C', length: 50 }, // name
  { name: 'FIELD04', type: 'C', length: 10 }, // nature
  { name: 'FIELD05', type: 'C', length: 20 }, // group ext ref
  { name: 'FIELD07', type: 'C', length: 10 }, // ledger type
  { name: 'FIELD10', type: 'N', length: 14, decimals: 2 }, // opening balance
  { name: 'FIELD31', type: 'C', length: 50 }, // address1
  { name: 'FIELD32', type: 'C', length: 50 }, // address2
  { name: 'FIELD33', type: 'C', length: 50 }, // city
  { name: 'FIELD34', type: 'C', length: 20 }, // pincode
  { name: 'FIELD40', type: 'C', length: 20 }, // GSTIN
  { name: 'M01F05', type: 'C', length: 20 }, // phone
  { name: 'M01F15', type: 'C', length: 20 }, // mobile
  { name: 'M01F18', type: 'C', length: 50 }, // email
];

const PRODUCT_FIELDS: DbfWriteField[] = [
  { name: 'FIELD01', type: 'C', length: 20 }, // external ref
  { name: 'FIELD02', type: 'C', length: 100 }, // name
  { name: 'FIELD04', type: 'C', length: 20 }, // code
  { name: 'FIELD05', type: 'C', length: 10 }, // unit
  { name: 'FIELD20', type: 'C', length: 20 }, // tax class
  { name: 'FIELD40', type: 'C', length: 20 }, // HSN
];

const RATE_FIELDS: DbfWriteField[] = [
  { name: 'M29F01', type: 'C', length: 20 }, // product ext ref
  { name: 'M29F02', type: 'N', length: 12, decimals: 2 }, // MRP
  { name: 'M29F03', type: 'N', length: 12, decimals: 2 }, // sale rate
  { name: 'M29F10', type: 'N', length: 12, decimals: 2 }, // purchase rate
];

const VOUCHER_HDR_FIELDS: DbfWriteField[] = [
  { name: 'FIELD01', type: 'C', length: 20 }, // voucher ext ref
  { name: 'FIELD02', type: 'D', length: 8 }, // date
  { name: 'FIELD04', type: 'C', length: 20 }, // party ledger ext ref
  { name: 'FIELD05', type: 'C', length: 20 }, // contra ledger ext ref
  { name: 'FIELD06', type: 'N', length: 14, decimals: 2 }, // debit amount
  { name: 'FIELD07', type: 'N', length: 14, decimals: 2 }, // credit amount
  { name: 'FIELD12', type: 'C', length: 20 }, // voucher number
  { name: 'FIELD16', type: 'C', length: 10 }, // subtype
  { name: 'FIELD74', type: 'C', length: 10 }, // voucher type
  { name: 'FIELD98', type: 'C', length: 10 }, // type alt
  { name: 'T41FVNO', type: 'C', length: 20 }, // voucher number alt
];

const VOUCHER_ENT_FIELDS: DbfWriteField[] = [
  { name: 'FIELD01', type: 'C', length: 20 }, // voucher ext ref
  { name: 'FIELD03', type: 'C', length: 20 }, // ledger ext ref
  { name: 'FIELD04', type: 'C', length: 20 }, // contra ledger ext ref
  { name: 'FIELD05', type: 'N', length: 14, decimals: 2 }, // amount
  { name: 'FIELD06', type: 'C', length: 1 }, // side D/C
];

const VOUCHER_ITEM_FIELDS: DbfWriteField[] = [
  { name: 'FIELD01', type: 'C', length: 20 }, // voucher ext ref
  { name: 'FIELD03', type: 'C', length: 20 }, // product ext ref
  { name: 'FIELD06', type: 'N', length: 12, decimals: 2 }, // qty
  { name: 'FIELD07', type: 'N', length: 12, decimals: 2 }, // rate
  { name: 'FIELD08', type: 'N', length: 14, decimals: 2 }, // amount
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function padRef(prefix: string, id: string): string {
  return `${prefix}${id.slice(-14)}`.slice(0, 20);
}

function isoToDate(s: unknown): string {
  if (!s) return '        ';
  const d = s instanceof Date ? s : new Date(String(s));
  if (isNaN(d.getTime())) return '        ';
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildMiracleExportZip(pool: Pool, tenantId: string): Promise<Buffer> {
  const [
    vendors,
    suppliers,
    customers,
    products,
    sales,
    purchases,
    expenses,
    invoices,
    vendorPayments,
    supplierPayments,
    invoicePayments,
    staffPayments,
    tenantRow,
  ] = await Promise.all([
    pool.query('SELECT * FROM vendors WHERE tenant_id=$1 ORDER BY name', [tenantId]),
    pool.query('SELECT * FROM suppliers WHERE tenant_id=$1 ORDER BY name', [tenantId]),
    pool.query('SELECT * FROM customers WHERE tenant_id=$1 ORDER BY name', [tenantId]),
    pool.query('SELECT * FROM products WHERE tenant_id=$1 ORDER BY name', [tenantId]),
    pool.query('SELECT * FROM product_sales WHERE tenant_id=$1 ORDER BY purchase_date', [tenantId]),
    pool.query('SELECT * FROM product_purchases WHERE tenant_id=$1 ORDER BY purchase_date', [tenantId]),
    pool.query('SELECT * FROM expenses WHERE tenant_id=$1 ORDER BY expense_date', [tenantId]),
    pool.query('SELECT * FROM standalone_invoices WHERE tenant_id=$1 ORDER BY invoice_date', [tenantId]),
    pool.query('SELECT * FROM vendor_payments WHERE tenant_id=$1 ORDER BY payment_date', [tenantId]),
    pool.query('SELECT * FROM supplier_payments WHERE tenant_id=$1 ORDER BY payment_date', [tenantId]),
    pool.query('SELECT * FROM invoice_payments WHERE tenant_id=$1 ORDER BY payment_date', [tenantId]),
    pool.query('SELECT * FROM staff_payments WHERE tenant_id=$1 ORDER BY payment_date', [tenantId]),
    pool.query('SELECT company_name, slug FROM tenants WHERE id=$1', [tenantId]),
  ]);

  type R = Record<string, unknown>;
  const vRows = vendors.rows as R[];
  const supRows = suppliers.rows as R[];
  const custRows = customers.rows as R[];
  const prodRows = products.rows as R[];

  const companyName = String(tenantRow.rows[0]?.company_name || 'Dhandho Company');

  // Stable ext ref maps
  const vendorRef = (id: string) => padRef('V', id);
  const supplierRef = (id: string) => padRef('S', id);
  const customerRef = (id: string) => padRef('C', id);
  const productRef = (id: string) => padRef('P', id);

  // ── RKACCM01: Ledgers ────────────────────────────────────────────────────

  const ledgerRows: R[] = [];

  // System accounts Miracle always expects
  ledgerRows.push({ FIELD01: 'ACASHACT', FIELD02: 'Cash', FIELD05: 'CASHNBANK', FIELD07: 'CA', FIELD10: 0 });
  ledgerRows.push({ FIELD01: 'SALESACT', FIELD02: 'Sales Account', FIELD05: 'SALESGRP', FIELD07: 'IN', FIELD10: 0 });
  ledgerRows.push({ FIELD01: 'PURCHACT', FIELD02: 'Purchase Account', FIELD05: 'PURCHGRP', FIELD07: 'PU', FIELD10: 0 });
  ledgerRows.push({ FIELD01: 'EXPENSACT', FIELD02: 'Expenses', FIELD05: 'EXPGRP', FIELD07: 'EX', FIELD10: 0 });
  ledgerRows.push({ FIELD01: 'STAFFACT', FIELD02: 'Staff Salary', FIELD05: 'EXPGRP', FIELD07: 'EX', FIELD10: 0 });

  for (const v of vRows) {
    ledgerRows.push({
      FIELD01: vendorRef(String(v.id)),
      FIELD02: String(v.name || ''),
      FIELD05: 'TRADEGRP',
      FIELD07: 'PR',
      FIELD10: 0,
      FIELD31: String(v.address || '').slice(0, 50),
      FIELD40: '',
      M01F05: String(v.phone || '').slice(0, 20),
      M01F18: String(v.email || '').slice(0, 50),
    });
  }

  for (const s of supRows) {
    ledgerRows.push({
      FIELD01: supplierRef(String(s.id)),
      FIELD02: String(s.name || ''),
      FIELD05: 'TRADEGRP',
      FIELD07: 'PR',
      FIELD10: 0,
      FIELD31: String(s.address || '').slice(0, 50),
      FIELD40: String(s.gst_number || '').slice(0, 20),
      M01F05: String(s.phone || '').slice(0, 20),
      M01F18: String(s.email || '').slice(0, 50),
    });
  }

  for (const c of custRows) {
    ledgerRows.push({
      FIELD01: customerRef(String(c.id)),
      FIELD02: String(c.name || ''),
      FIELD05: 'TRADEGRP',
      FIELD07: 'PR',
      FIELD10: 0,
      M01F05: String(c.phone || '').slice(0, 20),
    });
  }

  // ── rkaccm21 + rkaccm29: Products ────────────────────────────────────────

  const productDbfRows: R[] = [];
  const rateDbfRows: R[] = [];

  for (const p of prodRows) {
    const ext = productRef(String(p.id));
    productDbfRows.push({
      FIELD01: ext,
      FIELD02: String(p.name || '').slice(0, 100),
      FIELD04: String(p.barcode || p.id).slice(0, 20),
      FIELD05: 'NOS',
      FIELD20: p.gst_rate ? `GST${p.gst_rate}` : '',
      FIELD40: String(p.hsn_code || '').slice(0, 20),
    });
    rateDbfRows.push({
      M29F01: ext,
      M29F02: Number(p.price || 0),
      M29F03: Number(p.price || 0),
      M29F10: 0,
    });
  }

  // ── RKACCT41/01/02: Vouchers ─────────────────────────────────────────────

  const vhdrRows: R[] = [];
  const ventRows: R[] = [];
  const vitemRows: R[] = [];

  let vSeq = 1;
  const vRef = (id: string, prefix: string) => `${prefix}${String(vSeq++).padStart(6, '0')}`.slice(0, 20);

  // Sales (product_sales)
  const vendorIdMap = Object.fromEntries(vRows.map(v => [String(v.id), vendorRef(String(v.id))]));
  const supplierIdMap = Object.fromEntries(supRows.map(s => [String(s.id), supplierRef(String(s.id))]));

  for (const s of sales.rows as R[]) {
    const ext = `SP${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const partyExt = vendorIdMap[String(s.vendor_id)] || 'ACASHACT';
    const amt = Number(s.sale_price || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(s.purchase_date),
      FIELD04: partyExt,
      FIELD05: 'SALESACT',
      FIELD06: amt,
      FIELD12: String(s.id).slice(0, 20),
      FIELD74: 'SP',
    });
    ventRows.push({ FIELD01: ext, FIELD03: partyExt, FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: 'SALESACT', FIELD05: amt, FIELD06: 'C' });
    if (s.product_id) {
      vitemRows.push({
        FIELD01: ext,
        FIELD03: productRef(String(s.product_id)),
        FIELD06: 1,
        FIELD07: amt,
        FIELD08: amt,
      });
    }
  }

  // Purchases (product_purchases)
  for (const p of purchases.rows as R[]) {
    const ext = `PU${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const partyExt = supplierIdMap[String(p.supplier_id)] || 'ACASHACT';
    const amt = Number(p.billed_price || p.cost_price || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(p.purchase_date),
      FIELD04: partyExt,
      FIELD05: 'PURCHACT',
      FIELD07: amt,
      FIELD12: String(p.invoice_number || p.id).slice(0, 20),
      FIELD74: 'PU',
    });
    ventRows.push({ FIELD01: ext, FIELD03: 'PURCHACT', FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: partyExt, FIELD05: amt, FIELD06: 'C' });
    if (p.product_id) {
      vitemRows.push({
        FIELD01: ext,
        FIELD03: productRef(String(p.product_id)),
        FIELD06: 1,
        FIELD07: amt,
        FIELD08: amt,
      });
    }
  }

  // Standalone invoices
  for (const inv of invoices.rows as R[]) {
    const ext = `SI${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const amt = Number(inv.grand_total || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(inv.invoice_date),
      FIELD04: 'ACASHACT',
      FIELD05: 'SALESACT',
      FIELD06: amt,
      FIELD12: String(inv.invoice_number || '').slice(0, 20),
      FIELD74: 'SP',
    });
    ventRows.push({ FIELD01: ext, FIELD03: 'ACASHACT', FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: 'SALESACT', FIELD05: amt, FIELD06: 'C' });
    // Line items from JSONB
    const items = Array.isArray(inv.items) ? (inv.items as R[]) : [];
    for (const item of items) {
      if (item.description) {
        const itemAmt = Number(item.total || item.amount || 0);
        vitemRows.push({
          FIELD01: ext,
          FIELD03: String(item.description || '').slice(0, 20),
          FIELD06: Number(item.qty || 1),
          FIELD07: Number(item.rate || 0),
          FIELD08: itemAmt,
        });
      }
    }
  }

  // Vendor payments
  for (const vp of vendorPayments.rows as R[]) {
    const ext = `VP${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const partyExt = vendorIdMap[String(vp.vendor_id)] || 'ACASHACT';
    const amt = Number(vp.amount || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(vp.payment_date),
      FIELD04: partyExt,
      FIELD05: 'ACASHACT',
      FIELD07: amt,
      FIELD12: String(vp.reference_number || vp.id).slice(0, 20),
      FIELD74: 'CB',
    });
    ventRows.push({ FIELD01: ext, FIELD03: partyExt, FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: 'ACASHACT', FIELD05: amt, FIELD06: 'C' });
  }

  // Supplier payments
  for (const sp of supplierPayments.rows as R[]) {
    const ext = `SP${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const partyExt = supplierIdMap[String(sp.supplier_id)] || 'ACASHACT';
    const amt = Number(sp.amount || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(sp.payment_date),
      FIELD04: partyExt,
      FIELD05: 'ACASHACT',
      FIELD07: amt,
      FIELD12: String(sp.reference_number || sp.id).slice(0, 20),
      FIELD74: 'CB',
    });
    ventRows.push({ FIELD01: ext, FIELD03: partyExt, FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: 'ACASHACT', FIELD05: amt, FIELD06: 'C' });
  }

  // Expenses
  for (const ex of expenses.rows as R[]) {
    const ext = `EX${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const amt = Number(ex.amount || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(ex.expense_date),
      FIELD04: 'EXPENSACT',
      FIELD05: 'ACASHACT',
      FIELD07: amt,
      FIELD74: 'CB',
    });
    ventRows.push({ FIELD01: ext, FIELD03: 'EXPENSACT', FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: 'ACASHACT', FIELD05: amt, FIELD06: 'C' });
  }

  // Staff payments
  for (const st of staffPayments.rows as R[]) {
    const ext = `ST${String(vSeq++).padStart(6, '0')}`.slice(0, 20);
    const amt = Number(st.amount || 0);
    vhdrRows.push({
      FIELD01: ext,
      FIELD02: isoToDate(st.payment_date),
      FIELD04: 'STAFFACT',
      FIELD05: 'ACASHACT',
      FIELD07: amt,
      FIELD74: 'CB',
    });
    ventRows.push({ FIELD01: ext, FIELD03: 'STAFFACT', FIELD05: amt, FIELD06: 'D' });
    ventRows.push({ FIELD01: ext, FIELD03: 'ACASHACT', FIELD05: amt, FIELD06: 'C' });
  }

  // ── Build ZIP ─────────────────────────────────────────────────────────────

  const zip = new AdmZip();

  zip.addFile(
    'CMP0001/version.txt',
    Buffer.from(`Company Name : ${companyName}\r\nMiracle Version : 17.0\r\nExported By : Dhandho ERP\r\n`, 'latin1'),
  );

  zip.addFile('CMP0001/YR01/RKACCM01.DBF', writeDbf(LEDGER_FIELDS, ledgerRows));
  zip.addFile('CMP0001/YR01/rkaccm21.dbf', writeDbf(PRODUCT_FIELDS, productDbfRows));
  zip.addFile('CMP0001/YR01/rkaccm29.dbf', writeDbf(RATE_FIELDS, rateDbfRows));
  zip.addFile('CMP0001/YR01/RKACCT41.DBF', writeDbf(VOUCHER_HDR_FIELDS, vhdrRows));
  zip.addFile('CMP0001/YR01/RKACCT01.DBF', writeDbf(VOUCHER_ENT_FIELDS, ventRows));
  zip.addFile('CMP0001/YR01/RKACCT02.DBF', writeDbf(VOUCHER_ITEM_FIELDS, vitemRows));

  return zip.toBuffer();
}
