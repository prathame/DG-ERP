import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

type TradeKind = 'sales' | 'purchase';

interface TradeRow {
  voucherId: string;
  date: string;
  voucherNumber?: string | null;
  partyName?: string | null;
  contraName?: string | null;
  amount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  narration?: string | null;
}

interface TradeResponse {
  kind: TradeKind;
  from: string | null;
  to: string | null;
  rows: TradeRow[];
  totals: { count: number; amount: number; taxable: number; cgst: number; sgst: number; igst: number };
}

export function TradeRegisterPanel({
  kind,
  onOpenVoucher,
}: {
  kind: TradeKind;
  onOpenVoucher: (voucherId: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const fyStart = today.slice(5, 7) >= '04' ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<TradeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = kind === 'sales' ? 'Sales register' : 'Purchase register';
  const endpoint = kind === 'sales' ? '/books/sales-register' : '/books/purchase-register';
  const partyLabel = kind === 'sales' ? 'Party / Customer' : 'Party / Supplier';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const res = await fetchApi<TradeResponse>(`${endpoint}?${qs}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : `Failed to load ${title.toLowerCase()}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, from, to, title]);

  const showGst = Boolean(
    data &&
    (data.totals.cgst > 0 ||
      data.totals.sgst > 0 ||
      data.totals.igst > 0 ||
      data.totals.taxable !== data.totals.amount),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          {kind === 'sales'
            ? 'Books sales vouchers for the period (ops invoices + manual sales). Separate from the product Sales Register under Reports.'
            : 'Books purchase vouchers for the period (supplier bills + dual-written purchases).'}
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm">
            <span className="font-medium text-slate-800">{title}</span>
            <span className="tabular-nums text-slate-600">
              {data?.totals.count || 0} voucher(s) · ₹{money(data?.totals.amount || 0)}
            </span>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">{partyLabel}</th>
                {showGst && <th className="px-3 py-2 text-right">Taxable</th>}
                {showGst && <th className="px-3 py-2 text-right">CGST</th>}
                {showGst && <th className="px-3 py-2 text-right">SGST</th>}
                {showGst && <th className="px-3 py-2 text-right">IGST</th>}
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Narration</th>
              </tr>
            </thead>
            <tbody>
              {!data?.rows.length ? (
                <tr>
                  <td colSpan={showGst ? 9 : 5} className="px-3 py-8 text-center text-slate-500">
                    No {kind} vouchers in this period.
                  </td>
                </tr>
              ) : (
                data.rows.map(row => (
                  <tr key={row.voucherId} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{String(row.date).slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() => onOpenVoucher(row.voucherId)}
                      >
                        {row.voucherNumber || '—'}
                      </button>
                    </td>
                    <td className="px-3 py-2 max-w-[12rem] truncate" title={row.partyName || ''}>
                      {row.partyName || '—'}
                    </td>
                    {showGst && <td className="px-3 py-2 text-right tabular-nums">{money(row.taxable)}</td>}
                    {showGst && (
                      <td className="px-3 py-2 text-right tabular-nums">{row.cgst ? money(row.cgst) : ''}</td>
                    )}
                    {showGst && (
                      <td className="px-3 py-2 text-right tabular-nums">{row.sgst ? money(row.sgst) : ''}</td>
                    )}
                    {showGst && (
                      <td className="px-3 py-2 text-right tabular-nums">{row.igst ? money(row.igst) : ''}</td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{money(row.amount)}</td>
                    <td className="px-3 py-2 max-w-[14rem] truncate text-slate-500" title={row.narration || ''}>
                      {row.narration || ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    Total
                  </td>
                  {showGst && <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.taxable)}</td>}
                  {showGst && <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.cgst)}</td>}
                  {showGst && <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.sgst)}</td>}
                  {showGst && <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.igst)}</td>}
                  <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.amount)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
