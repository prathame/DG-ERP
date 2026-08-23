import { describe, expect, it } from 'vitest';
import { buildEinvoiceEwbDtls } from '../../shared/gstPortalTransport';

describe('buildEinvoiceEwbDtls', () => {
  it('builds NIC EwbDtls block for combined portal filing', () => {
    const d = buildEinvoiceEwbDtls({
      vehicleNo: 'gj01ab1234',
      distance: 120,
      transportMode: '1',
      transporterName: 'ABC Logistics',
      transporterId: '24AABCU9603R1ZM',
      transDocNo: 'LR-99',
      transDocDate: '23/08/2026',
      vehicleType: 'R',
    });
    expect(d).toEqual({
      TransMode: '1',
      Distance: 120,
      VehType: 'R',
      TransName: 'ABC Logistics',
      TransId: '24AABCU9603R1ZM',
      TransDocNo: 'LR-99',
      TransDocDt: '23/08/2026',
      VehNo: 'GJ01AB1234',
    });
  });

  it('omits optional fields when blank', () => {
    const d = buildEinvoiceEwbDtls({ vehicleNo: '', distance: 0, transportMode: '2' });
    expect(d).toEqual({ TransMode: '2', Distance: 0, VehType: 'R' });
    expect(d).not.toHaveProperty('VehNo');
  });
});
