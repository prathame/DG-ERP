import { describe, expect, it } from 'vitest';
import { deliveryChallanBase, deliveryDocKind, deliveryDocLabel, deliveryDocNos } from '../../src/lib/deliveryDocKind';

describe('deliveryDocKind', () => {
  it('classifies gst / bos / mixed from unit counts', () => {
    expect(deliveryDocKind(3, 0)).toBe('gst');
    expect(deliveryDocKind(0, 2)).toBe('bos');
    expect(deliveryDocKind(1, 1)).toBe('mixed');
    expect(deliveryDocKind(0, 0)).toBe('unknown');
  });

  it('labels match list UX copy', () => {
    expect(deliveryDocLabel('gst')).toBe('Tax Invoice (GST)');
    expect(deliveryDocLabel('bos')).toBe('Bill of Supply (non-GST)');
    expect(deliveryDocLabel('mixed')).toBe('Mixed (GST + BoS)');
  });

  it('builds -GST / -BOS doc nos from batch id', () => {
    expect(deliveryChallanBase('D20260722AB')).toBe('CH-20260722AB');
    expect(deliveryDocNos('D20260722AB', 2, 1)).toEqual({
      gstDocNo: 'CH-20260722AB-GST',
      nonGstDocNo: 'CH-20260722AB-BOS',
    });
    expect(deliveryDocNos('D20260722AB', 2, 0).nonGstDocNo).toBeNull();
  });
});
