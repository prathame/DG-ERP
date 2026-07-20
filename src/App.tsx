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
import { cn } from './lib/utils';
import { Tab } from './types';
import { ToastProvider, LoadingSpinner, NotificationCenter } from './components/ui';
import { BrandMark } from './components/ui/BrandMark';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { useTranslation } from './i18n';
import { session } from './lib/session';
import { resolveTabAccess, type AccessLevel } from './lib/tabAccess';
import type { GlobalSearchNavigate } from './lib/globalSearch';
import type { MasterType } from './features/masters/MastersView';
import { OnlineStatus } from './platforms/desktop/offline';
import { isServiceMobileMode } from './platforms/service-mobile/mode';
import { loadLicense } from './platforms/service-mobile/licenseStore';
import { getAccountsTabVisiblePref } from './platforms/service-mobile/tabPrefs';
import {
  ServiceCloudGate,
  ServiceCloudLiveBadge,
  isServiceCloudDesktop,
  isServiceCloudMobile,
  isServicePhoneUx,
} from './platforms/service-cloud';
import {
  getPhoneMode,
  hydratePhoneMode,
  isBakedServiceMobile,
  needsPhoneModePicker,
  setPhoneModeOnce,
  type PhoneMode,
} from './platforms/mobileMode';
import { PhoneModePicker } from './platforms/PhoneModePicker';
import { bugReportFeedbackMessage, shareBugReport } from './lib/bugReport';
import { isMobileAppShell } from './lib/mobileAppShell';

const AppShutterIntro = lazy(() =>
  import('./components/layout/AppShutterIntro').then(m => ({ default: m.AppShutterIntro })),
);
const CommandPalette = lazy(() => import('./components/ui/CommandPalette').then(m => ({ default: m.CommandPalette })));

const ServiceMobileOnboarding = lazy(() =>
  import('./platforms/service-mobile/ServiceMobileOnboarding').then(m => ({
    default: m.ServiceMobileOnboarding,
  })),
);

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

