import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fetchApi } from '../../api';
import { AppModal } from '../../components/ui';
import { SearchSelect } from '../../components/ui/SearchSelect';

type VoucherKind = 'receipt' | 'payment' | 'journal' | 'contra' | 'sales';

interface LedgerOption {
  id: string;
  name: string;
  ledgerType?: string;
  groupName?: string;
}

interface JournalLine {
  key: string;
  ledgerId: string;
  debit: string;
  credit: string;
}

const TYPE_OPTIONS: { id: VoucherKind; label: string; hint: string }[] = [
  { id: 'receipt', label: 'Receipt', hint: 'Cash/Bank ← Party' },
  { id: 'payment', label: 'Payment', hint: 'Party ← Cash/Bank' },
  { id: 'sales', label: 'Sales', hint: 'Party ← Sales income' },
  { id: 'contra', label: 'Contra', hint: 'Cash ↔ Bank transfer' },
  { id: 'journal', label: 'Journal', hint: 'Multi-ledger adjustment' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newLine(): JournalLine {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ledgerId: '', debit: '', credit: '' };
}

export function CreateVoucherModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(true);
  const [voucherType, setVoucherType] = useState<VoucherKind>('receipt');
  const [voucherDate, setVoucherDate] = useState(todayIso);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [narration, setNarration] = useState('');
  const [partyLedgerId, setPartyLedgerId] = useState('');
  const [contraLedgerId, setContraLedgerId] = useState('');
  const [amount, setAmount] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([newLine(), newLine()]);
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

  const ledgerOptions = useMemo(
    () =>
      ledgers.map(l => ({
        value: l.id,
        label: l.name,
        sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
      })),
    [ledgers],
  );

  const cashBankOptions = useMemo(() => {
    const cashish = ledgers.filter(l => {
      const t = (l.ledgerType || '').toUpperCase();
      const g = `${l.groupName || ''} ${l.name}`.toLowerCase();
      return t === 'CS' || t === 'BK' || t === 'BN' || /cash|bank/.test(g);
    });
    const list = cashish.length ? cashish : ledgers;
    return list.map(l => ({
      value: l.id,
      label: l.name,
      sublabel: [l.ledgerType, l.groupName].filter(Boolean).join(' · ') || undefined,
    }));
  }, [ledgers]);

  const salesIncomeOptions = useMemo(() => {
    const salesish = ledgers.filter(l => {
      const t = (l.ledgerType || '').toUpperCase();
      const g = `${l.groupName || ''} ${l.name}`.toLowerCase();
      return t === 'IN' || t === 'TS' || t === 'JP' || /sales|income|revenue/.test(g);
    });
    const list = salesish.length ? salesish : ledgers;
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
      const body: Record<string, unknown> = {
        voucherType,
        voucherDate,
        voucherNumber: voucherNumber.trim() || null,
        narration: narration.trim() || null,
      };
      if (voucherType === 'journal') {
        body.entries = lines.map(l => ({
          ledgerId: l.ledgerId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        }));
      } else {
        body.partyLedgerId = partyLedgerId;
        body.contraLedgerId = contraLedgerId;
        body.amount = Number(amount);
      }
      await fetchApi('/books/vouchers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  }

  const partyLabel =
    voucherType === 'contra'
      ? 'To (deposit / destination)'
      : voucherType === 'payment'
        ? 'Party (paid to)'
        : voucherType === 'sales'
          ? 'Party (customer)'
          : 'Party';
  const contraLabel =
    voucherType === 'contra'
      ? 'From (withdraw / source)'
      : voucherType === 'receipt'
        ? 'Cash / Bank (received in)'
        : voucherType === 'sales'
          ? 'Sales income'
          : 'Cash / Bank (paid from)';

  return (
    <AppModal
      title="New voucher"
      subtitle="Receipt, payment, sales, contra, or journal"
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
            {saving ? 'Saving…' : 'Save voucher'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setVoucherType(opt.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                voucherType === opt.id
                  ? 'border-orange-400 bg-orange-50 text-orange-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold">{opt.label}</div>
              <div className="text-xs opacity-70">{opt.hint}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Date</span>
            <input
              type="date"
              value={voucherDate}
              onChange={e => setVoucherDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Voucher no. (optional)</span>
            <input
              value={voucherNumber}
              onChange={e => setVoucherNumber(e.target.value)}
              placeholder="e.g. CR/12"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>

        {voucherType === 'journal' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Journal lines</span>
              <button
                type="button"
                onClick={() => setLines(prev => [...prev, newLine()])}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
              >
                <Plus size={14} /> Add line
              </button>
            </div>
            {lines.map((line, idx) => (
              <div
                key={line.key}
                className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2 sm:grid-cols-12"
              >
                <div className="sm:col-span-6">
                  <SearchSelect
                    options={ledgerOptions}
                    value={line.ledgerId}
                    onChange={v => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ledgerId: v } : l)))}
                    placeholder="Ledger"
                  />
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Debit"
                  value={line.debit}
                  onChange={e =>
                    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, debit: e.target.value, credit: '' } : l)))
                  }
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-2"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Credit"
                  value={line.credit}
                  onChange={e =>
                    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, credit: e.target.value, debit: '' } : l)))
                  }
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-2"
                />
                <button
                  type="button"
                  disabled={lines.length <= 2}
                  onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                  className="inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30 sm:col-span-2"
                  aria-label="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block text-slate-600">{partyLabel}</span>
              <SearchSelect
                options={voucherType === 'contra' ? cashBankOptions : ledgerOptions}
                value={partyLedgerId}
                onChange={setPartyLedgerId}
                placeholder="Select ledger"
              />
            </label>
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block text-slate-600">{contraLabel}</span>
              <SearchSelect
                options={
                  voucherType === 'sales'
                    ? salesIncomeOptions
                    : voucherType === 'contra'
                      ? cashBankOptions
                      : cashBankOptions
                }
                value={contraLedgerId}
                onChange={setContraLedgerId}
                placeholder={voucherType === 'sales' ? 'Select sales income' : 'Select cash/bank'}
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
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Narration</span>
          <input
            value={narration}
            onChange={e => setNarration(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>

        {loadingLedgers && <p className="text-xs text-slate-500">Loading ledgers…</p>}
        {!loadingLedgers && ledgers.length === 0 && (
          <p className="text-xs text-amber-700">
            No ledgers yet — open Accounts → Ledger once to set up Cash/Bank, or add a client first.
          </p>
        )}
      </div>
    </AppModal>
  );
}
