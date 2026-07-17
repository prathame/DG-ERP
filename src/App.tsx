import React, { useState, useEffect, lazy, Suspense } from 'react';
import { api } from './api';
import {
  LayoutDashboard,
  BookUser,
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
  Search,
  ReceiptIndianRupee,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Tab } from './types';
import { ToastProvider, LoadingSpinner, NotificationCenter } from './components/ui';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { useTranslation } from './i18n';
import { AppShutterIntro } from './components/layout/AppShutterIntro';
import { session } from './lib/session';
import { CommandPalette } from './components/ui/CommandPalette';
import { OnlineStatus } from './platforms/desktop/offline';
import {
  isServiceMobileMode,
  loadLicense,
  isLocalProvisioned,
  getLocalSlug,
  getLocalDb,
  ServiceMobileOnboarding,
  startServiceMobileHeartbeat,
} from './platforms/service-mobile';
import { ServiceCloudGate } from './platforms/service-cloud';

const LandingPage = lazy(() => import('./components/layout/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginScreen = lazy(() => import('./components/layout/LoginScreen').then(m => ({ default: m.LoginScreen })));
const PrivacyPolicy = lazy(() => import('./components/layout/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() =>
  import('./components/layout/TermsOfService').then(m => ({ default: m.TermsOfService })),
);
const DownloadPage = lazy(() => import('./components/layout/DownloadPage').then(m => ({ default: m.DownloadPage })));
const ChatWidget = lazy(() => import('./components/layout/ChatWidget').then(m => ({ default: m.ChatWidget })));
const DashboardView = lazy(() =>
  import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })),
);
const SalesEntryView = lazy(() => import('./features/sales/SalesEntryView').then(m => ({ default: m.SalesEntryView })));
const DistributionView = lazy(() =>
  import('./features/distribution/DistributionView').then(m => ({ default: m.DistributionView })),
);
const InventoryView = lazy(() =>
  import('./features/inventory/InventoryView').then(m => ({ default: m.InventoryView })),
);
const WarrantyView = lazy(() => import('./features/warranty/WarrantyView').then(m => ({ default: m.WarrantyView })));
const ReplacementsView = lazy(() =>
  import('./features/replacements/ReplacementsView').then(m => ({ default: m.ReplacementsView })),
);
const RewardsView = lazy(() => import('./features/rewards/RewardsView').then(m => ({ default: m.RewardsView })));
const VendorFinanceView = lazy(() =>
  import('./features/finance/VendorFinanceView').then(m => ({ default: m.VendorFinanceView })),
);
const InvoiceFinanceView = lazy(() =>
  import('./features/finance/InvoiceFinanceView').then(m => ({ default: m.InvoiceFinanceView })),
);
const PurchasesView = lazy(() =>
  import('./features/purchases/PurchasesView').then(m => ({ default: m.PurchasesView })),
);
const QuotationsView = lazy(() =>
  import('./features/quotations/QuotationsView').then(m => ({ default: m.QuotationsView })),
);
const OrdersView = lazy(() => import('./features/orders/OrdersView').then(m => ({ default: m.OrdersView })));
const AccountsView = lazy(() => import('./features/accounts/AccountsView').then(m => ({ default: m.AccountsView })));
const AnalyticsView = lazy(() =>
  import('./features/analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView })),
);
const MastersView = lazy(() => import('./features/masters/MastersView').then(m => ({ default: m.MastersView })));
const SettingsView = lazy(() => import('./features/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const ProductVerificationView = lazy(() =>
  import('./features/verification/ProductVerificationView').then(m => ({ default: m.ProductVerificationView })),
);
const InvoicesView = lazy(() => import('./features/invoices/InvoicesView').then(m => ({ default: m.InvoicesView })));
const SuperAdminApp = lazy(() =>
  import('./features/super-admin/SuperAdminApp').then(m => ({ default: m.SuperAdminApp })),
);
const SuperAdminLogin = lazy(() =>
  import('./features/super-admin/SuperAdminLogin').then(m => ({ default: m.SuperAdminLogin })),
);

function ElectronSlugEntry() {
  const [slug, setSlug] = React.useState('');
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = slug.trim().toLowerCase();
    if (s) window.location.href = `/${s}`;
  };
  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center gap-8 px-4">
      <img
        src="/icons/logo-full.png"
        alt="Dhando"
        className="h-24 w-auto object-contain"
        style={{ filter: 'drop-shadow(0 0 24px rgba(242,125,38,0.4))' }}
      />
      <div className="w-full max-w-sm">
        <p className="text-white/50 text-sm text-center mb-6">Enter your company URL to continue</p>
        <form onSubmit={go} className="flex flex-col gap-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-brand/60 transition-colors">
            <span className="text-white/30 text-sm pl-4 pr-1 shrink-0">dhandho.app/</span>
            <input
              autoFocus
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="your-company"
              className="flex-1 bg-transparent py-3 pr-4 text-white placeholder-white/20 text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!slug.trim()}
            className="w-full py-3 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            Continue →
          </button>
        </form>
      </div>
    </div>
  );
}

