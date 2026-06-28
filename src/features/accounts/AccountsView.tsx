import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Download, Printer, Search, BookOpen, TrendingUp, Scale, Banknote, ShoppingCart, Truck, Clock, IndianRupee, Package, Receipt } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { useToast, LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';

type AccountTab = 'pnl' | 'balance' | 'cashflow' | 'ledger' | 'sales' | 'distribution' | 'outstanding' | 'payments' | 'stock' | 'gst';

function fetchApi<T>(path: string): Promise<T> {
  const token = session.getToken(); const tenantId = session.getTenantId();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (tenantId) h['X-Tenant-ID'] = tenantId;
  return fetch(`/api${path}`, { headers: h }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error || r.statusText); }); return r.json(); });
}

function fmtCurrency(n: number) { return `₹${Math.abs(n).toLocaleString('en-IN')}${n < 0 ? ' (Cr)' : ''}`; }

export function AccountsView() {
  const { toast } = useToast();
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
    setLoading(true); setData(null);
    try {
      const qs = `from=${from}&to=${to}`;
      if (tab === 'pnl') setData(await fetchApi(`/accounts/profit-loss?${qs}`));
      else if (tab === 'balance') setData(await fetchApi('/accounts/balance-sheet'));
      else if (tab === 'cashflow') setData(await fetchApi(`/accounts/cash-flow?${qs}`));
      else if (tab === 'ledger') setData(await fetchApi(`/accounts/ledger?${qs}&type=${ledgerFilter}`));
      else if (tab === 'sales') setData(await fetchApi(`/reports/sales-register?${qs}`));
      else if (tab === 'distribution') setData(await fetchApi(`/reports/distribution-register?${qs}`));
      else if (tab === 'outstanding') setData(await fetchApi('/reports/outstanding'));
      else if (tab === 'payments') setData(await fetchApi(`/reports/payment-register?${qs}`));
      else if (tab === 'stock') setData(await fetchApi('/reports/stock-summary'));
      else if (tab === 'gst') setData(await fetchApi(`/reports/gst-summary?month=${gstMonth}&year=${gstYear}`));
    } catch { toast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  const handlePrint = () => {
    const el = document.getElementById('accounts-content');
    if (!el) return;
    const titles: Record<string, string> = { pnl: 'Profit & Loss Statement', balance: 'Balance Sheet', cashflow: 'Cash Flow Statement', ledger: 'General Ledger', sales: 'Sales Register', distribution: 'Distribution Register', outstanding: 'Outstanding Report', payments: 'Payment Register', stock: 'Stock Summary', gst: 'GST Summary' };
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<html><head><title>${titles[tab]}</title><style>body{font-family:sans-serif;margin:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}.card{border:1px solid #ddd;padding:16px;margin:8px 0;border-radius:8px}.amount{text-align:right;font-weight:bold}.label{color:#666;font-size:11px;text-transform:uppercase}h2{margin-bottom:4px}p{color:#666;font-size:12px;margin-top:0}@media print{body{margin:0}}</style></head><body><h2>${titles[tab]}</h2><p>Period: ${from} to ${to}</p>${el.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const TABS: { key: AccountTab; label: string; shortLabel: string; icon: React.ElementType; group: 'accounts' | 'reports' }[] = [
    { key: 'pnl', label: 'Profit & Loss', shortLabel: 'P&L', icon: TrendingUp, group: 'accounts' },
    { key: 'balance', label: 'Balance Sheet', shortLabel: 'Balance', icon: Scale, group: 'accounts' },
    { key: 'cashflow', label: 'Cash Flow', shortLabel: 'Cash', icon: Banknote, group: 'accounts' },
    { key: 'ledger', label: 'Ledger', shortLabel: 'Ledger', icon: BookOpen, group: 'accounts' },
    { key: 'sales', label: 'Sales Register', shortLabel: 'Sales', icon: ShoppingCart, group: 'reports' },
    { key: 'distribution', label: 'Distribution Register', shortLabel: 'Dist.', icon: Truck, group: 'reports' },
    { key: 'outstanding', label: 'Outstanding', shortLabel: 'Due', icon: Clock, group: 'reports' },
    { key: 'payments', label: 'Payment Register', shortLabel: 'Payments', icon: IndianRupee, group: 'reports' },
    { key: 'stock', label: 'Stock Summary', shortLabel: 'Stock', icon: Package, group: 'reports' },
    { key: 'gst', label: 'GST Summary', shortLabel: 'GST', icon: Receipt, group: 'reports' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3 size={22} /> Accounts & Reports</h2>
          <p className="text-sm text-gray-500">Financial statements, GST reports, registers — all in one place</p>
        </div>
        {data && (
          <div className="flex gap-2">
            {data && ((data as Record<string, unknown>).entries || (data as Record<string, unknown>).rows) && <button type="button" onClick={() => { const rows = (data as Record<string, unknown>).entries || (data as Record<string, unknown>).rows; if (Array.isArray(rows)) exportToCsv(rows as Record<string, unknown>[], tab); }} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"><Download size={16} /> CSV</button>}
            <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200"><Printer size={16} /> Print</button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Accounts</p>
          <div className="flex gap-1.5 flex-wrap">
            {TABS.filter(t => t.group === 'accounts').map(t => (
              <button key={t.key} type="button" onClick={() => { setTab(t.key); setData(null); }}
                className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", tab === t.key ? "bg-[#F27D26] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                <t.icon size={14} /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Reports</p>
          <div className="flex gap-1.5 flex-wrap">
            {TABS.filter(t => t.group === 'reports').map(t => (
              <button key={t.key} type="button" onClick={() => { setTab(t.key); setData(null); }}
                className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all", tab === t.key ? "bg-[#F27D26] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                <t.icon size={14} /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-end gap-3 flex-wrap">
          {tab !== 'balance' && tab !== 'outstanding' && tab !== 'stock' && tab !== 'gst' && (
            <>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </>
          )}
          {tab === 'ledger' && (
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Type</label><select value={ledgerFilter} onChange={e => setLedgerFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="all">All</option><option value="sales">Sales/Distribution</option><option value="purchases">Purchases</option><option value="payments">Payments</option></select></div>
          )}
          {tab === 'gst' && (
            <>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Month</label><select value={gstMonth} onChange={e => setGstMonth(parseInt(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(2000, m-1).toLocaleString('en', { month: 'long' })}</option>)}</select></div>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Year</label><input type="number" value={gstYear} onChange={e => setGstYear(parseInt(e.target.value))} className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </>
          )}
          <button type="button" onClick={loadData} disabled={loading} className="flex items-center gap-1.5 px-5 py-2 bg-[#F27D26] text-white rounded-lg text-sm font-bold disabled:opacity-60"><Search size={16} /> {loading ? 'Loading...' : 'Generate'}</button>
        </div>
      </div>

      {loading && <div className="py-20 text-center"><LoadingSpinner /></div>}

      {!loading && data && (
        <div id="accounts-content">
          {tab === 'pnl' && <ProfitLoss data={data} />}
          {tab === 'balance' && <BalanceSheet data={data} />}
          {tab === 'cashflow' && <CashFlow data={data} />}
          {tab === 'ledger' && <Ledger data={data} />}
          {['sales', 'distribution', 'outstanding', 'payments', 'stock', 'gst'].includes(tab) && <ReportTable tab={tab} data={data} />}
        </div>
      )}

      {!loading && !data && (
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
      <p className={cn("text-xl font-bold mt-1", color)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProfitLoss({ data }: { data: Record<string, unknown> }) {
  const rev = data.revenue as { distributionRevenue: number; salesRevenue: number; total: number };
  const exp = data.expenses as { purchaseCost: number; total: number };
  const profit = Number(data.grossProfit) || 0;
  const margin = Number(data.profitMargin) || 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={fmtCurrency(rev.total)} color="text-blue-600" />
        <StatCard label="Total Expenses" value={fmtCurrency(exp.total)} color="text-rose-600" />
        <StatCard label="Gross Profit" value={fmtCurrency(profit)} color={profit >= 0 ? "text-emerald-600" : "text-rose-600"} />
        <StatCard label="Profit Margin" value={`${margin}%`} color={margin >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-gray-400 uppercase mb-4">Revenue</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">Distribution Revenue</span><span className="font-bold text-blue-600">{fmtCurrency(rev.distributionRevenue)}</span></div>
            <div className="flex justify-between"><span className="text-sm">Sales Revenue</span><span className="font-bold text-blue-600">{fmtCurrency(rev.salesRevenue)}</span></div>
            <div className="border-t pt-2 flex justify-between"><span className="font-bold">Total Revenue</span><span className="font-bold text-blue-600 text-lg">{fmtCurrency(rev.total)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-gray-400 uppercase mb-4">Expenses</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">Purchase Cost</span><span className="font-bold text-rose-600">{fmtCurrency(exp.purchaseCost)}</span></div>
            <div className="border-t pt-2 flex justify-between"><span className="font-bold">Total Expenses</span><span className="font-bold text-rose-600 text-lg">{fmtCurrency(exp.total)}</span></div>
          </div>
        </div>
      </div>
      <div className={cn("rounded-2xl border p-6 text-center", profit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
        <p className="text-sm font-bold text-gray-400 uppercase">Gross Profit</p>
        <p className={cn("text-3xl font-bold mt-1", profit >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtCurrency(profit)}</p>
        <p className="text-sm text-gray-500 mt-1">{margin}% margin</p>
      </div>
    </div>
  );
}

function BalanceSheet({ data }: { data: Record<string, unknown> }) {
  const assets = data.assets as { inventory: number; receivables: number; cashBank: number; total: number };
  const liabilities = data.liabilities as { payables: number; total: number };
  const netWorth = Number(data.netWorth) || 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Assets" value={fmtCurrency(assets.total)} color="text-blue-600" />
        <StatCard label="Total Liabilities" value={fmtCurrency(liabilities.total)} color="text-rose-600" />
        <StatCard label="Net Worth" value={fmtCurrency(netWorth)} color={netWorth >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-blue-600 uppercase mb-4">Assets</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">Inventory (at cost)</span><span className="font-bold">{fmtCurrency(assets.inventory)}</span></div>
            <div className="flex justify-between"><span className="text-sm">Receivables (vendors owe you)</span><span className="font-bold">{fmtCurrency(assets.receivables)}</span></div>
            <div className="flex justify-between"><span className="text-sm">Cash / Bank</span><span className="font-bold">{fmtCurrency(assets.cashBank)}</span></div>
            <div className="border-t pt-2 flex justify-between"><span className="font-bold">Total Assets</span><span className="font-bold text-blue-600 text-lg">{fmtCurrency(assets.total)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-6">
          <h3 className="font-bold text-sm text-rose-600 uppercase mb-4">Liabilities</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">Payables (you owe suppliers)</span><span className="font-bold">{fmtCurrency(liabilities.payables)}</span></div>
            <div className="border-t pt-2 flex justify-between"><span className="font-bold">Total Liabilities</span><span className="font-bold text-rose-600 text-lg">{fmtCurrency(liabilities.total)}</span></div>
          </div>
        </div>
      </div>
      <div className={cn("rounded-2xl border p-6 text-center", netWorth >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
        <p className="text-sm font-bold text-gray-400 uppercase">Net Worth</p>
        <p className={cn("text-3xl font-bold mt-1", netWorth >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtCurrency(netWorth)}</p>
      </div>
    </div>
  );
}

function CashFlow({ data }: { data: Record<string, unknown> }) {
  const inflows = data.inflows as { vendorPayments: number; total: number };
  const outflows = data.outflows as { supplierPayments: number; total: number };
  const net = Number(data.netCashFlow) || 0;
  const monthly = (data.monthly as { month: string; inflow: number; outflow: number; net: number }[]) || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Inflows" value={fmtCurrency(inflows.total)} color="text-emerald-600" sub="Received from vendors" />
        <StatCard label="Total Outflows" value={fmtCurrency(outflows.total)} color="text-rose-600" sub="Paid to suppliers" />
        <StatCard label="Net Cash Flow" value={fmtCurrency(net)} color={net >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>
      {monthly.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><span className="text-sm font-bold text-gray-600">Monthly Breakdown</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50"><th className="px-4 py-2 text-left text-xs font-bold text-gray-400 uppercase">Month</th><th className="px-4 py-2 text-right text-xs font-bold text-emerald-500 uppercase">Inflow</th><th className="px-4 py-2 text-right text-xs font-bold text-rose-500 uppercase">Outflow</th><th className="px-4 py-2 text-right text-xs font-bold text-gray-400 uppercase">Net</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {monthly.map((m, i) => (
                  <tr key={i}><td className="px-4 py-2 font-medium">{m.month}</td><td className="px-4 py-2 text-right text-emerald-600">{fmtCurrency(m.inflow)}</td><td className="px-4 py-2 text-right text-rose-600">{fmtCurrency(m.outflow)}</td><td className={cn("px-4 py-2 text-right font-bold", m.net >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtCurrency(m.net)}</td></tr>
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
  const entries = (data.entries as { date: string; type: string; particulars: string; refId: string; debit: number; credit: number; balance: number }[]) || [];
  const totals = data.totals as { debit: number; credit: number };
  const typeColors: Record<string, string> = { Distribution: 'bg-blue-50 text-blue-600', Sale: 'bg-emerald-50 text-emerald-600', Purchase: 'bg-amber-50 text-amber-600', 'Payment Received': 'bg-green-50 text-green-600', 'Payment Made': 'bg-rose-50 text-rose-600' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-600">{entries.length} entries</span>
        <span className="text-xs text-gray-400">Debit: {fmtCurrency(totals.debit)} | Credit: {fmtCurrency(totals.credit)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
            <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Type</th>
            <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 uppercase">Particulars</th>
            <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Debit</th>
            <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Credit</th>
            <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-400 uppercase">Balance</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
                <td className="px-3 py-2"><span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", typeColors[e.type] || 'bg-gray-100 text-gray-600')}>{e.type}</span></td>
                <td className="px-3 py-2 text-gray-700">{e.particulars}</td>
                <td className="px-3 py-2 text-right font-medium">{e.debit > 0 ? fmtCurrency(e.debit) : '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{e.credit > 0 ? fmtCurrency(e.credit) : '—'}</td>
                <td className={cn("px-3 py-2 text-right font-bold", e.balance >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtCurrency(e.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
            <td colSpan={3} className="px-3 py-2.5">Total</td>
            <td className="px-3 py-2.5 text-right">{fmtCurrency(totals.debit)}</td>
            <td className="px-3 py-2.5 text-right">{fmtCurrency(totals.credit)}</td>
            <td className="px-3 py-2.5 text-right">{fmtCurrency(totals.debit - totals.credit)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

function ReportTable({ tab, data }: { tab: string; data: Record<string, unknown> }) {
  const rows = (data.rows as Record<string, unknown>[]) || [];
  const totals = (data.totals as Record<string, number>) || {};
  const count = data.count as number || rows.length;

  if (tab === 'gst') {
    const b2b = (data.b2b as Record<string, unknown>[]) || [];
    const b2c = data.b2c as Record<string, number> || {};
    const hsn = (data.hsnSummary as Record<string, unknown>[]) || [];
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-xs text-gray-400 uppercase font-bold">Taxable</p><p className="text-lg font-bold text-blue-600">{fmtCurrency(data.totalTaxable as number || 0)}</p></div>
            <div><p className="text-xs text-gray-400 uppercase font-bold">Tax</p><p className="text-lg font-bold text-amber-600">{fmtCurrency(data.totalTax as number || 0)}</p></div>
            <div><p className="text-xs text-gray-400 uppercase font-bold">Total</p><p className="text-lg font-bold text-emerald-600">{fmtCurrency(data.totalValue as number || 0)}</p></div>
          </div>
        </div>
        {b2b.length > 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"><div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">B2B (with GSTIN)</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase"><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-left">GSTIN</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{b2b.map((r, i) => <tr key={i} className="border-t border-gray-50"><td className="px-3 py-2">{r.vendorName as string}</td><td className="px-3 py-2 font-mono text-xs">{r.gstin as string}</td><td className="px-3 py-2 text-right">{fmtCurrency(r.taxable as number)}</td><td className="px-3 py-2 text-right">{fmtCurrency(r.cgst as number)}</td><td className="px-3 py-2 text-right">{fmtCurrency(r.sgst as number)}</td><td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total as number)}</td></tr>)}</tbody></table></div></div>}
        {b2c.total > 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-sm font-bold text-gray-600 mb-2">B2C (without GSTIN)</p><div className="grid grid-cols-4 gap-4 text-center"><div><p className="text-xs text-gray-400">Taxable</p><p className="font-bold">{fmtCurrency(b2c.taxable)}</p></div><div><p className="text-xs text-gray-400">CGST</p><p className="font-bold">{fmtCurrency(b2c.cgst)}</p></div><div><p className="text-xs text-gray-400">SGST</p><p className="font-bold">{fmtCurrency(b2c.sgst)}</p></div><div><p className="text-xs text-gray-400">Total</p><p className="font-bold">{fmtCurrency(b2c.total)}</p></div></div></div>}
        {hsn.length > 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"><div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">HSN Summary</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase"><th className="px-3 py-2 text-left">HSN</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{hsn.map((r, i) => <tr key={i} className="border-t border-gray-50"><td className="px-3 py-2 font-mono">{r.hsn as string}</td><td className="px-3 py-2">{r.description as string}</td><td className="px-3 py-2 text-right">{r.qty as number}</td><td className="px-3 py-2 text-right">{fmtCurrency(r.taxable as number)}</td><td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total as number)}</td></tr>)}</tbody></table></div></div>}
      </div>
    );
  }

  const cols = tab === 'outstanding'
    ? [{ k: 'vendorName', l: 'Vendor' }, { k: 'totalBilled', l: 'Billed', r: true }, { k: 'totalPaid', l: 'Paid', r: true }, { k: 'balance', l: 'Balance', r: true }, { k: 'd0_30', l: '0-30d', r: true }, { k: 'd31_60', l: '31-60d', r: true }, { k: 'd61_90', l: '61-90d', r: true }, { k: 'd90plus', l: '90+d', r: true }]
    : tab === 'stock'
    ? [{ k: 'name', l: 'Product' }, { k: 'hsnCode', l: 'HSN' }, { k: 'unitPrice', l: 'Price', r: true }, { k: 'inStock', l: 'InStock', r: true }, { k: 'withVendors', l: 'Vendors', r: true }, { k: 'sold', l: 'Sold', r: true }, { k: 'closingStock', l: 'Closing', r: true }, { k: 'stockValue', l: 'Value', r: true }]
    : tab === 'payments'
    ? [{ k: 'date', l: 'Date' }, { k: 'vendorName', l: 'Vendor' }, { k: 'amount', l: 'Amount', r: true }, { k: 'method', l: 'Method' }, { k: 'reference', l: 'Ref' }]
    : tab === 'sales'
    ? [{ k: 'date', l: 'Date' }, { k: 'customerName', l: 'Customer' }, { k: 'productName', l: 'Product' }, { k: 'hsnCode', l: 'HSN' }, { k: 'taxableValue', l: 'Taxable', r: true }, { k: 'cgst', l: 'CGST', r: true }, { k: 'sgst', l: 'SGST', r: true }, { k: 'total', l: 'Total', r: true }]
    : [{ k: 'date', l: 'Date' }, { k: 'vendorName', l: 'Vendor' }, { k: 'productName', l: 'Product' }, { k: 'hsnCode', l: 'HSN' }, { k: 'taxableValue', l: 'Taxable', r: true }, { k: 'cgst', l: 'CGST', r: true }, { k: 'sgst', l: 'SGST', r: true }, { k: 'total', l: 'Total', r: true }];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100"><span className="text-sm font-bold text-gray-600">{count} records</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">{cols.map(c => <th key={c.k} className={cn("px-3 py-2 text-xs font-bold text-gray-400 uppercase whitespace-nowrap", c.r ? "text-right" : "text-left")}>{c.l}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => <tr key={i} className="hover:bg-gray-50/50">{cols.map(c => <td key={c.k} className={cn("px-3 py-2 whitespace-nowrap", c.r ? "text-right" : "")}>{c.k === 'date' ? formatDate(r[c.k] as string) : typeof r[c.k] === 'number' ? (c.r ? fmtCurrency(r[c.k] as number) : r[c.k]) : (r[c.k] as string || '—')}</td>)}</tr>)}
          </tbody>
          {Object.keys(totals).length > 0 && <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">{cols.map((c, ci) => <td key={c.k} className={cn("px-3 py-2", c.r ? "text-right" : "")}>{ci === 0 ? 'Total' : totals[c.k] !== undefined ? fmtCurrency(totals[c.k]) : ''}</td>)}</tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
