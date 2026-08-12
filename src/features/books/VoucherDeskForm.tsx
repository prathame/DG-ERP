import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fetchApi } from '../../api';
import { SearchSelect } from '../../components/ui/SearchSelect';
import {
  isCashBankLedger,
  isPurchaseAccountLedger,
  isSalesIncomeLedger,
  journalDeskTotals,
  journalEntriesFromDeskLines,
} from './bookLedgerUtils';

type DeskMode =
  | 'receipt'
  | 'payment'
  | 'sales'
  | 'purchase'
  | 'purchase_return'
  | 'credit_note'
  | 'debit_note'
  | 'contra'
  | 'journal'
  | 'memorandum';

interface LedgerOption {
  id: string;
  name: string;
  ledgerType?: string;
  groupName?: string;
}

type JournalLine = { key: string; ledgerId: string; debit: string; credit: string };
type StockLine = { key: string; productId: string; qty: string; rate: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newJournalLine(): JournalLine {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ledgerId: '', debit: '', credit: '' };
}

function newStockLine(): StockLine {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, productId: '', qty: '1', rate: '' };
}

const MODE_TABS: { id: DeskMode; label: string }[] = [
  { id: 'receipt', label: 'Receipt' },
  { id: 'payment', label: 'Payment' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'purchase_return', label: 'PR' },
  { id: 'credit_note', label: 'CN' },
  { id: 'debit_note', label: 'DN' },
  { id: 'contra', label: 'Contra' },
  { id: 'journal', label: 'Journal' },
  { id: 'memorandum', label: 'Memo' },
];

/**
 * Miracle-style voucher desk: cash/bank, sales/purchase/return, CN/DN, contra, journal, memorandum.
 * Purchase / PR / sales / CN / DN optional product lines dual-write ops stock when products resolve.
 * Posts via existing POST /books/vouchers; Save & next keeps the form open.
 */
