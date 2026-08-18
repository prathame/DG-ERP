import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, IndianRupee } from 'lucide-react';
import { api } from '../../api';
import { AppModal, LoadingSpinner, useToast } from '../../components/ui';
import {
  billsForParty,
  daysPastDue,
  filterOpenBills,
  outstandingAgeBucket,
  partiesWithOpenDues,
  summarizeArAging,
  type OutstandingBillRow,
  type OutstandingPartyRow,
} from './bookOutstandingUtils';

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type ViewMode = 'parties' | 'bills';

type PayTarget =
  | { mode: 'invoice'; invoiceId: string; label: string; balance: number }
  | { mode: 'collective'; partyKey: string; label: string; balance: number };

/**
 * Miracle-style bill-wise outstanding inside Books.
 * Reuses Invoice Finance open-bills / payments (dual-writes Books receipts).
 */
export function BooksOutstandingPanel() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>('parties');
  const [search, setSearch] = useState('');
  const [parties, setParties] = useState<OutstandingPartyRow[]>([]);
  const [bills, setBills] = useState<OutstandingBillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<OutstandingPartyRow | null>(null);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIso);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setError(null);
    try {
      const [summary, openBills] = await Promise.all([api.invoiceFinance.summary(), api.invoiceFinance.openBills()]);
      const nextParties = (Array.isArray(summary) ? summary : []).map(r => ({
        partyKey: r.partyKey,
        clientName: r.clientName,
        balance: Number(r.balance) || 0,
        advanceBalance: Number(r.advanceBalance) || 0,
        invoiceCount: Number(r.invoiceCount) || 0,
      }));
      const nextBills = (Array.isArray(openBills) ? openBills : []).map(r => ({
        partyKey: r.partyKey,
        clientName: r.clientName,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        dueDate: (r as { dueDate?: string | null }).dueDate ?? null,
        balance: Number(r.balance) || 0,
        grandTotal: Number(r.grandTotal) || 0,
        paid: Number(r.paid) || 0,
      }));
      setParties(nextParties);
      setBills(nextBills);
      setSelectedParty(prev => {
        if (!prev) return null;
        return nextParties.find(p => p.partyKey === prev.partyKey) || null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load outstanding');
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openParties = useMemo(() => partiesWithOpenDues(parties), [parties]);
  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openParties;
    return openParties.filter(p => p.clientName.toLowerCase().includes(q) || p.partyKey.toLowerCase().includes(q));
  }, [openParties, search]);

  const filteredBills = useMemo(() => filterOpenBills(bills, search), [bills, search]);
  const partyBills = useMemo(
    () => (selectedParty ? billsForParty(bills, selectedParty.partyKey) : []),
    [bills, selectedParty],
  );

  const totalDue = useMemo(() => openParties.reduce((s, p) => s + (Number(p.balance) || 0), 0), [openParties]);
  const aging = useMemo(() => summarizeArAging(bills), [bills]);

  function openPay(target: PayTarget) {
    setPayTarget(target);
    setPayAmount(String(target.balance));
    setPayDate(todayIso());
    setPayMethod('Cash');
    setPayRef('');
  }

  async function handlePay() {
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) {
      toast('Enter an amount greater than zero', 'error');
      return;
    }
    if (amount > payTarget.balance + 0.001) {
      toast(`Amount exceeds due (₹${money(payTarget.balance)})`, 'error');
      return;
    }
    setSaving(true);
    try {
      await api.invoiceFinance.recordPayment({
        ...(payTarget.mode === 'invoice' ? { invoiceId: payTarget.invoiceId } : { partyKey: payTarget.partyKey }),
        amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        referenceNumber: payRef.trim() || undefined,
        notes: payTarget.mode === 'invoice' ? 'Bill-wise payment (Books)' : 'Party payment (Books)',
      });
      toast(
        payTarget.mode === 'invoice'
          ? `₹${money(amount)} applied to ${payTarget.label}`
          : `₹${money(amount)} applied toward ${payTarget.label}`,
        'success',
      );
      setPayTarget(null);
      await load({ soft: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (selectedParty) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedParty(null)}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Parties
          </button>
          <button
            type="button"
            disabled={selectedParty.balance <= 0}
            onClick={() =>
              openPay({
                mode: 'collective',
                partyKey: selectedParty.partyKey,
                label: selectedParty.clientName,
                balance: selectedParty.balance,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <IndianRupee size={14} /> Collect (FIFO)
          </button>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{selectedParty.clientName}</h3>
          <p className="text-sm text-slate-500">
            Due ₹{money(selectedParty.balance)}
            {(selectedParty.advanceBalance || 0) > 0.005
              ? ` · Advance ₹${money(selectedParty.advanceBalance || 0)}`
              : ''}
            {' · '}
            {partyBills.length} open bill{partyBills.length === 1 ? '' : 's'}
          </p>
        </div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!partyBills.length ? (
          <p className="text-sm text-slate-500">No open bills for this party.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Bill</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {partyBills.map(b => (
                  <tr key={b.invoiceId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{b.invoiceNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{b.invoiceDate}</td>
                    <td className="px-3 py-2 text-slate-600">{b.dueDate || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(b.grandTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(b.paid)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-orange-800">
                      {money(b.balance)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          openPay({
                            mode: 'invoice',
                            invoiceId: b.invoiceId,
                            label: b.invoiceNumber,
                            balance: b.balance,
                          })
                        }
                        className="rounded-md px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                      >
                        Collect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payModal()}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Outstanding</h3>
          <p className="text-xs text-slate-500">
            Bill-wise dues from Invoice Finance — collect against a party or a specific bill (posts Books receipt).
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(
            [
              { id: 'parties' as const, label: 'Parties' },
              { id: 'bills' as const, label: 'Bills' },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={`rounded-md px-2.5 py-1.5 ${
                view === t.id ? 'bg-slate-800 font-medium text-white' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={view === 'parties' ? 'Search parties…' : 'Search bills / parties…'}
          className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{openParties.length}</span> parties · due{' '}
          <span className="font-semibold tabular-nums text-orange-800">₹{money(totalDue)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            { label: '0–30d', value: aging.d0_30 },
            { label: '31–60d', value: aging.d31_60 },
            { label: '61–90d', value: aging.d61_90 },
            { label: '90d+', value: aging.d90plus },
          ] as const
        ).map(b => (
          <div key={b.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{b.label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">₹{money(b.value)}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {view === 'parties' ? (
        !filteredParties.length ? (
          <p className="text-sm text-slate-500">No party outstanding.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2 text-right">Bills</th>
                  <th className="px-3 py-2 text-right">Advance</th>
                  <th className="px-3 py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {filteredParties.map(p => (
                  <tr
                    key={p.partyKey}
                    className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/50"
                    onClick={() => setSelectedParty(p)}
                  >
                    <td className="px-3 py-2 font-medium">{p.clientName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.invoiceCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {(p.advanceBalance || 0) > 0.005 ? money(p.advanceBalance || 0) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-800">
                      {money(p.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !filteredBills.length ? (
        <p className="text-sm text-slate-500">No open bills.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Bill</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredBills.map(b => {
                const days = daysPastDue(b.invoiceDate, new Date(), b.dueDate);
                return (
                  <tr key={b.invoiceId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{b.clientName}</td>
                    <td className="px-3 py-2 font-medium">{b.invoiceNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{b.invoiceDate}</td>
                    <td className="px-3 py-2 text-slate-600">{b.dueDate || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{outstandingAgeBucket(days)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-800">
                      {money(b.balance)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          openPay({
                            mode: 'invoice',
                            invoiceId: b.invoiceId,
                            label: b.invoiceNumber,
                            balance: b.balance,
                          })
                        }
                        className="rounded-md px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                      >
                        Collect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {payModal()}
    </div>
  );

  function payModal() {
    if (!payTarget) return null;
    return (
      <AppModal
        onClose={() => {
          if (!saving) setPayTarget(null);
        }}
        title={`Collect — ${payTarget.label}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setPayTarget(null)}
              className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handlePay()}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-500">
            Due ₹{money(payTarget.balance)}
            {payTarget.mode === 'collective' ? ' · applied FIFO across open bills' : ' · this bill only'}
          </p>
          <label className="block">
            <span className="mb-1 block text-slate-600">Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-600">Date</span>
            <input
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-600">Method</span>
            <select
              value={payMethod}
              onChange={e => setPayMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              {['Cash', 'Bank Transfer', 'UPI', 'Cheque'].map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-600">Reference</span>
            <input
              value={payRef}
              onChange={e => setPayRef(e.target.value)}
              placeholder="Optional cheque / UTR"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>
      </AppModal>
    );
  }
}
