import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchApi } from '../../api';
import { SearchSelect } from '../../components/ui/SearchSelect';
import {
  isCashBankLedger,
  isPurchaseAccountLedger,
  isSalesIncomeLedger,
  twoLineJournalEntries,
} from './bookLedgerUtils';

type DeskMode = 'receipt' | 'payment' | 'sales' | 'purchase' | 'contra' | 'journal';

interface LedgerOption {
  id: string;
  name: string;
  ledgerType?: string;
  groupName?: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const MODE_TABS: { id: DeskMode; label: string }[] = [
  { id: 'receipt', label: 'Receipt' },
  { id: 'payment', label: 'Payment' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'contra', label: 'Contra' },
  { id: 'journal', label: 'Journal' },
];

/**
 * Miracle-style voucher desk: receipt / payment / sales / purchase / contra / simple journal.
 * Posts via existing POST /books/vouchers; Save & next keeps the form open.
 */
export function VoucherDeskForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(true);
  const [mode, setMode] = useState<DeskMode>('receipt');
  const [voucherDate, setVoucherDate] = useState(todayIso);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [partyLedgerId, setPartyLedgerId] = useState('');
  const [fundLedgerId, setFundLedgerId] = useState('');
  const [salesIncomeId, setSalesIncomeId] = useState('');
  const [purchaseAccountId, setPurchaseAccountId] = useState('');
  const [fromFundId, setFromFundId] = useState('');
  const [toFundId, setToFundId] = useState('');
  const [debitLedgerId, setDebitLedgerId] = useState('');
  const [creditLedgerId, setCreditLedgerId] = useState('');
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
          const bank = funds.find(l => l.id !== (cash || funds[0])!.id);
          const primary = (cash || funds[0])!.id;
          const secondary = (bank || funds[Math.min(1, funds.length - 1)])!.id;
          setFundLedgerId(prev => prev || primary);
          setFromFundId(prev => prev || primary);
          setToFundId(prev => prev || secondary);
        }
        const sales = rows.filter(isSalesIncomeLedger);
        if (sales.length) setSalesIncomeId(prev => prev || sales[0]!.id);
        const purch = rows.filter(isPurchaseAccountLedger);
        if (purch.length) setPurchaseAccountId(prev => prev || purch[0]!.id);
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
  }, [loadingLedgers, mode, lastSaved]);

  const allLedgerOptions = useMemo(
    () =>
      ledgers.map(l => ({
        value: l.id,
        label: l.name,
        sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
      })),
    [ledgers],
  );

  const fundOptions = useMemo(() => {
    const funds = ledgers.filter(isCashBankLedger);
    const list = funds.length ? funds : ledgers;
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers]);

  const salesIncomeOptions = useMemo(() => {
    const sales = ledgers.filter(isSalesIncomeLedger);
    const list = sales.length ? sales : ledgers;
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers]);

  const purchaseAccountOptions = useMemo(() => {
    const purch = ledgers.filter(isPurchaseAccountLedger);
    const list = purch.length ? purch : ledgers;
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers]);

  const partyOptions = useMemo(() => {
    const excludeId = mode === 'sales' ? salesIncomeId : mode === 'purchase' ? purchaseAccountId : fundLedgerId;
    const parties = ledgers.filter(l => {
      if (l.id === excludeId) return false;
      if (mode === 'receipt' || mode === 'payment') {
        if (isCashBankLedger(l)) return false;
      }
      return true;
    });
    const list = parties.length ? parties : ledgers.filter(l => l.id !== excludeId);
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers, fundLedgerId, salesIncomeId, purchaseAccountId, mode]);

  async function handleSave() {
    setError(null);
    setLastSaved(null);
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError('Enter an amount greater than zero');
      return;
    }

    let body: Record<string, unknown>;
    let savedLabel: string;

    if (mode === 'receipt' || mode === 'payment') {
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
      body = {
        voucherType: mode,
        voucherDate,
        voucherNumber: voucherNumber.trim() || null,
        narration: narration.trim() || null,
        partyLedgerId,
        contraLedgerId: fundLedgerId,
        amount: amt,
      };
      const fundName = ledgers.find(l => l.id === fundLedgerId)?.name || 'fund';
      savedLabel = `${mode === 'receipt' ? 'Receipt' : 'Payment'} ₹${amt.toLocaleString('en-IN')} via ${fundName}`;
    } else if (mode === 'sales' || mode === 'purchase') {
      if (!partyLedgerId) {
        setError(mode === 'sales' ? 'Select a customer / party' : 'Select a supplier / party');
        return;
      }
      const contraId = mode === 'sales' ? salesIncomeId : purchaseAccountId;
      if (!contraId) {
        setError(mode === 'sales' ? 'Select a sales / income account' : 'Select a purchase account');
        return;
      }
      if (partyLedgerId === contraId) {
        setError('Party and account must be different ledgers');
        return;
      }
      body = {
        voucherType: mode,
        voucherDate,
        voucherNumber: voucherNumber.trim() || null,
        narration: narration.trim() || null,
        partyLedgerId,
        contraLedgerId: contraId,
        amount: amt,
      };
      const partyName = ledgers.find(l => l.id === partyLedgerId)?.name || 'party';
      savedLabel = `${mode === 'sales' ? 'Sales' : 'Purchase'} ₹${amt.toLocaleString('en-IN')} — ${partyName}`;
    } else if (mode === 'contra') {
      if (!fromFundId || !toFundId) {
        setError('Select from and to cash/bank accounts');
        return;
      }
      if (fromFundId === toFundId) {
        setError('From and to must be different accounts');
        return;
      }
      body = {
        voucherType: 'contra',
        voucherDate,
        voucherNumber: voucherNumber.trim() || null,
        narration: narration.trim() || null,
        partyLedgerId: toFundId,
        contraLedgerId: fromFundId,
        amount: amt,
      };
      const fromName = ledgers.find(l => l.id === fromFundId)?.name || 'from';
      const toName = ledgers.find(l => l.id === toFundId)?.name || 'to';
      savedLabel = `Contra ₹${amt.toLocaleString('en-IN')} ${fromName} → ${toName}`;
    } else {
      if (!debitLedgerId || !creditLedgerId) {
        setError('Select debit and credit ledgers');
        return;
      }
      if (debitLedgerId === creditLedgerId) {
        setError('Debit and credit must be different ledgers');
        return;
      }
      body = {
        voucherType: 'journal',
        voucherDate,
        voucherNumber: voucherNumber.trim() || null,
        narration: narration.trim() || null,
        entries: twoLineJournalEntries(debitLedgerId, creditLedgerId, amt),
      };
      const drName = ledgers.find(l => l.id === debitLedgerId)?.name || 'Dr';
      const crName = ledgers.find(l => l.id === creditLedgerId)?.name || 'Cr';
      savedLabel = `Journal ₹${amt.toLocaleString('en-IN')} Dr ${drName} / Cr ${crName}`;
    }

    setSaving(true);
    try {
      await fetchApi('/books/vouchers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await onSaved();
      setLastSaved(savedLabel);
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

  const subtitle =
    mode === 'contra'
      ? 'Cash ↔ bank transfer — Save & next for rapid posting'
      : mode === 'journal'
        ? 'Two-line journal (Dr / Cr) — multi-line stays in New voucher'
        : mode === 'sales'
          ? 'Party sale on account — customer + sales income'
          : mode === 'purchase'
            ? 'Party purchase on account — supplier + purchase account'
            : 'Cash / bank receipt & payment — Save & next for rapid posting';

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Voucher desk</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {MODE_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setError(null);
                setLastSaved(null);
              }}
              className={`rounded-md px-2.5 py-1.5 ${
                mode === t.id ? 'bg-slate-800 font-medium text-white' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
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

        {(mode === 'receipt' || mode === 'payment') && (
          <>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">{mode === 'receipt' ? 'Received from' : 'Paid to'}</span>
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
          </>
        )}

        {mode === 'sales' && (
          <>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">Customer / party</span>
              <SearchSelect
                options={partyOptions}
                value={partyLedgerId}
                onChange={setPartyLedgerId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select customer'}
              />
            </div>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">Sales / income</span>
              <SearchSelect
                options={salesIncomeOptions}
                value={salesIncomeId}
                onChange={setSalesIncomeId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select sales account'}
              />
            </div>
          </>
        )}

        {mode === 'purchase' && (
          <>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">Supplier / party</span>
              <SearchSelect
                options={partyOptions}
                value={partyLedgerId}
                onChange={setPartyLedgerId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select supplier'}
              />
            </div>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">Purchase account</span>
              <SearchSelect
                options={purchaseAccountOptions}
                value={purchaseAccountId}
                onChange={setPurchaseAccountId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select purchase account'}
              />
            </div>
          </>
        )}

        {mode === 'contra' && (
          <>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">From (withdraw)</span>
              <SearchSelect
                options={fundOptions}
                value={fromFundId}
                onChange={setFromFundId}
                placeholder={loadingLedgers ? 'Loading…' : 'Source cash / bank'}
              />
            </div>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">To (deposit)</span>
              <SearchSelect
                options={fundOptions}
                value={toFundId}
                onChange={setToFundId}
                placeholder={loadingLedgers ? 'Loading…' : 'Destination cash / bank'}
              />
            </div>
          </>
        )}

        {mode === 'journal' && (
          <>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">Debit ledger</span>
              <SearchSelect
                options={allLedgerOptions}
                value={debitLedgerId}
                onChange={setDebitLedgerId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select ledger to debit'}
              />
            </div>
            <div className="text-sm sm:col-span-2">
              <span className="text-xs text-slate-500">Credit ledger</span>
              <SearchSelect
                options={allLedgerOptions}
                value={creditLedgerId}
                onChange={setCreditLedgerId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select ledger to credit'}
              />
            </div>
          </>
        )}

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
