import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  Download,
  Printer,
  Search,
  BookOpen,
  TrendingUp,
  Scale,
  Banknote,
  ShoppingCart,
  Truck,
  Clock,
  IndianRupee,
  Package,
  Receipt,
  FileCheck,
  Upload,
} from 'lucide-react';
import {
  cn,
  exportToCsv,
  formatDate,
  useTabLabel,
  openPrintWindow,
  withPrintPagination,
  PRINT_POPUP_BLOCKED,
} from '../../lib/utils';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { useToast, LoadingSpinner } from '../../components/ui';
import { fetchApi } from '../../api';
import { esc } from '../../lib/billTemplates';

type AccountTab =
  | 'pnl'
  | 'balance'
  | 'cashflow'
  | 'ledger'
  | 'daybook'
  | 'notes'
  | 'sales'
  | 'distribution'
  | 'outstanding'
  | 'payments'
  | 'stock'
  | 'gst'
  | 'gstr2b'
  | 'gstr3b';

function fmtCurrency(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN')}${n < 0 ? ' (Cr)' : ''}`;
}

export function AccountsView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' } = {}) {
  const { toast } = useToast();
  const cfg = useBusinessConfig();
  const ds = cfg.type === 'dealer' || cfg.type === 'retail';
  const businessType = cfg.type;
  const [tab, setTab] = useState<AccountTab>('pnl');
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear() - 1}-04-01`;
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [gstMonth, setGstMonth] = useState(now.getMonth() + 1);
  const [gstYear, setGstYear] = useState(now.getFullYear());

  const loadData = async () => {
    setLoading(true);
    setData(null);
    try {
      const qs = `from=${from}&to=${to}`;
      if (tab === 'pnl') setData(await fetchApi(`/accounts/profit-loss?${qs}`));
      else if (tab === 'balance') setData(await fetchApi('/accounts/balance-sheet'));
      else if (tab === 'cashflow') setData(await fetchApi(`/accounts/cash-flow?${qs}`));
      else if (tab === 'ledger') setData(await fetchApi(`/accounts/ledger?${qs}&type=${ledgerFilter}`));
      else if (tab === 'daybook') setData(await fetchApi(`/accounts/day-book?date=${from}`));
      else if (tab === 'notes') setData(await fetchApi('/accounts/notes'));
      else if (tab === 'sales') setData(await fetchApi(`/reports/sales-register?${qs}`));
      else if (tab === 'distribution') setData(await fetchApi(`/reports/distribution-register?${qs}`));
      else if (tab === 'outstanding') setData(await fetchApi('/reports/outstanding'));
      else if (tab === 'payments') setData(await fetchApi(`/reports/payment-register?${qs}`));
      else if (tab === 'stock') setData(await fetchApi('/reports/stock-summary'));
      else if (tab === 'gst') setData(await fetchApi(`/reports/gst-summary?month=${gstMonth}&year=${gstYear}`));
      else if (tab === 'gstr3b') setData(await fetchApi(`/gstr3b/compute?month=${gstMonth}&year=${gstYear}`));
    } catch {
      toast('Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const el = document.getElementById('accounts-content');
    if (!el) return;
    const titles: Record<string, string> = {
      pnl: 'Profit & Loss Statement',
      balance: 'Balance Sheet',
      cashflow: 'Cash Flow Statement',
      ledger: 'General Ledger',
      daybook: 'Day Book',
      notes: 'Credit / Debit Notes',
      sales: 'Sales Register',
      distribution: ds ? 'Sales Register' : 'Distribution Register',
      outstanding: 'Outstanding Report',
      payments: 'Payment Register',
      stock: 'Stock Summary',
      gst: 'GST Summary',
    };
    const win = openPrintWindow();
    if (!win) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    // Prefer DOM clone over string concat so React-escaped text stays text (no re-parse XSS).
    win.document.open();
    win.document.write(
      withPrintPagination(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titles[tab] || 'Accounts')}</title><style>body{font-family:sans-serif;margin:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}.card{border:1px solid #ddd;padding:16px;margin:8px 0;border-radius:8px}.amount{text-align:right;font-weight:bold}.label{color:#666;font-size:11px;text-transform:uppercase}h2{margin-bottom:4px}p{color:#666;font-size:12px;margin-top:0}@media print{body{margin:0}}</style></head><body></body></html>`,
      ),
    );
    win.document.close();
    const h2 = win.document.createElement('h2');
    h2.textContent = titles[tab] || 'Accounts';
    const period = win.document.createElement('p');
    period.textContent = `Period: ${from} to ${to}`;
    win.document.body.appendChild(h2);
    win.document.body.appendChild(period);
    win.document.body.appendChild(win.document.importNode(el, true));
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* ignore */
      }
    }, 300);
  };

  const ALL_TABS: {
    key: AccountTab;
    label: string;
    shortLabel: string;
    icon: React.ElementType;
    group: 'accounts' | 'reports';
    hide?: boolean;
  }[] = [
    { key: 'pnl', label: 'Profit & Loss', shortLabel: 'P&L', icon: TrendingUp, group: 'accounts' },
    { key: 'balance', label: 'Balance Sheet', shortLabel: 'Balance', icon: Scale, group: 'accounts' },
    { key: 'cashflow', label: 'Cash Flow', shortLabel: 'Cash', icon: Banknote, group: 'accounts' },
    { key: 'ledger', label: 'Ledger', shortLabel: 'Ledger', icon: BookOpen, group: 'accounts' },
    { key: 'daybook', label: 'Day Book', shortLabel: 'DayBook', icon: BookOpen, group: 'accounts' },
    { key: 'notes', label: 'Credit/Debit Notes', shortLabel: 'Notes', icon: Receipt, group: 'accounts' },
    {
      key: 'sales',
      label: 'Sales Register',
      shortLabel: 'Sales',
      icon: ShoppingCart,
      group: 'reports',
      hide: cfg.accounts.hideTabs.includes('sales'),
    },
    {
      key: 'distribution',
      label: cfg.accounts.distributionRegisterLabel,
      shortLabel: ds ? 'Sales' : 'Dist.',
      icon: Truck,
      group: 'reports',
      hide: cfg.accounts.hideTabs.includes('distribution'),
    },
    { key: 'outstanding', label: 'Outstanding', shortLabel: 'Due', icon: Clock, group: 'reports' },
    { key: 'payments', label: 'Payment Register', shortLabel: 'Payments', icon: IndianRupee, group: 'reports' },
    {
      key: 'stock',
      label: 'Stock Summary',
      shortLabel: 'Stock',
      icon: Package,
      group: 'reports',
      hide: cfg.accounts.hideTabs.includes('stock'),
    },
    { key: 'gst', label: 'GST Summary', shortLabel: 'GST', icon: Receipt, group: 'reports' },
    { key: 'gstr2b', label: 'GSTR-2B Reconciliation', shortLabel: '2B', icon: FileCheck, group: 'reports' },
    { key: 'gstr3b', label: 'GSTR-3B Computation', shortLabel: '3B', icon: FileCheck, group: 'reports' },
  ];
  const TABS = ALL_TABS.filter(t => !t.hide);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 size={22} /> {useTabLabel('accounts', 'Accounts & Reports')}
          </h2>
          <p className="text-sm text-gray-500">Financial statements, GST reports, registers — all in one place</p>
        </div>
        {data && (
          <div className="flex gap-2">
            {data && ((data as Record<string, unknown>).entries || (data as Record<string, unknown>).rows) && (
              <button
                type="button"
                onClick={() => {
                  const rows = (data as Record<string, unknown>).entries || (data as Record<string, unknown>).rows;
                  if (Array.isArray(rows)) exportToCsv(rows as Record<string, unknown>[], tab);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
              >
                <Download size={16} /> CSV
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Accounts</p>
          <div className="flex gap-1.5 flex-wrap">
            {TABS.filter(t => t.group === 'accounts').map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setData(null);
                }}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  tab === t.key ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                <t.icon size={14} /> <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Reports</p>
          <div className="flex gap-1.5 flex-wrap">
            {TABS.filter(t => t.group === 'reports').map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setData(null);
                }}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  tab === t.key ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                <t.icon size={14} /> <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-end gap-3 flex-wrap">
          {tab !== 'balance' && tab !== 'outstanding' && tab !== 'stock' && tab !== 'gst' && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </>
          )}
          {tab === 'ledger' && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Type</label>
              <select
                value={ledgerFilter}
                onChange={e => setLedgerFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="all">All</option>
                <option value="sales">Sales/Distribution</option>
                <option value="purchases">Purchases</option>
                <option value="payments">Payments</option>
              </select>
            </div>
          )}
          {tab === 'gst' && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Month</label>
                <select
                  value={gstMonth}
                  onChange={e => setGstMonth(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Year</label>
                <input
                  type="number"
                  value={gstYear}
                  onChange={e => setGstYear(parseInt(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2 bg-brand text-white rounded-lg text-sm font-bold disabled:opacity-60"
          >
            <Search size={16} /> {loading ? 'Loading...' : 'Generate'}
          </button>
          {tab === 'gst' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const gstr1 = await fetchApi(`/reports/gstr1?month=${gstMonth}&year=${gstYear}`);
                  const blob = new Blob([JSON.stringify(gstr1, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `GSTR1_${gstYear}_${String(gstMonth).padStart(2, '0')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  alert((e as Error).message);
                }
              }}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700"
            >
              <Download size={16} /> GSTR-1 JSON
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="py-20 text-center">
          <LoadingSpinner />
        </div>
      )}

      {!loading && data && (
        <div id="accounts-content">
          {tab === 'pnl' && <ProfitLoss data={data} ds={ds} cfg={cfg} />}
          {tab === 'balance' && <BalanceSheet data={data} ds={ds} />}
          {tab === 'cashflow' && <CashFlow data={data} ds={ds} />}
          {tab === 'ledger' && <Ledger data={data} />}
          {tab === 'daybook' && <DayBook data={data} ds={ds} />}
          {tab === 'notes' && <NotesView data={data} onRefresh={loadData} />}
          {['sales', 'distribution', 'outstanding', 'payments', 'stock', 'gst'].includes(tab) && (
            <ReportTable tab={tab} data={data} ds={ds} />
          )}
        </div>
      )}

      {tab === 'gstr2b' && <Gstr2bReconciliation />}
      {tab === 'gstr3b' && !loading && data && <Gstr3bView data={data as Record<string, unknown>} />}

      {!loading && !data && tab !== 'gstr2b' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select a statement and click Generate</p>
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
      <p className={cn('text-xl font-bold mt-1', color)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProfitLoss({
  data,
  ds,
  cfg,
}: {
  data: Record<string, unknown>;
  ds: boolean;
  cfg: ReturnType<typeof useBusinessConfig>;
}) {
  const rev = data.revenue as {
    distributionRevenue: number;
    salesRevenue: number;
    invoiceRevenue?: number;
    total: number;
  };
  const exp = data.expenses as { purchaseCost: number; staffPayments?: number; otherExpenses?: number; total: number };
  const profit = Number(data.grossProfit) || 0;
  const margin = Number(data.profitMargin) || 0;
  const invoiceRev = rev.invoiceRevenue || 0;
  const revenueLines = [
    cfg.features.distribution &&
      rev.distributionRevenue > 0 && { label: cfg.labels.distributionRevenue, value: rev.distributionRevenue },
    cfg.features.distribution && rev.salesRevenue > 0 && { label: 'Direct Sales Revenue', value: rev.salesRevenue },
    invoiceRev > 0 && { label: 'Invoice Revenue', value: invoiceRev },
  ].filter(Boolean) as { label: string; value: number }[];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={fmtCurrency(rev.total)} color="text-blue-600" />
        <StatCard label="Total Expenses" value={fmtCurrency(exp.total)} color="text-rose-600" />
        <StatCard
          label="Gross Profit"
          value={fmtCurrency(profit)}
          color={profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        />
        <StatCard
          label="Profit Margin"
          value={`${margin}%`}
          color={margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-gray-400 uppercase mb-4">Revenue</h3>
          <div className="space-y-3">
            {revenueLines.map(r => (
              <div key={r.label} className="flex justify-between">
                <span className="text-sm">{r.label}</span>
                <span className="font-bold text-blue-600">{fmtCurrency(r.value)}</span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold">Total Revenue</span>
              <span className="font-bold text-blue-600 text-lg">{fmtCurrency(rev.total)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-gray-400 uppercase mb-4">Expenses</h3>
          <div className="space-y-3">
            {exp.purchaseCost > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">{cfg.labels.purchaseCost}</span>
                <span className="font-bold text-rose-600">{fmtCurrency(exp.purchaseCost)}</span>
              </div>
            )}
            {(exp.staffPayments || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Staff Payments</span>
                <span className="font-bold text-rose-600">{fmtCurrency(exp.staffPayments || 0)}</span>
              </div>
            )}
            {(exp.otherExpenses || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Other Expenses</span>
                <span className="font-bold text-rose-600">{fmtCurrency(exp.otherExpenses || 0)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold">Total Expenses</span>
              <span className="font-bold text-rose-600 text-lg">{fmtCurrency(exp.total)}</span>
            </div>
          </div>
        </div>
      </div>
      <div
        className={cn(
          'rounded-2xl border p-6 text-center',
          profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200',
        )}
      >
        <p className="text-sm font-bold text-gray-400 uppercase">Gross Profit</p>
        <p className={cn('text-3xl font-bold mt-1', profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
          {fmtCurrency(profit)}
        </p>
        <p className="text-sm text-gray-500 mt-1">{margin}% margin</p>
      </div>
    </div>
  );
}

function BalanceSheet({ data, ds }: { data: Record<string, unknown>; ds: boolean }) {
  const assets = data.assets as {
    inventory: number;
    receivables: number;
    distributionReceivables?: number;
    invoiceReceivables?: number;
    staffAdvances?: number;
    cashBank: number;
    total: number;
  };
  const liabilities = data.liabilities as { payables: number; total: number };
  const netWorth = Number(data.netWorth) || 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Assets" value={fmtCurrency(assets.total)} color="text-blue-600" />
        <StatCard label="Total Liabilities" value={fmtCurrency(liabilities.total)} color="text-rose-600" />
        <StatCard
          label="Net Worth"
          value={fmtCurrency(netWorth)}
          color={netWorth >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-blue-600 uppercase mb-4">Assets</h3>
          <div className="space-y-3">
            {assets.inventory > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Inventory (at cost)</span>
                <span className="font-bold">{fmtCurrency(assets.inventory)}</span>
              </div>
            )}
            {(assets.distributionReceivables || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">{ds ? 'Customer Receivables' : 'Vendor Receivables'}</span>
                <span className="font-bold">{fmtCurrency(assets.distributionReceivables || 0)}</span>
              </div>
            )}
            {(assets.invoiceReceivables || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Invoice Receivables</span>
                <span className="font-bold">{fmtCurrency(assets.invoiceReceivables || 0)}</span>
              </div>
            )}
            {(assets.staffAdvances || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Staff Advances</span>
                <span className="font-bold">{fmtCurrency(assets.staffAdvances || 0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm">Cash / Bank</span>
              <span className="font-bold">{fmtCurrency(assets.cashBank)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold">Total Assets</span>
              <span className="font-bold text-blue-600 text-lg">{fmtCurrency(assets.total)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-rose-600 uppercase mb-4">Liabilities</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm">Payables (you owe suppliers)</span>
              <span className="font-bold">{fmtCurrency(liabilities.payables)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold">Total Liabilities</span>
              <span className="font-bold text-rose-600 text-lg">{fmtCurrency(liabilities.total)}</span>
            </div>
          </div>
        </div>
      </div>
      <div
        className={cn(
          'rounded-2xl border p-6 text-center',
          netWorth >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200',
        )}
      >
        <p className="text-sm font-bold text-gray-400 uppercase">Net Worth</p>
        <p className={cn('text-3xl font-bold mt-1', netWorth >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
          {fmtCurrency(netWorth)}
        </p>
      </div>
    </div>
  );
}

function CashFlow({ data, ds }: { data: Record<string, unknown>; ds: boolean }) {
  const inflows = data.inflows as { vendorPayments: number; invoicePayments?: number; total: number };
  const outflows = data.outflows as {
    supplierPayments: number;
    staffPayments?: number;
    expenses?: number;
    total: number;
  };
  const net = Number(data.netCashFlow) || 0;
  const monthly = (data.monthly as { month: string; inflow: number; outflow: number; net: number }[]) || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Inflows"
          value={fmtCurrency(inflows.total)}
          color="text-emerald-600"
          sub={ds ? 'Payments received' : 'Received from vendors & invoices'}
        />
        <StatCard
          label="Total Outflows"
          value={fmtCurrency(outflows.total)}
          color="text-rose-600"
          sub="Suppliers, staff & expenses"
        />
        <StatCard
          label="Net Cash Flow"
          value={fmtCurrency(net)}
          color={net >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        />
      </div>
      {(inflows.vendorPayments > 0 || (inflows.invoicePayments || 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-sm text-gray-400 uppercase mb-3">Inflows</h3>
            <div className="space-y-2">
              {inflows.vendorPayments > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{ds ? 'Customer Payments' : 'Vendor Payments'}</span>
                  <span className="font-bold text-emerald-600">{fmtCurrency(inflows.vendorPayments)}</span>
                </div>
              )}
              {(inflows.invoicePayments || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Invoice Payments</span>
                  <span className="font-bold text-emerald-600">{fmtCurrency(inflows.invoicePayments || 0)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-emerald-600">{fmtCurrency(inflows.total)}</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-sm text-gray-400 uppercase mb-3">Outflows</h3>
            <div className="space-y-2">
              {outflows.supplierPayments > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Supplier Payments</span>
                  <span className="font-bold text-rose-600">{fmtCurrency(outflows.supplierPayments)}</span>
                </div>
              )}
              {(outflows.staffPayments || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Staff Payments</span>
                  <span className="font-bold text-rose-600">{fmtCurrency(outflows.staffPayments || 0)}</span>
                </div>
              )}
              {(outflows.expenses || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Expenses</span>
                  <span className="font-bold text-rose-600">{fmtCurrency(outflows.expenses || 0)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-rose-600">{fmtCurrency(outflows.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {monthly.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-sm font-bold text-gray-600">Monthly Breakdown</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-400 uppercase">Month</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-emerald-500 uppercase">Inflow</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-rose-500 uppercase">Outflow</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-gray-400 uppercase">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map((m, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{m.month}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{fmtCurrency(m.inflow)}</td>
                    <td className="px-4 py-2 text-right text-rose-600">{fmtCurrency(m.outflow)}</td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right font-bold',
                        m.net >= 0 ? 'text-emerald-600' : 'text-rose-600',
                      )}
                    >
                      {fmtCurrency(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Ledger({ data }: { data: Record<string, unknown> }) {
  const entries =
    (data.entries as {
      date: string;
      type: string;
      particulars: string;
      refId: string;
      debit: number;
      credit: number;
      balance: number;
    }[]) || [];
  const totals = data.totals as { debit: number; credit: number };
  const typeColors: Record<string, string> = {
    Distribution: 'bg-blue-50 text-blue-600',
    Sale: 'bg-emerald-50 text-emerald-600',
    Invoice: 'bg-violet-50 text-violet-600',
    Purchase: 'bg-amber-50 text-amber-600',
    'Payment Received': 'bg-green-50 text-green-600',
    'Payment Made': 'bg-rose-50 text-rose-600',
    'Staff Salary': 'bg-purple-50 text-purple-600',
    'Staff Advance': 'bg-amber-50 text-amber-600',
    'Advance Repaid': 'bg-blue-50 text-blue-600',
    'Staff Bonus': 'bg-purple-50 text-purple-600',
    'Staff Deduction': 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-600">{entries.length} entries</span>
        <span className="text-xs text-gray-400">
          Debit: {fmtCurrency(totals.debit)} | Credit: {fmtCurrency(totals.credit)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Particulars</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Debit</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Credit</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-bold',
                      typeColors[e.type] || 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {e.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-700">{e.particulars}</td>
                <td className="px-3 py-2 text-right font-medium">{e.debit > 0 ? fmtCurrency(e.debit) : '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{e.credit > 0 ? fmtCurrency(e.credit) : '—'}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-right font-bold',
                    e.balance >= 0 ? 'text-emerald-600' : 'text-rose-600',
                  )}
                >
                  {fmtCurrency(e.balance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
              <td colSpan={3} className="px-3 py-2.5">
                Total
              </td>
              <td className="px-3 py-2.5 text-right">{fmtCurrency(totals.debit)}</td>
              <td className="px-3 py-2.5 text-right">{fmtCurrency(totals.credit)}</td>
              <td className="px-3 py-2.5 text-right">{fmtCurrency(totals.debit - totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DayBook({ data, ds }: { data: Record<string, unknown>; ds: boolean }) {
  const rawEntries =
    (data.entries as {
      id: string;
      type: string;
      party: string;
      product?: string;
      debit: number;
      credit: number;
      method?: string;
    }[]) || [];
  const entries = ds ? rawEntries.map(e => ({ ...e, type: e.type === 'Distribution' ? 'Sale' : e.type })) : rawEntries;
  const totalDebit = Number(data.totalDebit) || 0;
  const totalCredit = Number(data.totalCredit) || 0;
  const typeColors: Record<string, string> = {
    Sale: 'bg-emerald-50 text-emerald-600',
    Distribution: 'bg-blue-50 text-blue-600',
    Purchase: 'bg-amber-50 text-amber-600',
    'Payment Received': 'bg-green-50 text-green-600',
    'Payment Made': 'bg-rose-50 text-rose-600',
    'Staff Salary': 'bg-purple-50 text-purple-600',
    'Staff Advance': 'bg-amber-50 text-amber-600',
    'Advance Repaid': 'bg-blue-50 text-blue-600',
    'Staff Bonus': 'bg-purple-50 text-purple-600',
    'Staff Deduction': 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-600">
          {entries.length} transactions — {data.date as string}
        </span>
        <span className="text-xs text-gray-400">
          In: {fmtCurrency(totalDebit)} | Out: {fmtCurrency(totalCredit)} | Net: {fmtCurrency(totalDebit - totalCredit)}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <p>No transactions on this date</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Party</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Product</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Method</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Debit (In)</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Credit (Out)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e, i) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-bold',
                        typeColors[e.type] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {e.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{e.party}</td>
                  <td className="px-3 py-2 text-gray-600">{e.product || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{e.method || '—'}</td>
                  <td className="px-3 py-2 text-right font-medium text-emerald-600">
                    {e.debit > 0 ? fmtCurrency(e.debit) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-rose-600">
                    {e.credit > 0 ? fmtCurrency(e.credit) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td colSpan={4} className="px-3 py-2.5">
                  Total
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-600">{fmtCurrency(totalDebit)}</td>
                <td className="px-3 py-2.5 text-right text-rose-600">{fmtCurrency(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function NotesView({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const notes = (Array.isArray(data) ? data : []) as {
    id: string;
    noteNumber: string;
    noteType: string;
    vendorName?: string;
    customerName?: string;
    noteDate: string;
    total: number;
    reason?: string;
    status: string;
    referenceInvoice?: string;
    referenceType?: string | null;
    referenceId?: string | null;
  }[];
  const [creating, setCreating] = React.useState(false);
  const emptyNoteForm = {
    noteType: 'credit' as 'credit' | 'debit',
    vendorName: '',
    customerName: '',
    reason: '',
    referenceInvoice: '',
    referenceType: '' as '' | 'invoice' | 'distribution' | 'quotation',
    referenceId: '',
    items: [{ description: '', quantity: 1, price: 0, withGst: true }],
  };
  const [noteForm, setNoteForm] = React.useState(emptyNoteForm);
  const [submitting, setSubmitting] = React.useState(false);

  const handleCreate = async () => {
    if (noteForm.items.filter(i => i.description && i.price > 0).length === 0) return;
    setSubmitting(true);
    try {
      await fetchApi('/accounts/notes', {
        method: 'POST',
        body: JSON.stringify({
          ...noteForm,
          referenceType: noteForm.referenceType || undefined,
          referenceId: noteForm.referenceId || undefined,
          items: noteForm.items.filter(i => i.description && i.price > 0),
        }),
      });
      setCreating(false);
      setNoteForm(emptyNoteForm);
      onRefresh();
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
        >
          + New Note
        </button>
      </div>
      {notes.length === 0 && !creating && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
          No credit/debit notes yet
        </div>
      )}
      {notes.map(n => (
        <div
          key={n.id}
          className={cn(
            'bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between',
            n.noteType === 'credit' ? 'border-emerald-200' : 'border-rose-200',
          )}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{n.noteNumber}</span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                  n.noteType === 'credit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                )}
              >
                {n.noteType === 'credit' ? 'Credit Note' : 'Debit Note'}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {n.vendorName || n.customerName || 'N/A'} — {formatDate(n.noteDate)}
            </p>
            {n.reason && <p className="text-xs text-gray-400">{n.reason}</p>}
            {(n.referenceType || n.referenceInvoice) && (
              <p className="text-xs text-gray-400">
                Ref{n.referenceType ? ` (${n.referenceType})` : ''}: {n.referenceId || n.referenceInvoice}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className={cn('font-bold text-lg', n.noteType === 'credit' ? 'text-emerald-600' : 'text-rose-600')}>
              ₹{n.total.toLocaleString()}
            </p>
          </div>
        </div>
      ))}
      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-lg">New Credit / Debit Note</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNoteForm({ ...noteForm, noteType: 'credit' })}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-bold',
                    noteForm.noteType === 'credit' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  Credit Note
                </button>
                <button
                  type="button"
                  onClick={() => setNoteForm({ ...noteForm, noteType: 'debit' })}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-bold',
                    noteForm.noteType === 'debit' ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  Debit Note
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Party Name</label>
              <input
                value={noteForm.vendorName}
                onChange={e => setNoteForm({ ...noteForm, vendorName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                placeholder="Vendor or customer name"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Reason</label>
              <input
                value={noteForm.reason}
                onChange={e => setNoteForm({ ...noteForm, reason: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                placeholder="Return, refund, price adjustment..."
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Reference label</label>
              <input
                value={noteForm.referenceInvoice}
                onChange={e => setNoteForm({ ...noteForm, referenceInvoice: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                placeholder="Invoice / challan number (display)"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Linked document type</label>
              <select
                value={noteForm.referenceType}
                onChange={e =>
                  setNoteForm({
                    ...noteForm,
                    referenceType: e.target.value as typeof noteForm.referenceType,
                  })
                }
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
              >
                <option value="">None</option>
                <option value="invoice">Standalone invoice</option>
                <option value="distribution">Distribution batch</option>
                <option value="quotation">Quotation</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Linked document id</label>
              <input
                value={noteForm.referenceId}
                onChange={e => setNoteForm({ ...noteForm, referenceId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                placeholder="Internal id (INV-… / batch / QT-…)"
                disabled={!noteForm.referenceType}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Items</label>
            {noteForm.items.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={item.description}
                  onChange={e =>
                    setNoteForm({
                      ...noteForm,
                      items: noteForm.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                    })
                  }
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Description"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={item.quantity || ''}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setNoteForm({
                      ...noteForm,
                      items: noteForm.items.map((x, j) => (j === i ? { ...x, quantity: v ? parseInt(v) : 0 } : x)),
                    });
                  }}
                  className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center"
                  placeholder="Qty"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.price || ''}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '');
                    setNoteForm({
                      ...noteForm,
                      items: noteForm.items.map((x, j) => (j === i ? { ...x, price: v ? parseFloat(v) : 0 } : x)),
                    });
                  }}
                  className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center"
                  placeholder="₹ Price"
                />
                {noteForm.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setNoteForm({ ...noteForm, items: noteForm.items.filter((_, j) => j !== i) })}
                    className="text-rose-400 hover:text-rose-600 px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setNoteForm({
                  ...noteForm,
                  items: [...noteForm.items, { description: '', quantity: 1, price: 0, withGst: true }],
                })
              }
              className="text-sm font-bold text-brand"
            >
              + Add Item
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="flex-1 py-2 border rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className={cn(
                'flex-1 py-2 text-white rounded-xl font-bold disabled:opacity-60',
                noteForm.noteType === 'credit' ? 'bg-emerald-600' : 'bg-rose-600',
              )}
            >
              {submitting ? 'Saving...' : `Create ${noteForm.noteType === 'credit' ? 'Credit' : 'Debit'} Note`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTable({ tab, data, ds }: { tab: string; data: Record<string, unknown>; ds: boolean }) {
  const rows = (data.rows as Record<string, unknown>[]) || [];
  const totals = (data.totals as Record<string, number>) || {};
  const count = (data.count as number) || rows.length;

  if (tab === 'gst') {
    const b2b = (data.b2b as Record<string, unknown>[]) || [];
    const b2c = (data.b2c as Record<string, number>) || {};
    const hsn = (data.hsnSummary as Record<string, unknown>[]) || [];
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold">Taxable</p>
              <p className="text-lg font-bold text-blue-600">{fmtCurrency((data.totalTaxable as number) || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold">Tax</p>
              <p className="text-lg font-bold text-amber-600">{fmtCurrency((data.totalTax as number) || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold">Total</p>
              <p className="text-lg font-bold text-emerald-600">{fmtCurrency((data.totalValue as number) || 0)}</p>
            </div>
          </div>
        </div>
        {b2b.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">B2B (with GSTIN)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left">{ds ? 'Customer' : 'Vendor'}</th>
                    <th className="px-3 py-2 text-left">GSTIN</th>
                    <th className="px-3 py-2 text-right">Taxable</th>
                    <th className="px-3 py-2 text-right">CGST</th>
                    <th className="px-3 py-2 text-right">SGST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {b2b.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2">{r.vendorName as string}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.gstin as string}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.taxable as number)}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.cgst as number)}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.sgst as number)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {b2c.total > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm font-bold text-gray-600 mb-2">B2C (without GSTIN)</p>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-400">Taxable</p>
                <p className="font-bold">{fmtCurrency(b2c.taxable)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">CGST</p>
                <p className="font-bold">{fmtCurrency(b2c.cgst)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">SGST</p>
                <p className="font-bold">{fmtCurrency(b2c.sgst)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total</p>
                <p className="font-bold">{fmtCurrency(b2c.total)}</p>
              </div>
            </div>
          </div>
        )}
        {hsn.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">HSN Summary</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left">HSN</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Taxable</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hsn.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-mono">{r.hsn as string}</td>
                      <td className="px-3 py-2">{r.description as string}</td>
                      <td className="px-3 py-2 text-right">{r.qty as number}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.taxable as number)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const cols =
    tab === 'outstanding'
      ? [
          { k: 'vendorName', l: ds ? 'Customer' : 'Vendor' },
          { k: 'totalBilled', l: 'Billed', r: true },
          { k: 'totalPaid', l: 'Paid', r: true },
          { k: 'balance', l: 'Balance', r: true },
          { k: 'd0_30', l: '0-30d', r: true },
          { k: 'd31_60', l: '31-60d', r: true },
          { k: 'd61_90', l: '61-90d', r: true },
          { k: 'd90plus', l: '90+d', r: true },
        ]
      : tab === 'stock'
        ? [
            { k: 'name', l: 'Product' },
            { k: 'hsnCode', l: 'HSN' },
            { k: 'unitPrice', l: 'Price', r: true },
            { k: 'inStock', l: 'InStock', r: true },
            ...(!ds ? [{ k: 'withVendors', l: 'Vendors', r: true }] : []),
            { k: 'sold', l: 'Sold', r: true },
            { k: 'closingStock', l: 'Closing', r: true },
            { k: 'stockValue', l: 'Value', r: true },
          ]
        : tab === 'payments'
          ? [
              { k: 'date', l: 'Date' },
              { k: 'vendorName', l: ds ? 'Customer' : 'Vendor' },
              { k: 'amount', l: 'Amount', r: true },
              { k: 'method', l: 'Method' },
              { k: 'reference', l: 'Ref' },
            ]
          : tab === 'sales'
            ? [
                { k: 'date', l: 'Date' },
                { k: 'customerName', l: 'Customer' },
                { k: 'productName', l: 'Product' },
                { k: 'hsnCode', l: 'HSN' },
                { k: 'taxableValue', l: 'Taxable', r: true },
                { k: 'cgst', l: 'CGST', r: true },
                { k: 'sgst', l: 'SGST', r: true },
                { k: 'total', l: 'Total', r: true },
              ]
            : [
                { k: 'date', l: 'Date' },
                { k: 'vendorName', l: ds ? 'Customer' : 'Vendor' },
                { k: 'productName', l: 'Product' },
                { k: 'hsnCode', l: 'HSN' },
                { k: 'taxableValue', l: 'Taxable', r: true },
                { k: 'cgst', l: 'CGST', r: true },
                { k: 'sgst', l: 'SGST', r: true },
                { k: 'total', l: 'Total', r: true },
              ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-600">{count} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {cols.map(c => (
                <th
                  key={c.k}
                  className={cn(
                    'px-3 py-2 text-xs font-bold text-gray-400 uppercase whitespace-nowrap',
                    c.r ? 'text-right' : 'text-left',
                  )}
                >
                  {c.l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                {cols.map(c => (
                  <td key={c.k} className={cn('px-3 py-2 whitespace-nowrap', c.r ? 'text-right' : '')}>
                    {c.k === 'date'
                      ? formatDate(r[c.k] as string)
                      : typeof r[c.k] === 'number'
                        ? c.r
                          ? fmtCurrency(r[c.k] as number)
                          : r[c.k]
                        : (r[c.k] as string) || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {Object.keys(totals).length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                {cols.map((c, ci) => (
                  <td key={c.k} className={cn('px-3 py-2', c.r ? 'text-right' : '')}>
                    {ci === 0 ? 'Total' : totals[c.k] !== undefined ? fmtCurrency(totals[c.k]) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// GSTR-2B Reconciliation — upload JSON from GST portal, match against purchases
type ReconRow = {
  status: string;
  supplier: string;
  ctin: string;
  invoiceNumber: string;
  date: string;
  twoBVal: number;
  bookVal: number;
  diff: number;
  itcAvailable: boolean;
};
function Gstr2bReconciliation() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<ReconRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, number>>({});
  const [filter, setFilter] = React.useState('all');
  const [uploading, setUploading] = React.useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetchApi<{ rows: ReconRow[]; stats: Record<string, number> }>('/gstr2b/reconcile', {
        method: 'POST',
        body: JSON.stringify(json),
      });
      setRows(res.rows);
      setStats(res.stats);
      toast(`Reconciled ${res.stats.total} invoices`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter);

  const statusBadge = (s: string) => {
    const m: Record<string, { cls: string; label: string }> = {
      matched: { cls: 'bg-emerald-100 text-emerald-700', label: 'Matched' },
      amount_mismatch: { cls: 'bg-amber-100 text-amber-700', label: 'Mismatch' },
      book_only: { cls: 'bg-rose-100 text-rose-700', label: 'Books Only' },
      twob_only: { cls: 'bg-purple-100 text-purple-700', label: '2B Only' },
    };
    const b = m[s] || { cls: 'bg-gray-100 text-gray-600', label: s };
    return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', b.cls)}>{b.label}</span>;
  };

  const exportCsv = () => {
    exportToCsv(
      filtered.map(r => ({
        Status: r.status,
        Supplier: r.supplier,
        GSTIN: r.ctin,
        Invoice: r.invoiceNumber,
        Date: r.date,
        '2B Value': r.twoBVal,
        'Book Value': r.bookVal,
        Difference: r.diff,
        'ITC Available': r.itcAvailable ? 'Yes' : 'No',
      })),
      'gstr2b-reconciliation',
    );
  };

  const pills = [
    { key: 'all', label: 'All', count: stats.total || 0, cls: 'bg-gray-100 text-gray-700' },
    { key: 'matched', label: 'Matched', count: stats.matched || 0, cls: 'bg-emerald-100 text-emerald-700' },
    {
      key: 'amount_mismatch',
      label: 'Mismatch',
      count: stats.amount_mismatch || 0,
      cls: 'bg-amber-100 text-amber-700',
    },
    { key: 'book_only', label: 'Books Only', count: stats.book_only || 0, cls: 'bg-rose-100 text-rose-700' },
    { key: 'twob_only', label: '2B Only', count: stats.twob_only || 0, cls: 'bg-purple-100 text-purple-700' },
  ];

  return (
    <div className="space-y-4">
      {/* Upload bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold cursor-pointer hover:bg-brand-dark transition-colors">
            <Upload size={16} />
            {uploading ? 'Processing...' : 'Upload 2B JSON'}
            <input type="file" accept=".json" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
          <p className="text-xs text-gray-400">Download GSTR-2B JSON from gst.gov.in → Upload here</p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
            >
              <Download size={16} /> CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setStats({});
                setFilter('all');
              }}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Status pills */}
      {rows.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {pills.map(p => (
            <button
              type="button"
              key={p.key}
              onClick={() => setFilter(p.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold transition-all border',
                filter === p.key
                  ? `${p.cls} border-current`
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
              )}
            >
              {p.label}: {p.count}
            </button>
          ))}
        </div>
      )}

      {/* Results table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-left">Supplier</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Invoice</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">2B Value</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Book Value</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Diff</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-center">ITC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 text-sm">{r.supplier}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{r.ctin}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.date ? formatDate(r.date) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-right">{r.twoBVal ? fmtCurrency(r.twoBVal) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-right">{r.bookVal ? fmtCurrency(r.bookVal) : '—'}</td>
                    <td
                      className={cn(
                        'px-4 py-3 text-sm text-right font-medium',
                        Math.abs(r.diff) > 1 ? 'text-rose-600' : 'text-gray-400',
                      )}
                    >
                      {r.diff ? `₹${r.diff.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.itcAvailable ? (
                        <span className="text-emerald-600 font-bold">✓</span>
                      ) : (
                        <span className="text-gray-300">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      No entries{filter !== 'all' ? ` with status "${filter}"` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <FileCheck size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium text-lg">GSTR-2B Reconciliation</p>
          <p className="text-gray-400 text-sm mt-1">
            Upload your GSTR-2B JSON from the GST portal to reconcile with your purchase records
          </p>
          <p className="text-gray-400 text-xs mt-3">Go to gst.gov.in → Returns → GSTR-2B → Download JSON</p>
        </div>
      )}
    </div>
  );
}

// GSTR-3B computation view — output tax, ITC, net payable
function Gstr3bView({ data }: { data: Record<string, unknown> }) {
  const period = data.period as { month: number; year: number };
  const output = data.output as { taxableValue: number; cgst: number; sgst: number; igst: number; total: number };
  const itc = data.itc as {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    fromPurchases: number;
    fromExpenses: number;
  };
  const net = data.netPayable as { cgst: number; sgst: number; igst: number; total: number };
  const monthName = new Date(period.year, period.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h4 className="font-bold text-sm">{title}</h4>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  const Row = ({
    label,
    cgst,
    sgst,
    igst,
    total,
    bold,
  }: {
    label: string;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    bold?: boolean;
  }) => (
    <tr className={bold ? 'border-t-2 border-gray-300 font-bold bg-gray-50' : 'border-b border-gray-100'}>
      <td className="py-2.5 px-3 text-sm">{label}</td>
      <td className="py-2.5 px-3 text-sm text-right font-mono">{fmtCurrency(cgst)}</td>
      <td className="py-2.5 px-3 text-sm text-right font-mono">{fmtCurrency(sgst)}</td>
      <td className="py-2.5 px-3 text-sm text-right font-mono">{fmtCurrency(igst)}</td>
      <td className="py-2.5 px-3 text-sm text-right font-mono font-semibold">{fmtCurrency(total)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="bg-brand/10 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-brand">GSTR-3B Summary</p>
          <p className="text-xs text-gray-600">{monthName} — Copy these values to GST portal</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const text = `GSTR-3B ${monthName}\n\nOutput Tax: ₹${output.total.toLocaleString()}\n  Taxable Value: ₹${output.taxableValue.toLocaleString()}\n  CGST: ₹${output.cgst.toLocaleString()}\n  SGST: ₹${output.sgst.toLocaleString()}\n\nITC Claimed: ₹${itc.total.toLocaleString()}\n  From Purchases: ₹${itc.fromPurchases.toLocaleString()}\n  From Expenses: ₹${itc.fromExpenses.toLocaleString()}\n\nNet Tax Payable: ₹${net.total.toLocaleString()}\n  CGST: ₹${net.cgst.toLocaleString()}\n  SGST: ₹${net.sgst.toLocaleString()}`;
            navigator.clipboard.writeText(text);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-bold"
        >
          Copy to Clipboard
        </button>
      </div>

      <Section title="3.1 — Outward Supplies (Output Tax)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-200">
                <th className="py-2 px-3 text-left">Description</th>
                <th className="py-2 px-3 text-right">CGST</th>
                <th className="py-2 px-3 text-right">SGST</th>
                <th className="py-2 px-3 text-right">IGST</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label={`Taxable Value: ₹${output.taxableValue.toLocaleString()}`}
                cgst={output.cgst}
                sgst={output.sgst}
                igst={output.igst}
                total={output.total}
              />
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="4 — Input Tax Credit (ITC)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-200">
                <th className="py-2 px-3 text-left">Source</th>
                <th className="py-2 px-3 text-right">CGST</th>
                <th className="py-2 px-3 text-right">SGST</th>
                <th className="py-2 px-3 text-right">IGST</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="From Purchases"
                cgst={Math.round((itc.fromPurchases / 2) * 100) / 100}
                sgst={Math.round((itc.fromPurchases / 2) * 100) / 100}
                igst={0}
                total={itc.fromPurchases}
              />
              <Row
                label="From Expenses (eligible)"
                cgst={Math.round((itc.fromExpenses / 2) * 100) / 100}
                sgst={Math.round((itc.fromExpenses / 2) * 100) / 100}
                igst={0}
                total={itc.fromExpenses}
              />
              <Row label="Total ITC" cgst={itc.cgst} sgst={itc.sgst} igst={itc.igst} total={itc.total} bold />
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="6.1 — Net Tax Payable">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-200">
                <th className="py-2 px-3 text-left">Head</th>
                <th className="py-2 px-3 text-right">CGST</th>
                <th className="py-2 px-3 text-right">SGST</th>
                <th className="py-2 px-3 text-right">IGST</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Output Tax" cgst={output.cgst} sgst={output.sgst} igst={0} total={output.total} />
              <Row label="Less: ITC" cgst={itc.cgst} sgst={itc.sgst} igst={0} total={itc.total} />
              <Row label="Net Payable" cgst={net.cgst} sgst={net.sgst} igst={net.igst} total={net.total} bold />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          * IGST shown as 0 — inter-state transactions need manual adjustment. Verify with CA before filing.
        </p>
      </Section>
    </div>
  );
}
