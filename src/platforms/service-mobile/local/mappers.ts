/** Map local snake_case rows → API camelCase shapes used by the UI. */

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapVendor(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? null,
    email: r.email ?? null,
    address: r.address ?? null,
    gstin: r.gstin ?? null,
    createdAt: r.created_at,
  };
}

export function mapCustomer(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? null,
    email: r.email ?? null,
    address: r.address ?? null,
    createdAt: r.created_at,
  };
}

export function mapProduct(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku ?? null,
    categoryId: r.category_id ?? null,
    price: Number(r.price) || 0,
    gstPercent: Number(r.gst_percent) || 18,
    createdAt: r.created_at,
  };
}

export function mapBank(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    accountNumber: r.account_number ?? null,
    accountName: r.account_name ?? r.name ?? null,
    bankName: r.bank_name ?? r.name ?? null,
    branch: r.branch ?? null,
    ifsc: r.ifsc ?? null,
    balance: Number(r.balance) || 0,
    createdAt: r.created_at,
  };
}

export function mapInvoice(r: Record<string, unknown>) {
  const items = parseJsonArray(r.items);
  return {
    id: r.id,
    invoiceNumber: r.invoice_number ?? r.invoiceNumber,
    customerName: r.customer_name ?? r.client_name ?? '',
    customerGstin: r.customer_gstin ?? null,
    customerAddress: r.customer_address ?? null,
    customerPhone: r.customer_phone ?? null,
    partyType: (r.party_type as string) || null,
    partyId: (r.party_id as string) || r.client_id || null,
    items,
    subtotal: Number(r.subtotal) || 0,
    taxTotal: Number(r.tax_total ?? r.tax) || 0,
    taxCgst: Number(r.tax_cgst) || 0,
    taxSgst: Number(r.tax_sgst) || 0,
    taxIgst: Number(r.tax_igst) || 0,
    isInterstate: !!r.is_interstate,
    grandTotal: Number(r.grand_total ?? r.total) || 0,
    notes: r.notes ?? null,
    terms: r.terms ?? null,
    status: (r.status as string) || 'draft',
    invoiceDate: r.invoice_date,
    dueDate: r.due_date ?? null,
    createdAt: r.created_at,
  };
}

export function mapSupplier(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    address: r.address ?? null,
    gstNumber: r.gst_number ?? null,
  };
}

export function mapStaff(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? null,
    role: r.role ?? null,
    address: r.address ?? null,
    salary: Number(r.salary) || 0,
    joiningDate: r.joining_date ?? null,
    status: (r.status as string) || 'active',
    totalPaid: Number(r.total_paid) || 0,
    totalAdvance: Number(r.total_advance) || 0,
    totalRepaid: Number(r.total_repaid) || 0,
    advanceBalance: Math.max(0, (Number(r.total_advance) || 0) - (Number(r.total_repaid) || 0)),
    paymentCount: Number(r.payment_count) || 0,
    lastPayment: r.last_payment ?? null,
  };
}

export function mapExpense(r: Record<string, unknown>) {
  return {
    id: r.id,
    category: r.category,
    amount: Number(r.amount) || 0,
    description: r.description ?? null,
    expenseDate: r.expense_date,
    createdAt: r.created_at,
  };
}

export { mapQuoteRow as mapQuotation, mapOrderRow as mapOrder } from './quoteOrderHelpers';

export function mapPriceRule(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    productId: r.product_id ?? null,
    productName: r.product_name ?? '',
    vendorId: r.vendor_id ?? null,
    vendorName: r.vendor_name ?? null,
    minQty: Number(r.min_qty) || 1,
    maxQty: r.max_qty != null ? Number(r.max_qty) : null,
    price: Number(r.price) || 0,
    validFrom: r.valid_from ?? null,
    validTo: r.valid_to ?? null,
    isActive: r.is_active !== false,
  };
}
