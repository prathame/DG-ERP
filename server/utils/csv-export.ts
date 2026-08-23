import type { Response } from 'express';

export function toCsv(headers: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
}

export function r2(n: number): string {
  return (Number(n) || 0).toFixed(2);
}
