/** Miracle-style cash-memo party: auto-selected and frozen when sale is Cash. */
export const CASH_ACCOUNT_NAME = 'Cash Account';

export function isCashPartyName(name?: string | null): boolean {
  return (
    String(name || '')
      .trim()
      .toLowerCase() === 'cash account'
  );
}

export function findCashAccountVendor<T extends { name: string }>(vendors: T[]): T | undefined {
  return vendors.find(v => isCashPartyName(v.name));
}

/** Find or create the frozen Cash Account party used for cash memos. */
export async function ensureCashAccountVendor<T extends { id: string; name: string }>(
  vendors: T[],
  create: (input: { name: string }) => Promise<T>,
): Promise<{ vendor: T; created: boolean }> {
  const existing = findCashAccountVendor(vendors);
  if (existing) return { vendor: existing, created: false };
  const vendor = await create({ name: CASH_ACCOUNT_NAME });
  return { vendor, created: true };
}
