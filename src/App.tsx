import React, { useState, useEffect } from 'react';
import { api } from './api';
import {
  LayoutDashboard,
  ShieldCheck,
  Gift,
  Package,
  Users,
  ShoppingCart,
  CreditCard,
  Settings,
  Menu,
  X,
  RefreshCw,
  LogOut,
  IndianRupee,
  ScanSearch,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Tab, USER_STORAGE_KEY } from './types';
import { ToastProvider } from './components/ui';
import { LanguageProvider, useTranslation } from './i18n';
import { LoginScreen, GlobalSearchBar, NotificationBell } from './components/layout';
import { LandingPage } from './components/layout/LandingPage';
import { PrivacyPolicy } from './components/layout/PrivacyPolicy';
import { TermsOfService } from './components/layout/TermsOfService';
import { ChatWidget } from './components/layout/ChatWidget';
import { DashboardView } from './features/dashboard/DashboardView';
import { SalesEntryView } from './features/sales/SalesEntryView';
import { DistributionView } from './features/distribution/DistributionView';
import { InventoryView } from './features/inventory/InventoryView';
import { WarrantyView } from './features/warranty/WarrantyView';
import { ReplacementsView } from './features/replacements/ReplacementsView';
import { RewardsView } from './features/rewards/RewardsView';
import { AccountsView } from './features/accounts/AccountsView';
import { VendorFinanceView } from './features/finance/VendorFinanceView';
import { MastersView } from './features/masters/MastersView';
import { SettingsView } from './features/settings/SettingsView';
import { ProductVerificationView } from './features/verification/ProductVerificationView';
import { SuperAdminApp } from './features/super-admin/SuperAdminApp';
import { SuperAdminLogin } from './features/super-admin/SuperAdminLogin';

function SuperAdminLoginWrapper({ onLogin }: { onLogin: (u: Record<string, unknown>) => void }) {
  return (
    <SuperAdminLogin onLogin={(u) => {
      onLogin(u as unknown as Record<string, unknown>);
      window.location.href = '/admin';
    }} />
  );
}

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
  const token = sessionStorage.getItem('auth_token');
  if (!token) return { isSuperAdmin: false, hasTenant: false };
  const payload = decodeJwtPayload(token);
  if (!payload) return { isSuperAdmin: false, hasTenant: false };
  return {
    isSuperAdmin: payload.role === 'super_admin',
    hasTenant: Boolean(payload.tenantId || sessionStorage.getItem('tenant_id')),
  };
}

