/** Postgres COUNT and JSON often arrive as strings; the hub only prints numbers. */
export function asMasterCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Masters card button — same wording as the card / tenant tab name. */
export function openMasterCta(name: string): string {
  const label = name.trim();
  return label ? `Open ${label}` : 'Open';
}
