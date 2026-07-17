import React, { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { Users, ShoppingCart, Gift, Package, CreditCard, Link2, Plus, Tag, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { api } from '../../api';
import type { Tab } from '../../types';
import { LoadingSpinner } from '../../components/ui';

const CustomerMasterView = lazy(() => import('./CustomerMasterView').then(m => ({ default: m.CustomerMasterView })));
const VendorMasterView = lazy(() => import('./VendorMasterView').then(m => ({ default: m.VendorMasterView })));
const BankMasterView = lazy(() => import('./BankMasterView').then(m => ({ default: m.BankMasterView })));
const VendorCustomerMappingView = lazy(() =>
  import('./VendorCustomerMappingView').then(m => ({ default: m.VendorCustomerMappingView })),
);
const RewardRulesView = lazy(() => import('./RewardRulesView').then(m => ({ default: m.RewardRulesView })));
const PriceListView = lazy(() => import('./PriceListView').then(m => ({ default: m.PriceListView })));
const StaffMasterView = lazy(() => import('./StaffMasterView').then(m => ({ default: m.StaffMasterView })));

export type MasterType = 'customer' | 'vendor' | 'item' | 'bank' | 'mapping' | 'rewardRules' | 'priceList' | 'staff';

const MasterFallback = () => (
  <div className="flex items-center justify-center py-16">
    <LoadingSpinner size="lg" />
  </div>
);

export function MastersView({
  setActiveTab,
  user,
  businessType: _businessType = 'manufacturer',
}: {
  setActiveTab: (tab: Tab) => void;
  user?: Record<string, unknown> | null;
  businessType?: string;
}) {
  const cfg = useBusinessConfig();
  const isVendor = user?.role === 'Vendor' && user?.vendorId;
  const isDirectSell = cfg.type === 'dealer' || cfg.type === 'retail';
  const tabConfig = (user?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
  const tv = (key: string) => tabConfig[key]?.visible !== false;
  const hasCustomerTracking = tv('sales') && cfg.features.customerTracking;

  const [masterCounts, setMasterCounts] = useState({ customer: 0, vendor: 0, item: 0, bank: 0, staff: 0 });
  const [selectedMaster, setSelectedMaster] = useState<MasterType | null>(null);

  const refreshCounts = () => {
    api.masters
      .counts()
      .then(c => {
        setMasterCounts({
          customer: c.customerMaster,
          vendor: c.vendorMaster,
          item: c.itemMaster,
          bank: c.bankMaster,
          staff: (c as Record<string, number>).staffCount ?? 0,
        });
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshCounts();
  }, []); // ponytail: fetch once on mount, not on every selectedMaster change

  const allMasters = [
    ...(hasCustomerTracking && !isDirectSell
      ? [
          {
            id: 'customer' as const,
            name: 'Customers',
            count: masterCounts.customer as number | string,
            icon: Users,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
        ]
      : []),
    {
      id: 'vendor' as const,
      name: cfg.labels.vendors,
      count: masterCounts.vendor as number | string,
      icon: ShoppingCart,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    ...(tv('rewards')
      ? [
          {
            id: 'rewardRules' as const,
            name: 'Reward Rules',
            count: '' as number | string,
            icon: Gift,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
        ]
      : []),
    ...(hasCustomerTracking
      ? [
          {
            id: 'mapping' as const,
            name: 'Vendor-Customer Map',
            count: '' as number | string,
            icon: Link2,
            color: 'text-cyan-600',
            bg: 'bg-cyan-50',
          },
        ]
      : []),
    {
      id: 'item' as const,
      name: 'Products',
      count: masterCounts.item as number | string,
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      id: 'bank' as const,
      name: 'Banks',
      count: masterCounts.bank as number | string,
      icon: CreditCard,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      id: 'staff' as const,
      name: 'Staff',
      count: masterCounts.staff as number | string,
      icon: Wallet,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      id: 'priceList' as const,
      name: 'Price List',
      count: '' as number | string,
      icon: Tag,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
  ];
  const masters = isVendor ? allMasters.filter(m => m.id === 'customer') : allMasters;

  const handleMasterClick = (id: MasterType) => {
    if (id === 'item') {
      setActiveTab('inventory');
    } else {
      setSelectedMaster(id);
    }
  };

  if (selectedMaster === 'customer')
    return (
      <Suspense fallback={<MasterFallback />}>
        <CustomerMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} user={user} />
      </Suspense>
    );
  if (selectedMaster === 'vendor')
    return (
      <Suspense fallback={<MasterFallback />}>
        <VendorMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} />
      </Suspense>
    );
  if (selectedMaster === 'bank')
    return (
      <Suspense fallback={<MasterFallback />}>
        <BankMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} />
      </Suspense>
    );
  if (selectedMaster === 'mapping')
    return (
      <Suspense fallback={<MasterFallback />}>
        <VendorCustomerMappingView onBack={() => setSelectedMaster(null)} />
      </Suspense>
    );
  if (selectedMaster === 'rewardRules')
    return (
      <Suspense fallback={<MasterFallback />}>
        <RewardRulesView onBack={() => setSelectedMaster(null)} />
      </Suspense>
    );
  if (selectedMaster === 'priceList')
    return (
      <Suspense fallback={<MasterFallback />}>
        <PriceListView onBack={() => setSelectedMaster(null)} />
      </Suspense>
    );
  if (selectedMaster === 'staff')
    return (
      <Suspense fallback={<MasterFallback />}>
        <StaffMasterView onBack={() => setSelectedMaster(null)} onRefresh={refreshCounts} />
      </Suspense>
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      {masters.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => handleMasterClick(m.id)}
          className="w-full text-left bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn('p-4 rounded-2xl transition-transform group-hover:scale-110', m.bg)}>
                <m.icon className={m.color} size={28} />
              </div>
              <div>
                <h3 className="font-bold text-lg">{m.name}</h3>
                <p className="text-sm text-gray-500">
                  {typeof m.count === 'number' ? `${m.count} records found` : 'View & manage mapping'}
                </p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors">
              <Plus size={20} />
            </div>
          </div>
        </button>
      ))}
    </motion.div>
  );
}
