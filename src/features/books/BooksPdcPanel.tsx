import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { fetchApi } from '../../api';
import { AppModal, LoadingSpinner } from '../../components/ui';
import { SearchSelect } from '../../components/ui/SearchSelect';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type PdcKind = 'pdc_receipt' | 'pdc_payment';
type MemoFilter = 'open' | 'realised' | 'cancelled' | 'all';

interface LedgerOption {
  id: string;
  name: string;
  ledgerType?: string;
  groupName?: string;
}

interface PdcRow {
  id: string;
  voucherType: string;
  voucherDate: string;
  voucherNumber?: string | null;
  partyName?: string | null;
  contraName?: string | null;
  amount: number;
  narration?: string | null;
  instrumentRef?: string | null;
  maturityDate?: string | null;
  memoStatus?: string | null;
  realisedVoucherId?: string | null;
}

function typeLabel(t: string) {
  if (t === 'pdc_receipt') return 'PDC receipt';
  if (t === 'pdc_payment') return 'PDC payment';
  return t;
}

function isBankish(l: LedgerOption) {
  const t = (l.ledgerType || '').toUpperCase();
  const g = `${l.groupName || ''} ${l.name}`.toLowerCase();
  return t === 'BK' || t === 'BN' || t === 'CS' || /bank|cash/.test(g);
}

export function BooksPdcPanel({ onOpenVoucher }: { onOpenVoucher: (voucherId: string) => void }) {
  const [rows, setRows] = useState<PdcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemoFilter>('open');
  const [createKind, setCreateKind] = useState<PdcKind | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ types: 'pdc_receipt,pdc_payment' });
      if (filter !== 'all') qs.set('memoStatus', filter);
      const data = await fetchApi<PdcRow[]>(`/books/vouchers?${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load PDC register');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function realise(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const result = await fetchApi<{ realisedId: string }>(`/books/vouchers/${id}/realise`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
      if (result?.realisedId) onOpenVoucher(result.realisedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to realise PDC');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm('Cancel this open PDC? It will stay off the books.')) return;
    setBusyId(id);
    setError(null);
    try {
      await fetchApi(`/books/vouchers/${id}/cancel-memo`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel PDC');
    } finally {
      setBusyId(null);
    }
  }

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">
          Post-dated cheques — memorandum until realised into a receipt or payment. They do not affect trial balance,
          day book, or cash/bank books while open.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            Status
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as MemoFilter)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="open">Open</option>
              <option value="realised">Realised</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setCreateKind('pdc_receipt')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus size={16} /> PDC receipt
          </button>
          <button
            type="button"
            onClick={() => setCreateKind('pdc_payment')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> PDC payment
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
                <th className="px-3 py-2">Maturity</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Cheque</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    No PDC vouchers in this filter
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-orange-50/40">
                  <td
                    className="cursor-pointer whitespace-nowrap px-3 py-2 tabular-nums"
                    onClick={() => onOpenVoucher(r.id)}
                  >
                    {String(r.voucherDate).slice(0, 10)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {r.maturityDate ? String(r.maturityDate).slice(0, 10) : '—'}
                  </td>
                  <td className="px-3 py-2">{typeLabel(r.voucherType)}</td>
                  <td className="px-3 py-2">{r.instrumentRef || '—'}</td>
                  <td className="px-3 py-2">{r.partyName || '—'}</td>
                  <td className="px-3 py-2">{r.contraName || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.amount)}</td>
                  <td className="px-3 py-2 capitalize">{r.memoStatus || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.memoStatus === 'open' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void realise(r.id)}
                            className="rounded-md bg-orange-500 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                          >
                            Realise
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void cancel(r.id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {r.realisedVoucherId && (
                        <button
                          type="button"
                          onClick={() => onOpenVoucher(r.realisedVoucherId!)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                        >
                          Posted voucher
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={6}>
                    {rows.length} PDC
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {createKind && (
        <CreatePdcModal
          kind={createKind}
          onClose={() => setCreateKind(null)}
          onCreated={() => {
            setCreateKind(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CreatePdcModal({ kind, onClose, onCreated }: { kind: PdcKind; onClose: () => void; onCreated: () => void }) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(true);
  const [voucherDate, setVoucherDate] = useState(todayIso);
  const [maturityDate, setMaturityDate] = useState(todayIso);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [instrumentRef, setInstrumentRef] = useState('');
  const [partyLedgerId, setPartyLedgerId] = useState('');
  const [contraLedgerId, setContraLedgerId] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLedgers(true);
      try {
        const rows = await fetchApi<LedgerOption[]>('/books/ledgers');
        if (!cancelled) setLedgers(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load ledgers');
      } finally {
        if (!cancelled) setLoadingLedgers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const partyOptions = useMemo(
    () =>
      ledgers.map(l => ({
        value: l.id,
        label: l.name,
        sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
      })),
    [ledgers],
  );

  const bankOptions = useMemo(() => {
    const banks = ledgers.filter(isBankish);
    const list = banks.length ? banks : ledgers;
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await fetchApi('/books/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          voucherType: kind,
          voucherDate,
          maturityDate: maturityDate || null,
          voucherNumber: voucherNumber.trim() || null,
          instrumentRef: instrumentRef.trim() || null,
          partyLedgerId,
          contraLedgerId,
          amount: Number(amount),
          narration: narration.trim() || null,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save PDC');
    } finally {
      setSaving(false);
    }
  }

  const title = kind === 'pdc_receipt' ? 'New PDC receipt' : 'New PDC payment';

  return (
    <AppModal
      title={title}
      subtitle="Memorandum cheque — realise later to post to books"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loadingLedgers}
            onClick={() => void handleSave()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save PDC'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Entry date</span>
            <input
              type="date"
              value={voucherDate}
              onChange={e => setVoucherDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Maturity date</span>
            <input
              type="date"
              value={maturityDate}
              onChange={e => setMaturityDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Cheque / instrument no.</span>
            <input
              value={instrumentRef}
              onChange={e => setInstrumentRef(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Voucher no. (optional)</span>
            <input
              value={voucherNumber}
              onChange={e => setVoucherNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Party</span>
            <SearchSelect
              options={partyOptions}
              value={partyLedgerId}
              onChange={setPartyLedgerId}
              placeholder="Select party"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Bank / cash</span>
            <SearchSelect
              options={bankOptions}
              value={contraLedgerId}
              onChange={setContraLedgerId}
              placeholder="Select bank"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Narration</span>
            <input
              value={narration}
              onChange={e => setNarration(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>
      </div>
    </AppModal>
  );
}
