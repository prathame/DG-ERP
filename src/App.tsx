import React, { useState, useEffect, lazy, Suspense } from 'react';
import { api } from './api';
import {
  LayoutDashboard,
  ShieldCheck,
  Gift,
  Package,
  ShoppingCart,
  Settings,
  Menu,
  X,
  RefreshCw,
  LogOut,
  IndianRupee,
  ScanSearch,
  FileText,
  ShoppingBag,
  BarChart3,
  ClipboardList,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Tab, USER_STORAGE_KEY } from './types';
import { ToastProvider, LoadingSpinner } from './components/ui';
import { LanguageProvider, useTranslation } from './i18n';
import { LoginScreen } from './components/layout';
import { LandingPage } from './components/layout/LandingPage';
import { PrivacyPolicy } from './components/layout/PrivacyPolicy';
import { TermsOfService } from './components/layout/TermsOfService';
import { ChatWidget } from './components/layout/ChatWidget';
import { session } from './lib/session';

const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const SalesEntryView = lazy(() => import('./features/sales/SalesEntryView').then(m => ({ default: m.SalesEntryView })));
const DistributionView = lazy(() => import('./features/distribution/DistributionView').then(m => ({ default: m.DistributionView })));
const InventoryView = lazy(() => import('./features/inventory/InventoryView').then(m => ({ default: m.InventoryView })));
const WarrantyView = lazy(() => import('./features/warranty/WarrantyView').then(m => ({ default: m.WarrantyView })));
const ReplacementsView = lazy(() => import('./features/replacements/ReplacementsView').then(m => ({ default: m.ReplacementsView })));
const RewardsView = lazy(() => import('./features/rewards/RewardsView').then(m => ({ default: m.RewardsView })));
const VendorFinanceView = lazy(() => import('./features/finance/VendorFinanceView').then(m => ({ default: m.VendorFinanceView })));
const PurchasesView = lazy(() => import('./features/purchases/PurchasesView').then(m => ({ default: m.PurchasesView })));
const QuotationsView = lazy(() => import('./features/quotations/QuotationsView').then(m => ({ default: m.QuotationsView })));
const OrdersView = lazy(() => import('./features/orders/OrdersView').then(m => ({ default: m.OrdersView })));
const AccountsView = lazy(() => import('./features/accounts/AccountsView').then(m => ({ default: m.AccountsView })));
const SettingsView = lazy(() => import('./features/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const ProductVerificationView = lazy(() => import('./features/verification/ProductVerificationView').then(m => ({ default: m.ProductVerificationView })));
const PayrollView = lazy(() => import('./features/payroll/PayrollView').then(m => ({ default: m.PayrollView })));
const SuperAdminApp = lazy(() => import('./features/super-admin/SuperAdminApp').then(m => ({ default: m.SuperAdminApp })));
const SuperAdminLogin = lazy(() => import('./features/super-admin/SuperAdminLogin').then(m => ({ default: m.SuperAdminLogin })));

function QuotationsAndOrdersView() {
  const [view, setView] = React.useState<'quotations' | 'orders'>('quotations');
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => setView('quotations')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'quotations' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Quotations</button>
        <button type="button" onClick={() => setView('orders')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'orders' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Orders</button>
      </div>
      {view === 'quotations' ? <QuotationsView /> : <OrdersView />}
    </div>
  );
}

const LazyFallback = () => <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;


/** Decode a JWT payload without any library. Returns null on failure. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** Check whether we have a stored JWT and what role it carries. */
function getAuthState(): { isSuperAdmin: boolean; hasTenant: boolean } {
  const token = session.getToken();
  if (!token) return { isSuperAdmin: false, hasTenant: false };
  const payload = decodeJwtPayload(token);
  if (!payload) return { isSuperAdmin: false, hasTenant: false };
  return {
    isSuperAdmin: payload.role === 'super_admin',
    hasTenant: Boolean(payload.tenantId || session.getTenantId()),
  };
}

// Apply saved theme on load
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('dg_erp_theme');
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');
}

export default function App() {
  const [activeTab, setActiveTabRaw] = useState<Tab>('dashboard');
  const [tabKey, setTabKey] = useState(0);
  const setActiveTab = (tab: Tab) => {
    setActiveTabRaw(tab);
    setTabKey(k => k + 1);
    window.history.pushState({ tab }, '', window.location.pathname);
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; vendorId?: string | null; autoWhatsapp?: boolean } | null>(() => {
    try {
      const u = session.getUser();
      if (u?.companyName) document.title = `${u.companyName} — DG ERP`;
      return u;
    } catch { return null; }
  });

  useEffect(() => {
    if (user && session.getToken()) {
      api.settings.getProfile(user.id).then((fresh) => {
        const merged = { ...user, ...fresh };
        session.setUser(merged);
        setUser(merged);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state?.tab) {
        setActiveTabRaw(e.state.tab);
      } else {
        window.history.pushState({ tab: 'dashboard' }, '', window.location.pathname);
        setActiveTabRaw('dashboard');
      }
    };
    window.addEventListener('popstate', onPopState);
    window.history.replaceState({ tab: 'dashboard' }, '', window.location.pathname);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleLogout = () => {
    const slug = session.getSlug();
    session.clearAll();
    setUser(null);
    setUserMenuOpen(false);
    if (slug) window.history.replaceState(null, '', `/${slug}`);
  };

  const handleLogin = (u: { id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; vendorId?: string | null; autoWhatsapp?: boolean }) => {
    setUser(u);
    if (u.companyName) document.title = `${u.companyName} — DG ERP`;
  };

  const { t } = useTranslation();

  const userConfig = user as Record<string, unknown>;
  const tabConfig = (userConfig?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
  const tc = (key: string, fallback: string) => tabConfig[key]?.label || fallback;
  const tv = (key: string) => tabConfig[key]?.visible !== false;

  const allNavItems = [
    { id: 'dashboard', label: tc('dashboard', t('nav.dashboard')), icon: LayoutDashboard, show: true },
    { id: 'sales', label: tc('sales', t('nav.sales')), icon: ShoppingCart, show: tv('sales') },
    { id: 'distribution', label: tc('distribution', t('nav.distribution')), icon: Package, show: tv('distribution') },
    { id: 'inventory', label: tc('inventory', t('nav.inventory')), icon: Package, show: tv('inventory') },
    { id: 'purchases', label: tc('purchases', 'Purchase / Expense'), icon: ShoppingBag, show: tv('purchases') },
    { id: 'verification', label: tc('verification', t('nav.verification')), icon: ScanSearch, show: tv('verification') },
    { id: 'quotations', label: tc('quotations', 'Quotes & Orders'), icon: FileText, show: true },
    { id: 'finance', label: tc('finance', t('nav.finance')), icon: IndianRupee, show: tv('finance') },
    { id: 'warranty', label: tc('warranty', t('nav.warranty')), icon: ShieldCheck, show: tv('warranty') },
    { id: 'replacements', label: tc('replacements', t('nav.replacements')), icon: RefreshCw, show: tv('replacements') },
    { id: 'rewards', label: tc('rewards', t('nav.rewards')), icon: Gift, show: tv('rewards') },
    { id: 'accounts', label: 'Accounts', icon: BarChart3, show: true },
  ];
  const navItems = allNavItems.filter(item => item.show);

  type AccessLevel = 'hidden' | 'view' | 'print' | 'full';
  const getAccess = (tabId: string): AccessLevel => {
    const u = userConfig as Record<string, unknown> | null;
    if (!u) return 'hidden';
    const perms = u.permissions as Record<string, string> | string[] | null;
    // Object format (new): { dashboard: "full", inventory: "view" }
    if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
      const level = perms[tabId] as string;
      if (level === 'full' || level === 'print' || level === 'view' || level === 'hidden') return level;
      return 'hidden';
    }
    // Array format (old): ["dashboard", "distribution"]
    if (Array.isArray(perms)) return perms.includes(tabId) ? 'full' : 'hidden';
    // No permissions — role defaults
    const role = u.role as string ?? '';
    if (['Super Admin', 'Admin'].includes(role)) return 'full';
    if (role === 'Manager') return tabId === 'settings' ? 'view' : 'full';
    if (role === 'Staff') return 'view';
    if (role === 'Vendor') return ['dashboard', 'distribution', 'finance'].includes(tabId) ? 'view' : 'hidden';
    return 'full';
  };
  const canAccess = (tabId: string) => getAccess(tabId) !== 'hidden';
  const visibleNavItems = navItems.filter((item) => canAccess(item.id));

  // Static pages
  const pathname = window.location.pathname;
  if (pathname === '/privacy') return <PrivacyPolicy />;
  if (pathname === '/terms') return <TermsOfService />;

  // Detect slug from URL: /splender, /radhe-krishan, etc. (not /admin, not /)
  const isSuperAdminRoute = pathname.startsWith('/admin');
  const slugMatch = pathname.match(/^\/([a-z0-9][a-z0-9-]*[a-z0-9])(\/.*)?$/i) || pathname.match(/^\/([a-z0-9]+)(\/.*)?$/i);
  const urlSlug = (!isSuperAdminRoute && slugMatch) ? slugMatch[1].toLowerCase() : null;

  // Tenant branding state for slug-based login
  const [tenantBranding, setTenantBranding] = useState<{ tenantId: string; companyName: string; slug: string; logoBase64: string | null; primaryColor: string; tagline: string | null } | null>(null);
  const [slugNotFound, setSlugNotFound] = useState(false);

  useEffect(() => {
    if (urlSlug && !user && urlSlug !== 'admin') {
      api.tenantBySlug(urlSlug)
        .then((t) => { setTenantBranding(t); setSlugNotFound(false); })
        .catch(() => setSlugNotFound(true));
    }
  }, [urlSlug, !user]);

  const authState = getAuthState();

  // /admin route — super admin portal
  if (isSuperAdminRoute) {
    if (authState.isSuperAdmin) {
      const tokenPayload = decodeJwtPayload(session.getToken() || '') || {};
      const superAdminUser = { id: tokenPayload.userId as string || '', email: tokenPayload.email as string || '', name: tokenPayload.name as string || '', role: 'super_admin' as const };
      return (
        <ToastProvider><Suspense fallback={<LazyFallback />}>
          <SuperAdminApp user={superAdminUser} onLogout={() => { handleLogout(); window.location.href = '/admin'; }} />
        </Suspense></ToastProvider>
      );
    }
    return (
      <ToastProvider><Suspense fallback={<LazyFallback />}>
        <SuperAdminLogin onLogin={(u) => { handleLogin(u as Parameters<typeof handleLogin>[0]); window.location.href = '/admin'; }} />
      </Suspense></ToastProvider>
    );
  }

  // Super admin visiting a tenant slug — clear super admin session, show tenant login
  useEffect(() => {
    if (authState.isSuperAdmin && urlSlug) session.clearAll();
  }, [authState.isSuperAdmin, urlSlug]);

  // No user session — show tenant login
  if (!user) {
    // Slug URL but tenant not found
    if (urlSlug && slugNotFound) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#151619] via-[#1A1D21] to-[#151619] flex items-center justify-center p-4">
          <div className="text-center">
            <div className="inline-flex w-16 h-16 bg-gray-700 rounded-2xl items-center justify-center font-bold text-2xl text-gray-400 mb-4">?</div>
            <h1 className="text-xl font-bold text-white mb-2">Company Not Found</h1>
            <p className="text-gray-400 text-sm mb-6">No company registered with URL <span className="font-mono text-gray-300">/{urlSlug}</span></p>
            <a href="/" className="px-6 py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark transition-colors">Go to DG ERP Home</a>
          </div>
        </div>
      );
    }

    // Slug URL — show branded tenant login
    if (urlSlug && tenantBranding) {
      return (
        <ToastProvider>
          <LoginScreen onLogin={handleLogin} tenant={tenantBranding} />
        </ToastProvider>
      );
    }

    // Root URL (/) — show company landing page
    return <LandingPage />;
  }

  return (
    <ToastProvider>
    <div className="flex h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-[#151619] text-white transition-all duration-300 flex flex-col z-50",
          "fixed lg:relative inset-y-0 left-0",
          isSidebarOpen ? "w-64 translate-x-0" : "w-20 -translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center font-bold text-xs">{(user?.companyName || 'DG').substring(0, 2).toUpperCase()}</div>
              <span className="font-bold text-xl tracking-tight">{user?.companyName || 'DG ERP'}</span>
            </motion.div>
          )}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item, idx) => (<React.Fragment key={item.id}>
            {isSidebarOpen && idx > 0 && (
              (item.id === 'purchases' && <div className="pt-2 pb-1"><p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-3">Supply Chain</p></div>) ||
              (item.id === 'finance' && <div className="pt-2 pb-1"><p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-3">Finance & Reports</p></div>) ||
              (item.id === 'warranty' && <div className="pt-2 pb-1"><p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-3">After Sales</p></div>) ||
              null
            )}
            {/* nav item */}
            <button
              key={item.id}
              type="button"
              onClick={() => { setActiveTab(item.id as Tab); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group relative",
                activeTab === item.id
                  ? "bg-brand text-white shadow-lg shadow-brand/20"
                  : "hover:bg-white/5 text-gray-400 hover:text-white"
              )}
            >
              <item.icon size={22} />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
              {!isSidebarOpen && <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">{item.label}</span>}
            </button>
          </React.Fragment>))}
        </nav>

        {canAccess('settings') && (
          <div className="p-4 border-t border-white/5">
            <button type="button" onClick={() => { setActiveTab('settings'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-all", activeTab === 'settings' ? 'bg-brand text-white' : 'hover:bg-white/5 text-gray-400 hover:text-white')}>
              <Settings size={22} />
              {isSidebarOpen && <span className="font-medium">{t('nav.settings')}</span>}
            </button>
          </div>
        )}
        {isSidebarOpen && (
          <div className="px-4 pb-3 text-center">
            <p className="text-[10px] text-gray-600">Powered by <span className="text-gray-400 font-semibold">DG ERP</span></p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Subscription expiry banner */}
        {(() => {
          const subEnd = (userConfig?.subscriptionEndsAt || userConfig?.trialEndsAt) as string | undefined;
          if (!subEnd) return null;
          const days = Math.ceil((new Date(subEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (days > 15) return null;
          const isTrial = !!userConfig?.trialEndsAt && !userConfig?.subscriptionEndsAt;
          return (
            <div className={cn("px-4 py-2 text-center text-sm font-medium", days <= 0 ? "bg-rose-600 text-white" : days <= 7 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>
              {days <= 0
                ? `Your ${isTrial ? 'trial' : 'subscription'} has expired. Contact DG ERP to renew.`
                : `Your ${isTrial ? 'trial' : 'subscription'} expires in ${days} day${days === 1 ? '' : 's'}. Contact DG ERP to renew.`}
            </div>
          );
        })()}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold">{t(`nav.${activeTab}`)}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{(userConfig?.planName as string) || 'Standard'} Plan</span>
            </div>
            <div className="relative flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => setUserMenuOpen((o) => !o)} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-gray-100 transition-colors">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold">{user?.name ?? 'Guest'}</p>
                  <p className="text-xs text-gray-500">{user?.role ?? 'Not signed in'}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand to-[#FFB347] border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-sm">{user?.name?.charAt(0) ?? '?'}</div>
              </button>
              {userMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />}
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div key="user-menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute right-0 top-full mt-2 z-50 w-48 bg-white rounded-xl border border-gray-100 shadow-lg py-1 overflow-hidden">
                    <button type="button" onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 font-medium">
                      <LogOut size={16} />
                      {t('common.logout')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <Suspense fallback={<LazyFallback />}>
          <div key={tabKey}>
          {activeTab === 'dashboard' && <DashboardView user={user} setActiveTab={setActiveTab} />}
          {activeTab === 'sales' && <SalesEntryView user={user} />}
          {activeTab === 'purchases' && <PurchasesView accessLevel={getAccess('purchases')} />}
          {activeTab === 'distribution' && <DistributionView user={user} accessLevel={getAccess('distribution')} businessType={(userConfig?.businessType as string) || 'manufacturer'} />}
          {activeTab === 'warranty' && <WarrantyView user={user} />}
          {activeTab === 'replacements' && <ReplacementsView user={user} />}
          {activeTab === 'rewards' && <RewardsView user={user} />}
          {activeTab === 'inventory' && <InventoryView accessLevel={getAccess('inventory')} />}
          {activeTab === 'verification' && <ProductVerificationView />}
          {activeTab === 'quotations' && <QuotationsAndOrdersView />}
          {activeTab === 'finance' && <VendorFinanceView user={user} accessLevel={getAccess('finance')} />}
          {activeTab === 'accounts' && <AccountsView accessLevel={getAccess('accounts')} businessType={(userConfig?.businessType as string) || 'manufacturer'} />}
          </div>
          {activeTab === 'settings' && <SettingsView user={user} onUserChange={setUser} />}
          </Suspense>
        </div>
      </main>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 lg:hidden safe-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {(() => {
            const priorityIds = user?.role === 'Vendor'
              ? ['dashboard', 'distribution', 'finance', 'inventory', 'settings']
              : ['dashboard', 'distribution', 'inventory', 'finance', 'quotations'];
            const mobileItems = priorityIds.map(id => visibleNavItems.find(n => n.id === id) || navItems.find(n => n.id === id)).filter(Boolean).slice(0, 5);
            return mobileItems;
          })().map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as Tab)}
              className={cn("flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg min-w-[56px] transition-colors", activeTab === item.id ? "text-brand" : "text-gray-400")}
            >
              <item.icon size={20} />
              <span className="text-[9px] font-medium leading-tight">{item.label.split(' ')[0]}</span>
            </button>
          ))}
          {visibleNavItems.length > 5 && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg text-gray-400"
            >
              <Menu size={20} />
              <span className="text-[9px] font-medium leading-tight">More</span>
            </button>
          )}
        </div>
      </nav>
      {tv('chatbot') && <div className="hidden lg:block"><ChatWidget /></div>}
    </div>
    </ToastProvider>
  );
}
