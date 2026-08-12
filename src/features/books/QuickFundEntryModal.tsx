import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchApi } from '../../api';
import { AppModal } from '../../components/ui';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { isCashBankLedger } from './bookLedgerUtils';

type FundKind = 'cash' | 'bank';
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
 * Miracle-style rapid cash/bank entry: receipt or payment against a fixed fund ledger.
 * Stays open after save for the next line.
 */
export function QuickFundEntryModal({
  kind,
  fundLedgerId,
  fundLedgerName,
  onClose,
  onSaved,
}: {
  kind: FundKind;
  fundLedgerId: string;
  fundLedgerName?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(true);
  const [side, setSide] = useState<EntrySide>('receipt');
  const [voucherDate, setVoucherDate] = useState(todayIso);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [partyLedgerId, setPartyLedgerId] = useState('');
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

  useEffect(() => {
    if (!loadingLedgers) amountRef.current?.focus();
  }, [loadingLedgers, side, lastSaved]);

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

  const fundLabel = fundLedgerName || (kind === 'cash' ? 'Cash' : 'Bank');
  const title = kind === 'cash' ? 'Quick cash entry' : 'Quick bank entry';

  async function handleSave(andClose: boolean) {
    setError(null);
    setLastSaved(null);
    const amt = Number(amount);
    if (!partyLedgerId) {
      setError('Select a party / ledger');
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
      setLastSaved(`${side === 'receipt' ? 'Receipt' : 'Payment'} ₹${amt.toLocaleString('en-IN')} saved`);
      setAmount('');
      setNarration('');
      setVoucherNumber('');
      // keep party for repeated entries to same party; user can change
      if (andClose) onClose();
      else amountRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      title={title}
      subtitle={`${fundLabel} — receipt (in) or payment (out). Save & next for rapid posting.`}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving || loadingLedgers}
            onClick={() => void handleSave(true)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Save & close
          </button>
          <button
            type="button"
            disabled={saving || loadingLedgers}
            onClick={() => void handleSave(false)}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & next'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {lastSaved && !error && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{lastSaved}</div>
        )}

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setSide('receipt')}
            className={`rounded-md px-3 py-1.5 ${
              side === 'receipt' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Receipt (in)
          </button>
          <button
            type="button"
            onClick={() => setSide('payment')}
            className={`rounded-md px-3 py-1.5 ${
              side === 'payment' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Payment (out)
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs text-slate-500">Date</span>
            <input
              type="date"
              value={voucherDate}
              onChange={e => setVoucherDate(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500">Voucher no.</span>
            <input
              type="text"
              value={voucherNumber}
              onChange={e => setVoucherNumber(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5"
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="text-sm">
          <span className="text-xs text-slate-500">{side === 'receipt' ? 'Received from' : 'Paid to'}</span>
          <SearchSelect
            options={partyOptions}
            value={partyLedgerId}
            onChange={setPartyLedgerId}
            placeholder="Select party / ledger"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
                  void handleSave(false);
                }
              }}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums"
              placeholder="0.00"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500">{kind === 'cash' ? 'Cash account' : 'Bank account'}</span>
            <input
              type="text"
              value={fundLabel}
              disabled
              className="mt-0.5 w-full rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-slate-600"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-xs text-slate-500">Narration</span>
          <input
            type="text"
            value={narration}
            onChange={e => setNarration(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5"
            placeholder="Optional"
          />
        </label>
      </div>
    </AppModal>
  );
}