// Apply saved theme on load
if (typeof window !== 'undefined') {
  const savedTheme = sessionStorage.getItem('dg_erp_theme');
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; vendorId?: string | null; autoWhatsapp?: boolean } | null>(() => {
    try {
      const s = sessionStorage.getItem(USER_STORAGE_KEY);
      const u = s ? JSON.parse(s) : null;
      if (u?.companyName) document.title = `${u.companyName} — DG ERP`;
      return u;
    } catch { return null; }
  });

  const handleLogout = () => {
    const slug = sessionStorage.getItem('tenant_slug');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('tenant_id');
    sessionStorage.removeItem('tenant_slug');
    sessionStorage.removeItem(USER_STORAGE_KEY);
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
  const warrantyEnabled = userConfig?.warrantyEnabled !== false;
  const replacementEnabled = userConfig?.replacementEnabled !== false;
  const rewardsEnabled = userConfig?.rewardsEnabled !== false;
  const financeEnabled = userConfig?.financeEnabled !== false;

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'sales', label: t('nav.sales'), icon: ShoppingCart },
    { id: 'distribution', label: t('nav.distribution'), icon: Package },
    { id: 'masters', label: t('nav.masters'), icon: Users },
    { id: 'inventory', label: t('nav.inventory'), icon: Package },
    { id: 'accounts', label: t('nav.accounts'), icon: CreditCard },
    ...(userConfig?.barcodeSystemEnabled !== false ? [{ id: 'verification', label: t('nav.verification'), icon: ScanSearch }] : []),
    ...(financeEnabled ? [{ id: 'finance', label: t('nav.finance'), icon: IndianRupee }] : []),
    ...(warrantyEnabled ? [{ id: 'warranty', label: t('nav.warranty'), icon: ShieldCheck }] : []),
    ...(replacementEnabled ? [{ id: 'replacements', label: t('nav.replacements'), icon: RefreshCw }] : []),
    ...(rewardsEnabled ? [{ id: 'rewards', label: t('nav.rewards'), icon: Gift }] : []),
  ];

  const canAccess = (tabId: string) => {
    const u = user as { permissions?: string[] | null; role?: string } | null;
    if (!u) return false;
    if (u.permissions && Array.isArray(u.permissions)) {
      if (tabId === 'settings') return u.permissions.includes('settings') || u.permissions.includes('user_management');
      return u.permissions.includes(tabId);
    }
    if (['Super Admin', 'Admin'].includes(u.role ?? '')) return true;
    if (u.role === 'Vendor') return ['dashboard', 'sales', 'distribution', 'warranty', 'replacements', 'rewards', 'masters', 'finance', 'settings'].includes(tabId);
    if (u.role === 'Manager') return ['dashboard', 'sales', 'distribution', 'inventory', 'warranty', 'replacements', 'rewards', 'accounts', 'masters', 'settings'].includes(tabId);
    if (u.role === 'Staff') return ['dashboard', 'sales', 'inventory', 'warranty', 'replacements'].includes(tabId);
    return true;
  };
  const visibleNavItems = navItems.filter((item) => canAccess(item.id));

  // Static pages
  const pathname = window.location.pathname;
  if (pathname === '/privacy') return <PrivacyPolicy />;
  if (pathname === '/terms') return <TermsOfService />;

  // Detect slug from URL: /splender, /radhe-krishan, etc. (not /admin, not /)
  const isSuperAdminRoute = pathname.startsWith('/admin');
  const slugMatch = pathname.match(/^\/([a-z0-9][a-z0-9-]*[a-z0-9])$/i) || pathname.match(/^\/([a-z0-9]+)$/i);
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
      const tokenPayload = decodeJwtPayload(sessionStorage.getItem('auth_token') || '') || {};
      const superAdminUser = { id: tokenPayload.userId as string || '', email: tokenPayload.email as string || '', name: tokenPayload.name as string || '', role: 'super_admin' as const };
      return (
        <ToastProvider>
          <SuperAdminApp user={superAdminUser} onLogout={() => { handleLogout(); window.location.href = '/admin'; }} />
        </ToastProvider>
      );
    }
    return (
      <ToastProvider>
        <SuperAdminLoginWrapper onLogin={handleLogin} />
      </ToastProvider>
    );
  }

  // Already logged in as super admin but on tenant route — redirect
  if (authState.isSuperAdmin && !isSuperAdminRoute) {
    window.location.href = '/admin';
    return null;
  }

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
            <a href="/" className="px-6 py-3 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#D96A1C] transition-colors">Go to DG ERP Home</a>
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
              <div className="w-8 h-8 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-xs">{(user?.companyName || 'DG').substring(0, 2).toUpperCase()}</div>
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

        <nav className="flex-1 px-4 py-4 space-y-2">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setActiveTab(item.id as Tab); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
                activeTab === item.id
                  ? "bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20"
                  : "hover:bg-white/5 text-gray-400 hover:text-white"
              )}
            >
              <item.icon size={22} />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {canAccess('settings') && (
          <div className="p-4 border-t border-white/5">
            <button type="button" onClick={() => { setActiveTab('settings'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-all", activeTab === 'settings' ? 'bg-[#F27D26] text-white' : 'hover:bg-white/5 text-gray-400 hover:text-white')}>
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
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Premium Plan</span>
            </div>
            <GlobalSearchBar setActiveTab={setActiveTab} />
            <NotificationBell />
            <div className="relative flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => setUserMenuOpen((o) => !o)} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-gray-100 transition-colors">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold">{user?.name ?? 'Guest'}</p>
                  <p className="text-xs text-gray-500">{user?.role ?? 'Not signed in'}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#F27D26] to-[#FFB347] border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-sm">{user?.name?.charAt(0) ?? '?'}</div>
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

        <div className="p-4 sm:p-6 lg:p-8">
          {activeTab === 'dashboard' && <DashboardView user={user} setActiveTab={setActiveTab} />}
          {activeTab === 'sales' && <SalesEntryView user={user} />}
          {activeTab === 'distribution' && <DistributionView user={user} />}
          {activeTab === 'warranty' && <WarrantyView user={user} />}
          {activeTab === 'replacements' && <ReplacementsView user={user} />}
          {activeTab === 'rewards' && <RewardsView user={user} />}
          {activeTab === 'inventory' && <InventoryView />}
          {activeTab === 'accounts' && <AccountsView />}
          {activeTab === 'masters' && <MastersView setActiveTab={setActiveTab} user={user} />}
          {activeTab === 'verification' && <ProductVerificationView />}
          {activeTab === 'finance' && <VendorFinanceView user={user} />}
          {activeTab === 'settings' && <SettingsView user={user} onUserChange={setUser} />}
        </div>
      </main>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 lg:hidden safe-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {visibleNavItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as Tab)}
              className={cn("flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg min-w-[56px] transition-colors", activeTab === item.id ? "text-[#F27D26]" : "text-gray-400")}
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
      {userConfig?.chatbotEnabled !== false && <ChatWidget />}
    </div>
    </ToastProvider>
  );
}