function QuotationsAndOrdersView() {
  const [view, setView] = React.useState<'quotations' | 'orders'>('quotations');
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setView('quotations')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'quotations' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Quotations
        </button>
        <button
          type="button"
          onClick={() => setView('orders')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'orders' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Orders
        </button>
      </div>
      {view === 'quotations' ? <QuotationsView /> : <OrdersView />}
    </div>
  );
}

const LazyFallback = () => (
  <div className="flex items-center justify-center py-20">
    <LoadingSpinner size="lg" />
  </div>
);

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

/**
 * Consume one-time super-admin impersonation token from the URL.
 * Stores session, strips the token from the address bar (XSS / leak surface).
 */
function consumeImpersonationToken(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('impersonate_token');
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.userId || !payload?.tenantId) return false;
  session.setToken(token);
  session.setTenantId(String(payload.tenantId));
  const slugMatch = window.location.pathname.match(/^\/([a-z0-9][a-z0-9-]*)/i);
  if (slugMatch) session.setSlug(slugMatch[1].toLowerCase());
  session.setUser({
    id: String(payload.userId),
    email: String(payload.email ?? ''),
    name: String(payload.name ?? ''),
    role: String(payload.role ?? 'Admin'),
    companyName: typeof payload.companyName === 'string' ? payload.companyName : undefined,
    impersonated: Boolean(payload.impersonatedBy),
  });
  params.delete('impersonate_token');
  const qs = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  return true;
}

// Run before first React paint so session is ready for initial useState
consumeImpersonationToken();

// Apply saved theme on load
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('dhandho_theme');
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');
}

