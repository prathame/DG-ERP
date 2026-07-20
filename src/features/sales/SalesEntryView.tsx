import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Barcode, CheckCircle2, AlertCircle, Download, Printer, MessageCircle, Mail, Camera } from 'lucide-react';
import {
  cn,
  exportToCsv,
  openPrintWindow,
  printBillInWindow,
  saveBillAsPdf,
  shareViaWhatsApp,
  shareViaEmail,
  formatSalesInvoiceText,
  formatDate,
  getTabLabel,
  fetchImageAsDataUrl,
  PRINT_POPUP_BLOCKED,
} from '../../lib/utils';
import { api } from '../../api';
import type { SaleRecord } from '../../api';
import { useToast, DateRangeFilter, PaginationControls } from '../../components/ui';
import { generateSalesInvoiceHtml } from '../../lib/billTemplates';
import { BarcodeScanner } from '../../components/ui/BarcodeScanner';
import { session } from '../../lib/session';

export function SalesEntryView({
  user,
}: {
  user: { id: string; role?: string; vendorId?: string; autoWhatsapp?: boolean } | null;
}) {
  const { toast } = useToast();
  const vendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const barcodeSystemEnabled = (() => {
    try {
      const u = session.getUser() || {};
      return u.barcodeSystemEnabled !== false;
    } catch {
      return true;
    }
  })();
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{
    valid: boolean;
    productName?: string;
    vendorName?: string;
    rewardPointsValue?: number;
    price?: number;
    error?: string;
  } | null>(null);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    salePrice: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [includeGst, setIncludeGst] = useState(true);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotalPages, setSalesTotalPages] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesDateFilter, setSalesDateFilter] = useState({ range: 'all', from: '', to: '' });

  const loadSales = (page = 1) => {
    api.sales
      .list({
        vendorId,
        page,
        dateRange:
          salesDateFilter.range !== 'all' && salesDateFilter.range !== 'custom' ? salesDateFilter.range : undefined,
        dateFrom: salesDateFilter.range === 'custom' ? salesDateFilter.from : undefined,
        dateTo: salesDateFilter.range === 'custom' ? salesDateFilter.to : undefined,
      })
      .then(r => {
        setSales(r.data);
        setSalesPage(r.page);
        setSalesTotalPages(r.totalPages);
        setSalesTotal(r.total);
      })
      .catch(() => setSales([]));
  };
  useEffect(() => {
    loadSales(1);
  }, [vendorId, salesDateFilter]);

  const handleValidate = (scannedCode?: string) => {
    if (typeof scannedCode !== 'string') scannedCode = undefined;
    const code = (scannedCode || barcode).trim();
    if (!code) {
      toast('Enter a barcode', 'error');
      return;
    }
    if (scannedCode) {
      setBarcode(scannedCode);
      toast(`Scanned: ${scannedCode}`, 'success');
    }
    setValidation(null);
    setValidating(true);
    toast('Verifying...', 'info');
    api.sales
      .validate(code, vendorId)
      .then(r => {
        setValidation({
          valid: r.valid,
          productName: r.productName,
          vendorName: r.vendorName,
          rewardPointsValue: r.rewardPointsValue,
          price: (r as { price?: number }).price,
          error: (r as { error?: string }).error,
        });
        if (r.valid) {
          toast(`Found: ${r.productName}`, 'success');
          if ((r as { price?: number }).price != null)
            setForm(f => ({ ...f, salePrice: String((r as { price?: number }).price ?? '') }));
        } else {
          toast((r as { error?: string }).error || 'Invalid barcode', 'error');
        }
      })
      .catch(err => {
        setValidation({ valid: false, error: 'Validation failed' });
        toast(err instanceof Error ? err.message : 'Validation failed', 'error');
      })
      .finally(() => setValidating(false));
  };

  const handleSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation?.valid || !barcode.trim() || !form.customerName || !form.customerPhone) return;
    setSubmitting(true);
    api.sales
      .create({
        barcode: barcode.trim(),
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        purchaseDate: form.purchaseDate,
        salePrice: form.salePrice ? parseFloat(form.salePrice) : undefined,
      })
      .then(saleResult => {
        const savedPhone = form.customerPhone;
        setBarcode('');
        setValidation(null);
        setForm({
          customerName: '',
          customerPhone: '',
          customerEmail: '',
          purchaseDate: new Date().toISOString().slice(0, 10),
          salePrice: '',
        });
        loadSales(salesPage);
        toast('Sale completed successfully', 'success');
        if (user?.autoWhatsapp && savedPhone && saleResult?.id) {
          api.sales
            .getBill(saleResult.id)
            .then(bill => {
              shareViaWhatsApp(savedPhone, formatSalesInvoiceText(bill));
            })
            .catch(() => {});
        }
      })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">{getTabLabel('sales', 'Sales')}</h2>
        <p className="text-sm text-gray-500">Scan barcode, verify product, enter customer details to complete sale</p>
        <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-3 py-2 rounded-lg inline-block">
          {vendorId
            ? 'Scan or enter barcode assigned to your vendor.'
            : 'Scan or enter barcode. Products in inventory (Owner) or distributed to vendors can be sold.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <h3 className="font-bold text-lg">1. Scan / Enter Barcode</h3>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[12rem]">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder={barcodeSystemEnabled ? 'Scan or enter product barcode' : 'Enter product SKU / code'}
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleValidate()}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl font-mono focus:ring-2 focus:ring-brand"
                autoComplete="off"
              />
            </div>
            {barcodeSystemEnabled && (
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="shrink-0 px-4 py-3 min-h-[44px] bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 flex items-center gap-2"
                title="Scan with camera"
              >
                <Camera size={18} />
                <span className="hidden sm:inline">Scan</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleValidate()}
              disabled={validating}
              className="shrink-0 flex-1 sm:flex-none px-6 py-3 min-h-[44px] bg-brand text-white rounded-xl font-bold hover:bg-brand-dark disabled:opacity-60"
            >
              {validating ? 'Checking...' : 'Verify'}
            </button>
          </div>

          {validation && (
            <div
              className={cn(
                'p-4 rounded-xl border',
                validation.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200',
              )}
            >
              {validation.valid ? (
                <>
                  <p className="font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={20} /> Product verified
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-emerald-700">
                    <p>
                      <span className="font-medium text-gray-600">Product:</span> {validation.productName}
                    </p>
                    <p>
                      <span className="font-medium text-gray-600">Vendor:</span> {validation.vendorName}
                    </p>
                    <p>
                      <span className="font-medium text-gray-600">Price:</span> ₹
                      {(validation.price ?? 0).toLocaleString()}
                    </p>
                    <p>{validation.rewardPointsValue ?? 0} reward pts</p>
                  </div>
                </>
              ) : (
                <p className="font-bold text-rose-800 flex items-center gap-2">
                  <AlertCircle size={20} /> {validation.error || 'Invalid'}
                </p>
              )}
            </div>
          )}

          {validation?.valid && (
            <form onSubmit={handleSale} className="space-y-4 pt-4 border-t border-gray-100">
              <h3 className="font-bold text-lg">2. Customer Details</h3>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Customer Name</label>
                <input
                  required
                  value={form.customerName}
                  onChange={e => setForm({ ...form, customerName: e.target.value })}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Phone</label>
                <input
                  required
                  value={form.customerPhone}
                  onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Email (optional)</label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={e => setForm({ ...form, customerEmail: e.target.value })}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Purchase Date</label>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={e => setForm({ ...form, purchaseDate: e.target.value })}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Sale Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Price at which product is sold"
                  value={form.salePrice}
                  onChange={e => setForm({ ...form, salePrice: e.target.value })}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-60"
              >
                Complete Sale
              </button>
            </form>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-bold text-lg">Sales ({salesTotal})</h3>
            <button
              type="button"
              onClick={() =>
                sales.length &&
                exportToCsv(
                  sales.map(s => ({
                    id: s.id,
                    barcode: s.barcode,
                    productName: s.productName,
                    customerName: s.customerName,
                    customerPhone: s.customerPhone,
                    purchaseDate: s.purchaseDate,
                    salePrice: s.salePrice ?? '',
                    rewardPointsEarned: s.rewardPointsEarned,
                  })),
                  'sales',
                )
              }
              disabled={!sales.length}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <DateRangeFilter
              value={salesDateFilter}
              onChange={v => {
                setSalesDateFilter(v);
                setSalesPage(1);
              }}
            />
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full select-none">
              <input
                type="checkbox"
                checked={includeGst}
                onChange={e => setIncludeGst(e.target.checked)}
                className="rounded text-brand"
              />
              GST on Bill
            </label>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {sales.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">No sales found for this period</p>
            ) : (
              sales.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group">
                  <div>
                    <p className="font-medium text-sm">{s.productName}</p>
                    <p className="text-xs text-gray-500">
                      {s.customerName} • {formatDate(s.purchaseDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                      <button
                        type="button"
                        onClick={async () => {
                          const w = openPrintWindow();
                          if (!w) {
                            toast(PRINT_POPUP_BLOCKED, 'error');
                            return;
                          }
                          try {
                            const bill = await api.sales.getBill(s.id);
                            const bs = (bill as unknown as Record<string, unknown>).billSettings as
                              Record<string, unknown> | undefined;
                            const qrDataUrl = bs?.bankUpiId
                              ? await fetchImageAsDataUrl(
                                  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`)}`,
                                )
                              : undefined;
                            printBillInWindow(w, generateSalesInvoiceHtml(bill, { showGst: includeGst, qrDataUrl }));
                          } catch (err) {
                            try {
                              w.close();
                            } catch {
                              /* ignore */
                            }
                            toast((err as Error).message, 'error');
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-brand hover:bg-orange-50 rounded-lg"
                        title="Print Invoice"
                      >
                        <Printer size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const w = openPrintWindow('Preparing PDF…');
                          if (!w) {
                            toast(PRINT_POPUP_BLOCKED, 'error');
                            return;
                          }
                          try {
                            const bill = await api.sales.getBill(s.id);
                            const bs = (bill as unknown as Record<string, unknown>).billSettings as
                              Record<string, unknown> | undefined;
                            const qrDataUrl = bs?.bankUpiId
                              ? await fetchImageAsDataUrl(
                                  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`)}`,
                                )
                              : undefined;
                            if (
                              !(await saveBillAsPdf(
                                generateSalesInvoiceHtml(bill, { showGst: includeGst, qrDataUrl }),
                                `Invoice-${s.customerName}-${s.id}`,
                                w,
                              ))
                            ) {
                              toast(PRINT_POPUP_BLOCKED, 'error');
                            }
                          } catch (err) {
                            try {
                              w.close();
                            } catch {
                              /* ignore */
                            }
                            toast((err as Error).message, 'error');
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-brand hover:bg-orange-50 rounded-lg"
                        title="Save as PDF"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          api.sales
                            .getBill(s.id)
                            .then(bill => shareViaWhatsApp(bill.customerPhone, formatSalesInvoiceText(bill)))
                            .catch(err => toast(err.message, 'error'))
                        }
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                        title="Send via WhatsApp"
                      >
                        <MessageCircle size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          api.sales
                            .getBill(s.id)
                            .then(bill => {
                              const email = bill.customerEmail || '';
                              if (!email) {
                                toast('No customer email on record — enter email manually', 'info');
                              }
                              shareViaEmail(
                                email,
                                `Sales Invoice ${bill.id} — ${bill.company.name}`,
                                formatSalesInvoiceText(bill),
                              );
                            })
                            .catch(err => toast(err.message, 'error'))
                        }
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Send via Email"
                      >
                        <Mail size={15} />
                      </button>
                    </div>
                    <div className="text-right">
                      {s.salePrice != null && (
                        <p className="text-xs font-bold text-brand">₹{Number(s.salePrice).toLocaleString()}</p>
                      )}
                      <span className="text-xs font-bold text-emerald-600">+{s.rewardPointsEarned} pts</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <PaginationControls
            page={salesPage}
            totalPages={salesTotalPages}
            total={salesTotal}
            onPageChange={loadSales}
          />
        </div>
      </div>
      {scannerOpen && (
        <BarcodeScanner
          onScan={code => {
            setScannerOpen(false);
            handleValidate(code);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </motion.div>
  );
}
