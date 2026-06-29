import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, ShoppingCart, Gift, Package, CreditCard, Link2, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import type { Tab } from '../../types';
import { CustomerMasterView } from './CustomerMasterView';
import { VendorMasterView } from './VendorMasterView';
import { BankMasterView } from './BankMasterView';
import { VendorCustomerMappingView } from './VendorCustomerMappingView';
import { RewardRulesView } from './RewardRulesView';

export type MasterType = 'customer' | 'vendor' | 'item' | 'bank' | 'mapping' | 'rewardRules';

export function MastersView({ setActiveTab, user }: { setActiveTab: (tab: Tab) => void; user?: { role?: string; vendorId?: string } | null }) {
  const isVendor = user?.role === 'Vendor' && user?.vendorId;
  const [masterCounts, setMasterCounts] = useState({ customer: 0, vendor: 0, item: 0, bank: 0 });
  const [selectedMaster, setSelectedMaster] = useState<MasterType | null>(null);

  const refreshCounts = () => {
    api.masters.counts().then((c) => {
      setMasterCounts({
        customer: c.customerMaster,
        vendor: c.vendorMaster,
        item: c.itemMaster,
        bank: c.bankMaster,
      });
    }).catch(() => {});
  };

  useEffect(() => {
    refreshCounts();
  }, [selectedMaster]);

  const allMasters = [
    { id: 'customer' as const, name: 'Customer Master', count: masterCounts.customer, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'vendor' as const, name: 'Vendor Master', count: masterCounts.vendor, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 'rewardRules' as const, name: 'Reward Rules', count: '', icon: Gift, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: 'mapping' as const, name: 'Vendor-Customer Mapping', count: '', icon: Link2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { id: 'item' as const, name: 'Item Master', count: masterCounts.item, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'bank' as const, name: 'Bank Master', count: masterCounts.bank, icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];
  const masters = isVendor ? allMasters.filter((m) => m.id === 'customer') : allMasters;

  const handleMasterClick = (id: MasterType) => {
    if (id === 'item') {
      setActiveTab('inventory');
    } else {
      setSelectedMaster(id);
    }
  };

  if (selectedMaster === 'customer') return <CustomerMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} user={user} />;
  if (selectedMaster === 'vendor') return <VendorMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} />;
  if (selectedMaster === 'bank') return <BankMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} />;
  if (selectedMaster === 'mapping') return <VendorCustomerMappingView onBack={() => setSelectedMaster(null)} />;
  if (selectedMaster === 'rewardRules') return <RewardRulesView onBack={() => setSelectedMaster(null)} />;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {masters.map((m) => (
        <button key={m.id} type="button" onClick={() => handleMasterClick(m.id)} className="w-full text-left bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn("p-4 rounded-2xl transition-transform group-hover:scale-110", m.bg)}><m.icon className={m.color} size={28} /></div>
              <div>
                <h3 className="font-bold text-lg">{m.name}</h3>
                <p className="text-sm text-gray-500">{typeof m.count === 'number' ? `${m.count} records found` : 'View & manage mapping'}</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors"><Plus size={20} /></div>
          </div>
        </button>
      ))}
    </motion.div>
  );
}
