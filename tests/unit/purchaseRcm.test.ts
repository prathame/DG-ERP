import { describe, it, expect } from 'vitest';
import {
  PURCHASE_TAX_SQL,
  PURCHASE_RCM_TAX_SQL,
  PURCHASE_RCM_TAXABLE_SQL,
  applyRcmToGstr3b,
  indianFinancialYear,
  nextSelfInvoiceNumber,
} from '../../server/utils/helpers';

describe('purchase RCM helpers', () => {
  it('forward-charge tax SQL excludes is_rcm rows', () => {
    expect(PURCHASE_TAX_SQL).toContain('NOT COALESCE(pp.is_rcm, false)');
    expect(PURCHASE_RCM_TAX_SQL).toContain('COALESCE(pp.is_rcm, false)');
    expect(PURCHASE_RCM_TAXABLE_SQL).toContain('COALESCE(pp.is_rcm, false)');
  });

  it('applyRcmToGstr3b adds liability and matching ITC without changing outward taxable', () => {
    const folded = applyRcmToGstr3b({
      outputTax: 1000,
      outputTaxable: 10000,
      itcPurchases: 400,
      rcmTax: 180,
      rcmTaxable: 1000,
    });
    expect(folded.outputTax).toBe(1180);
    expect(folded.outputTaxable).toBe(10000);
    expect(folded.itcPurchases).toBe(580);
    expect(folded.reverseChargeTax).toBe(180);
    expect(folded.reverseChargeTaxable).toBe(1000);
    // Fully claimable RCM: net tax impact is zero
    expect(folded.outputTax - folded.itcPurchases).toBe(1000 - 400);
  });

  it('applyRcmToGstr3b treats missing RCM as zero', () => {
    const folded = applyRcmToGstr3b({
      outputTax: 50,
      outputTaxable: 500,
      itcPurchases: 10,
      rcmTax: 0,
      rcmTaxable: 0,
    });
    expect(folded).toEqual({
      outputTax: 50,
      outputTaxable: 500,
      itcPurchases: 10,
      reverseChargeTax: 0,
      reverseChargeTaxable: 0,
    });
  });

  it('auto-allocates SI/{FY}/#### from last self-invoice number', () => {
    const fy = indianFinancialYear(new Date('2026-08-12T00:00:00'));
    expect(fy).toBe('2026-27');
    expect(nextSelfInvoiceNumber(null, fy)).toBe('SI/2026-27/0001');
    expect(nextSelfInvoiceNumber('', fy)).toBe('SI/2026-27/0001');
    expect(nextSelfInvoiceNumber('SI/2026-27/0001', fy)).toBe('SI/2026-27/0002');
    expect(nextSelfInvoiceNumber('SI/2026-27/0099', fy)).toBe('SI/2026-27/0100');
    // Pre-April uses previous calendar year's FY start
    expect(indianFinancialYear(new Date('2026-03-15T00:00:00'))).toBe('2025-26');
  });
});
