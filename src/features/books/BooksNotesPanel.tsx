import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import { CreateVoucherModal } from './CreateVoucherModal';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

interface NoteRow {
  id: string;
  voucherType: string;
  voucherDate: string;
  voucherNumber?: string | null;
  partyName?: string | null;
  contraName?: string | null;
  amount: number;
  narration?: string | null;
}

function typeLabel(t: string) {
  if (t === 'credit_note') return 'Credit note';
  if (t === 'debit_note') return 'Debit note';
  return t;
}

export function BooksNotesPanel({ onOpenVoucher }: { onOpenVoucher: (voucherId: string) => void }) {
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [initialType, setInitialType] = useState<'credit_note' | 'debit_note'>('credit_note');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cn, dn] = await Promise.all([
        fetchApi<NoteRow[]>('/books/vouchers?type=credit_note'),
        fetchApi<NoteRow[]>('/books/vouchers?type=debit_note'),
      ]);
      const merged = [...(Array.isArray(cn) ? cn : []), ...(Array.isArray(dn) ? dn : [])].sort((a, b) => {
        const d = String(b.voucherDate).localeCompare(String(a.voucherDate));
        if (d !== 0) return d;
        return String(b.voucherNumber || '').localeCompare(String(a.voucherNumber || ''));
      });
      setRows(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credit/debit notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          Books credit and debit notes — sales returns and extra charges posted to party and sales ledgers.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setInitialType('credit_note');
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus size={16} /> Credit note
          </button>
          <button
            type="button"
            onClick={() => {
              setInitialType('debit_note');
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> Debit note
          </button>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Contra</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Narration</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    No credit or debit notes yet
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/40"
                  onClick={() => onOpenVoucher(r.id)}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.voucherDate}</td>
                  <td className="px-3 py-2">{typeLabel(r.voucherType)}</td>
                  <td className="px-3 py-2">{r.voucherNumber || '—'}</td>
                  <td className="px-3 py-2">{r.partyName || '—'}</td>
                  <td className="px-3 py-2">{r.contraName || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.amount)}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-slate-500">{r.narration || '—'}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>
                    {rows.length} note{rows.length === 1 ? '' : 's'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {createOpen && (
        <CreateVoucherModal initialType={initialType} onClose={() => setCreateOpen(false)} onCreated={() => load()} />
      )}
    </div>
  );
}
