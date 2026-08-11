import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface DayBookRow {
  voucherId: string;
  date: string;
  voucherNumber?: string;
  voucherType: string;
  ledgerName: string;
  debit: number;
  credit: number;
  narration?: string;
}

export function DayBookPanel({ onOpenVoucher }: { onOpenVoucher: (voucherId: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<DayBookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const data = await fetchApi<DayBookRow[]>(`/books/day-book?${qs}`);
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load day book');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const totalDebit = rows.reduce((s, r) => s + (r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (r.credit || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          Day book — every debit/credit line from Books vouchers (not ops Accounts day book).
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Ledger</th>
                <th className="px-3 py-2">Narration</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No entries in this date range.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.voucherId}-${idx}`} className="border-t border-slate-100 hover:bg-orange-50/40">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {typeof r.date === 'string' ? r.date.slice(0, 10) : String(r.date)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpenVoucher(r.voucherId)}
                        className="font-medium text-orange-700 hover:underline"
                      >
                        {r.voucherNumber || '—'}
                      </button>
                    </td>
                    <td className="px-3 py-2 uppercase">{r.voucherType}</td>
                    <td className="px-3 py-2">{r.ledgerName}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-slate-600">{r.narration || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.debit ? money(r.debit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.credit ? money(r.credit) : '—'}</td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>
                    Totals ({rows.length} lines)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totalDebit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totalCredit)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
