import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fyDefaults() {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear() - 1}-04-01`;
  return { from: fyStart, to: now.toISOString().slice(0, 10) };
}

type ReportKind = 'tb' | 'pnl' | 'bs';

interface TbResponse {
  from: string | null;
  to: string | null;
  balanced: boolean;
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  };
  rows: Array<{
    ledgerId: string;
    name: string;
    groupName?: string | null;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  }>;
}

interface PnlResponse {
  from: string | null;
  to: string | null;
  income: Array<{ name: string; amount: number }>;
  expenses: Array<{ name: string; amount: number }>;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  netLabel: string;
}

interface BsResponse {
  asOf: string | null;
  assets: Array<{ name: string; amount: number }>;
  liabilities: Array<{ name: string; amount: number }>;
  capital: Array<{ name: string; amount: number }>;
  totalAssets: number;
  totalLiabilities: number;
  totalCapital: number;
  totalLiabilitiesAndCapital: number;
  netProfit: number;
  balanced: boolean;
  difference: number;
}

export function BooksReportsPanel() {
  const defaults = fyDefaults();
  const [kind, setKind] = useState<ReportKind>('tb');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tb, setTb] = useState<TbResponse | null>(null);
  const [pnl, setPnl] = useState<PnlResponse | null>(null);
  const [bs, setBs] = useState<BsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (kind === 'tb') {
          const data = await fetchApi<TbResponse>(`/books/trial-balance?${qs}`);
          if (!cancelled) {
            setTb(data);
            setPnl(null);
            setBs(null);
          }
        } else if (kind === 'pnl') {
          const data = await fetchApi<PnlResponse>(`/books/profit-loss?${qs}`);
          if (!cancelled) {
            setPnl(data);
            setTb(null);
            setBs(null);
          }
        } else {
          const data = await fetchApi<BsResponse>(`/books/balance-sheet?asOf=${encodeURIComponent(to)}`);
          if (!cancelled) {
            setBs(data);
            setTb(null);
            setPnl(null);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, from, to]);

  const tabs: { id: ReportKind; label: string }[] = [
    { id: 'tb', label: 'Trial balance' },
    { id: 'pnl', label: 'Profit & loss' },
    { id: 'bs', label: 'Balance sheet' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            CA statements from Books vouchers (double-entry) — not ops Accounts reports.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKind(t.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  kind === t.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {kind !== 'bs' && (
            <label className="text-xs text-slate-500">
              From
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <label className="text-xs text-slate-500">
            {kind === 'bs' ? 'As of' : 'To'}
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
      ) : kind === 'tb' && tb ? (
        <div className="space-y-2">
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              tb.balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {tb.balanced
              ? `Trial balance balanced — Closing Dr ₹${money(tb.totals.closingDebit)} = Cr ₹${money(tb.totals.closingCredit)}`
              : `Out of balance — Closing Dr ₹${money(tb.totals.closingDebit)} vs Cr ₹${money(tb.totals.closingCredit)}`}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ledger</th>
                  <th className="px-3 py-2 text-right">Op Dr</th>
                  <th className="px-3 py-2 text-right">Op Cr</th>
                  <th className="px-3 py-2 text-right">Dr</th>
                  <th className="px-3 py-2 text-right">Cr</th>
                  <th className="px-3 py-2 text-right">Cl Dr</th>
                  <th className="px-3 py-2 text-right">Cl Cr</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map(r => (
                  <tr key={r.ledgerId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      {r.groupName && <div className="text-xs text-slate-400">{r.groupName}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.openingDebit ? money(r.openingDebit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.openingCredit ? money(r.openingCredit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.periodDebit ? money(r.periodDebit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.periodCredit ? money(r.periodCredit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.closingDebit ? money(r.closingDebit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.closingCredit ? money(r.closingCredit) : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tb.totals.openingDebit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tb.totals.openingCredit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tb.totals.periodDebit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tb.totals.periodCredit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tb.totals.closingDebit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tb.totals.closingCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : kind === 'pnl' && pnl ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-800">Income</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {pnl.income.length === 0 && <li className="py-2 text-slate-500">No income in period</li>}
              {pnl.income.map(r => (
                <li key={r.name} className="flex justify-between gap-2 py-1.5">
                  <span>{r.name}</span>
                  <span className="tabular-nums font-medium">{money(r.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold">
                <span>Total income</span>
                <span className="tabular-nums">{money(pnl.totalIncome)}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-800">Expenses</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {pnl.expenses.length === 0 && <li className="py-2 text-slate-500">No expenses in period</li>}
              {pnl.expenses.map(r => (
                <li key={r.name} className="flex justify-between gap-2 py-1.5">
                  <span>{r.name}</span>
                  <span className="tabular-nums font-medium">{money(r.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold">
                <span>Total expenses</span>
                <span className="tabular-nums">{money(pnl.totalExpenses)}</span>
              </li>
            </ul>
          </div>
          <div
            className={`lg:col-span-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
              pnl.netProfit >= 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {pnl.netLabel}: ₹{money(Math.abs(pnl.netProfit))}
          </div>
        </div>
      ) : kind === 'bs' && bs ? (
        <div className="space-y-3">
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              bs.balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {bs.balanced
              ? `Balance sheet tallies — Assets ₹${money(bs.totalAssets)} = Liab+Capital ₹${money(bs.totalLiabilitiesAndCapital)}`
              : `Difference ₹${money(bs.difference)} — Assets ₹${money(bs.totalAssets)} vs Liab+Capital ₹${money(bs.totalLiabilitiesAndCapital)}`}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold text-slate-800">Assets</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {bs.assets.map(r => (
                  <li key={r.name} className="flex justify-between gap-2 py-1.5">
                    <span>{r.name}</span>
                    <span className="tabular-nums font-medium">{money(r.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold">
                  <span>Total assets</span>
                  <span className="tabular-nums">{money(bs.totalAssets)}</span>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 font-semibold text-slate-800">Liabilities</h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {bs.liabilities.length === 0 && <li className="py-2 text-slate-500">None</li>}
                  {bs.liabilities.map(r => (
                    <li key={r.name} className="flex justify-between gap-2 py-1.5">
                      <span>{r.name}</span>
                      <span className="tabular-nums font-medium">{money(r.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{money(bs.totalLiabilities)}</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 font-semibold text-slate-800">Capital</h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {bs.capital.length === 0 && <li className="py-2 text-slate-500">None</li>}
                  {bs.capital.map(r => (
                    <li key={r.name} className="flex justify-between gap-2 py-1.5">
                      <span>{r.name}</span>
                      <span className="tabular-nums font-medium">{money(r.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{money(bs.totalCapital)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
