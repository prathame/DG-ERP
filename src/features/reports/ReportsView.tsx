import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, Download, Printer, Search, ShoppingCart, Truck, Clock, IndianRupee, Package, Receipt } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';

type ReportTab = 'sales' | 'distribution' | 'outstanding' | 'payments' | 'stock' | 'gst';

const TABS: { key: ReportTab; label: string; icon: React.ElementType }[] = [
  { key: 'sales', label: 'Sales Register', icon: ShoppingCart },
  { key: 'distribution', label: 'Distribution Register', icon: Truck },
  { key: 'outstanding', label: 'Outstanding', icon: Clock },
  { key: 'payments', label: 'Payment Register', icon: IndianRupee },
  { key: 'stock', label: 'Stock Summary', icon: Package },
  { key: 'gst', label: 'GST Summary', icon: Receipt },
];

interface ReportFilters { from: string; to: string; vendorId: string; productId: string; month: number; year: number }

async function fetchReport(path: string, headers: Record<string, string>) {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json', ...headers } });
  if (!res.ok) throw new Error('Failed to load report');
  return res.json();
}

function getAuthHeaders() {
  const token = session.getToken();
  const tenantId = session.getTenantId();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (tenantId) h['X-Tenant-ID'] = tenantId;
  return h;
}

function fmtCurrency(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

export function ReportsView() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const now = new Date();
  const [filters, setFilters] = useState<ReportFilters>({
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    vendorId: '', productId: '',
    month: now.getMonth() + 1, year: now.getFullYear(),
  });
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; totals: Record<string, number>; count: number } | null>(null);
  const [gstData, setGstData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = getAuthHeaders();

  const loadReport = async () => {
    setLoading(true); setData(null); setGstData(null);
    try {
      const qs = `from=${filters.from}&to=${filters.to}` + (filters.vendorId ? `&vendorId=${filters.vendorId}` : '') + (filters.productId ? `&productId=${filters.productId}` : '');
      if (activeTab === 'sales') setData(await fetchReport(`/reports/sales-register?${qs}`, headers));
      else if (activeTab === 'distribution') setData(await fetchReport(`/reports/distribution-register?${qs}`, headers));
      else if (activeTab === 'outstanding') setData(await fetchReport('/reports/outstanding', headers));
      else if (activeTab === 'payments') setData(await fetchReport(`/reports/payment-register?${qs}`, headers));
      else if (activeTab === 'stock') setData(await fetchReport('/reports/stock-summary', headers));
      else if (activeTab === 'gst') setGstData(await fetchReport(`/reports/gst-summary?month=${filters.month}&year=${filters.year}`, headers));
    } catch { toast('Failed to load report', 'error'); }
    finally { setLoading(false); }
  };

  const handleExport = () => {
    if (activeTab === 'gst' && gstData) {
      const b2b = (gstData.b2b as Record<string, unknown>[]) || [];
      const hsn = (gstData.hsnSummary as Record<string, unknown>[]) || [];
      if (b2b.length) exportToCsv(b2b, `gst-b2b-${filters.month}-${filters.year}`);
      if (hsn.length) exportToCsv(hsn, `gst-hsn-${filters.month}-${filters.year}`);
      toast('GST reports exported', 'success');
      return;
    }
    if (!data?.rows.length) return;
    exportToCsv(data.rows, `${activeTab}-register`);
    toast('Exported to CSV', 'success');
  };

  const handlePrint = () => {
    const el = document.getElementById('report-table');
    if (!el) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const title = TABS.find(t => t.key === activeTab)?.label || 'Report';
    win.document.write(`<html><head><title>${title}</title><style>body{font-family:sans-serif;margin:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:bold}tr:nth-child(even){background:#fafafa}.totals{font-weight:bold;background:#f0f0f0}@media print{body{margin:0}}</style></head><body><h2>${title}</h2><p style="color:#666;font-size:12px">Period: ${filters.from} to ${filters.to}</p>${el.outerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const needsDateFilter = ['sales', 'distribution', 'payments'].includes(activeTab);
  const needsMonthFilter = activeTab === 'gst';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><FileText size={22} /> Reports</h2>
          <p className="text-sm text-gray-500">CA-ready reports for ITR filing and GST compliance</p>
        </div>
        {(data?.rows.length || gstData) ? (
          <div className="flex gap-2">
            <button type="button" onClick={handleExport} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"><Download size={16} /> Export CSV</button>
            <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200"><Printer size={16} /> Print</button>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => { setActiveTab(t.key); setData(null); setGstData(null); }}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all", activeTab === t.key ? "bg-[#F27D26] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-end gap-3 flex-wrap">
          {needsDateFilter && (
            <>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">From</label><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">To</label><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </>
          )}
          {needsMonthFilter && (
            <>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Month</label><select value={filters.month} onChange={(e) => setFilters({ ...filters, month: parseInt(e.target.value) })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(2000, m-1).toLocaleString('en', { month: 'long' })}</option>)}</select></div>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Year</label><input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })} className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </>
          )}
          <button type="button" onClick={loadReport} disabled={loading} className="flex items-center gap-1.5 px-5 py-2 bg-[#F27D26] text-white rounded-lg text-sm font-bold disabled:opacity-60">
            <Search size={16} /> {loading ? 'Loading...' : 'Generate'}
          </button>
        </div>
      </div>

      {loading && <div className="py-20 text-center"><LoadingSpinner /></div>}

      {!loading && data && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-600">{data.count} records</span>
          </div>
          <div className="overflow-x-auto" id="report-table">
            {activeTab === 'sales' && <SalesTable rows={data.rows} totals={data.totals} />}
            {activeTab === 'distribution' && <DistributionTable rows={data.rows} totals={data.totals} />}
            {activeTab === 'outstanding' && <OutstandingTable rows={data.rows} totals={data.totals} />}
            {activeTab === 'payments' && <PaymentTable rows={data.rows} totals={data.totals} />}
            {activeTab === 'stock' && <StockTable rows={data.rows} totals={data.totals} />}
          </div>
        </div>
      )}

      {!loading && gstData && activeTab === 'gst' && (
        <div className="space-y-6" id="report-table">
          <GstSummary data={gstData} />
        </div>
      )}

      {!loading && !data && !gstData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select a report and click Generate</p>
        </div>
      )}
    </motion.div>
  );
}

function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap", className)}>{children}</th>;
}
function TD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 text-sm whitespace-nowrap", className)}>{children}</td>;
}

function SalesTable({ rows, totals }: { rows: Record<string, unknown>[]; totals: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-200 bg-gray-50">
        <TH>Date</TH><TH>Invoice</TH><TH>Customer</TH><TH>Vendor</TH><TH>Product</TH><TH>HSN</TH><TH className="text-right">Rate</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">Total</TH>
      </tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <TD>{formatDate(r.date as string)}</TD><TD className="font-mono text-xs">{(r.id as string).slice(-8)}</TD><TD>{r.customerName as string}</TD><TD>{r.vendorName as string || '—'}</TD><TD>{r.productName as string}</TD><TD>{r.hsnCode as string || '—'}</TD>
            <TD className="text-right">{fmtCurrency(r.rate as number)}</TD><TD className="text-right">{fmtCurrency(r.taxableValue as number)}</TD><TD className="text-right">{fmtCurrency(r.cgst as number)}</TD><TD className="text-right">{fmtCurrency(r.sgst as number)}</TD><TD className="text-right font-bold">{fmtCurrency(r.total as number)}</TD>
          </tr>
        ))}
      </tbody>
      <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-sm">
        <td colSpan={7} className="px-3 py-2.5">Total</td>
        <TD className="text-right">{fmtCurrency(totals.taxableValue)}</TD><TD className="text-right">{fmtCurrency(totals.cgst)}</TD><TD className="text-right">{fmtCurrency(totals.sgst)}</TD><TD className="text-right">{fmtCurrency(totals.total)}</TD>
      </tr></tfoot>
    </table>
  );
}

function DistributionTable({ rows, totals }: { rows: Record<string, unknown>[]; totals: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-200 bg-gray-50">
        <TH>Date</TH><TH>Challan</TH><TH>Vendor</TH><TH>GSTIN</TH><TH>Product</TH><TH>HSN</TH><TH>Status</TH><TH className="text-right">Rate</TH><TH className="text-right">Disc%</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">Total</TH>
      </tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <TD>{formatDate(r.date as string)}</TD><TD className="font-mono text-xs">{((r.batchId as string) || '').slice(-8)}</TD><TD>{r.vendorName as string}</TD><TD className="font-mono text-xs">{r.vendorGstin as string || '—'}</TD><TD>{r.productName as string}</TD><TD>{r.hsnCode as string || '—'}</TD>
            <TD><span className={cn("px-1.5 py-0.5 rounded text-xs font-bold", (r.status as string) === 'Sold' ? 'bg-emerald-50 text-emerald-600' : (r.status as string) === 'Distributed' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600')}>{r.status as string}</span></TD>
            <TD className="text-right">{fmtCurrency(r.rate as number)}</TD><TD className="text-right">{r.discountPercent as number}%</TD><TD className="text-right">{fmtCurrency(r.taxableValue as number)}</TD><TD className="text-right">{fmtCurrency(r.cgst as number)}</TD><TD className="text-right">{fmtCurrency(r.sgst as number)}</TD><TD className="text-right font-bold">{fmtCurrency(r.total as number)}</TD>
          </tr>
        ))}
      </tbody>
      <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-sm">
        <td colSpan={9} className="px-3 py-2.5">Total</td>
        <TD className="text-right">{fmtCurrency(totals.taxableValue)}</TD><TD className="text-right">{fmtCurrency(totals.cgst)}</TD><TD className="text-right">{fmtCurrency(totals.sgst)}</TD><TD className="text-right">{fmtCurrency(totals.total)}</TD>
      </tr></tfoot>
    </table>
  );
}

function OutstandingTable({ rows, totals }: { rows: Record<string, unknown>[]; totals: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-200 bg-gray-50">
        <TH>Vendor</TH><TH className="text-right">Total Billed</TH><TH className="text-right">Paid</TH><TH className="text-right">Balance</TH><TH className="text-right text-blue-600">0-30 days</TH><TH className="text-right text-amber-600">31-60 days</TH><TH className="text-right text-orange-600">61-90 days</TH><TH className="text-right text-rose-600">90+ days</TH>
      </tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <TD className="font-medium">{r.vendorName as string}</TD>
            <TD className="text-right">{fmtCurrency(r.totalBilled as number)}</TD><TD className="text-right text-emerald-600">{fmtCurrency(r.totalPaid as number)}</TD><TD className="text-right font-bold text-rose-600">{fmtCurrency(r.balance as number)}</TD>
            <TD className="text-right text-blue-600">{(r.d0_30 as number) > 0 ? fmtCurrency(r.d0_30 as number) : '—'}</TD><TD className="text-right text-amber-600">{(r.d31_60 as number) > 0 ? fmtCurrency(r.d31_60 as number) : '—'}</TD><TD className="text-right text-orange-600">{(r.d61_90 as number) > 0 ? fmtCurrency(r.d61_90 as number) : '—'}</TD><TD className="text-right text-rose-600">{(r.d90plus as number) > 0 ? fmtCurrency(r.d90plus as number) : '—'}</TD>
          </tr>
        ))}
      </tbody>
      <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-sm">
        <td className="px-3 py-2.5">Total</td>
        <TD className="text-right">{fmtCurrency(totals.totalBilled)}</TD><TD className="text-right text-emerald-600">{fmtCurrency(totals.totalPaid)}</TD><TD className="text-right text-rose-600">{fmtCurrency(totals.balance)}</TD>
        <TD className="text-right text-blue-600">{fmtCurrency(totals.d0_30)}</TD><TD className="text-right text-amber-600">{fmtCurrency(totals.d31_60)}</TD><TD className="text-right text-orange-600">{fmtCurrency(totals.d61_90)}</TD><TD className="text-right text-rose-600">{fmtCurrency(totals.d90plus)}</TD>
      </tr></tfoot>
    </table>
  );
}

function PaymentTable({ rows, totals }: { rows: Record<string, unknown>[]; totals: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-200 bg-gray-50">
        <TH>Date</TH><TH>Vendor</TH><TH className="text-right">Amount</TH><TH>Method</TH><TH>Reference</TH><TH>Batch</TH><TH>Notes</TH>
      </tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <TD>{formatDate(r.date as string)}</TD><TD>{r.vendorName as string}</TD><TD className="text-right font-bold text-emerald-600">{fmtCurrency(r.amount as number)}</TD><TD>{r.method as string}</TD><TD className="font-mono text-xs">{(r.reference as string) || '—'}</TD><TD className="font-mono text-xs">{(r.batchId as string) ? (r.batchId as string).slice(-8) : '—'}</TD><TD className="text-gray-500">{(r.notes as string) || '—'}</TD>
          </tr>
        ))}
      </tbody>
      <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-sm">
        <td colSpan={2} className="px-3 py-2.5">Total</td>
        <TD className="text-right text-emerald-600">{fmtCurrency(totals.amount)}</TD><td colSpan={4}></td>
      </tr></tfoot>
    </table>
  );
}

function StockTable({ rows, totals }: { rows: Record<string, unknown>[]; totals: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-200 bg-gray-50">
        <TH>Product</TH><TH>HSN</TH><TH className="text-right">Unit Price</TH><TH className="text-right">Total Inv.</TH><TH className="text-right">In Stock</TH><TH className="text-right">With Vendors</TH><TH className="text-right">Sold</TH><TH className="text-right">Closing Stock</TH><TH className="text-right">Stock Value</TH>
      </tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <TD className="font-medium">{r.name as string}</TD><TD>{r.hsnCode as string || '—'}</TD><TD className="text-right">{fmtCurrency(r.unitPrice as number)}</TD>
            <TD className="text-right">{r.totalInventory as number}</TD><TD className="text-right text-blue-600">{r.inStock as number}</TD><TD className="text-right text-amber-600">{r.withVendors as number}</TD><TD className="text-right text-emerald-600">{r.sold as number}</TD>
            <TD className="text-right font-bold">{r.closingStock as number}</TD><TD className="text-right font-bold">{fmtCurrency(r.stockValue as number)}</TD>
          </tr>
        ))}
      </tbody>
      <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-sm">
        <td colSpan={3} className="px-3 py-2.5">Total</td>
        <TD className="text-right">{totals.totalInventory}</TD><TD className="text-right text-blue-600">{totals.inStock}</TD><TD className="text-right text-amber-600">{totals.withVendors}</TD><TD className="text-right text-emerald-600">{totals.sold}</TD>
        <TD className="text-right">{totals.closingStock}</TD><TD className="text-right">{fmtCurrency(totals.stockValue)}</TD>
      </tr></tfoot>
    </table>
  );
}

function GstSummary({ data }: { data: Record<string, unknown> }) {
  const b2b = (data.b2b as Record<string, unknown>[]) || [];
  const b2c = data.b2c as Record<string, number>;
  const hsn = (data.hsnSummary as Record<string, unknown>[]) || [];
  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-600">GST Summary — {data.period as string}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 p-4">
          <div className="text-center"><p className="text-xs text-gray-400 uppercase font-bold">Total Taxable</p><p className="text-lg font-bold text-blue-600">{fmtCurrency(data.totalTaxable as number)}</p></div>
          <div className="text-center"><p className="text-xs text-gray-400 uppercase font-bold">Total Tax</p><p className="text-lg font-bold text-amber-600">{fmtCurrency(data.totalTax as number)}</p></div>
          <div className="text-center"><p className="text-xs text-gray-400 uppercase font-bold">Total Value</p><p className="text-lg font-bold text-emerald-600">{fmtCurrency(data.totalValue as number)}</p></div>
        </div>
      </div>

      {b2b.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><span className="text-sm font-bold text-gray-600">B2B — Vendor-wise (with GSTIN)</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50">
                <TH>Vendor</TH><TH>GSTIN</TH><TH className="text-right">Invoices</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">Total</TH>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {b2b.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <TD>{r.vendorName as string}</TD><TD className="font-mono text-xs">{r.gstin as string}</TD><TD className="text-right">{r.invoiceCount as number}</TD>
                    <TD className="text-right">{fmtCurrency(r.taxable as number)}</TD><TD className="text-right">{fmtCurrency(r.cgst as number)}</TD><TD className="text-right">{fmtCurrency(r.sgst as number)}</TD><TD className="text-right font-bold">{fmtCurrency(r.total as number)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {b2c && b2c.total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm font-bold text-gray-600 mb-2">B2C — Without GSTIN (Aggregate)</p>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div><p className="text-xs text-gray-400">Taxable</p><p className="font-bold">{fmtCurrency(b2c.taxable)}</p></div>
            <div><p className="text-xs text-gray-400">CGST</p><p className="font-bold">{fmtCurrency(b2c.cgst)}</p></div>
            <div><p className="text-xs text-gray-400">SGST</p><p className="font-bold">{fmtCurrency(b2c.sgst)}</p></div>
            <div><p className="text-xs text-gray-400">Total</p><p className="font-bold">{fmtCurrency(b2c.total)}</p></div>
          </div>
        </div>
      )}

      {hsn.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><span className="text-sm font-bold text-gray-600">HSN-wise Summary</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50">
                <TH>HSN</TH><TH>Description</TH><TH className="text-right">Qty</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">Total</TH>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {hsn.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <TD className="font-mono">{r.hsn as string}</TD><TD>{r.description as string}</TD><TD className="text-right">{r.qty as number}</TD>
                    <TD className="text-right">{fmtCurrency(r.taxable as number)}</TD><TD className="text-right">{fmtCurrency(r.cgst as number)}</TD><TD className="text-right">{fmtCurrency(r.sgst as number)}</TD><TD className="text-right font-bold">{fmtCurrency(r.total as number)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
