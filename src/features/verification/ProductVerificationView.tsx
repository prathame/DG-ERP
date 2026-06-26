import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, Package, Truck, ShoppingCart, ShieldCheck, RefreshCw, Gift, Camera, CheckCircle2, XCircle, Clock, AlertCircle, IndianRupee, Users, FileText, Barcode } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useToast } from '../../components/ui';
import { BarcodeScanner } from '../../components/ui/BarcodeScanner';
import { useDebounce } from '../../hooks/useDebounce';

interface VerificationResult {
  found: boolean;
  barcode: string;
  currentStatus: string;
  features: { warranty: boolean; replacement: boolean; rewards: boolean; vendorPortal: boolean; barcodeSystem: boolean };
  product: { name: string; price: number; description?: string; hsnCode?: string; gstRate?: number; warrantyMonths?: number; warrantyApplicable?: boolean };
  timeline: { addedToInventory?: string; distributed?: string; sold?: string };
  distribution?: { date: string; status: string; discountPercent?: number; netPrice?: number; gstApplied?: boolean; billedPrice?: number; vendorName?: string; vendorPhone?: string; contactPerson?: string };
  sale?: { date: string; salePrice?: number; soldByVendor?: string; customerName?: string; customerPhone?: string; customerEmail?: string; rewardPointsEarned?: number };
  warranty?: { status: string; activationDate: string; expiryDate: string };
  replacements?: { oldBarcode: string; newBarcode: string; reason?: string; status: string; date: string }[];
}

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  InStock: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Package },
  Distributed: { color: 'text-amber-600', bg: 'bg-amber-50', icon: Truck },
  Sold: { color: 'text-emerald-600', bg: 'bg-emerald-50', icon: ShoppingCart },
  Replaced: { color: 'text-purple-600', bg: 'bg-purple-50', icon: RefreshCw },
  Damaged: { color: 'text-rose-600', bg: 'bg-rose-50', icon: XCircle },
};

