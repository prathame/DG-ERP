import React, { useState, useEffect, lazy, Suspense, Fragment } from 'react';
import { motion } from 'motion/react';
import { Users, ShoppingCart, Gift, Package, CreditCard, Link2, Plus, Tag, Wallet, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { api } from '../../api';
import { isServiceMobileMode } from '../../platforms/service-mobile/mode';
import type { Tab, Vendor, Customer, Bank, Product } from '../../types';
import { LoadingSpinner, MobilePillTabs, MobileListRow, MobileFab, MobileEmptyState } from '../../components/ui';

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

type StaffRow = { id: string; name: string; phone?: string; role?: string };

const MasterFallback = () => (
  <div className="flex items-center justify-center py-16">
    <LoadingSpinner size="lg" />
  </div>
);

/** Short pill labels for phone hub (Emergent-style). Vendor/Client uses `m.name` from cfg.labels.vendors. */
const PILL_LABEL: Partial<Record<MasterType, string>> = {
  item: 'Products',
  customer: 'Customers',
  bank: 'Banks',
  staff: 'Staff',
  priceList: 'Prices',
  mapping: 'Mapping',
  rewardRules: 'Rewards',
};

function pillLabel(id: MasterType): string {
  return PILL_LABEL[id] || '';
}

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
  const serviceMobile = isServiceMobileMode();
  const isVendor = user?.role === 'Vendor' && user?.vendorId;
  const isDirectSell = cfg.type === 'dealer' || cfg.type === 'retail';
  const tabConfig = (user?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
  const tv = (key: string) => tabConfig[key]?.visible !== false;
  const hasCustomerTracking = tv('sales') && cfg.features.customerTracking;

  const [masterCounts, setMasterCounts] = useState({ customer: 0, vendor: 0, item: 0, bank: 0, staff: 0 });
  /** Full-screen detail (desktop flow + phone “open manage”). */
  const [selectedMaster, setSelectedMaster] = useState<MasterType | null>(null);
  /** When opening Staff manage from a hub row, jump into that person’s payments. */
  const [focusStaffId, setFocusStaffId] = useState<string | null>(null);
  /** When opening Clients manage from a hub row, jump into that client’s invoice hub. */
  const [focusVendorId, setFocusVendorId] = useState<string | null>(null);
  /** Phone hub selected pill. */
  const [hubTab, setHubTab] = useState<MasterType | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);

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
  }, []);

  // Offline: no stock Products/Catalog pill — Price List (Catalog + Clients tabs) is the sellable catalog.
  const productsMaster = !serviceMobile
    ? [
        {
          id: 'item' as const,
          name: 'Products',
          count: masterCounts.item as number | string,
          icon: Package,
          color: 'text-orange-600',
          bg: 'bg-orange-50',
        },
      ]
    : [];
  const priceListMaster = {
    id: 'priceList' as const,
    name: 'Price List',
    count: '' as number | string,
    icon: Tag,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  };
  const allMasters = [
    ...productsMaster,
    {
      id: 'vendor' as const,
      name: cfg.labels.vendors,
      count: masterCounts.vendor as number | string,
      icon: Truck,
      color: 'text-brand',
      bg: 'bg-orange-50',
    },
    // Offline: Price List next to Clients — Catalog/Clients scope tabs live inside Price ListView.
    ...(serviceMobile ? [priceListMaster] : []),
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
    ...(!serviceMobile ? [priceListMaster] : []),
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
    // Offline Mobile has no mapping routes — hide entirely (cloud manufacturer keeps it).
    ...(hasCustomerTracking && !serviceMobile
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
  ];
  const masters = isVendor ? allMasters.filter(m => m.id === 'customer') : allMasters;
  const masterIdsKey = masters.map(m => m.id).join(',');

  // Sync: never treat a removed pill (e.g. Products Offline) as active — avoids first-paint crash
  // before the repair effect runs (HMR / preserved state after af26121).
  const active: MasterType | undefined = hubTab && masters.some(m => m.id === hubTab) ? hubTab : masters[0]?.id;

  // Default / repair phone hub tab when the active pill was filtered out (e.g. Products Offline)
  useEffect(() => {
    const first = masters[0]?.id ?? null;
    if (hubTab && !masters.some(m => m.id === hubTab)) {
      setHubTab(first);
      return;
    }
    if (!hubTab && first) setHubTab(first);
    // masterIdsKey — stable when category set unchanged (avoids effect churn / update loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- masters identity changes every render
  }, [masterIdsKey, hubTab]);

  // Cloud: Products pill opens Inventory. Offline never shows Products (Price List is the catalog).
  useEffect(() => {
    if (selectedMaster === 'item' && !serviceMobile) {
      setSelectedMaster(null);
      setActiveTab('inventory');
    }
  }, [selectedMaster, serviceMobile, setActiveTab]);

  // Load list for active hub pill (use resolved `active`, not stale hubTab)
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setHubLoading(true);
    const done = () => {
      if (!cancelled) setHubLoading(false);
    };
    const asArray = <T,>(rows: unknown): T[] => (Array.isArray(rows) ? rows : []);
    if (active === 'vendor') {
      api.vendors
        .list()
        .then(rows => {
          if (!cancelled) setVendors(asArray(rows));
        })
        .catch(() => {
          if (!cancelled) setVendors([]);
        })
        .finally(done);
    } else if (active === 'customer') {
      api.customers
        .list()
        .then(rows => {
          if (!cancelled) setCustomers(asArray(rows));
        })
        .catch(() => {
          if (!cancelled) setCustomers([]);
        })
        .finally(done);
    } else if (active === 'item') {
      api.products
        .list()
        .then(rows => {
          if (!cancelled) setProducts(asArray(rows));
        })
        .catch(() => {
          if (!cancelled) setProducts([]);
        })
        .finally(done);
    } else if (active === 'bank') {
      api.banks
        .list()
        .then(rows => {
          if (!cancelled) setBanks(asArray(rows));
        })
        .catch(() => {
          if (!cancelled) setBanks([]);
        })
        .finally(done);
    } else if (active === 'staff') {
      api.staff
        .list()
        .then(rows => {
          if (!cancelled) setStaff(asArray<StaffRow>(rows));
        })
        .catch(() => {
          if (!cancelled) setStaff([]);
        })
        .finally(done);
    } else {
      done();
    }
    return () => {
      cancelled = true;
    };
  }, [active, serviceMobile]);

  const openFull = (id: MasterType, opts?: { staffId?: string; vendorId?: string }) => {
    if (id === 'item') {
      // Cloud manufacturer only — Offline never lists this pill.
      setActiveTab('inventory');
      return;
    }
    if (id === 'staff') setFocusStaffId(opts?.staffId ?? null);
    else setFocusStaffId(null);
    if (id === 'vendor') setFocusVendorId(opts?.vendorId ?? null);
    else setFocusVendorId(null);
    setSelectedMaster(id);
  };

  const handleMasterClick = (id: MasterType) => {
    openFull(id);
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
        <VendorMasterView
          onBack={() => {
            setSelectedMaster(null);
            setFocusVendorId(null);
          }}
          onRefresh={refreshCounts}
          businessType={cfg.type}
          initialVendorId={focusVendorId ?? undefined}
        />
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
        <StaffMasterView
          onBack={() => {
            setSelectedMaster(null);
            setFocusStaffId(null);
          }}
          onRefresh={refreshCounts}
          initialStaffId={focusStaffId ?? undefined}
        />
      </Suspense>
    );

  const activeMeta = masters.find(m => m.id === active);
  const ActiveIcon = activeMeta?.icon;
  const listHubTabs = new Set<MasterType>(['vendor', 'customer', 'item', 'bank', 'staff']);
  const showList = Boolean(active && listHubTabs.has(active));
  const partyLabel = cfg.labels.vendors || 'Clients';

  const fabLabel =
    active === 'vendor'
      ? partyLabel.replace(/s$/, '')
      : active === 'customer'
        ? 'Customer'
        : active === 'item'
          ? 'Product'
          : active === 'bank'
            ? 'Bank'
            : active === 'staff'
              ? 'Staff'
              : 'Add';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 sm:space-y-4 pb-14 sm:pb-0"
    >
      {/* Phone hub — Emergent-style: pills + list + FAB */}
      <div className="sm:hidden space-y-3">
        <p className="text-[11px] text-gray-500 px-0.5">
          {serviceMobile ? 'Clients &amp; rates' : 'Catalog &amp; partners'}
        </p>
        <MobilePillTabs
          items={masters.map(m => {
            const Icon = m.icon;
            return {
              id: m.id,
              label: pillLabel(m.id) || m.name,
              icon: m.id === 'vendor' ? <Truck /> : Icon ? <Icon /> : undefined,
            };
          })}
          value={active || ''}
          onChange={id => {
            const next = id as MasterType;
            if (next === 'priceList' || next === 'mapping' || next === 'rewardRules') {
              openFull(next);
              return;
            }
            setHubTab(next);
          }}
        />

        {hubLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : showList && active === 'vendor' ? (
          vendors.length === 0 ? (
            <MobileEmptyState
              icon={<Truck />}
              title={`No ${partyLabel.toLowerCase()} yet`}
              subtitle="Add your first partner to get started"
              actionLabel={`Add ${fabLabel}`}
              onAction={() => openFull('vendor')}
            />
          ) : (
            <div className="space-y-1.5">
              {vendors.map(v => (
                <Fragment key={v.id}>
                  <MobileListRow
                    icon={<Truck className="text-brand" />}
                    title={v.name}
                    subtitle={v.gstNumber ? `GSTIN: ${v.gstNumber}` : v.phone || v.contactPerson || '—'}
                    trailing={
                      typeof v.totalSales === 'number' && v.totalSales > 0
                        ? `₹${v.totalSales.toLocaleString()}`
                        : undefined
                    }
                    meta={typeof v.totalSales === 'number' && v.totalSales > 0 ? 'Sales' : undefined}
                    onClick={() => openFull('vendor', { vendorId: v.id })}
                  />
                </Fragment>
              ))}
            </div>
          )
        ) : showList && active === 'customer' ? (
          customers.length === 0 ? (
            <MobileEmptyState
              icon={<Users />}
              title="No customers yet"
              actionLabel="Add Customer"
              onAction={() => openFull('customer')}
            />
          ) : (
            <div className="space-y-1.5">
              {customers.map(c => (
                <Fragment key={c.id}>
                  <MobileListRow
                    icon={<Users className="text-blue-600" />}
                    title={c.name}
                    subtitle={c.phone || c.email || '—'}
                    onClick={() => openFull('customer')}
                  />
                </Fragment>
              ))}
            </div>
          )
        ) : showList && active === 'item' ? (
          products.length === 0 ? (
            <MobileEmptyState
              icon={<Package />}
              title="No products yet"
              actionLabel="Open Products"
              onAction={() => openFull('item')}
            />
          ) : (
            <div className="space-y-1.5">
              {products.map(p => (
                <Fragment key={p.id}>
                  <MobileListRow
                    icon={<Package className="text-orange-600" />}
                    title={p.name}
                    subtitle={p.hsnCode || p.barcode || `Stock ${p.stock ?? 0}`}
                    trailing={typeof p.price === 'number' ? `₹${p.price.toLocaleString()}` : undefined}
                    onClick={() => openFull('item')}
                  />
                </Fragment>
              ))}
            </div>
          )
        ) : showList && active === 'bank' ? (
          banks.length === 0 ? (
            <MobileEmptyState
              icon={<CreditCard />}
              title="No banks yet"
              actionLabel="Add Bank"
              onAction={() => openFull('bank')}
            />
          ) : (
            <div className="space-y-1.5">
              {banks.map(b => (
                <Fragment key={b.id}>
                  <MobileListRow
                    icon={<CreditCard className="text-emerald-600" />}
                    title={b.name}
                    subtitle={b.bankName || b.accountNumber || '—'}
                    onClick={() => openFull('bank')}
                  />
                </Fragment>
              ))}
            </div>
          )
        ) : showList && active === 'staff' ? (
          staff.length === 0 ? (
            <MobileEmptyState
              icon={<Wallet />}
              title="No staff yet"
              actionLabel="Add Staff"
              onAction={() => openFull('staff')}
            />
          ) : (
            <div className="space-y-1.5">
              {staff.map(s => (
                <Fragment key={s.id}>
                  <MobileListRow
                    icon={<Wallet className="text-indigo-600" />}
                    title={s.name}
                    subtitle={s.role || s.phone || '—'}
                    onClick={() => openFull('staff', { staffId: s.id })}
                  />
                </Fragment>
              ))}
            </div>
          )
        ) : (
          <MobileEmptyState
            icon={ActiveIcon ? <ActiveIcon /> : <ShoppingCart />}
            title={activeMeta?.name || 'Masters'}
            subtitle="Open to manage records"
            actionLabel="Open"
            onAction={() => active && openFull(active)}
          />
        )}

        {showList && <MobileFab label={fabLabel} iconOnly onClick={() => active && openFull(active)} />}
      </div>

      {/* Desktop / tablet cards */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-6">
        {masters.map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleMasterClick(m.id)}
              className="w-full text-left bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={cn('p-4 rounded-2xl transition-transform group-hover:scale-110 shrink-0', m.bg)}>
                    {Icon ? <Icon className={m.color} size={22} /> : null}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg truncate">{m.name}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {typeof m.count === 'number' ? `${m.count} records found` : 'View & manage mapping'}
                    </p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors shrink-0">
                  <Plus size={18} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
