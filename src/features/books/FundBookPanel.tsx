import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import { QuickFundEntryModal } from './QuickFundEntryModal';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

type FundKind = 'cash' | 'bank';

interface FundAccount {
  id: string;
  name: string;
  externalRef?: string | null;
}

interface FundLine {
  voucherId: string;
  date: string;
  voucherNumber?: string | null;
  voucherType: string;
  particulars: string;
  narration?: string | null;
  debit: number;
  credit: number;
  balance: number;
  balanceLabel: string;
}

interface FundBookResponse {
  kind: FundKind;
  accounts: FundAccount[];
  ledger: { id: string; name: string; ledgerType?: string; externalRef?: string | null } | null;
  from: string | null;
  to: string | null;
  opening: { balance: number; balanceLabel: string };
  lines: FundLine[];
  totals: { debit: number; credit: number };
  closing: { balance: number; balanceLabel: string };
}

export function FundBookPanel({ kind, onOpenVoucher }: { kind: FundKind; onOpenVoucher: (voucherId: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const fyStart = today.slice(5, 7) >= '04' ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [ledgerId, setLedgerId] = useState('');
  const [data, setData] = useState<FundBookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [showQuick, setShowQuick] = useState(false);

  const title = kind === 'cash' ? 'Cash book' : 'Bank book';
  const endpoint = kind === 'cash' ? '/books/cash-book' : '/books/bank-book';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (ledgerId) qs.set('ledgerId', ledgerId);
        const res = await fetchApi<FundBookResponse>(`${endpoint}?${qs}`);
        if (!cancelled) {
          setData(res);
          if (!ledgerId && res.ledger?.id) setLedgerId(res.ledger.id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : `Failed to load ${title.toLowerCase()}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, from, to, ledgerId, title, reloadTick]);

  const activeLedgerId = ledgerId || data?.ledger?.id || '';
  const activeLedgerName = data?.ledger?.name;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          {kind === 'cash'
            ? 'Cash book — receipts (Dr) and payments (Cr) on the cash ledger, with running balance.'
            : 'Bank book — deposits (Dr) and withdrawals (Cr) on the bank ledger, with running balance.'}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {(data?.accounts?.length || 0) > 1 && (
            <label className="text-xs text-slate-500">
              Account
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
          {activeLedgerId && (
            <button
              type="button"
              onClick={() => setShowQuick(true)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white"
            >
              Quick entry
            </button>
          )}
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
          No {kind === 'cash' ? 'cash' : 'bank'} ledger yet. Create a voucher or open Ledgers after Books COA seeds.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm">
            <span className="font-medium text-slate-800">{data.ledger.name}</span>
            <span className="tabular-nums text-slate-600">
              Opening {data.opening.balanceLabel} → Closing {data.closing.balanceLabel}
            </span>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
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
              <tr className="border-t border-slate-100 bg-slate-50/80 text-slate-600">
                <td className="px-3 py-2" colSpan={4}>
                  Opening balance
                </td>
                <td className="px-3 py-2 text-right tabular-nums">—</td>
                <td className="px-3 py-2 text-right tabular-nums">—</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{data.opening.balanceLabel}</td>
              </tr>
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    No movements in this period
                  </td>
                </tr>
              ) : (
                data.lines.map((row, i) => (
                  <tr
                    key={`${row.voucherId}-${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => onOpenVoucher(row.voucherId)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {typeof row.date === 'string' ? row.date.slice(0, 10) : row.date}
                    </td>
                    <td className="px-3 py-2">{row.voucherNumber || '—'}</td>
                    <td className="px-3 py-2 capitalize">{row.voucherType}</td>
                    <td className="px-3 py-2 max-w-[16rem] truncate" title={row.particulars}>
                      {row.particulars || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.debit ? money(row.debit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.credit ? money(row.credit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{row.balanceLabel}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-3 py-2" colSpan={4}>
                  Period total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.credit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.closing.balanceLabel}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showQuick && activeLedgerId && (
        <QuickFundEntryModal
          kind={kind}
          fundLedgerId={activeLedgerId}
          fundLedgerName={activeLedgerName}
          onClose={() => setShowQuick(false)}
          onSaved={async () => {
            setReloadTick(t => t + 1);
          }}
        />
      )}
    </div>
  );
}