export default function App() {
  const serviceMobile = isServiceMobileMode();
  const [smBoot, setSmBoot] = useState<'loading' | 'onboarding' | 'ready'>(() => (serviceMobile ? 'loading' : 'ready'));

  useEffect(() => {
    if (!serviceMobile) return;
    let cancelled = false;
    (async () => {
      try {
        await getLocalDb();
        const lic = loadLicense();
        const provisioned = await isLocalProvisioned();
        if (!cancelled) {
          if (!lic || !provisioned) setSmBoot('onboarding');
          else {
            const slug = await getLocalSlug();
            if (slug) session.setSlug(slug);
            setSmBoot('ready');
            startServiceMobileHeartbeat();
          }
        }
      } catch {
        if (!cancelled) setSmBoot('onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceMobile]);

  const [activeTab, setActiveTabRaw] = useState<Tab>('analytics');
  const [tabKey, setTabKey] = useState(0);
  const setActiveTab = (tab: Tab) => {
    setActiveTabRaw(tab);
    setTabKey(k => k + 1);
    window.history.pushState({ tab }, '', window.location.pathname);
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('dg_nav_collapsed');
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      localStorage.setItem('dg_nav_collapsed', JSON.stringify([...next]));
      return next;
    });
  };
  const [cmdOpen, setCmdOpen] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string;
    phone?: string;
    address?: string;
    role?: string;
    companyName?: string;
    vendorId?: string | null;
    autoWhatsapp?: boolean;
  } | null>(() => {
    try {
      const u = session.getUser();
      if (u?.companyName) document.title = `${u.companyName} — Dhandho`;
      return u;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user && session.getToken()) {
      api.settings
        .getProfile(user.id)
        .then(fresh => {
          const merged = { ...user, ...fresh };
          session.setUser(merged);
          setUser(merged);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state?.tab) {
        setActiveTabRaw(e.state.tab);
      } else {
        window.history.pushState({ tab: 'analytics' }, '', window.location.pathname);
        setActiveTabRaw('analytics');
      }
    };
    window.addEventListener('popstate', onPopState);
    window.history.replaceState({ tab: 'analytics' }, '', window.location.pathname);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = () => {
    const slug = session.getSlug();
    session.clearAll();
    setUser(null);
    setUserMenuOpen(false);
    if (slug) window.history.replaceState(null, '', `/${slug}`);
  };

  const [appShutter, setAppShutter] = useState<string | null>(null);
  const handleLogin = (u: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    address?: string;
    role?: string;
    companyName?: string;
    vendorId?: string | null;
    autoWhatsapp?: boolean;
  }) => {
    setUser(u);
    if (u.companyName) document.title = `${u.companyName} — Dhandho`;
    if (u.companyName) setAppShutter(u.companyName);
  };

  const { t } = useTranslation();

  const userConfig = user as Record<string, unknown>;
  const tabConfig = (userConfig?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
  const tc = (key: string, fallback: string) => tabConfig[key]?.label || fallback;
  const tv = (key: string) => tabConfig[key]?.visible !== false;

  const navSections = [
    {
      label: '',
      items: [
        { id: 'analytics', label: 'Analytics', icon: LayoutDashboard, show: true },
        { id: 'masters', label: 'Masters', icon: BookUser, show: true },
        { id: 'sales', label: tc('sales', t('nav.sales')), icon: ShoppingCart, show: tv('sales') },
        {
          id: 'distribution',
          label: tc('distribution', t('nav.distribution')),
          icon: Package,
          show: tv('distribution'),
        },
        { id: 'inventory', label: tc('inventory', t('nav.inventory')), icon: Package, show: tv('inventory') },
      ],
    },
    {
      label: 'Supply Chain',
      items: [
        { id: 'purchases', label: tc('purchases', 'Purchase / Expense'), icon: ShoppingBag, show: tv('purchases') },
        {
          id: 'verification',
          label: tc('verification', t('nav.verification')),
          icon: ScanSearch,
          show: tv('verification'),
        },
        { id: 'quotations', label: tc('quotations', 'Quotes & Orders'), icon: FileText, show: tv('quotations') },
      ],
    },
    {
      label: 'Finance & Reports',
      items: [
        { id: 'invoices', label: 'Invoices', icon: ReceiptIndianRupee, show: tv('invoices') },
        { id: 'finance', label: tc('finance', t('nav.finance')), icon: IndianRupee, show: tv('finance') },
        { id: 'accounts', label: 'Accounts', icon: BarChart3, show: tv('accounts') },
      ],
    },
    {
      label: 'After Sales',
      items: [
        { id: 'warranty', label: tc('warranty', t('nav.warranty')), icon: ShieldCheck, show: tv('warranty') },
        {
          id: 'replacements',
          label: tc('replacements', t('nav.replacements')),
          icon: RefreshCw,
          show: tv('replacements'),
        },
        { id: 'rewards', label: tc('rewards', t('nav.rewards')), icon: Gift, show: tv('rewards') },
      ],
    },
  ];
  const navItems = navSections.flatMap(s => s.items).filter(i => i.show);

  type AccessLevel = 'hidden' | 'view' | 'print' | 'full';
  const getAccess = (tabId: string): AccessLevel => {
    const u = userConfig as Record<string, unknown> | null;
    if (!u) return 'hidden';
    const perms = u.permissions as Record<string, string> | string[] | null;
    // Object format (new): { analytics: "full", inventory: "view" }
    // Treat legacy "dashboard" permission as "analytics" (nav id)
    if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
      const level = (perms[tabId] ??
        (tabId === 'analytics' ? perms.dashboard : undefined) ??
        (tabId === 'dashboard' ? perms.analytics : undefined)) as string | undefined;
      if (level === 'full' || level === 'print' || level === 'view' || level === 'hidden') return level;
      return 'hidden';
    }
    // Array format (old): ["dashboard", "distribution"] — map dashboard ↔ analytics
    if (Array.isArray(perms)) {
      if (perms.includes(tabId)) return 'full';
      if (tabId === 'analytics' && perms.includes('dashboard')) return 'full';
      if (tabId === 'dashboard' && perms.includes('analytics')) return 'full';
      return 'hidden';
    }
    // No permissions — role defaults
    const role = (u.role as string) ?? '';
    if (['Super Admin', 'Admin'].includes(role)) return 'full';
    if (role === 'Manager') return tabId === 'settings' ? 'view' : 'full';
    if (role === 'Staff') return 'view';
    if (role === 'Vendor')
      return ['analytics', 'dashboard', 'distribution', 'finance'].includes(tabId) ? 'view' : 'hidden';
    // H10 fix: unknown role gets no access (was incorrectly returning 'full')
    return 'hidden';
  };
  const canAccess = (tabId: string) => getAccess(tabId) !== 'hidden';

  useEffect(() => {
    if (!user) return;
    // Normalize legacy dashboard tab → analytics (primary nav id)
    if (activeTab === 'dashboard' && canAccess('analytics')) {
      setActiveTabRaw('analytics');
      return;
    }
    if (!canAccess(activeTab)) {
      const fallback =
        (['analytics', 'distribution', 'finance', 'inventory'] as Tab[]).find(t => canAccess(t)) ?? 'analytics';
      setActiveTabRaw(fallback);
    }
  }, [activeTab, user]);
  const visibleNavItems = navItems.filter(item => canAccess(item.id));

  // C9 fix: all hooks must come before any conditional return.
  // Moved slug/branding state and effects up here, before the /privacy & /terms early returns.
  const pathname = window.location.pathname;
  const isSuperAdminRoute = pathname.startsWith('/admin');
  const slugMatch =
    pathname.match(/^\/([a-z0-9][a-z0-9-]*[a-z0-9])(\/.*)?$/i) || pathname.match(/^\/([a-z0-9]+)(\/.*)?$/i);
  const urlSlug = !isSuperAdminRoute && slugMatch ? slugMatch[1].toLowerCase() : null;

  const [tenantBranding, setTenantBranding] = useState<{
    tenantId: string;
    companyName: string;
    slug: string;
    logoBase64: string | null;
    primaryColor: string;
    tagline: string | null;
  } | null>(null);
  const [slugNotFound, setSlugNotFound] = useState(false);

  useEffect(() => {
    if (urlSlug && !user && urlSlug !== 'admin') {
      api
        .tenantBySlug(urlSlug)
        .then(t => {
          setTenantBranding(t);
          setSlugNotFound(false);
        })
        .catch(() => setSlugNotFound(true));
    }
  }, [urlSlug, !user]);

  const authState = getAuthState();

  useEffect(() => {
    if (authState.isSuperAdmin && urlSlug) session.clearAll();
  }, [authState.isSuperAdmin, urlSlug]);

  // Static pages — now safe to return early (all hooks are above)
  if (pathname === '/privacy')
    return (
      <Suspense fallback={<LazyFallback />}>
        <PrivacyPolicy />
      </Suspense>
    );
  if (pathname === '/terms')
    return (
      <Suspense fallback={<LazyFallback />}>
        <TermsOfService />
      </Suspense>
    );
  if (pathname === '/download')
    return (
      <Suspense fallback={<LazyFallback />}>
        <DownloadPage />
      </Suspense>
    );

  // /admin route — super admin portal
  if (isSuperAdminRoute) {
    if (authState.isSuperAdmin) {
      const tokenPayload = decodeJwtPayload(session.getToken() || '') || {};
      const superAdminUser = {
        id: (tokenPayload.userId as string) || '',
        email: (tokenPayload.email as string) || '',
        name: (tokenPayload.name as string) || '',
        role: 'super_admin' as const,
      };
      return (
        <ToastProvider>
          <Suspense fallback={<LazyFallback />}>
            <SuperAdminApp
              user={superAdminUser}
              onLogout={() => {
                handleLogout();
                window.location.href = '/admin';
              }}
            />
          </Suspense>
        </ToastProvider>
      );
    }
    return (
      <ToastProvider>
        <Suspense fallback={<LazyFallback />}>
          <SuperAdminLogin
            onLogin={u => {
              handleLogin(u as Parameters<typeof handleLogin>[0]);
              window.location.href = '/admin';
            }}
          />
        </Suspense>
      </ToastProvider>
    );
  }

  // Service Mobile Capacitor shell — license + local provision before login
  if (serviceMobile) {
    if (smBoot === 'loading') {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-emerald-50">
          <LoadingSpinner size="lg" />
        </div>
      );
    }
    if (smBoot === 'onboarding') {
      return (
        <ServiceMobileOnboarding
          onReady={() => {
            void getLocalSlug().then(slug => {
              if (slug) {
                session.setSlug(slug);
                window.history.replaceState(null, '', `/${slug}`);
              }
              setSmBoot('ready');
              startServiceMobileHeartbeat();
            });
          }}
        />
      );
    }
  }

  // No user session — show tenant login
  if (!user) {
    // Service Mobile: always local tenant login (no marketing landing)
    if (serviceMobile && smBoot === 'ready') {
      const slug = session.getSlug() || 'service';
      return (
        <ToastProvider>
          <Suspense fallback={<LazyFallback />}>
            <LoginScreen
              onLogin={handleLogin}
              tenant={{
                tenantId: session.getTenantId() || 'local',
                companyName: loadLicense()?.companyName || 'Service Mobile',
                slug,
                logoBase64: null,
                primaryColor: '#059669',
                tagline: 'Offline service',
              }}
            />
          </Suspense>
        </ToastProvider>
      );
    }

    // Slug URL but tenant not found
    if (urlSlug && slugNotFound) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#151619] via-[#1A1D21] to-[#151619] flex items-center justify-center p-4">
          <div className="text-center">
            <div className="inline-flex w-16 h-16 bg-gray-700 rounded-2xl items-center justify-center font-bold text-2xl text-gray-400 mb-4">
              ?
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Company Not Found</h1>
            <p className="text-gray-400 text-sm mb-6">
              No company registered with URL <span className="font-mono text-gray-300">/{urlSlug}</span>
            </p>
            <a
              href="/"
              className="px-6 py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark transition-colors"
            >
              Go to Dhandho Home
            </a>
          </div>
        </div>
      );
    }

    // Slug URL — show branded tenant login
    if (urlSlug && tenantBranding) {
      return (
        <ToastProvider>
          <Suspense fallback={<LazyFallback />}>
            <LoginScreen onLogin={handleLogin} tenant={tenantBranding} />
          </Suspense>
        </ToastProvider>
      );
    }

    // Waiting on tenant branding fetch for /{slug}
    if (urlSlug && !slugNotFound) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-[#151619]">
          <LoadingSpinner size="lg" />
        </div>
      );
    }

    // Root URL (/) — show company landing page (web)
    const isDesktop = new URLSearchParams(window.location.search).get('desktop') === '1';
    if (isDesktop) return <ElectronSlugEntry />;
    return (
      <Suspense fallback={<LazyFallback />}>
        <LandingPage />
      </Suspense>
    );
  }

  const mobileNavIds =
    user?.role === 'Vendor'
      ? ['analytics', 'distribution', 'finance', 'inventory', 'settings']
      : ['analytics', 'masters', 'inventory', 'finance', 'quotations'];
  const mobileNavItems = mobileNavIds
    .map(id => visibleNavItems.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .slice(0, 4);
  const mobileMoreActive = !mobileNavItems.some(i => i.id === activeTab) && activeTab !== 'settings';

  return (
    <ToastProvider>
      <ServiceCloudGate enabled={(userConfig?.businessType as string) === 'service'}>
        {appShutter && <AppShutterIntro companyName={appShutter} onDone={() => setAppShutter(null)} />}
        <div className="app-shell flex h-[100dvh] max-h-[100dvh] bg-[#F8F9FA] text-[#1A1A1A] font-sans overflow-hidden">
          {/* Mobile sidebar backdrop */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-[1px]"
              onClick={() => setIsSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          {/* Sidebar — full-height drawer on phone, rail on desktop */}
          <aside
            className={cn(
              'bg-white border-r border-gray-200 transition-transform duration-300 flex flex-col z-50 shadow-xl lg:shadow-none',
              'fixed lg:relative inset-y-0 left-0',
              isSidebarOpen ? 'w-[min(88vw,20rem)] translate-x-0 lg:w-60' : 'w-16 -translate-x-full lg:translate-x-0',
            )}
          >
            <div className="h-14 lg:h-16 px-4 flex items-center justify-between border-b border-gray-100 pt-[env(safe-area-inset-top)] lg:pt-0">
              {isSidebarOpen && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src="/icons/logo-full.png" alt="Dhando" className="h-8 w-auto object-contain shrink-0" />
                  <span className="font-semibold text-gray-900 text-sm truncate">{user?.companyName}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-500"
                aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
              >
                {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>

            <nav className="flex-1 px-3 py-3 overflow-y-auto">
              {navSections.map(section => {
                const sectionItems = section.items.filter(i => i.show && canAccess(i.id));
                if (!sectionItems.length) return null;
                const isCollapsed = section.label ? collapsedSections.has(section.label) : false;
                const hasActiveChild = sectionItems.some(i => activeTab === i.id);
                return (
                  <div key={section.label || '_top'} className={section.label ? 'mt-3' : ''}>
                    {isSidebarOpen && section.label && (
                      <button
                        type="button"
                        onClick={() => toggleSection(section.label)}
                        className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5 rounded-lg hover:bg-gray-100 transition-colors group"
                      >
                        <span
                          className={cn(
                            'text-[11px] font-bold uppercase tracking-wider',
                            hasActiveChild ? 'text-brand' : 'text-gray-600',
                          )}
                        >
                          {section.label}
                        </span>
                        <ChevronDown
                          size={14}
                          className={cn('text-gray-500 transition-transform', isCollapsed ? '-rotate-90' : '')}
                        />
                      </button>
                    )}
                    {!isSidebarOpen && section.label && <div className="my-2 mx-2 border-t border-gray-100" />}
                    {(!isCollapsed || !isSidebarOpen) && (
                      <div className="space-y-0.5">
                        {sectionItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(item.id as Tab);
                              if (window.innerWidth < 1024) setIsSidebarOpen(false);
                            }}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg transition-all text-[13px] group relative',
                              activeTab === item.id
                                ? 'bg-brand/10 text-brand font-semibold border-l-[3px] border-l-brand pl-[9px]'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                            )}
                          >
                            <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 2} className="shrink-0" />
                            {isSidebarOpen && <span>{item.label}</span>}
                            {!isSidebarOpen && (
                              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                {item.label}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {tv('chatbot') && (
              <div className="px-3 pt-1">
                <Suspense fallback={null}>
                  <ChatWidget />
                </Suspense>
              </div>
            )}
            {canAccess('settings') && (
              <div className="px-3 pb-2 border-t border-gray-100 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('settings');
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px]',
                    activeTab === 'settings'
                      ? 'bg-brand/10 text-brand font-semibold border-l-[3px] border-l-brand pl-[9px]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Settings size={18} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
                  {isSidebarOpen && <span>{t('nav.settings')}</span>}
                </button>
              </div>
            )}
            {((window as unknown as Record<string, unknown>).electronAPI as Record<string, unknown> | undefined)
              ?.deploymentMode === 'onprem' && (
              <div className="px-3 pb-2 border-t border-gray-100 pt-2">
                <OnlineStatus collapsed={!isSidebarOpen} />
              </div>
            )}
            {isSidebarOpen && (
              <div className="px-3 pb-3 text-center">
                <p className="text-[10px] text-gray-400">
                  Powered by <span className="text-gray-500 font-semibold">Dhandho</span>
                </p>
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
                <div
                  className={cn(
                    'px-4 py-2 text-center text-sm font-medium',
                    days <= 0
                      ? 'bg-rose-600 text-white'
                      : days <= 7
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700',
                  )}
                >
                  {days <= 0
                    ? `Your ${isTrial ? 'trial' : 'subscription'} has expired. Contact Dhandho to renew.`
                    : `Your ${isTrial ? 'trial' : 'subscription'} expires in ${days} day${days === 1 ? '' : 's'}. Contact Dhandho to renew.`}
                </div>
              );
            })()}
            <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-3 sm:px-8 py-2.5 sm:py-4 flex items-center justify-between gap-2 app-header-safe">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors lg:hidden shrink-0"
                  aria-label="Open menu"
                >
                  <Menu size={22} />
                </button>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold truncate leading-tight">{t(`nav.${activeTab}`)}</h1>
                  <p className="text-[11px] text-gray-400 truncate sm:hidden">{user?.companyName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setCmdOpen(true)}
                  className="sm:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl text-gray-500"
                  aria-label="Search"
                >
                  <Search size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setCmdOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm text-gray-500"
                >
                  <Search size={15} />
                  <span>Search...</span>
                  <kbd className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-400">
                    ⌘K
                  </kbd>
                </button>
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    {(userConfig?.planName as string) || 'Standard'} Plan
                  </span>
                </div>
                <NotificationCenter
                  onNavigate={tab => {
                    if (canAccess(tab)) setActiveTab(tab as Tab);
                  }}
                  canAccessTab={canAccess}
                />
                <div className="relative flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="flex items-center gap-3 rounded-xl p-1 hover:bg-gray-100 transition-colors"
                    aria-label="Account menu"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    id="account-menu-button"
                  >
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold">{user?.name ?? 'Guest'}</p>
                      <p className="text-xs text-gray-500">{user?.role ?? 'Not signed in'}</p>
                    </div>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-brand to-[#FFB347] border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-sm">
                      {user?.name?.charAt(0) ?? '?'}
                    </div>
                  </button>
                  {userMenuOpen && (
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setUserMenuOpen(false);
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        key="user-menu"
                        role="menu"
                        aria-labelledby="account-menu-button"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute right-0 top-full mt-2 z-50 w-52 bg-white rounded-xl border border-gray-100 shadow-xl py-1 overflow-hidden"
                      >
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>
                        <div className="py-1">
                          {canAccess('settings') && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('settings');
                                setUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Settings size={15} className="text-gray-400" />
                              Settings
                            </button>
                          )}
                        </div>
                        <div className="border-t border-gray-100 py-1">
                          <button
                            type="button"
                            onClick={handleLogout}
                            className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 font-medium"
                          >
                            <LogOut size={15} />
                            {t('common.logout')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </header>

            <div className="app-mobile-content p-3 sm:p-6 lg:p-8 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
              <ErrorBoundary key={tabKey} onReset={() => setTabKey(k => k + 1)}>
                <Suspense fallback={<LazyFallback />}>
                  <div key={tabKey}>
                    {canAccess(activeTab) && activeTab === 'dashboard' && (
                      <DashboardView
                        user={user}
                        setActiveTab={setActiveTab}
                        businessType={(userConfig?.businessType as string) || 'manufacturer'}
                      />
                    )}
                    {canAccess(activeTab) && activeTab === 'masters' && (
                      <MastersView
                        setActiveTab={setActiveTab}
                        user={user}
                        businessType={(userConfig?.businessType as string) || 'manufacturer'}
                      />
                    )}
                    {canAccess(activeTab) && activeTab === 'sales' && <SalesEntryView user={user} />}
                    {canAccess(activeTab) && activeTab === 'purchases' && (
                      <PurchasesView accessLevel={getAccess('purchases')} />
                    )}
                    {canAccess(activeTab) && activeTab === 'distribution' && (
                      <DistributionView
                        user={user}
                        accessLevel={getAccess('distribution')}
                        businessType={(userConfig?.businessType as string) || 'manufacturer'}
                      />
                    )}
                    {canAccess(activeTab) && activeTab === 'warranty' && <WarrantyView user={user} />}
                    {canAccess(activeTab) && activeTab === 'replacements' && <ReplacementsView user={user} />}
                    {canAccess(activeTab) && activeTab === 'rewards' && <RewardsView user={user} />}
                    {canAccess(activeTab) && activeTab === 'inventory' && (
                      <InventoryView accessLevel={getAccess('inventory')} />
                    )}
                    {canAccess(activeTab) && activeTab === 'verification' && <ProductVerificationView />}
                    {canAccess(activeTab) && activeTab === 'quotations' && <QuotationsAndOrdersView />}
                    {canAccess(activeTab) && activeTab === 'invoices' && <InvoicesView />}
                    {canAccess(activeTab) &&
                      activeTab === 'finance' &&
                      ((userConfig?.businessType as string) === 'service' ? (
                        <InvoiceFinanceView accessLevel={getAccess('finance')} />
                      ) : (
                        <VendorFinanceView user={user} accessLevel={getAccess('finance')} />
                      ))}
                    {canAccess(activeTab) && activeTab === 'analytics' && <AnalyticsView setActiveTab={setActiveTab} />}
                    {canAccess(activeTab) && activeTab === 'accounts' && (
                      <AccountsView accessLevel={getAccess('accounts')} />
                    )}
                  </div>
                  {canAccess('settings') && activeTab === 'settings' && (
                    <SettingsView user={user} onUserChange={setUser} />
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
          {/* Mobile bottom nav — primary destinations + More drawer */}
          <nav
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 lg:hidden safe-bottom shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
            aria-label="Primary"
          >
            <div className="flex items-stretch justify-around px-1 pt-1 pb-0.5">
              {mobileNavItems.map(item => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id as Tab)}
                    className={cn(
                      'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl min-h-[52px] transition-colors',
                      active ? 'text-brand' : 'text-gray-400',
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center w-10 h-8 rounded-xl transition-colors',
                        active && 'bg-brand/10',
                      )}
                    >
                      <item.icon size={22} strokeWidth={active ? 2.5 : 2} />
                    </span>
                    <span
                      className={cn(
                        'text-[10px] leading-tight max-w-[4.5rem] truncate',
                        active ? 'font-bold' : 'font-medium',
                      )}
                    >
                      {item.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl min-h-[52px] transition-colors',
                  mobileMoreActive || isSidebarOpen ? 'text-brand' : 'text-gray-400',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-10 h-8 rounded-xl transition-colors',
                    (mobileMoreActive || isSidebarOpen) && 'bg-brand/10',
                  )}
                >
                  <Menu size={22} />
                </span>
                <span
                  className={cn(
                    'text-[10px] leading-tight font-medium',
                    (mobileMoreActive || isSidebarOpen) && 'font-bold',
                  )}
                >
                  More
                </span>
              </button>
            </div>
          </nav>
        </div>
        <AnimatePresence>
          {cmdOpen && (
            <CommandPalette
              items={[
                ...visibleNavItems.map(i => ({ id: i.id, label: i.label, icon: i.icon })),
                ...(canAccess('settings') ? [{ id: 'settings', label: 'Settings', icon: Settings }] : []),
              ]}
              onSelect={id => setActiveTab(id as Tab)}
              onClose={() => setCmdOpen(false)}
            />
          )}
        </AnimatePresence>
      </ServiceCloudGate>
    </ToastProvider>
  );
}
