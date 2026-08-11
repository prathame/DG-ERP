import React, { useCallback, useEffect, useState } from 'react';
import { fetchApi } from '../../api';
import { LoadingSpinner } from '../../components/ui';
import { BookOpen, FileUp, Landmark, Package, Plus, Receipt } from 'lucide-react';
import { MiracleImportPanel, summaryCount } from './MiracleImportPanel';
import { CreateVoucherModal } from './CreateVoucherModal';

type BooksPanel = 'overview' | 'ledgers' | 'vouchers' | 'products' | 'import';

interface BooksSummary {
  ledgers: number;
  products: number;
  vouchers: number;
  recentImports: Array<{
    id: string;
    status: string;
    companyName?: string;
    miracleVersion?: string;
    summary?: Record<string, number | string>;
    errorMessage?: string;
    createdAt?: string;
  }>;
}

interface LedgerRow {
  id: string;
  name: string;
  groupName?: string;
  ledgerType?: string;
  nature?: string;
  gstin?: string;
  openingBalance: number;
  contactPerson?: string;
  city?: string;
  state?: string;
}

interface ProductRow {
  id: string;
  name: string;
  unit?: string;
  saleRate: number;
  hsnCode?: string;
}

interface VoucherRow {
  id: string;
  voucherType: string;
  voucherDate: string;
  voucherNumber?: string;
  partyName?: string;
  contraName?: string;
  amount: number;
  narration?: string;
  miracleType?: string;
}

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function BooksView({ initialPanel = 'overview' }: { initialPanel?: BooksPanel }) {
  const [panel, setPanel] = useState<BooksPanel>(initialPanel);
  const [summary, setSummary] = useState<BooksSummary | null>(null);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateVoucher, setShowCreateVoucher] = useState(false);
  const [vouchersTick, setVouchersTick] = useState(0);

  useEffect(() => {
    setPanel(initialPanel);
  }, [initialPanel]);

  const loadSummary = useCallback(async () => {
    const data = await fetchApi<BooksSummary>('/books/summary');
    setSummary(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadSummary();
        if (panel === 'ledgers') {
          const q = search ? `?search=${encodeURIComponent(search)}` : '';
          const rows = await fetchApi<LedgerRow[]>(`/books/ledgers${q}`);
          if (!cancelled) setLedgers(rows);
        } else if (panel === 'products') {
          const rows = await fetchApi<ProductRow[]>('/books/products');
          if (!cancelled) setProducts(rows);
        } else if (panel === 'vouchers') {
          const rows = await fetchApi<VoucherRow[]>('/books/vouchers');
          if (!cancelled) setVouchers(rows);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load books data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, search, loadSummary, vouchersTick]);

  const tabs: { id: BooksPanel; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BookOpen size={16} /> },
    { id: 'ledgers', label: 'Ledgers', icon: <Landmark size={16} /> },
    { id: 'vouchers', label: 'Vouchers', icon: <Receipt size={16} /> },
    { id: 'products', label: 'Products', icon: <Package size={16} /> },
    { id: 'import', label: 'Miracle Import', icon: <FileUp size={16} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Books</h1>
          <p className="text-sm text-slate-500">
            Miracle-shaped books desk — import a CMP to fill parties, products, invoices & payments, then work from
            ledgers and vouchers here
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPanel(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                panel === t.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {panel === 'import' ? (
        <MiracleImportPanel onComplete={() => loadSummary()} />
      ) : loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : panel === 'overview' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Ledgers', value: summary?.ledgers ?? 0 },
            { label: 'Products', value: summary?.products ?? 0 },
            { label: 'Vouchers', value: summary?.vouchers ?? 0 },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">{c.label}</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">{c.value}</div>
            </div>
          ))}
          <div className="sm:col-span-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">How Dhandho replaces Miracle</h2>
            <ol className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              <li>
                <span className="font-semibold text-orange-700">1. Import</span> — upload Miracle CMP (.rar / .zip)
              </li>
              <li>
                <span className="font-semibold text-orange-700">2. Work</span> — parties, invoices & payments land in
                Transactions
              </li>
              <li>
                <span className="font-semibold text-orange-700">3. Books</span> — ledgers & vouchers stay here for audit
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setPanel('import')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
            >
              <FileUp size={16} />
              Open Miracle Import
            </button>
          </div>
          <div className="sm:col-span-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-800">Recent Miracle imports</h2>
            {!summary?.recentImports?.length ? (
              <p className="text-sm text-slate-500">No imports yet — use Miracle Import to upload a CMP .rar / .zip.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.recentImports.map(j => {
                  const s = (j.summary || {}) as Record<string, unknown>;
                  const opsBits = [
                    summaryCount(s, 'vendors') ? `${summaryCount(s, 'vendors')} parties` : null,
                    summaryCount(s, 'opsProducts') ? `${summaryCount(s, 'opsProducts')} products` : null,
                    summaryCount(s, 'invoices') ? `${summaryCount(s, 'invoices')} invoices` : null,
                    summaryCount(s, 'vendorPayments') + summaryCount(s, 'invoicePayments')
                      ? `${summaryCount(s, 'vendorPayments') + summaryCount(s, 'invoicePayments')} payments`
                      : null,
                  ].filter(Boolean);
                  return (
                    <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{j.companyName || 'Import'}</span>
                        <span className="ml-2 text-slate-500">{j.miracleVersion}</span>
                        {opsBits.length > 0 && (
                          <div className="text-xs text-slate-500 mt-0.5">Dhandho: {opsBits.join(', ')}</div>
                        )}
                        {j.status === 'failed' && j.errorMessage && (
                          <div className="text-xs text-red-600 mt-0.5 break-words">{j.errorMessage}</div>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          j.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : j.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {j.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : panel === 'ledgers' ? (
        <div className="space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ledgers…"
            className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2 text-right">Opening</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map(l => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{l.name}</td>
                    <td className="px-3 py-2 text-slate-600">{l.ledgerType || l.nature || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{l.groupName || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {[l.contactPerson, l.city, l.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(l.openingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : panel === 'products' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">HSN</th>
                <th className="px-3 py-2 text-right">Sale rate</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">{p.unit || '—'}</td>
                  <td className="px-3 py-2">{p.hsnCode || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(p.saleRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              Enter receipt, payment, contra, or journal — same mental model as Miracle cash/bank & journals.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateVoucher(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              <Plus size={16} />
              New voucher
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Narration</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No vouchers yet — import from Miracle or create one with New voucher.
                    </td>
                  </tr>
                ) : (
                  vouchers.map(v => (
                    <tr key={v.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {typeof v.voucherDate === 'string' ? v.voucherDate.slice(0, 10) : String(v.voucherDate)}
                      </td>
                      <td className="px-3 py-2">{v.voucherNumber || '—'}</td>
                      <td className="px-3 py-2 uppercase">{v.voucherType}</td>
                      <td className="px-3 py-2">{v.partyName || v.contraName || '—'}</td>
                      <td className="px-3 py-2 max-w-xs truncate text-slate-600">{v.narration || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(v.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {showCreateVoucher && (
            <CreateVoucherModal
              onClose={() => setShowCreateVoucher(false)}
              onCreated={async () => {
                setVouchersTick(t => t + 1);
                await loadSummary();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
