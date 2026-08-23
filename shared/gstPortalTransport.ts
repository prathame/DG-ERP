/** Transport fields for EwbDtls inside e-invoice JSON (one-portal combined filing). */

export type GstPortalTransport = {
  vehicleNo: string;
  distance: number;
  transportMode?: string;
  transporterName?: string;
  transporterId?: string;
  transDocNo?: string;
  transDocDate?: string;
  vehicleType?: string;
};

/** NIC e-invoice schema EwbDtls block — IRP generates IRN + E-Way together when present. */
export function buildEinvoiceEwbDtls(t: GstPortalTransport) {
  const d: Record<string, string | number> = {
    TransMode: t.transportMode || '1',
    Distance: Number(t.distance) || 0,
    VehType: t.vehicleType || 'R',
  };
  if (t.transporterName?.trim()) d.TransName = t.transporterName.trim();
  if (t.transporterId?.trim()) d.TransId = t.transporterId.trim().toUpperCase();
  if (t.transDocNo?.trim()) d.TransDocNo = t.transDocNo.trim();
  if (t.transDocDate?.trim()) d.TransDocDt = t.transDocDate.trim();
  if (t.vehicleNo?.trim()) d.VehNo = t.vehicleNo.trim().toUpperCase();
  return d;
}

export function transportQueryParams(t: GstPortalTransport): Record<string, string> {
  const p: Record<string, string> = {
    vehicleNo: t.vehicleNo.trim().toUpperCase(),
    distance: String(Number(t.distance) || 0),
    transportMode: t.transportMode || '1',
  };
  if (t.transporterName?.trim()) p.transporterName = t.transporterName.trim();
  if (t.transporterId?.trim()) p.transporterId = t.transporterId.trim();
  if (t.transDocNo?.trim()) p.transDocNo = t.transDocNo.trim();
  if (t.transDocDate?.trim()) p.transDocDate = t.transDocDate.trim();
  if (t.vehicleType?.trim()) p.vehicleType = t.vehicleType.trim();
  return p;
}
