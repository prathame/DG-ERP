import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import { ArrowLeft } from 'lucide-react';
import { defaultDateRangeFromReportingPeriod } from '../../lib/reportingPeriod';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fyDefaults() {
  return defaultDateRangeFromReportingPeriod();
}

interface StatementResponse {
  ledger: { id: string; name: string; groupName?: string; ledgerType?: string; nature?: string };
  from: string | null;
  to: string | null;
  opening: { debit: number; credit: number; balanceLabel: string };
  lines: Array<{
    voucherId: string;
    date: string;
    voucherNumber?: string;
    voucherType: string;
    narration?: string;
    debit: number;
    credit: number;
    balanceLabel: string;
  }>;
  totals: { debit: number; credit: number };
  closing: { debit: number; credit: number; balanceLabel: string };
  count: number;
}

export function LedgerStatementPanel({
  ledgerId,
  ledgerName,
  onBack,
  onOpenVoucher,
}: {
  ledgerId: string;
  ledgerName?: string;
  onBack: () => void;
  onOpenVoucher: (voucherId: string) => void;
}) {
  const defaults = fyDefaults();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [data, setData] = useState<StatementResponse | null>(null);
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
        const row = await fetchApi<StatementResponse>(`/books/ledgers/${ledgerId}/statement?${qs}`);
        if (!cancelled) setData(row);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load statement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ledgerId, from, to]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          <ArrowLeft size={16} />
          Back to ledgers
        </button>
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

      <div>
        <h2 className="text-lg font-semibold text-slate-900">{data?.ledger.name || ledgerName || 'Ledger'}</h2>
        <p className="text-sm text-slate-500">
          Ledger statement (Books) — opening, voucher movements, closing balance
          {data?.ledger.groupName ? ` · ${data.ledger.groupName}` : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : data ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Particulars</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 bg-slate-50/80 font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  Opening balance
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {data.opening.debit ? money(data.opening.debit) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {data.opening.credit ? money(data.opening.credit) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{data.opening.balanceLabel}</td>
              </tr>
              {data.lines.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No voucher entries in this period.
                  </td>
                </tr>
              ) : (
                data.lines.map((l, idx) => (
                  <tr key={`${l.voucherId}-${idx}`} className="border-t border-slate-100 hover:bg-orange-50/40">
                    <td className="px-3 py-2 whitespace-nowrap">{l.date}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpenVoucher(l.voucherId)}
                        className="font-medium text-orange-700 hover:underline"
                      >
                        {l.voucherNumber || l.voucherType}
                      </button>
                      <div className="text-xs uppercase text-slate-400">{l.voucherType}</div>
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-slate-600">{l.narration || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.debit ? money(l.debit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.credit ? money(l.credit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{l.balanceLabel}</td>
                  </tr>
                ))
              )}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Period totals / Closing
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.credit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.closing.balanceLabel}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
