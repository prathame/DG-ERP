import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchApi } from '../../api';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { isCashBankLedger } from './bookLedgerUtils';

type EntrySide = 'receipt' | 'payment';

interface LedgerOption {
  id: string;
  name: string;
  ledgerType?: string;
  groupName?: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Miracle-style voucher desk: rapid cash/bank receipt & payment on the Vouchers tab.
 * Posts via existing POST /books/vouchers; Save & next keeps the form open.
 */
export function VoucherDeskForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(true);
  const [side, setSide] = useState<EntrySide>('receipt');
  const [voucherDate, setVoucherDate] = useState(todayIso);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [partyLedgerId, setPartyLedgerId] = useState('');
  const [fundLedgerId, setFundLedgerId] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLedgers(true);
      try {
        const rows = await fetchApi<LedgerOption[]>('/books/ledgers');
        if (cancelled) return;
        setLedgers(rows);
        const funds = rows.filter(isCashBankLedger);
        if (funds.length) {
          const cash = funds.find(l => (l.ledgerType || '').toUpperCase() === 'CS' || /cash/i.test(l.name));
          setFundLedgerId(prev => prev || (cash || funds[0])!.id);
        }
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

  useEffect(() => {
    if (!loadingLedgers) amountRef.current?.focus();
  }, [loadingLedgers, side, lastSaved]);

  const fundOptions = useMemo(() => {
    const funds = ledgers.filter(isCashBankLedger);
    const list = funds.length ? funds : ledgers;
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers]);

  const partyOptions = useMemo(() => {
    const parties = ledgers.filter(l => {
      if (l.id === fundLedgerId) return false;
      if (isCashBankLedger(l)) return false;
      return true;
    });
    const list = parties.length ? parties : ledgers.filter(l => l.id !== fundLedgerId);
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers, fundLedgerId]);

  async function handleSave() {
    setError(null);
    setLastSaved(null);
    const amt = Number(amount);
    if (!partyLedgerId) {
      setError('Select a party / ledger');
      return;
    }
    if (!fundLedgerId) {
      setError('Select a cash or bank account');
      return;
    }
    if (partyLedgerId === fundLedgerId) {
      setError('Party and cash/bank must be different ledgers');
      return;
    }
    if (!(amt > 0)) {
      setError('Enter an amount greater than zero');
      return;
    }
    setSaving(true);
    try {
      await fetchApi('/books/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          voucherType: side,
          voucherDate,
          voucherNumber: voucherNumber.trim() || null,
          narration: narration.trim() || null,
          partyLedgerId,
          contraLedgerId: fundLedgerId,
          amount: amt,
        }),
      });
      await onSaved();
      const fundName = ledgers.find(l => l.id === fundLedgerId)?.name || 'fund';
      setLastSaved(`${side === 'receipt' ? 'Receipt' : 'Payment'} ₹${amt.toLocaleString('en-IN')} via ${fundName}`);
      setAmount('');
      setNarration('');
      setVoucherNumber('');
      amountRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Voucher desk</h3>
          <p className="text-xs text-slate-500">
            Cash / bank receipt & payment — Save & next for rapid posting (like Miracle)
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setSide('receipt')}
            className={`rounded-md px-3 py-1.5 ${
              side === 'receipt' ? 'bg-slate-800 font-medium text-white' : 'text-slate-600'
            }`}
          >
            Receipt (in)
          </button>
          <button
            type="button"
            onClick={() => setSide('payment')}
            className={`rounded-md px-3 py-1.5 ${
              side === 'payment' ? 'bg-slate-800 font-medium text-white' : 'text-slate-600'
            }`}
          >
            Payment (out)
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {lastSaved && !error && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{lastSaved}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Date</span>
          <input
            type="date"
            value={voucherDate}
            onChange={e => setVoucherDate(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Voucher no.</span>
          <input
            type="text"
            value={voucherNumber}
            onChange={e => setVoucherNumber(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5"
            placeholder="Optional"
          />
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="text-xs text-slate-500">{side === 'receipt' ? 'Received from' : 'Paid to'}</span>
          <SearchSelect
            options={partyOptions}
            value={partyLedgerId}
            onChange={setPartyLedgerId}
            placeholder={loadingLedgers ? 'Loading…' : 'Select party / ledger'}
          />
        </div>
        <div className="text-sm sm:col-span-2">
          <span className="text-xs text-slate-500">Cash / bank</span>
          <SearchSelect
            options={fundOptions}
            value={fundLedgerId}
            onChange={setFundLedgerId}
            placeholder={loadingLedgers ? 'Loading…' : 'Select cash or bank'}
          />
        </div>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Amount</span>
          <input
            ref={amountRef}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !saving) {
                e.preventDefault();
                void handleSave();
              }
            }}
            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 tabular-nums"
            placeholder="0.00"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Narration</span>
          <input
            type="text"
            value={narration}
            onChange={e => setNarration(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5"
            placeholder="Optional"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={saving || loadingLedgers}
          onClick={() => void handleSave()}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & next'}
        </button>
      </div>
    </div>
  );
}