/** Cloud Electron + Online Cap: company slug → /{slug} login (not marketing LandingPage). */
function CompanySlugEntry() {
  const [slug, setSlug] = React.useState(() => {
    try {
      return String(localStorage.getItem('dg_last_slug') || '')
        .trim()
        .toLowerCase();
    } catch {
      return '';
    }
  });
  const [sharingReport, setSharingReport] = React.useState(false);
  const [reportHint, setReportHint] = React.useState('');
  const mobileApp = isMobileAppShell();

  React.useEffect(() => {
    // Returning users: skip the form when we already know the company
    try {
      const last = String(localStorage.getItem('dg_last_slug') || '')
        .trim()
        .toLowerCase();
      if (last && window.location.pathname === '/') {
        window.location.replace(`/${last}`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = slug.trim().toLowerCase().replace(/^\/+/, '');
    if (s) window.location.href = `/${s}`;
  };
  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center gap-8 px-4">
      <BrandMark
        relative={mobileApp}
        alt="Dhandho"
        className="h-24 w-24 object-contain rounded-3xl"
        style={{ filter: 'drop-shadow(0 0 24px rgba(242,125,38,0.4))' }}
      />
      <div className="w-full max-w-sm">
        <p className="text-white/50 text-sm text-center mb-2">Enter your company to continue</p>
        <p className="text-white/30 text-xs text-center mb-6">Use the company URL slug (same as dhandho.app/…)</p>
        <form onSubmit={go} className="flex flex-col gap-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-brand/60 transition-colors">
            <span className="text-white/30 text-sm pl-4 pr-1 shrink-0">dhandho.app/</span>
            <input
              autoFocus
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="your-company"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
        {reportHint && <p className="mt-3 text-center text-xs text-emerald-400/90">{reportHint}</p>}
        {mobileApp && (
          <button
            type="button"
            disabled={sharingReport}
            onClick={() => {
              void (async () => {
                setSharingReport(true);
                setReportHint('');
                try {
                  const how = await shareBugReport({ note: 'Online Cap company slug entry' });
                  setReportHint(bugReportFeedbackMessage(how));
                } catch (e) {
                  setReportHint(e instanceof Error ? e.message : 'Could not create bug report');
                } finally {
                  setSharingReport(false);
                }
              })();
            }}
            className="w-full mt-4 py-2.5 text-xs text-gray-500 hover:text-white border border-white/10 rounded-xl transition-colors disabled:opacity-50"
          >
            {sharingReport ? 'Preparing report…' : 'Share bug report'}
          </button>
        )}
      </div>
    </div>
  );
}

function cloudSlugHomeHref(): string {
  return isServiceCloudDesktop() ? '/?desktop=1' : '/';
}

function QuotationsAndOrdersView() {
  const [view, setView] = React.useState<'quotations' | 'orders'>('quotations');
  return (
    <div className="space-y-2 sm:space-y-4">
      {/* Compact Quotes | Orders segment — opt out of 44px bg-brand / phone min-heights */}
      <div
        className="inline-flex w-full sm:w-auto p-0.5 rounded-full border border-gray-200 bg-gray-100/80"
        role="tablist"
        aria-label="Quotations or Orders"
      >
        {(
          [
            { id: 'quotations' as const, label: 'Quotes' },
            { id: 'orders' as const, label: 'Orders' },
          ] as const
        ).map(tab => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(tab.id)}
              className={`dg-pill-tab dg-compact flex-1 sm:flex-none box-border h-8 min-h-8 max-h-8 !min-h-8 px-4 rounded-full text-[11px] font-bold border border-solid transition-colors ${
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-transparent text-gray-600 border-transparent hover:bg-white/80'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
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
  /** Unified Cap: resolve one-time Online/Offline latch before any stack boots. */
  const [phoneGate, setPhoneGate] = useState<'loading' | 'picker' | 'ready'>(() => {
    if (isBakedServiceMobile()) return 'ready';
    if (needsPhoneModePicker()) return 'loading';
    return 'ready';
  });
  const [, setPhoneModeTick] = useState(0);
  const serviceMobile = isServiceMobileMode();
  const [smBoot, setSmBoot] = useState<'loading' | 'onboarding' | 'ready'>(() => (serviceMobile ? 'loading' : 'ready'));
  const [smOnlineAdapter, setSmOnlineAdapter] = useState<
    import('./platforms/desktop/offline/OnlineStatus').OnlineStatusAdapter | undefined
  >(undefined);

  useEffect(() => {
    if (isBakedServiceMobile()) {
      setPhoneGate('ready');
      return;
    }
    let cancelled = false;
    (async () => {
      await hydratePhoneMode();
      if (cancelled) return;
      if (getPhoneMode() == null) {
        // Upgrade path: existing Offline license → lock offline, skip picker
        const lic = loadLicense();
        if (lic) {
          setPhoneModeOnce('offline');
          setPhoneModeTick(t => t + 1);
          setPhoneGate('ready');
          return;
        }
        if (needsPhoneModePicker()) {
          setPhoneGate('picker');
          return;
        }
      }
      setPhoneGate('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phoneGate !== 'ready' || !serviceMobile) {
      if (phoneGate === 'ready' && !serviceMobile) setSmBoot('ready');
      return;
    }
    let cancelled = false;
    setSmBoot('loading');
    (async () => {
      try {
        const { getLocalDb } = await import('./platforms/service-mobile/local/db');
        const { isLocalProvisioned, getLocalSlug } = await import('./platforms/service-mobile/local/provision');
        const { startServiceMobileHeartbeat } = await import('./platforms/service-mobile/sync');
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
  }, [phoneGate, serviceMobile]);

  useEffect(() => {
    if (!serviceMobile) {
      setSmOnlineAdapter(undefined);
      return;
    }
    let cancelled = false;
    void import('./platforms/service-mobile/serviceMobileOnlineStatusAdapter').then(m => {
      if (!cancelled) setSmOnlineAdapter(() => m.serviceMobileOnlineStatusAdapter);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceMobile]);

  const [activeTab, setActiveTabRaw] = useState<Tab>('analytics');
  const [tabKey, setTabKey] = useState(0);
  /** Deep-link payload for Masters when picking a global search hit. */
  const [mastersLaunch, setMastersLaunch] = useState<{
    master?: MasterType;
    vendorId?: string;
    staffId?: string;
    staffName?: string;
  } | null>(null);
  const setActiveTab = (tab: Tab) => {
    setActiveTabRaw(tab);
    setTabKey(k => k + 1);
    window.history.pushState({ tab }, '', window.location.pathname);
  };
  const navigateFromGlobalSearch = (nav: GlobalSearchNavigate) => {
    if (nav.tab === 'masters' && nav.master) {
      setMastersLaunch({
        master: nav.master as MasterType,
        vendorId: nav.vendorId,
        staffName: nav.staffName,
      });
    } else {
      setMastersLaunch(null);
    }
    setActiveTab(nav.tab);
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
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
    businessType?: string;
    tabConfig?: Record<string, { label: string; visible: boolean }> | null;
  } | null>(() => {
    try {
      const u = session.getUser() as
        | (Record<string, unknown> & {
            id: string;
            email: string;
            name: string;
            companyName?: string;
          })
        | null;
      if (!u) return null;
      if (u.companyName) document.title = `${u.companyName} — Dhandho`;
      // Offline Mobile sessions created before businessType was persisted defaulted Finance to manufacturer.
      if (serviceMobile && !u.businessType) {
        return { ...u, businessType: 'service' } as typeof u;
      }
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
    businessType?: string;
    tabConfig?: Record<string, { label: string; visible: boolean }> | null;
  }) => {
    setUser(u);
    if (u.companyName) document.title = `${u.companyName} — Dhandho`;
    if (u.companyName) setAppShutter(u.companyName);
  };

  const { t } = useTranslation();

  const userConfig = user as Record<string, unknown>;
  const tabConfig = (userConfig?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
  const tc = (key: string, fallback: string) => tabConfig[key]?.label || fallback;
  /** Tenant tabConfig, plus Offline Mobile Settings override for Accounts. */
  const tv = (key: string) => {
    if (tabConfig[key]?.visible === false) return false;
    if (key === 'accounts' && serviceMobile) return getAccountsTabVisiblePref();
    return true;
  };

  const navSections = [
    {
      label: '',
      items: [
        { id: 'analytics', label: tc('analytics', t('nav.analytics')), icon: LayoutDashboard, show: true },
        { id: 'masters', label: tc('masters', t('nav.masters')), icon: BookUser, show: true },
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
      label: t('navSections.supplyChain'),
      items: [
        {
          id: 'purchases',
          label: tc('purchases', t('nav.purchaseExpense')),
          icon: ShoppingBag,
          show: tv('purchases'),
        },
        {
          id: 'verification',
          label: tc('verification', t('nav.verification')),
          icon: ScanSearch,
          show: tv('verification'),
        },
        {
          id: 'quotations',
          label: tc('quotations', t('nav.quotesOrders')),
          icon: FileText,
          show: tv('quotations'),
        },
      ],
    },
    {
      label: t('navSections.financeReports'),
      items: [
        { id: 'invoices', label: tc('invoices', t('nav.invoices')), icon: ReceiptIndianRupee, show: tv('invoices') },
        { id: 'finance', label: tc('finance', t('nav.finance')), icon: IndianRupee, show: tv('finance') },
        { id: 'accounts', label: tc('accounts', t('nav.accounts')), icon: BarChart3, show: tv('accounts') },
      ],
    },
    {
      label: t('navSections.afterSales'),
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

  const getAccess = (tabId: string): AccessLevel =>
    resolveTabAccess(tabId, userConfig as { permissions?: unknown; role?: string } | null);
  const canAccess = (tabId: string) => getAccess(tabId) !== 'hidden';

  useEffect(() => {
    if (!user) return;
    // Normalize legacy dashboard tab → analytics (primary nav id)
    if (activeTab === 'dashboard' && canAccess('analytics')) {
      setActiveTabRaw('analytics');
      return;
    }
    const tabHidden = activeTab !== 'settings' && !tv(activeTab);
    if (!canAccess(activeTab) || tabHidden) {
      const fallback =
        (['analytics', 'distribution', 'finance', 'inventory'] as Tab[]).find(t => canAccess(t) && tv(t)) ??
        'analytics';
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

  // Unified Cap: one-time Online/Offline latch before either stack boots
  if (phoneGate === 'loading') {
    return (
      <div
        className="min-h-[100dvh] flex items-center justify-center bg-[#0c0f12]"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
      >
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (phoneGate === 'picker') {
    return (
      <PhoneModePicker
        onChosen={(_mode: PhoneMode) => {
          setPhoneModeTick(t => t + 1);
          setPhoneGate('ready');
        }}
      />
    );
  }

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
        <div
          className="min-h-[100dvh] flex items-center justify-center bg-emerald-50"
          style={{
            paddingTop: 'var(--safe-top)',
            paddingBottom: 'var(--safe-bottom)',
          }}
        >
          <LoadingSpinner size="lg" />
        </div>
      );
    }
    if (smBoot === 'onboarding') {
      return (
        <Suspense fallback={<LazyFallback />}>
          <ServiceMobileOnboarding
            onReady={() => {
              void (async () => {
                const { getLocalSlug } = await import('./platforms/service-mobile/local/provision');
                const { startServiceMobileHeartbeat } = await import('./platforms/service-mobile/sync');
                const slug = await getLocalSlug();
                if (slug) {
                  session.setSlug(slug);
                  window.history.replaceState(null, '', `/${slug}`);
                }
                setSmBoot('ready');
                startServiceMobileHeartbeat();
              })();
            }}
          />
        </Suspense>
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
              href={isServiceCloudDesktop() || isServiceCloudMobile() ? cloudSlugHomeHref() : '/'}
              className="px-6 py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark transition-colors"
            >
              {isServiceCloudDesktop() || isServiceCloudMobile() ? 'Choose company' : 'Go to Dhandho Home'}
            </a>
          </div>
        </div>
      );
    }

    // Slug URL — show branded tenant login
    if (urlSlug && tenantBranding) {
      const changeCompany =
        isServiceCloudDesktop() || isServiceCloudMobile()
          ? () => {
              try {
                localStorage.removeItem('dg_last_slug');
              } catch {
                /* ignore */
              }
              window.location.href = cloudSlugHomeHref();
            }
          : undefined;
      return (
        <ToastProvider>
          <Suspense fallback={<LazyFallback />}>
            <LoginScreen onLogin={handleLogin} tenant={tenantBranding} onChangeCompany={changeCompany} />
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

    // Cloud Electron + Online Cap: company slug entry → /{slug} login (not marketing LandingPage)
    if (isServiceCloudDesktop() || isServiceCloudMobile()) {
      return <CompanySlugEntry />;
    }

    // Public web: marketing landing
    return (
      <Suspense fallback={<LazyFallback />}>
        <LandingPage />
      </Suspense>
    );
  }

  /** Emergent phone IA: Offline Mobile + online Service Cloud Capacitor (not manufacturer cloud). */
  const servicePhoneUx = isServicePhoneUx(userConfig?.businessType as string | undefined);
  const mobileNavIds = servicePhoneUx
    ? user?.role === 'Vendor'
      ? ['analytics', 'distribution', 'finance', 'inventory']
      : ['analytics', 'masters', 'invoices', 'quotations']
    : user?.role === 'Vendor'
      ? ['analytics', 'distribution', 'finance', 'inventory', 'settings']
      : ['analytics', 'masters', 'inventory', 'finance', 'quotations'];
  const mobileNavLabel: Record<string, string> = {
    analytics: t('nav.analytics'),
    masters: t('nav.masters'),
    invoices: t('nav.invoiceShort'),
    quotations: t('nav.quotesShort'),
    distribution: t('nav.dispatch'),
    finance: t('nav.finance'),
    inventory: t('nav.stock'),
  };
  const mobileNavItems = mobileNavIds
    .map(id => visibleNavItems.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .slice(0, 4);
  const mobileMoreActive = !mobileNavItems.some(i => i.id === activeTab) && activeTab !== 'settings';

  return (
    <ToastProvider>
      <ServiceCloudGate enabled={(userConfig?.businessType as string) === 'service'}>
        {appShutter && (
          <Suspense fallback={null}>
            <AppShutterIntro companyName={appShutter} onDone={() => setAppShutter(null)} />
          </Suspense>
        )}
        <div className="app-shell flex h-[100dvh] max-h-[100dvh] bg-[#F8F9FA] text-[#1A1A1A] font-sans overflow-hidden">
          {/* Mobile sidebar backdrop */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-[1px] dg-fade-enter"
              onClick={() => setIsSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          {/* Sidebar — full-height drawer on phone, rail on desktop */}
          <aside
            className={cn(
              'bg-white border-r border-gray-200 transition-transform duration-300 flex flex-col z-50 shadow-xl lg:shadow-none',
              'fixed lg:relative inset-y-0 left-0 h-[100dvh] max-h-[100dvh]',
              isSidebarOpen ? 'w-[min(70vw,15rem)] translate-x-0 lg:w-60' : 'w-16 -translate-x-full lg:translate-x-0',
            )}
          >
            {/* Sticky brand / profile */}
            <div className="shrink-0 px-3 lg:px-4 flex items-center justify-between gap-2 border-b border-gray-100 pt-[max(0.5rem,var(--safe-top))] pb-2 lg:h-16 lg:pt-0 lg:pb-0">
              {isSidebarOpen && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="lg:hidden w-9 h-9 rounded-full bg-gradient-to-tr from-brand to-[#FFB347] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {user?.name?.charAt(0) ?? '?'}
                  </div>
                  <BrandMark
                    relative={isMobileAppShell()}
                    alt="Dhandho"
                    className="hidden lg:block h-8 w-8 object-contain shrink-0 rounded-lg"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-xs lg:text-sm truncate leading-tight">
                      {user?.companyName}
                    </p>
                    {user?.name ? (
                      <p className="text-[10px] text-gray-400 truncate leading-tight lg:hidden">{user.name}</p>
                    ) : null}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-500 shrink-0"
                aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
              >
                {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>

            {/* Scrollable menu */}
            <nav className="flex-1 min-h-0 px-2.5 lg:px-3 py-2 lg:py-3 overflow-y-auto overscroll-contain">
              {navSections.map(section => {
                const sectionItems = section.items.filter(i => i.show && canAccess(i.id));
                if (!sectionItems.length) return null;
                const isCollapsed = section.label ? collapsedSections.has(section.label) : false;
                const hasActiveChild = sectionItems.some(i => activeTab === i.id);
                return (
                  <div key={section.label || '_top'} className={section.label ? 'mt-2 first:mt-0' : ''}>
                    {isSidebarOpen && section.label && (
                      <button
                        type="button"
                        onClick={() => toggleSection(section.label)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 mb-0.5 rounded-lg hover:bg-gray-50 transition-colors min-h-9"
                      >
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-wider',
                            hasActiveChild ? 'text-brand' : 'text-gray-500',
                          )}
                        >
                          {section.label}
                        </span>
                        <ChevronDown
                          size={14}
                          className={cn('text-gray-400 transition-transform', isCollapsed ? '-rotate-90' : '')}
                        />
                      </button>
                    )}
                    {!isSidebarOpen && section.label && <div className="my-1.5 mx-2 border-t border-gray-100" />}
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
                              'w-full flex items-center gap-2.5 px-2.5 lg:px-3 py-2 min-h-[44px] rounded-lg transition-all text-[13px] group relative',
                              activeTab === item.id
                                ? 'bg-brand/10 text-brand font-semibold border-l-[3px] border-l-brand pl-[7px]'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                            )}
                          >
                            <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 2} className="shrink-0" />
                            {isSidebarOpen && <span className="truncate">{item.label}</span>}
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

            {/* Pinned footer: chatbot (cloud), settings, status */}
            <div className="shrink-0 border-t border-gray-100 bg-white pb-[max(0.5rem,var(--safe-bottom))] lg:pb-2">
              {!serviceMobile && tv('chatbot') && (
                <div className="px-3 pt-2">
                  <Suspense fallback={null}>
                    <ChatWidget />
                  </Suspense>
                </div>
              )}
              {/* Sync: on-prem desktop + Offline Mobile only — never Cloud Electron chrome changes */}
              {(serviceMobile ||
                ((window as unknown as Record<string, unknown>).electronAPI as Record<string, unknown> | undefined)
                  ?.deploymentMode === 'onprem') && (
                <div className="px-2.5 lg:px-3 pt-2">
                  <OnlineStatus collapsed={!isSidebarOpen} adapter={serviceMobile ? smOnlineAdapter : undefined} />
                </div>
              )}
              {/* Online Cap only — Live chip (no Sync); desktop Electron UI untouched */}
              {isServiceCloudMobile() && (userConfig?.businessType as string) === 'service' && (
                <div className="px-2.5 lg:px-3 pt-2">
                  <ServiceCloudLiveBadge collapsed={!isSidebarOpen} />
                </div>
              )}
              {canAccess('settings') && (
                <div className="px-2.5 lg:px-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('settings');
                      if (window.innerWidth < 1024) setIsSidebarOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 lg:px-3 py-2 min-h-[44px] rounded-lg transition-all text-[13px]',
                      activeTab === 'settings'
                        ? 'bg-brand/10 text-brand font-semibold border-l-[3px] border-l-brand pl-[7px]'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    )}
                  >
                    <Settings size={18} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
                    {isSidebarOpen && <span>{t('nav.settings')}</span>}
                  </button>
                </div>
              )}
              {isSidebarOpen && (
                <div className="px-3 pt-2 pb-1 text-center">
                  <p className="text-[10px] text-gray-400">{t('common.poweredBy')}</p>
                </div>
              )}
            </div>
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
            <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-3 sm:px-8 pb-2.5 sm:pb-4 flex items-center justify-between gap-2 app-header-safe">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors lg:hidden shrink-0"
                  aria-label="Open menu"
                >
                  <Menu size={20} />
                </button>
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-2xl font-bold truncate leading-tight tracking-tight">
                    {t(`nav.${activeTab}`)}
                  </h1>
                  <p className="text-[9px] text-gray-400 truncate sm:hidden leading-tight mt-0.5">
                    {user?.companyName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setCmdOpen(true)}
                  className="sm:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-500"
                  aria-label="Search"
                >
                  <Search size={18} />
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
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-brand to-[#FFB347] border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-xs sm:text-sm">
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
                  {userMenuOpen && (
                    <div
                      key="user-menu"
                      role="menu"
                      aria-labelledby="account-menu-button"
                      className="dg-menu-enter absolute right-0 top-full mt-2 z-50 w-52 bg-white rounded-xl border border-gray-100 shadow-xl py-1 overflow-hidden"
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
                            {t('nav.settings')}
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
                    </div>
                  )}
                </div>
              </div>
            </header>

            <div className="app-mobile-content p-3 sm:p-4 lg:p-8">
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
                        launch={mastersLaunch}
                        onLaunchConsumed={() => setMastersLaunch(null)}
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
                      // Offline Mobile is always service; also honor businessType so Finance never opens Vendor Finance offline
                      (servicePhoneUx || (userConfig?.businessType as string) === 'service' ? (
                        <InvoiceFinanceView accessLevel={getAccess('finance')} />
                      ) : (
                        <VendorFinanceView user={user} accessLevel={getAccess('finance')} />
                      ))}
                    {canAccess(activeTab) && activeTab === 'analytics' && <AnalyticsView setActiveTab={setActiveTab} />}
                    {canAccess(activeTab) && tv('accounts') && activeTab === 'accounts' && (
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
            className="app-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 lg:hidden safe-bottom shadow-[0_-2px_16px_rgba(0,0,0,0.05)]"
            aria-label="Primary"
          >
            <div className="flex items-stretch justify-around px-0.5 pt-0.5 pb-0">
              {mobileNavItems.map(item => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id as Tab)}
                    className={cn(
                      'flex flex-1 flex-col items-center justify-center gap-0 py-1 px-0.5 rounded-lg min-h-[42px] transition-colors',
                      active ? 'text-brand' : 'text-gray-400',
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center w-8 h-6 rounded-md transition-colors',
                        active && 'bg-brand/10',
                      )}
                    >
                      <item.icon size={17} strokeWidth={active ? 2.5 : 2} />
                    </span>
                    <span
                      className={cn(
                        'text-[9px] leading-tight max-w-[4.5rem] truncate',
                        active ? 'font-bold' : 'font-medium',
                      )}
                    >
                      {mobileNavLabel[item.id] || item.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0 py-1 px-0.5 rounded-lg min-h-[42px] transition-colors',
                  mobileMoreActive || isSidebarOpen ? 'text-brand' : 'text-gray-400',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-8 h-6 rounded-md transition-colors',
                    (mobileMoreActive || isSidebarOpen) && 'bg-brand/10',
                  )}
                >
                  <Menu size={17} />
                </span>
                <span
                  className={cn(
                    'text-[9px] leading-tight font-medium',
                    (mobileMoreActive || isSidebarOpen) && 'font-bold',
                  )}
                >
                  {t('nav.more')}
                </span>
              </button>
            </div>
          </nav>
        </div>
        {cmdOpen && (
          <Suspense fallback={null}>
            <CommandPalette
              items={[
                ...visibleNavItems.map(i => ({ id: i.id, label: i.label, icon: i.icon })),
                ...(canAccess('settings') ? [{ id: 'settings', label: t('nav.settings'), icon: Settings }] : []),
              ]}
              onSelect={id => setActiveTab(id as Tab)}
              onNavigateEntity={navigateFromGlobalSearch}
              onClose={() => setCmdOpen(false)}
              inventoryVisible={tv('inventory')}
              distributionVisible={tv('distribution')}
              serviceMobile={servicePhoneUx}
            />
          </Suspense>
        )}
      </ServiceCloudGate>
    </ToastProvider>
  );
}
