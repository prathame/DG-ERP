import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';

function qtyFmt(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 4 });
}

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fyDefaults() {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear() - 1}-04-01`;
  return { from: fyStart, to: now.toISOString().slice(0, 10) };
}

interface ProductLedgerResponse {
  product: { id: string; name: string; code?: string | null; unit?: string | null; hsnCode?: string | null };
  from: string | null;
  to: string | null;
  openingQty: number;
  lines: Array<{
    voucherId: string;
    date: string;
    voucherNumber?: string | null;
    voucherType: string;
    partyName?: string | null;
    narration?: string | null;
    qtyIn: number;
    qtyOut: number;
    rate: number;
    amount: number;
    balanceQty: number;
  }>;
  totals: { qtyIn: number; qtyOut: number; amount: number };
  closingQty: number;
  count: number;
}

export function ProductLedgerPanel({
  productId,
  productName,
  onBack,
  onOpenVoucher,
}: {
  productId: string;
  productName?: string;
  onBack: () => void;
  onOpenVoucher: (voucherId: string) => void;
}) {
  const defaults = fyDefaults();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [data, setData] = useState<ProductLedgerResponse | null>(null);
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
        const row = await fetchApi<ProductLedgerResponse>(`/books/products/${productId}/ledger?${qs}`);
        if (!cancelled) setData(row);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load product ledger');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, from, to]);

  const title = data?.product.name || productName || 'Product ledger';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft size={16} /> Products
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
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">
          Item-wise stock ledger from Books voucher lines
          {data?.product.unit ? ` · ${data.product.unit}` : ''}
          {data?.product.hsnCode ? ` · HSN ${data.product.hsnCode}` : ''}
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
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 bg-slate-50/80 font-medium">
                <td className="px-3 py-2" colSpan={4}>
                  Opening
                </td>
                <td className="px-3 py-2 text-right tabular-nums" colSpan={4} />
                <td className="px-3 py-2 text-right tabular-nums">{qtyFmt(data.openingQty)}</td>
              </tr>
              {data.lines.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No stock movements in this period
                  </td>
                </tr>
              )}
              {data.lines.map((l, idx) => (
                <tr
                  key={`${l.voucherId}-${idx}`}
                  className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/40"
                  onClick={() => onOpenVoucher(l.voucherId)}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{l.date}</td>
                  <td className="px-3 py-2 font-medium text-orange-800">{l.voucherNumber || '—'}</td>
                  <td className="px-3 py-2 uppercase">{l.voucherType}</td>
                  <td className="max-w-[10rem] truncate px-3 py-2">{l.partyName || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qtyIn ? qtyFmt(l.qtyIn) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qtyOut ? qtyFmt(l.qtyOut) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(l.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(l.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{qtyFmt(l.balanceQty)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={4}>
                  Closing · {data.count} line{data.count === 1 ? '' : 's'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{qtyFmt(data.totals.qtyIn)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{qtyFmt(data.totals.qtyOut)}</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{money(data.totals.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{qtyFmt(data.closingQty)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
