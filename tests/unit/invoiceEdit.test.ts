import { describe, expect, it } from 'vitest';
import { canEditInvoice, invoiceEditBlockedReason } from '../../shared/invoiceEdit';

describe('invoiceEditBlockedReason', () => {
  it('allows draft and unpaid sent invoices', () => {
    expect(canEditInvoice({ status: 'draft' })).toBe(true);
    expect(canEditInvoice({ status: 'sent', paidAmount: 0 })).toBe(true);
  });

  it('blocks paid, cancelled, payments, IRN, and EWB', () => {
    expect(invoiceEditBlockedReason({ status: 'paid' })).toMatch(/paid/i);
    expect(invoiceEditBlockedReason({ status: 'cancelled' })).toMatch(/cancelled/i);
    expect(invoiceEditBlockedReason({ status: 'sent', paidAmount: 100 })).toMatch(/payments/i);
    expect(invoiceEditBlockedReason({ status: 'sent', irn: 'IRN1' })).toMatch(/IRN/i);
    expect(invoiceEditBlockedReason({ status: 'draft', ewbNumber: '123' })).toMatch(/E-Way/i);
  });
});
