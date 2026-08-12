import React, { useEffect, useMemo, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { X } from 'lucide-react';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface LedgerOption {
  id: string;
  name: string;
  ledgerType?: string;
  groupName?: string;
}

interface VoucherDetail {
  id: string;
  voucherType: string;
  voucherDate: string;
  voucherNumber?: string;
  partyLedgerId?: string | null;
  contraLedgerId?: string | null;
  partyName?: string;
  contraName?: string;
  amount: number;
  narration?: string;
  miracleType?: string;
  externalRef?: string | null;
  editableBody?: boolean;
  entries: Array<{
    id: string;
    lineNo: number;
    ledgerId?: string;
    ledgerName: string;
    debit: number;
    credit: number;
  }>;
  items: Array<{
    id: string;
    lineNo: number;
    productName?: string;
    qty: number;
    rate: number;
    amount: number;
  }>;
}

export function VoucherDetailModal({
  voucherId,
  onClose,
  onChanged,
}: {
  voucherId: string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [data, setData] = useState<VoucherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);

  const [voucherDate, setVoucherDate] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [narration, setNarration] = useState('');
  const [partyLedgerId, setPartyLedgerId] = useState('');
  const [contraLedgerId, setContraLedgerId] = useState('');
  const [amount, setAmount] = useState('');
  const [journalLines, setJournalLines] = useState<
    Array<{ key: string; ledgerId: string; debit: string; credit: string }>
  >([]);

  const load = async () => {
    setError(null);
    const row = await fetchApi<VoucherDetail>(`/books/vouchers/${voucherId}`);
    setData(row);
    setVoucherDate(
      typeof row.voucherDate === 'string' ? row.voucherDate.slice(0, 10) : String(row.voucherDate).slice(0, 10),
    );
    setVoucherNumber(row.voucherNumber || '');
    setNarration(row.narration || '');
    setPartyLedgerId(row.partyLedgerId || '');
    setContraLedgerId(row.contraLedgerId || '');
    setAmount(String(row.amount || ''));
    if (row.voucherType === 'journal') {
      setJournalLines(
        row.entries.map(e => ({
          key: e.id,
          ledgerId: e.ledgerId || '',
          debit: e.debit ? String(e.debit) : '',
          credit: e.credit ? String(e.credit) : '',
        })),
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load voucher');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherId]);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchApi<LedgerOption[]>('/books/ledgers');
        if (!cancelled) setLedgers(rows);
      } catch {
        /* keep edit usable with empty list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const ledgerOptions = useMemo(
    () =>
      ledgers.map(l => ({
        value: l.id,
        label: l.name,
        sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
      })),
    [ledgers],
  );

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        voucherDate,
        voucherNumber: voucherNumber || null,
        narration: narration || null,
      };
      if (data.editableBody) {
        if (data.voucherType === 'journal') {
          body.entries = journalLines.map(l => ({
            ledgerId: l.ledgerId,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          }));
        } else {
          body.partyLedgerId = partyLedgerId || null;
          body.contraLedgerId = contraLedgerId || null;
          body.amount = Number(amount) || 0;
        }
      }
      await fetchApi(`/books/vouchers/${voucherId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setEditing(false);
      await load();
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!data || saving) return;
    const label = data.voucherNumber || data.id;
    if (!window.confirm(`Delete voucher ${label}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await fetchApi(`/books/vouchers/${voucherId}`, { method: 'DELETE' });
      await onChanged?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete voucher');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{editing ? 'Edit voucher' : 'Voucher detail'}</h2>
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
          {data && !editing && (
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
                  <div className="font-medium">
                    {[data.partyName, data.contraName].filter(Boolean).join(' · ') || '—'}
                  </div>
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

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remove()}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(true)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Edit
                </button>
              </div>
            </>
          )}

          {data && editing && (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-slate-500">Date</span>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={e => setVoucherDate(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">Voucher no. (renumber)</span>
                  <input
                    type="text"
                    value={voucherNumber}
                    onChange={e => setVoucherNumber(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs text-slate-500">Narration</span>
                  <input
                    type="text"
                    value={narration}
                    onChange={e => setNarration(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                  />
                </label>
              </div>

              {!data.editableBody && (
                <p className="text-xs text-slate-500">
                  Ops dual-write voucher — date, number, and narration only. Amount/ledgers stay locked.
                </p>
              )}

              {data.editableBody && data.voucherType !== 'journal' && (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-slate-500">Party / To</span>
                    <SearchSelect
                      options={ledgerOptions}
                      value={partyLedgerId}
                      onChange={setPartyLedgerId}
                      placeholder="Select ledger"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Contra / From</span>
                    <SearchSelect
                      options={ledgerOptions}
                      value={contraLedgerId}
                      onChange={setContraLedgerId}
                      placeholder="Select ledger"
                    />
                  </div>
                  <label className="block">
                    <span className="text-xs text-slate-500">Amount</span>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums"
                    />
                  </label>
                </div>
              )}

              {data.editableBody && data.voucherType === 'journal' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-800">Journal lines</h3>
                  {journalLines.map((line, idx) => (
                    <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem]">
                      <SearchSelect
                        options={ledgerOptions}
                        value={line.ledgerId}
                        onChange={v =>
                          setJournalLines(prev => prev.map((l, i) => (i === idx ? { ...l, ledgerId: v } : l)))
                        }
                        placeholder="Ledger"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Dr"
                        value={line.debit}
                        onChange={e =>
                          setJournalLines(prev => prev.map((l, i) => (i === idx ? { ...l, debit: e.target.value } : l)))
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Cr"
                        value={line.credit}
                        onChange={e =>
                          setJournalLines(prev =>
                            prev.map((l, i) => (i === idx ? { ...l, credit: e.target.value } : l)),
                          )
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
