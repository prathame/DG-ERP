import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import { X } from 'lucide-react';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface VoucherDetail {
  id: string;
  voucherType: string;
  voucherDate: string;
  voucherNumber?: string;
  partyName?: string;
  contraName?: string;
  amount: number;
  narration?: string;
  miracleType?: string;
  entries: Array<{ id: string; lineNo: number; ledgerName: string; debit: number; credit: number }>;
  items: Array<{
    id: string;
    lineNo: number;
    productName?: string;
    qty: number;
    rate: number;
    amount: number;
  }>;
}

export function VoucherDetailModal({ voucherId, onClose }: { voucherId: string; onClose: () => void }) {
  const [data, setData] = useState<VoucherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchApi<VoucherDetail>(`/books/vouchers/${voucherId}`);
        if (!cancelled) setData(row);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load voucher');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [voucherId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Voucher detail</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {!data && !error && (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          )}
          {data && (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-slate-500">Date</span>
                  <div className="font-medium">
                    {typeof data.voucherDate === 'string' ? data.voucherDate.slice(0, 10) : String(data.voucherDate)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Number</span>
                  <div className="font-medium">{data.voucherNumber || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Type</span>
                  <div className="font-medium uppercase">{data.voucherType}</div>
                </div>
                <div>
                  <span className="text-slate-500">Amount</span>
                  <div className="font-medium tabular-nums">₹{money(data.amount)}</div>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Party / contra</span>
                  <div className="font-medium">{data.partyName || data.contraName || '—'}</div>
                </div>
                {data.narration && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Narration</span>
                    <div className="font-medium">{data.narration}</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Entries (Debit / Credit)</h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Ledger</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map(e => (
                        <tr key={e.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{e.ledgerName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.debit ? money(e.debit) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.credit ? money(e.credit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {data.items?.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">Items</h3>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map(i => (
                          <tr key={i.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{i.productName || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(i.qty)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(i.rate)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(i.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
