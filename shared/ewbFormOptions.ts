/** E-Way Bill form options aligned with Tally / NIC portal bulk JSON. */

export const EWB_SUB_SUPPLY_TYPES = [
  { value: 'Supply', label: 'Supply' },
  { value: 'Export', label: 'Export' },
  { value: 'Import', label: 'Import' },
  { value: 'Job Work', label: 'Job Work' },
  { value: 'For Own Use', label: 'For Own Use' },
  { value: 'Job work Returns', label: 'Job work Returns' },
  { value: 'Sales Return', label: 'Sales Return' },
  { value: 'Others', label: 'Others' },
  { value: 'SKD/CKD', label: 'SKD/CKD' },
  { value: 'Line Sales', label: 'Line Sales' },
  { value: 'Recipient Not Known', label: 'Recipient Not Known' },
  { value: 'Exhibition or Fairs', label: 'Exhibition or Fairs' },
] as const;

export const EWB_DOC_TYPES = [
  { value: 'INV', label: 'Tax Invoice' },
  { value: 'CHL', label: 'Delivery Challan' },
  { value: 'BIL', label: 'Bill of Supply' },
  { value: 'BOE', label: 'Bill of Entry' },
  { value: 'OTH', label: 'Others' },
] as const;

export const EWB_VEHICLE_TYPES = [
  { value: 'R', label: 'Regular' },
  { value: 'O', label: 'ODC (Over Dimensional Cargo)' },
] as const;

export const INDIAN_STATES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh (New)' },
  { code: '38', name: 'Ladakh' },
] as const;

export function stateCodeFromGstin(gstin?: string | null): string {
  const g = String(gstin || '').trim();
  return g.length >= 2 ? g.slice(0, 2) : '24';
}

export function stateNameFromCode(code: string): string {
  const c = code.padStart(2, '0').slice(0, 2);
  return INDIAN_STATES.find(s => s.code === c)?.name || '';
}

export function fmtEwbDocDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
