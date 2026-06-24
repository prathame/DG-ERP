import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Package, ArrowLeft, Download } from 'lucide-react';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import type { Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';

export function VendorCustomerMappingView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<{ vendors: { vendor: { id: string; name: string; contactPerson: string; phone: string }; customers: { id: string; name: string; phone: string; email: string }[] }[]; directCustomers: { id: string; name: string; phone: string; email: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [assignModal, setAssignModal] = useState<{ customer: { id: string; name: string }; currentVendorId: string | null } | null>(null);

  useEffect(() => {
    Promise.all([api.mapping.vendorsWithCustomers(), api.vendors.list()])
      .then(([m, v]) => { setData(m); setVendors(v); })
      .catch(() => setData({ vendors: [], directCustomers: [] }))
      .finally(() => setLoading(false));
  }, [assignModal]);

  const handleAssignVendor = (customerId: string, vendorId: string | null) => {
    api.customers.setVendor(customerId, vendorId)
      .then(() => { setAssignModal(null); setLoading(true); api.mapping.vendorsWithCustomers().then(setData).finally(() => setLoading(false)); })
      .catch((err) => toast(err.message, 'error'));
  };

  if (loading || !data) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Vendor-Customer Mapping</h2>
          <p className="text-sm text-gray-500">See which vendors have which customers. Customers can also purchase directly from factory.</p>
        </div>
        <button type="button" onClick={() => { const rows: Record<string, unknown>[] = []; data.vendors.forEach((v) => v.customers.forEach((c) => rows.push({ vendorName: v.vendor.name, vendorPhone: v.vendor.phone, customerName: c.name, customerPhone: c.phone, customerEmail: c.email ?? '' }))); data.directCustomers.forEach((c) => rows.push({ vendorName: 'Direct', vendorPhone: '', customerName: c.name, customerPhone: c.phone, customerEmail: c.email ?? '' })); rows.length && exportToCsv(rows, 'vendor-customer-mapping'); }} disabled={!data.vendors.length && !data.directCustomers.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="font-bold text-lg flex items-center gap-2"><ShoppingCart size={20} className="text-purple-600" /> Vendors & Their Customers</h3>
          {data.vendors.map((v) => (
            <div key={v.vendor.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 bg-purple-50 border-b border-purple-100">
                <h4 className="font-bold text-purple-900">{v.vendor.name}</h4>
                <p className="text-xs text-purple-600">{v.vendor.contactPerson} • {v.vendor.phone}</p>
                <p className="text-xs font-bold text-purple-700 mt-1">{v.customers.length} customer{v.customers.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
                {v.customers.length === 0 ? <p className="text-sm text-gray-400 italic">No customers mapped</p> : v.customers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-gray-500">{c.phone || c.email || '-'}</p></div>
                    <button type="button" onClick={() => setAssignModal({ customer: c, currentVendorId: v.vendor.id })} className="text-xs font-bold text-[#F27D26] hover:underline">Change</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <h3 className="font-bold text-lg flex items-center gap-2"><Package size={20} className="text-orange-600" /> Direct Customers (Factory Purchase)</h3>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 bg-amber-50 border-b border-amber-100">
              <p className="text-sm text-amber-800">Customers who purchase directly from factory without a vendor</p>
              <p className="text-xs font-bold text-amber-700 mt-1">{data.directCustomers.length} customer{data.directCustomers.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {data.directCustomers.length === 0 ? <p className="text-sm text-gray-400 italic">No direct customers</p> : data.directCustomers.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-gray-500">{c.phone || c.email || '-'}</p></div>
                  <button type="button" onClick={() => setAssignModal({ customer: c, currentVendorId: null })} className="text-xs font-bold text-[#F27D26] hover:underline">Assign Vendor</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {assignModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAssignModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-2">Assign Vendor for {assignModal.customer.name}</h3>
              <p className="text-sm text-gray-500 mb-4">Select a vendor or choose Direct (factory purchase)</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <button type="button" onClick={() => handleAssignVendor(assignModal.customer.id, null)} className={cn("w-full text-left px-4 py-3 rounded-xl border-2 transition-all", assignModal.currentVendorId === null ? "border-[#F27D26] bg-orange-50" : "border-gray-200 hover:border-gray-300")}>
                  <span className="font-bold">Direct (Factory)</span>
                  <span className="text-xs text-gray-500 block">No vendor – purchases directly</span>
                </button>
                {vendors.map((v) => (
                  <button key={v.id} type="button" onClick={() => handleAssignVendor(assignModal.customer.id, v.id)} className={cn("w-full text-left px-4 py-3 rounded-xl border-2 transition-all", assignModal.currentVendorId === v.id ? "border-[#F27D26] bg-orange-50" : "border-gray-200 hover:border-gray-300")}>
                    <span className="font-bold">{v.name}</span>
                    <span className="text-xs text-gray-500 block">{v.contactPerson || v.phone || '-'}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAssignModal(null)} className="w-full mt-4 py-2 border border-gray-200 rounded-lg font-medium">Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
