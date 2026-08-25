/** Rules for editing a saved standalone invoice (header + lines). */

export function invoiceEditBlockedReason(inv: {
  status?: string | null;
  paidAmount?: number | null;
  irn?: string | null;
  ewbNumber?: string | null;
}): string | null {
  const status = String(inv.status || '');
  if (status === 'cancelled') return 'Cancelled invoices cannot be edited';
  if (status === 'paid') return 'Paid invoices cannot be edited';
  if (status !== 'draft' && status !== 'sent') return 'Only draft or unpaid invoices can be edited';
  if ((Number(inv.paidAmount) || 0) > 0.001) {
    return 'Cannot edit invoice with payments. Delete payments in Finance first.';
  }
  if (inv.irn) return 'Cannot edit after e-invoice (IRN) is generated';
  if (inv.ewbNumber) return 'Cannot edit after E-Way Bill is generated';
  return null;
}

export function canEditInvoice(inv: Parameters<typeof invoiceEditBlockedReason>[0]): boolean {
  return invoiceEditBlockedReason(inv) == null;
}
