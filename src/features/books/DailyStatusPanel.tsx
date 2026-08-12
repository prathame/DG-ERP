import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface DailyStatus {
  date: string;
  voucherCount: number;
  byType: Array<{ voucherType: string; count: number; amount: number }>;
  receipts: number;
  payments: number;
  sales: number;
  purchases: number;
  dayBookLines: number;
  openPdcCount: number;
  cashBalance: number | null;
  bankBalance: number | null;
}

const SHORTCUTS: { tab: string; label: string; hint: string }[] = [
  { tab: 'daybook', label: 'Day book', hint: 'All lines for the day' },
  { tab: 'cashbook', label: 'Cash book', hint: 'Cash movements' },
  { tab: 'bankbook', label: 'Bank book', hint: 'Bank movements' },
  { tab: 'bankrecon', label: 'Bank recon', hint: 'BRS / uncleared' },
  { tab: 'pdc', label: 'PDC', hint: 'Post-dated cheques' },
  { tab: 'booksales', label: 'Sales register', hint: 'Sales vouchers' },
  { tab: 'bookpurchase', label: 'Purchase register', hint: 'Purchase vouchers' },
  { tab: 'notes', label: 'Credit / Debit notes', hint: 'CN & DN' },
  { tab: 'trial', label: 'Trial balance', hint: 'As-on balances' },
  { tab: 'trading', label: 'Trading A/c', hint: 'Gross profit' },
  { tab: 'pnl', label: 'Profit & Loss', hint: 'Net result' },
  { tab: 'balance', label: 'Balance sheet', hint: 'Position' },
  { tab: 'products', label: 'Product ledger', hint: 'Item stock' },
  { tab: 'vouchers', label: 'Vouchers', hint: 'All vouchers' },
  { tab: 'outstanding', label: 'Outstanding', hint: 'Bill-wise collect' },
  { tab: 'ledger', label: 'Ledger', hint: 'Party / ledger books' },
];

export function DailyStatusPanel({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<DailyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const row = await fetchApi<DailyStatus>(`/books/daily-status?date=${encodeURIComponent(date)}`);
        if (!cancelled) setData(row);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load daily status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Daily status</h2>
          <p className="text-sm text-slate-500">
            Miracle-style desk — today’s Books snapshot and shortcuts into the reports you already use.
          </p>
        </div>
        <label className="text-xs text-slate-500">
          Date
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Vouchers', value: String(data.voucherCount) },
              { label: 'Day-book lines', value: String(data.dayBookLines) },
              { label: 'Receipts', value: money(data.receipts) },
              { label: 'Payments', value: money(data.payments) },
              { label: 'Sales', value: money(data.sales) },
              { label: 'Purchases', value: money(data.purchases) },
              {
                label: 'Cash (as on)',
                value: data.cashBalance == null ? '—' : money(data.cashBalance),
              },
              {
                label: 'Bank (as on)',
                value: data.bankBalance == null ? '—' : money(data.bankBalance),
              },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{c.value}</div>
              </div>
            ))}
          </div>

          {data.openPdcCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('pdc')}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
            >
              {data.openPdcCount} open PDC cheque{data.openPdcCount === 1 ? '' : 's'} — open PDC register
            </button>
          )}

          {data.byType.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Count</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map(r => (
                    <tr key={r.voucherType} className="border-t border-slate-100">
                      <td className="px-3 py-2 uppercase">{r.voucherType}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.voucherCount === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No posting vouchers on this date.
            </p>
          )}
        </>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Open report</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map(s => (
            <button
              key={s.tab}
              type="button"
              onClick={() => onNavigate(s.tab)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-orange-300 hover:bg-orange-50/50"
            >
              <div className="text-sm font-semibold text-slate-800">{s.label}</div>
              <div className="text-xs text-slate-500">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