export function ProductVerificationView() {
  const { toast } = useToast();
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{ products: { id: string; name: string; price: number; stock: number }[]; customers: { id: string; name: string; phone: string; email: string }[]; vendors: { id: string; name: string; contact: string; phone: string }[]; barcodes: { barcode: string; productName: string; productId: string; status: string }[]; challans?: { batchId: string; vendorName: string; date: string; units: number }[] } | null>(null);
  const [vendorDetail, setVendorDetail] = useState<Record<string, unknown> | null>(null);
  const debouncedBarcode = useDebounce(barcode, 200);
  const barcodeSystem = (() => { try { return JSON.parse(sessionStorage.getItem('dg_erp_user') || '{}').barcodeSystemEnabled !== false; } catch { return true; } })();

  useEffect(() => {
    if (!debouncedBarcode || debouncedBarcode.length < 1) { setSearchResults(null); return; }
    api.search.global(debouncedBarcode).then(r => setSearchResults(r)).catch(() => {});
  }, [debouncedBarcode]);

  const handleVerify = (code?: string) => {
    const bc = (code || barcode).trim();
    if (!bc) { toast('Enter barcode or SKU', 'error'); return; }
    if (code) setBarcode(code);
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setSearchResults(null);
    setVendorDetail(null);
    api.products.verify(bc)
      .then((data) => {
        if (data.found) {
          setResult(data as unknown as VerificationResult);
          toast('Product found', 'success');
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };

  const status = result ? statusConfig[result.currentStatus] || statusConfig.InStock : null;
  const StatusIcon = status?.icon || Package;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-lg mb-1">Search</h3>
        <p className="text-sm text-gray-500 mb-4">Search vendors, products, barcodes, customers, or challans</p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={barcode}
              onChange={(e) => { setBarcode(e.target.value); setResult(null); setNotFound(false); setVendorDetail(null); }}
              placeholder="Type to search..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#F27D26]"
              autoComplete="off"
              autoFocus
            />
            {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#F27D26] border-t-transparent rounded-full animate-spin" />}
          </div>
          {barcodeSystem && (
            <button type="button" onClick={() => setScannerOpen(true)} className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 flex items-center gap-2">
              <Camera size={18} /> <span className="hidden sm:inline">Scan</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults && !result && !notFound && !vendorDetail && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {searchResults.barcodes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><Barcode size={16} className="text-gray-500" /><span className="text-xs font-bold text-gray-400 uppercase">Barcodes ({searchResults.barcodes.length})</span></div>
              {searchResults.barcodes.map((b) => (
                <button key={b.barcode} type="button" onClick={() => handleVerify(b.barcode)} className="w-full px-4 py-3 text-left hover:bg-orange-50 border-b border-gray-50 last:border-0">
                  <p className="font-mono font-medium text-sm">{b.barcode}</p>
                  <p className="text-xs text-gray-500">{b.productName} <span className={cn("ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold", b.status === 'InStock' ? 'bg-emerald-100 text-emerald-700' : b.status === 'Sold' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>{b.status}</span></p>
                </button>
              ))}
            </div>
          )}
          {searchResults.vendors.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><ShoppingCart size={16} className="text-purple-500" /><span className="text-xs font-bold text-gray-400 uppercase">Vendors ({searchResults.vendors.length})</span></div>
              {searchResults.vendors.map((v) => (
                <button key={v.id} type="button" onClick={() => { api.vendorFinance.detail(v.id).then(d => setVendorDetail(d as unknown as Record<string, unknown>)).catch(() => {}); }} className="w-full px-4 py-3 text-left hover:bg-orange-50 border-b border-gray-50 last:border-0">
                  <p className="font-medium text-sm">{v.name}</p>
                  <p className="text-xs text-gray-500">{v.contact || v.phone || '-'}</p>
                </button>
              ))}
            </div>
          )}
          {searchResults.products.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><Package size={16} className="text-blue-500" /><span className="text-xs font-bold text-gray-400 uppercase">Products ({searchResults.products.length})</span></div>
              {searchResults.products.map((p) => (
                <div key={p.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500">₹{p.price.toLocaleString()} · {p.stock} in stock</p>
                </div>
              ))}
            </div>
          )}
          {searchResults.customers.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><Users size={16} className="text-emerald-500" /><span className="text-xs font-bold text-gray-400 uppercase">Customers ({searchResults.customers.length})</span></div>
              {searchResults.customers.map((c) => (
                <div key={c.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone || c.email || '-'}</p>
                </div>
              ))}
            </div>
          )}
          {(searchResults.challans?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><FileText size={16} className="text-indigo-500" /><span className="text-xs font-bold text-gray-400 uppercase">Challans ({searchResults.challans!.length})</span></div>
              {searchResults.challans!.map((c) => (
                <div key={c.batchId} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <p className="font-medium text-sm">{c.batchId}</p>
                  <p className="text-xs text-gray-500">{c.vendorName} · {formatDate(c.date)} · {c.units} units</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vendor Detail */}
      {vendorDetail && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <button type="button" onClick={() => setVendorDetail(null)} className="text-xs font-medium text-[#F27D26] hover:underline">← Back to results</button>
          {(() => {
            const d = vendorDetail as { vendor?: { name: string; phone?: string; email?: string; address?: string }; totalDistributedValue: number; totalPaid: number; balance: number; payments?: { id: string; amount: number; paymentDate: string; paymentMethod: string }[]; distributions?: { date: string; productName: string; quantity: number; total: number }[] };
            return (
              <>
                <div>
                  <h3 className="text-lg font-bold">{d.vendor?.name}</h3>
                  {d.vendor?.phone && <p className="text-sm text-gray-500">{d.vendor.phone}</p>}
                  {d.vendor?.email && <p className="text-sm text-gray-500">{d.vendor.email}</p>}
                  {d.vendor?.address && <p className="text-sm text-gray-500">{d.vendor.address}</p>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 uppercase">Billed</p><p className="text-lg font-bold text-blue-700">₹{(d.totalDistributedValue ?? 0).toLocaleString()}</p></div>
                  <div className="bg-emerald-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 uppercase">Paid</p><p className="text-lg font-bold text-emerald-700">₹{(d.totalPaid ?? 0).toLocaleString()}</p></div>
                  <div className={cn("rounded-xl p-3", (d.balance ?? 0) > 0 ? "bg-rose-50" : "bg-emerald-50")}><p className="text-[10px] font-bold text-gray-400 uppercase">Balance</p><p className={cn("text-lg font-bold", (d.balance ?? 0) > 0 ? "text-rose-700" : "text-emerald-700")}>₹{(d.balance ?? 0).toLocaleString()}</p></div>
                </div>
                {d.payments && d.payments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Recent Payments</h4>
                    {d.payments.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-600">{formatDate(p.paymentDate)} · {p.paymentMethod}</span>
                        <span className="font-bold text-emerald-600">₹{p.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                {d.distributions && d.distributions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Recent Distributions</h4>
                    {d.distributions.slice(0, 5).map((dist, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-600">{formatDate(dist.date)} · {dist.productName} × {dist.quantity}</span>
                        <span className="font-bold">₹{dist.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </motion.div>
      )}

      {/* Not Found */}
      {notFound && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <XCircle size={48} className="text-rose-300 mx-auto mb-3" />
          <h3 className="font-bold text-lg text-gray-900">Not Found</h3>
          <p className="text-sm text-gray-500 mt-1">No results found for "<span className="font-bold">{barcode}</span>"</p>
        </motion.div>
      )}

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Status + Product */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={cn("px-6 py-4 flex items-center justify-between", status?.bg)}>
              <div className="flex items-center gap-3">
                <StatusIcon size={24} className={status?.color} />
                <div>
                  <p className={cn("font-bold text-lg", status?.color)}>{result.currentStatus}</p>
                  <p className="text-xs text-gray-500 font-mono">{result.barcode}</p>
                </div>
              </div>
              <CheckCircle2 size={28} className="text-emerald-500" />
            </div>
            <div className="p-6">
              <h3 className="font-bold text-xl">{result.product.name}</h3>
              {result.product.description && <p className="text-sm text-gray-500 mt-1">{result.product.description}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Price</p>
                  <p className="font-bold text-lg">₹{Number(result.product.price).toLocaleString()}</p>
                </div>
                {result.product.hsnCode && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">HSN Code</p>
                    <p className="font-bold text-sm font-mono">{result.product.hsnCode}</p>
                  </div>
                )}
                {result.product.gstRate && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">GST Rate</p>
                    <p className="font-bold text-sm">{result.product.gstRate}%</p>
                  </div>
                )}
                {result.features.warranty && result.product.warrantyApplicable && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Warranty</p>
                    <p className="font-bold text-sm">{result.product.warrantyMonths} months</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h4 className="font-bold text-sm text-gray-400 uppercase mb-4">Product Journey</h4>
            <div className="space-y-0">
              {/* Added */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center"><Package size={16} className="text-blue-600" /></div>
                  {(result.distribution || result.sale) && <div className="w-0.5 h-8 bg-gray-200" />}
                </div>
                <div className="pb-6">
                  <p className="font-medium text-sm">Added to Inventory</p>
                  <p className="text-xs text-gray-500">{result.timeline.addedToInventory ? new Date(result.timeline.addedToInventory as string).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
              {/* Distributed */}
              {result.distribution && (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center"><Truck size={16} className="text-amber-600" /></div>
                    {result.sale && <div className="w-0.5 h-8 bg-gray-200" />}
                  </div>
                  <div className="pb-6">
                    <p className="font-medium text-sm">Distributed{result.features.vendorPortal && result.distribution.vendorName ? ` to ${result.distribution.vendorName}` : ''}</p>
                    <p className="text-xs text-gray-500">{new Date(result.distribution.date).toLocaleDateString()}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      {result.distribution.netPrice && <span>Price: ₹{Number(result.distribution.netPrice).toLocaleString()}</span>}
                      {result.distribution.discountPercent ? <span>Discount: {result.distribution.discountPercent}%</span> : null}
                      {result.distribution.gstApplied && <span className="text-emerald-600">GST Applied</span>}
                    </div>
                    {result.features.vendorPortal && result.distribution.vendorPhone && (
                      <p className="text-xs text-gray-400 mt-0.5">Phone: {result.distribution.vendorPhone}</p>
                    )}
                  </div>
                </div>
              )}
              {/* Sold */}
              {result.sale && (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center"><ShoppingCart size={16} className="text-emerald-600" /></div>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Sold{result.features.vendorPortal && result.sale.customerName ? ` to ${result.sale.customerName}` : ''}</p>
                    <p className="text-xs text-gray-500">{new Date(result.sale.date).toLocaleDateString()}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      {result.sale.salePrice && <span>Sale Price: ₹{Number(result.sale.salePrice).toLocaleString()}</span>}
                      {result.features.vendorPortal && result.sale.soldByVendor && <span>By: {result.sale.soldByVendor}</span>}
                    </div>
                    {result.features.vendorPortal && result.sale.customerPhone && (
                      <p className="text-xs text-gray-400 mt-0.5">Customer Phone: {result.sale.customerPhone}</p>
                    )}
                    {result.features.rewards && result.sale.rewardPointsEarned ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Gift size={12} className="text-amber-500" />
                        <span className="text-xs font-medium text-amber-600">+{result.sale.rewardPointsEarned} reward points</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Warranty */}
          {result.features.warranty && result.warranty && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h4 className="font-bold text-sm text-gray-400 uppercase mb-3 flex items-center gap-2"><ShieldCheck size={16} /> Warranty</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Status</p>
                  <p className={cn("font-bold text-sm", result.warranty.status === 'Active' ? 'text-emerald-600' : result.warranty.status === 'Expired' ? 'text-rose-600' : 'text-gray-600')}>{result.warranty.status}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Activation</p>
                  <p className="font-medium text-sm">{new Date(result.warranty.activationDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Expiry</p>
                  <p className="font-medium text-sm">{new Date(result.warranty.expiryDate).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}

          {/* Replacements */}
          {result.features.replacement && result.replacements && result.replacements.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h4 className="font-bold text-sm text-gray-400 uppercase mb-3 flex items-center gap-2"><RefreshCw size={16} /> Replacement History</h4>
              <div className="space-y-2">
                {result.replacements.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 text-sm">
                    <span className="font-mono text-xs">{r.oldBarcode}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-mono text-xs">{r.newBarcode}</span>
                    {r.reason && <span className="text-xs text-gray-500">({r.reason})</span>}
                    <span className="ml-auto text-xs text-gray-400">{new Date(r.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {scannerOpen && (
        <BarcodeScanner onScan={(code) => { setScannerOpen(false); handleVerify(code); }} onClose={() => setScannerOpen(false)} />
      )}
    </motion.div>
  );
}
