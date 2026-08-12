import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

interface BankAccount {
  id: string;
  name: string;
  externalRef?: string | null;
}

interface ReconLine {
  entryId: string;
  voucherId: string;
  date: string;
  voucherNumber?: string | null;
  voucherType: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  balanceLabel: string;
  cleared: boolean;
  reconciledOn?: string | null;
}

interface ReconResponse {
  accounts: BankAccount[];
  ledger: { id: string; name: string; ledgerType?: string; externalRef?: string | null } | null;
  asOf: string;
  statementBalance: number;
  booksBalance: number;
  booksBalanceLabel: string;
  unclearedDeposits: number;
  unclearedCheques: number;
  adjustedBalance: number;
  difference: number;
  balanced: boolean;
  lines: ReconLine[];
}

export function BankReconPanel({ onOpenVoucher }: { onOpenVoucher: (voucherId: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [ledgerId, setLedgerId] = useState('');
  const [statementInput, setStatementInput] = useState('');
  const [data, setData] = useState<ReconResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'uncleared' | 'cleared'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set('asOf', asOf);
        if (ledgerId) qs.set('ledgerId', ledgerId);
        const res = await fetchApi<ReconResponse>(`/books/bank-reconciliation?${qs}`);
        if (!cancelled) {
          setData(res);
          if (!ledgerId && res.ledger?.id) setLedgerId(res.ledger.id);
          setStatementInput(String(res.statementBalance ?? 0));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load bank reconciliation');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asOf, ledgerId]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('asOf', asOf);
      if (ledgerId) qs.set('ledgerId', ledgerId);
      const res = await fetchApi<ReconResponse>(`/books/bank-reconciliation?${qs}`);
      setData(res);
      if (!ledgerId && res.ledger?.id) setLedgerId(res.ledger.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bank reconciliation');
    } finally {
      setLoading(false);
    }
  };

  const toggleCleared = async (line: ReconLine) => {
    if (!data?.ledger?.id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await fetchApi('/books/bank-reconciliation/mark', {
        method: 'POST',
        body: JSON.stringify({
          ledgerId: data.ledger.id,
          asOf,
          entryIds: [line.entryId],
          reconciled: !line.cleared,
        }),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update mark');
    } finally {
      setSaving(false);
    }
  };

  const saveStatement = async () => {
    if (!data?.ledger?.id || saving) return;
    const bal = Number(statementInput);
    if (!Number.isFinite(bal)) {
      setError('Enter a valid statement balance');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchApi<ReconResponse>('/books/bank-reconciliation/statement', {
        method: 'PUT',
        body: JSON.stringify({
          ledgerId: data.ledger.id,
          asOf,
          statementBalance: bal,
        }),
      });
      setData(res);
      setStatementInput(String(res.statementBalance ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save statement balance');
    } finally {
      setSaving(false);
    }
  };

  const lines = (data?.lines || []).filter(l => {
    if (filter === 'uncleared') return !l.cleared;
    if (filter === 'cleared') return l.cleared;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          Bank reconciliation — tick cleared bank-book lines, enter the bank statement balance, and clear the
          difference.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {(data?.accounts?.length || 0) > 1 && (
            <label className="text-xs text-slate-500">
              Bank
              <select
                value={ledgerId || data?.ledger?.id || ''}
                onChange={e => setLedgerId(e.target.value)}
                className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[10rem]"
              >
                {(data?.accounts || []).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-500">
            As of
            <input
              type="date"
              value={asOf}
              onChange={e => setAsOf(e.target.value)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Show
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as typeof filter)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="uncleared">Uncleared</option>
              <option value="cleared">Cleared</option>
            </select>
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
      ) : !data?.ledger ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          No bank ledger yet. Post a bank receipt/payment or open Ledgers after Books COA seeds.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Books balance</div>
              <div className="font-medium tabular-nums text-slate-800">{data.booksBalanceLabel}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Uncleared deposits (Dr)</div>
              <div className="tabular-nums text-slate-800">{money(data.unclearedDeposits)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Uncleared cheques (Cr)</div>
              <div className="tabular-nums text-slate-800">{money(data.unclearedCheques)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Adjusted (books − Dr + Cr)</div>
              <div className="font-medium tabular-nums text-slate-800">{money(data.adjustedBalance)}</div>
            </div>
            <div className="sm:col-span-2 lg:col-span-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">
                Statement balance
                <input
                  type="number"
                  step="0.01"
                  value={statementInput}
                  onChange={e => setStatementInput(e.target.value)}
                  className="mt-0.5 block w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveStatement()}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="text-xs text-slate-500">Difference (statement − adjusted)</div>
              <div className={`font-semibold tabular-nums ${data.balanced ? 'text-emerald-700' : 'text-amber-700'}`}>
                {money(data.difference)}
                {data.balanced ? ' · balanced' : ' · not balanced'}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{data.ledger.name}</span>
              <span className="text-slate-500">{lines.length} line(s)</span>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-10">✓</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Voucher</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Particulars</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No bank entries up to {asOf}.
                    </td>
                  </tr>
                ) : (
                  lines.map(line => (
                    <tr
                      key={line.entryId}
                      className={`border-t border-slate-100 ${line.cleared ? 'bg-emerald-50/40' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={line.cleared}
                          disabled={saving}
                          onChange={() => void toggleCleared(line)}
                          aria-label={line.cleared ? 'Mark uncleared' : 'Mark cleared'}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{String(line.date).slice(0, 10)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() => onOpenVoucher(line.voucherId)}
                        >
                          {line.voucherNumber || '—'}
                        </button>
                      </td>
                      <td className="px-3 py-2 uppercase text-xs text-slate-500">{line.voucherType}</td>
                      <td className="px-3 py-2 max-w-[14rem] truncate" title={line.particulars}>
                        {line.particulars}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.debit ? money(line.debit) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.credit ? money(line.credit) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.balanceLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
