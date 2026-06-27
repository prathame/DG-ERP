import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Download, Printer, Search, BookOpen, TrendingUp, Scale, Banknote } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { useToast, LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';

type AccountTab = 'ledger' | 'pnl' | 'balance' | 'cashflow';

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

  const loadData = async () => {
    setLoading(true); setData(null);
    try {
      if (tab === 'ledger') setData(await fetchApi(`/accounts/ledger?from=${from}&to=${to}&type=${ledgerFilter}`));
      else if (tab === 'pnl') setData(await fetchApi(`/accounts/profit-loss?from=${from}&to=${to}`));
      else if (tab === 'balance') setData(await fetchApi('/accounts/balance-sheet'));
      else if (tab === 'cashflow') setData(await fetchApi(`/accounts/cash-flow?from=${from}&to=${to}`));
    } catch { toast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  const handlePrint = () => {
    const el = document.getElementById('accounts-content');
    if (!el) return;
    const titles: Record<string, string> = { ledger: 'General Ledger', pnl: 'Profit & Loss Statement', balance: 'Balance Sheet', cashflow: 'Cash Flow Statement' };
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<html><head><title>${titles[tab]}</title><style>body{font-family:sans-serif;margin:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}.card{border:1px solid #ddd;padding:16px;margin:8px 0;border-radius:8px}.amount{text-align:right;font-weight:bold}.label{color:#666;font-size:11px;text-transform:uppercase}h2{margin-bottom:4px}p{color:#666;font-size:12px;margin-top:0}@media print{body{margin:0}}</style></head><body><h2>${titles[tab]}</h2><p>Period: ${from} to ${to}</p>${el.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const TABS: { key: AccountTab; label: string; icon: React.ElementType }[] = [
    { key: 'pnl', label: 'Profit & Loss', icon: TrendingUp },
    { key: 'balance', label: 'Balance Sheet', icon: Scale },
    { key: 'cashflow', label: 'Cash Flow', icon: Banknote },
    { key: 'ledger', label: 'Ledger', icon: BookOpen },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3 size={22} /> Accounts</h2>
          <p className="text-sm text-gray-500">Ledger, Profit & Loss, Balance Sheet — auto-generated</p>
        </div>
        {data && (
          <div className="flex gap-2">
            {tab === 'ledger' && data && (data as { entries?: unknown[] }).entries && <button type="button" onClick={() => exportToCsv((data as { entries: Record<string, unknown>[] }).entries, 'ledger')} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"><Download size={16} /> CSV</button>}
            <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200"><Printer size={16} /> Print</button>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setData(null); }}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all", tab === t.key ? "bg-[#F27D26] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
            <t.icon size={16} /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-end gap-3 flex-wrap">
          {tab !== 'balance' && (
            <>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </>
          )}
          {tab === 'ledger' && (
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Type</label><select value={ledgerFilter} onChange={e => setLedgerFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="all">All</option><option value="sales">Sales/Distribution</option><option value="purchases">Purchases</option><option value="payments">Payments</option></select></div>
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