export function VoucherDeskForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit?: string }>>([]);
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
  const [journalLines, setJournalLines] = useState<JournalLine[]>(() => [newJournalLine(), newJournalLine()]);
  const [stockLines, setStockLines] = useState<StockLine[]>(() => [newStockLine()]);
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
        const [rows, productRows] = await Promise.all([
          fetchApi<LedgerOption[]>('/books/ledgers'),
          fetchApi<Array<{ id: string; name: string; unit?: string }>>('/books/products').catch(() => []),
        ]);
        if (cancelled) return;
        setLedgers(rows);
        setProducts(Array.isArray(productRows) ? productRows : []);
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
    if (!loadingLedgers && mode !== 'journal' && mode !== 'memorandum') amountRef.current?.focus();
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

  const usesSalesContra = mode === 'sales' || mode === 'credit_note' || mode === 'debit_note';
  const usesPurchaseContra = mode === 'purchase' || mode === 'purchase_return';
  const usesStockLines =
    mode === 'purchase' ||
    mode === 'purchase_return' ||
    mode === 'sales' ||
    mode === 'credit_note' ||
    mode === 'debit_note';

  const partyOptions = useMemo(() => {
    const excludeId = usesSalesContra ? salesIncomeId : usesPurchaseContra ? purchaseAccountId : fundLedgerId;
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
  }, [ledgers, fundLedgerId, salesIncomeId, purchaseAccountId, mode, usesSalesContra, usesPurchaseContra]);

  const productOptions = useMemo(
    () =>
      products.map(p => ({
        value: p.id,
        label: p.name,
        sublabel: p.unit || undefined,
      })),
    [products],
  );

  async function handleSave() {
    setError(null);
    setLastSaved(null);

    let body: Record<string, unknown>;
    let savedLabel: string;

    if (mode === 'journal' || mode === 'memorandum') {
      const entries = journalEntriesFromDeskLines(journalLines);
      if (entries.length < 2) {
        setError(
          mode === 'memorandum'
            ? 'Add at least two memorandum lines with amounts'
            : 'Add at least two journal lines with amounts',
        );
        return;
      }
      const totals = journalDeskTotals(entries);
      if (!totals.balanced) {
        setError(
          `${mode === 'memorandum' ? 'Memorandum' : 'Journal'} must balance (Dr ₹${totals.debit.toLocaleString('en-IN')} / Cr ₹${totals.credit.toLocaleString('en-IN')})`,
        );
        return;
      }
      body = {
        voucherType: mode,
        voucherDate,
        voucherNumber: voucherNumber.trim() || null,
        narration: narration.trim() || null,
        entries,
      };
      savedLabel = `${mode === 'memorandum' ? 'Memorandum' : 'Journal'} ₹${totals.debit.toLocaleString('en-IN')} (${entries.length} lines)`;
    } else {
      const amt = Number(amount);
      if (!(amt > 0)) {
        setError('Enter an amount greater than zero');
        return;
      }

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
      } else if (usesSalesContra || usesPurchaseContra) {
        if (!partyLedgerId) {
          setError(usesPurchaseContra ? 'Select a supplier / party' : 'Select a customer / party');
          return;
        }
        const contraId = usesPurchaseContra ? purchaseAccountId : salesIncomeId;
        if (!contraId) {
          setError(usesPurchaseContra ? 'Select a purchase account' : 'Select a sales / income account');
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
        if (usesStockLines) {
          const items = stockLines
            .filter(l => l.productId && Number(l.qty) > 0)
            .map(l => {
              const qty = Number(l.qty) || 0;
              const rate = Number(l.rate) || 0;
              return {
                productId: l.productId,
                qty,
                rate,
                amount: rate > 0 ? Math.round(rate * qty * 100) / 100 : 0,
              };
            });
          if (items.length) body.items = items;
        }
        const partyName = ledgers.find(l => l.id === partyLedgerId)?.name || 'party';
        const label =
          mode === 'sales'
            ? 'Sales'
            : mode === 'purchase'
              ? 'Purchase'
              : mode === 'purchase_return'
                ? 'Purchase return'
                : mode === 'credit_note'
                  ? 'Credit note'
                  : 'Debit note';
        const stockHint =
          usesStockLines && Array.isArray(body.items) && (body.items as unknown[]).length
            ? ` · ${(body.items as unknown[]).length} stock line(s)`
            : '';
        savedLabel = `${label} ₹${amt.toLocaleString('en-IN')} — ${partyName}${stockHint}`;
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
        setError('Unknown voucher mode');
        return;
      }
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
      if (mode === 'journal' || mode === 'memorandum') {
        setJournalLines([newJournalLine(), newJournalLine()]);
      } else {
        if (usesStockLines) setStockLines([newStockLine()]);
        amountRef.current?.focus();
      }
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
        ? 'Multi-line journal — lines must balance'
        : mode === 'memorandum'
          ? 'Non-posting memorandum — stored for reference, off TB / day book'
          : mode === 'sales'
            ? 'Party sale on account — optional product lines for stock-out'
            : mode === 'purchase'
              ? 'Party purchase on account — optional product lines for stock-in'
              : mode === 'purchase_return'
                ? 'Purchase return — optional product lines for stock-out'
                : mode === 'credit_note'
                  ? 'Credit note / sales return — optional product lines for stock-in'
                  : mode === 'debit_note'
                    ? 'Debit note — optional product lines for stock-out'
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
              title={
                t.id === 'credit_note'
                  ? 'Credit note / sales return'
                  : t.id === 'debit_note'
                    ? 'Debit note'
                    : t.id === 'purchase_return'
                      ? 'Purchase return'
                      : t.id === 'memorandum'
                        ? 'Memorandum (non-posting)'
                        : undefined
              }
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
      {mode === 'memorandum' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Memorandum lines are stored for reference and stay off trial balance, day book, and cash/bank books.
        </p>
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

        {(mode === 'sales' || mode === 'credit_note' || mode === 'debit_note') && (
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
              <span className="text-xs text-slate-500">
                {mode === 'credit_note' ? 'Sales / return (debited)' : 'Sales / income'}
              </span>
              <SearchSelect
                options={salesIncomeOptions}
                value={salesIncomeId}
                onChange={setSalesIncomeId}
                placeholder={loadingLedgers ? 'Loading…' : 'Select sales account'}
              />
            </div>
          </>
        )}

        {(mode === 'purchase' || mode === 'purchase_return') && (
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
              <span className="text-xs text-slate-500">
                {mode === 'purchase_return' ? 'Purchase / return (credited)' : 'Purchase account'}
              </span>
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

        {mode !== 'journal' && mode !== 'memorandum' && (
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
        )}
        <label className={`block text-sm ${mode === 'journal' || mode === 'memorandum' ? 'sm:col-span-2' : ''}`}>
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

      {usesStockLines && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">
              Stock lines (optional — dual-write ops inventory when products resolve)
            </span>
            <button
              type="button"
              onClick={() => setStockLines(prev => [...prev, newStockLine()])}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
            >
              <Plus size={14} /> Add item
            </button>
          </div>
          {!productOptions.length && (
            <p className="text-xs text-amber-700">
              No Books products yet — import or add products for stock dual-write.
            </p>
          )}
          {stockLines.map((line, idx) => (
            <div
              key={line.key}
              className="grid gap-2 rounded-lg border border-slate-100 bg-white/80 p-2 sm:grid-cols-12"
            >
              <div className="sm:col-span-6">
                <SearchSelect
                  options={productOptions}
                  value={line.productId}
                  onChange={v => setStockLines(prev => prev.map((l, i) => (i === idx ? { ...l, productId: v } : l)))}
                  placeholder={loadingLedgers ? 'Loading…' : 'Product'}
                />
              </div>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Qty"
                value={line.qty}
                onChange={e =>
                  setStockLines(prev => prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))
                }
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm tabular-nums sm:col-span-2"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Rate"
                value={line.rate}
                onChange={e =>
                  setStockLines(prev => prev.map((l, i) => (i === idx ? { ...l, rate: e.target.value } : l)))
                }
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm tabular-nums sm:col-span-2"
              />
              <button
                type="button"
                disabled={stockLines.length <= 1}
                onClick={() => setStockLines(prev => prev.filter((_, i) => i !== idx))}
                className="inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30 sm:col-span-2"
                aria-label="Remove item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(mode === 'journal' || mode === 'memorandum') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">
              {mode === 'memorandum' ? 'Memorandum lines' : 'Journal lines'}
            </span>
            <button
              type="button"
              onClick={() => setJournalLines(prev => [...prev, newJournalLine()])}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          {journalLines.map((line, idx) => (
            <div
              key={line.key}
              className="grid gap-2 rounded-lg border border-slate-100 bg-white/80 p-2 sm:grid-cols-12"
            >
              <div className="sm:col-span-6">
                <SearchSelect
                  options={allLedgerOptions}
                  value={line.ledgerId}
                  onChange={v => setJournalLines(prev => prev.map((l, i) => (i === idx ? { ...l, ledgerId: v } : l)))}
                  placeholder={loadingLedgers ? 'Loading…' : 'Ledger'}
                />
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Debit"
                value={line.debit}
                onChange={e =>
                  setJournalLines(prev =>
                    prev.map((l, i) => (i === idx ? { ...l, debit: e.target.value, credit: '' } : l)),
                  )
                }
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm tabular-nums sm:col-span-2"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Credit"
                value={line.credit}
                onChange={e =>
                  setJournalLines(prev =>
                    prev.map((l, i) => (i === idx ? { ...l, credit: e.target.value, debit: '' } : l)),
                  )
                }
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm tabular-nums sm:col-span-2"
              />
              <button
                type="button"
                disabled={journalLines.length <= 2}
                onClick={() => setJournalLines(prev => prev.filter((_, i) => i !== idx))}
                className="inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30 sm:col-span-2"
                aria-label="Remove line"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

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
