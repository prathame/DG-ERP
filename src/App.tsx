import React, { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import {
  ShellDropdownPortal,
  shellDropdownAnchor,
  type ShellDropdownAnchor,
} from './components/layout/ShellDropdownPortal';
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
  FileUp,
  ShoppingBag,
  BarChart3,
  Search,
  ReceiptIndianRupee,
  ChevronDown,
  UtensilsCrossed,
  ConciergeBell,
  ChefHat,
  ListOrdered,
  BookOpen,
  IdCard,
  type LucideIcon,
} from 'lucide-react';
import { cn } from './lib/utils';
import { Tab } from './types';
import { ToastProvider, LoadingSpinner, NotificationCenter } from './components/ui';
import { BrandMark } from './components/ui/BrandMark';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { PwaInstallPrompt } from './components/ui/PwaInstallPrompt';
import { useTranslation } from './i18n';
import { session } from './lib/session';
import { startSessionHeartbeat, stopSessionHeartbeat } from './lib/singleSession';
import { isPwaStandalone } from './lib/deviceId';
import { resolveTabAccess, type AccessLevel } from './lib/tabAccess';
import type { GlobalSearchNavigate } from './lib/globalSearch';
import type { MasterType } from './features/masters/MastersView';
import { OnlineStatus } from './platforms/desktop/offline';
import { canChangeDesktopMode, requestChangeDesktopMode } from './platforms/desktop/changeDesktopMode';
import { isServiceMobileMode } from './platforms/service-mobile/mode';
import { loadLicense } from './platforms/service-mobile/licenseStore';
import { getTabVisiblePref, TAB_VISIBLE_PREF_CHANGED_EVENT } from './lib/tabVisibilityPrefs';
import { getChatbotPref, CHATBOT_PREF_CHANGED_EVENT } from './lib/chatbotPref';
import {
  getNavPositionPref,
  isNavHorizontal,
  applyNavChrome,
  NAV_POSITION_PREF_CHANGED_EVENT,
} from './lib/navPositionPref';
import {
  horizontalNavGroupTabIds,
  visibleHorizontalNavGroups,
  type HorizontalNavGroupId,
} from './lib/horizontalNavLayout';
import {
  ServiceCloudGate,
  ServiceCloudLiveBadge,
  ServiceCloudConfigRefresh,
  isServiceCloudClient,
  isServiceCloudDesktop,
  isServiceCloudMobile,
  isServicePhoneUx,
  isServiceProductUx,
} from './platforms/service-cloud';
import { mobileFeatureAllowsTab, normalizeMobileFeatures } from '../shared/mobileFeatures';
import { fillMissingTabPresetKeys, isMiracleBooksFamilyVisible, isTabVisibleForUser } from '../shared/tabPresets';
import { isNavItemActive } from './lib/navArchitecture';
import {
  getPhoneMode,
  hydratePhoneMode,
  isBakedServiceMobile,
  isNativeCapacitorShell,
  needsPhoneModePicker,
  setPhoneModeOnce,
  type PhoneMode,
} from './platforms/mobileMode';
import { PhoneModePicker } from './platforms/PhoneModePicker';
import { bugReportFeedbackMessage, shareBugReport } from './lib/bugReport';
import { isMobileAppShell, offersBugReportShare } from './lib/mobileAppShell';
import { isDesktopGlassUi } from './lib/desktopGlass';
import { applyDesktopFontPrefs } from './lib/desktopFontPrefs';
import { useEscapeKey } from './lib/useEscapeKey';
import { consumeAndroidBack } from './lib/androidBackStack';
import { normalizeCompanySlug, validateCompanySlug, getLastCompanySlug, clearLastCompanySlug } from './lib/companySlug';
import { reportSlugOnboardingFailure } from './lib/reportActionFailure';
import { getApiOrigin, getPublicAppHostPrefix } from './platforms/shared';
import { indianFyRange, readReportingPeriod } from './lib/reportingPeriod';

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
const HospitalityFloorView = lazy(() =>
  import('./features/hospitality/HospitalityFloorView').then(m => ({ default: m.HospitalityFloorView })),
);
const HospitalityWaiterView = lazy(() =>
  import('./features/hospitality/HospitalityWaiterView').then(m => ({ default: m.HospitalityWaiterView })),
);
const HospitalityKitchenView = lazy(() =>
  import('./features/hospitality/HospitalityKitchenView').then(m => ({ default: m.HospitalityKitchenView })),
);
const HospitalityQueueView = lazy(() =>
  import('./features/hospitality/HospitalityQueueView').then(m => ({ default: m.HospitalityQueueView })),
);
const HospitalityMenuAdminView = lazy(() =>
  import('./features/hospitality/HospitalityMenuAdminView').then(m => ({ default: m.HospitalityMenuAdminView })),
);
const HospitalityParcelsView = lazy(() =>
  import('./features/hospitality/HospitalityParcelsView').then(m => ({ default: m.HospitalityParcelsView })),
);
const HospitalityMembersView = lazy(() =>
  import('./features/hospitality/HospitalityMembersView').then(m => ({ default: m.HospitalityMembersView })),
);
const HospitalityAnalyticsView = lazy(() =>
  import('./features/hospitality/HospitalityAnalyticsView').then(m => ({ default: m.HospitalityAnalyticsView })),
);
const HospitalityAccountsView = lazy(() =>
  import('./features/hospitality/HospitalityAccountsView').then(m => ({ default: m.HospitalityAccountsView })),
);
function slugEntryApiContext(slug: string): {
  slug: string;
  apiOrigin: string;
  pageOrigin: string | undefined;
} {
  return {
    slug,
    apiOrigin: getApiOrigin() || '(same-origin)',
    pageOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
  };
}

function slugFailureKindFromValidationError(error: string): 'reserved' | 'invalid' {
  return /reserved/i.test(error) ? 'reserved' : 'invalid';
}

/** Cap + Cloud Electron share control for slug onboarding / not-found screens (before full app shell). */
function CapSlugOnboardingShare({ lastError, note }: { lastError?: string; note: string }) {
  const [sharingReport, setSharingReport] = React.useState(false);
  const [reportHint, setReportHint] = React.useState('');
  if (!offersBugReportShare()) return null;
  return (
    <div className="mt-4 w-full max-w-sm mx-auto">
      {reportHint ? <p className="mb-2 text-center text-xs text-emerald-400/90">{reportHint}</p> : null}
      <button
        type="button"
        disabled={sharingReport}
        onClick={() => {
          void (async () => {
            setSharingReport(true);
            setReportHint('');
            try {
              const how = await shareBugReport({ note, lastError: lastError || undefined });
              setReportHint(bugReportFeedbackMessage(how));
            } catch (e) {
              setReportHint(e instanceof Error ? e.message : 'Could not create bug report');
            } finally {
              setSharingReport(false);
            }
          })();
        }}
        className="w-full py-2.5 text-xs text-gray-500 hover:text-white border border-white/10 rounded-xl transition-colors disabled:opacity-50"
      >
        {sharingReport ? 'Preparing report…' : 'Share bug report'}
      </button>
    </div>
  );
}

/** Cloud Electron / Online Cap / installed PWA: company slug → /{slug} login (not marketing LandingPage). */
function CompanySlugEntry() {
  const [slug, setSlug] = React.useState(() => getLastCompanySlug());
  const [slugError, setSlugError] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const mobileApp = isMobileAppShell();
  // Cap WebView is localhost — show cloud API host (Render / future dhandho.app), not Cap loopback
  const hostPrefix = getPublicAppHostPrefix();

  React.useEffect(() => {
    // Returning users: skip the form when we already know the company
    const last = getLastCompanySlug();
    if (last && window.location.pathname === '/') {
      window.location.replace(`/${last}`);
    }
  }, []);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    setSlugError('');
    const checked = validateCompanySlug(slug);
    if (checked.ok === false) {
      const kind = slugFailureKindFromValidationError(checked.error);
      const ctx = slugEntryApiContext(normalizeCompanySlug(slug));
      void reportSlugOnboardingFailure({
        action: 'slug.entry',
        kind,
        reason: checked.error,
        ...ctx,
      });
      setSlugError(checked.error);
      return;
    }
    setChecking(true);
    void (async () => {
      try {
        // Preflight against cloud API so Online Cap failures stay on this screen (logged)
        const tenant = await api.tenantBySlug(checked.slug);
        // Cap Online: reject desktop-only companies early
        if (
          isServiceCloudMobile() &&
          tenant.clientAccessMode &&
          tenant.clientAccessMode !== 'mobile' &&
          tenant.clientAccessMode !== 'both'
        ) {
          const ui = 'This company has desktop-only access. Use the desktop app, or ask Super Admin to enable mobile.';
          void reportSlugOnboardingFailure({
            action: 'slug.entry',
            kind: 'unknown',
            reason: ui,
            ...slugEntryApiContext(checked.slug),
          });
          setSlugError(ui);
          return;
        }
        window.location.href = `/${checked.slug}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const network = /connection lost|failed to fetch|network|abort|timeout/i.test(msg);
        const ctx = slugEntryApiContext(checked.slug);
        if (network) {
          const ui = 'Cannot reach the cloud server. Check internet and try again.';
          void reportSlugOnboardingFailure({
            action: 'slug.entry',
            kind: 'network',
            reason: msg || ui,
            ...ctx,
          });
          setSlugError(ui);
        } else if (/not found|company not found/i.test(msg)) {
          const ui = `No company registered as “${checked.slug}”. Check the slug and try again.`;
          void reportSlugOnboardingFailure({
            action: 'slug.entry',
            kind: 'not_found',
            reason: msg || 'Company not found',
            ...ctx,
          });
          setSlugError(ui);
        } else {
          const ui = msg || 'Could not look up that company. Try again.';
          void reportSlugOnboardingFailure({
            action: 'slug.entry',
            kind: 'unknown',
            reason: ui,
            ...ctx,
          });
          setSlugError(ui);
        }
      } finally {
        setChecking(false);
      }
    })();
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
        <p className="text-white/30 text-xs text-center mb-6">Use the company URL slug (path after / on this host)</p>
        <form onSubmit={go} className="flex flex-col gap-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-brand/60 transition-colors">
            <span className="text-white/30 text-sm pl-4 pr-1 shrink-0">{hostPrefix}</span>
            <input
              autoFocus
              value={slug}
              onChange={e => {
                setSlug(e.target.value);
                if (slugError) setSlugError('');
              }}
              placeholder="your-company"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={checking}
              className="flex-1 bg-transparent py-3 pr-4 text-white placeholder-white/20 text-sm outline-none disabled:opacity-50"
            />
          </div>
          {slugError && <p className="text-rose-400/90 text-xs text-center">{slugError}</p>}
          <button
            type="submit"
            disabled={!slug.trim() || checking}
            className="w-full py-3 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            {checking ? 'Checking…' : 'Continue →'}
          </button>
        </form>
        {!checking && <CapSlugOnboardingShare lastError={slugError || undefined} note="Company slug entry" />}
        {canChangeDesktopMode() && (
          <button
            type="button"
            onClick={() => {
              void requestChangeDesktopMode();
            }}
            className="w-full mt-3 py-2.5 text-xs text-white/45 hover:text-white/80 border border-white/10 rounded-xl transition-colors"
          >
            Use Offline instead…
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

// Apply saved theme + desktop glass typography on load (font CSS scoped to .dg-desktop-glass)
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('dhandho_theme');
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');
  applyDesktopFontPrefs();
  // Windows Electron: sharper glyphs + solid glass (backdrop-filter blurs text on Win).
  try {
    const ea = (window as unknown as { electronAPI?: { isElectron?: boolean; platform?: string } }).electronAPI;
    if (ea?.isElectron && ea.platform === 'win32') {
      document.documentElement.classList.add('dg-win32');
    }
  } catch {
    /* ignore */
  }
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
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [tabKey, setTabKey] = useState(0);
  /** Books family folds into Accounts — seed the Accounts sub-tab from deep links. */
  const [accountsInitialTab, setAccountsInitialTab] = useState<string | null>(null);
  /** Deep-link payload for Masters when picking a global search hit. */
  const [mastersLaunch, setMastersLaunch] = useState<{
    master?: MasterType;
    vendorId?: string;
    staffId?: string;
    staffName?: string;
  } | null>(null);
  const setActiveTab = (tab: Tab) => {
    const bookToAccounts: Record<string, string> = {
      books: 'ledger',
      book_ledgers: 'ledger',
      book_vouchers: 'vouchers',
      book_products: 'products',
      book_import: 'import',
    };
    const accountsSeed = bookToAccounts[tab];
    if (accountsSeed) {
      setAccountsInitialTab(accountsSeed);
      setActiveTabRaw('accounts');
    } else {
      if (tab === 'accounts') setAccountsInitialTab(null);
      setActiveTabRaw(tab);
    }
    setTabKey(k => k + 1);
    // Cap: replace so Android back is not a deep tab history (double-back exits instead).
    // Desktop web keeps pushState so browser Back still moves between tabs.
    const path = window.location.pathname;
    const histTab = accountsSeed ? 'accounts' : tab;
    if (isNativeCapacitorShell()) {
      window.history.replaceState({ tab: histTab }, '', path);
    } else {
      window.history.pushState({ tab: histTab }, '', path);
    }
  };

  const openAccountsStatement = (seed: string) => {
    setAccountsInitialTab(seed);
    setActiveTabRaw('accounts');
    setTabKey(k => k + 1);
    const path = window.location.pathname;
    if (isNativeCapacitorShell()) {
      window.history.replaceState({ tab: 'accounts' }, '', path);
    } else {
      window.history.pushState({ tab: 'accounts' }, '', path);
    }
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
  // Bumped when a Settings nav-tab toggle changes, so tv() re-reads the pref live.
  const [, setTabVisiblePrefTick] = useState(0);
  useEffect(() => {
    const onPrefChange = () => setTabVisiblePrefTick(n => n + 1);
    window.addEventListener(TAB_VISIBLE_PREF_CHANGED_EVENT, onPrefChange);
    return () => window.removeEventListener(TAB_VISIBLE_PREF_CHANGED_EVENT, onPrefChange);
  }, []);
  // Bumped when Settings → Appearance chatbot toggle changes.
  const [, setChatbotPrefTick] = useState(0);
  useEffect(() => {
    const onChatbotPref = () => setChatbotPrefTick(n => n + 1);
    window.addEventListener(CHATBOT_PREF_CHANGED_EVENT, onChatbotPref);
    return () => window.removeEventListener(CHATBOT_PREF_CHANGED_EVENT, onChatbotPref);
  }, []);
  const [navPosTick, setNavPosTick] = useState(0);
  useEffect(() => {
    const onNavPos = () => setNavPosTick(n => n + 1);
    window.addEventListener(NAV_POSITION_PREF_CHANGED_EVENT, onNavPos);
    return () => window.removeEventListener(NAV_POSITION_PREF_CHANGED_EVENT, onNavPos);
  }, []);
  useEffect(() => {
    applyNavChrome(getNavPositionPref(), !isSidebarOpen);
  }, [navPosTick, isSidebarOpen]);
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
          const merged = {
            ...user,
            ...fresh,
            name: fresh.name || user.name || 'User',
            email: fresh.email || user.email || '',
          };
          session.setUser(merged);
          setUser(merged);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // PWA/browser back: close nested sheet/detail first (same LIFO stack as Cap hardware back).
      if (consumeAndroidBack()) {
        const path = window.location.pathname;
        window.history.pushState({ tab: activeTabRef.current }, '', path);
        return;
      }
      if (e.state?.tab) {
        const bookToAccounts: Record<string, string> = {
          books: 'ledger',
          book_ledgers: 'ledger',
          book_vouchers: 'vouchers',
          book_products: 'products',
          book_import: 'import',
        };
        const seed = bookToAccounts[e.state.tab as string];
        if (seed) {
          setAccountsInitialTab(seed);
          setActiveTabRaw('accounts');
        } else {
          setActiveTabRaw(e.state.tab);
        }
      } else {
        const path = window.location.pathname;
        if (isNativeCapacitorShell()) {
          window.history.replaceState({ tab: 'analytics' }, '', path);
        } else {
          window.history.pushState({ tab: 'analytics' }, '', path);
        }
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

  useEscapeKey(() => {
    if (cmdOpen) {
      setCmdOpen(false);
      return true;
    }
    return false;
  }, cmdOpen);

  useEscapeKey(() => {
    if (userMenuOpen) {
      setUserMenuOpen(false);
      return true;
    }
    return false;
  }, userMenuOpen);

  useEscapeKey(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) return false;
    if (!isSidebarOpen) return false;
    setIsSidebarOpen(false);
    return true;
  }, isSidebarOpen);

  // Cap/PWA: at a tab root (no nested UI), first back goes home to Analytics; only Analytics exits.
  // asRoot so nested Settings/Masters/Invoice handlers always run first.
  useEscapeKey(
    () => {
      if (!(isMobileAppShell() || isPwaStandalone())) return false;
      if (!user || activeTabRef.current === 'analytics') return false;
      setActiveTab('analytics');
      return true;
    },
    !!(user && (isMobileAppShell() || isPwaStandalone())),
    true,
  );

  const handleLogout = () => {
    stopSessionHeartbeat();
    void api.auth.logout().catch(() => {});
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
    startSessionHeartbeat();
  };

  useEffect(() => {
    if (user && session.getToken()) startSessionHeartbeat();
    else stopSessionHeartbeat();
    return () => stopSessionHeartbeat();
  }, [user]);

  const { t } = useTranslation();

  const userConfig = user as Record<string, unknown>;
  // Merge missing hospitality keys (e.g. hosp_menu) from preset for older hotel tab_config JSON
  const tabConfig = fillMissingTabPresetKeys(
    userConfig?.tabConfig as Record<string, { label?: string; visible?: boolean }> | null | undefined,
    userConfig?.businessType as string | undefined,
  );
  const tc = (key: string, fallback: string) => tabConfig[key]?.label || fallback;
  /** Tenant tabConfig (Super Admin), plus per-device Settings show/hide override. */
  const tv = (key: string) => isTabVisibleForUser(key, tabConfig, getTabVisiblePref(key));
  const serviceProductUx = isServiceProductUx(userConfig?.businessType as string | undefined);

  /** Icons for Miracle-shaped sidebar (tab ids stay stable; grouping follows navArchitecture). */
  const navIconByTab: Partial<Record<string, LucideIcon>> = {
    analytics: LayoutDashboard,
    masters: BookUser,
    invoices: ReceiptIndianRupee,
    quotations: FileText,
    purchases: ShoppingBag,
    sales: ShoppingCart,
    distribution: Package,
    inventory: Package,
    finance: IndianRupee,
    verification: ScanSearch,
    accounts: BarChart3,
    books: BookOpen,
    book_import: FileUp,
    warranty: ShieldCheck,
    replacements: RefreshCw,
    rewards: Gift,
    hosp_floor: UtensilsCrossed,
    hosp_waiter: ConciergeBell,
    hosp_kitchen: ChefHat,
    hosp_queue: ListOrdered,
    hosp_parcels: ShoppingBag,
    hosp_menu: BookOpen,
    hosp_members: IdCard,
  };
  const navLabel = (id: string, fallback: string) => tc(id, fallback);
  const navItem = (id: string, fallback: string, show: boolean) => ({
    id,
    label: navLabel(id, fallback),
    icon: navIconByTab[id] ?? FileText,
    show,
  });

  // Masters → Transactions → Reports/Accounts (ledgers & vouchers live under Accounts)
  const navSections = [
    {
      label: '',
      items: [
        navItem('analytics', t('nav.analytics'), tv('analytics')),
        navItem('masters', t('nav.masters'), tv('masters')),
      ],
    },
    {
      label: t('navSections.transactions'),
      items: [
        navItem('invoices', t('nav.invoices'), tv('invoices')),
        navItem('quotations', t('nav.quotesOrders'), tv('quotations')),
        navItem('purchases', t('nav.purchaseExpense'), tv('purchases')),
        navItem('sales', t('nav.sales'), tv('sales')),
        navItem('distribution', t('nav.distribution'), tv('distribution')),
        navItem('inventory', t('nav.inventory'), tv('inventory')),
        // Service: Collections is a normal Transactions item (not only inside Clients hub).
        navItem('finance', serviceProductUx ? tc('finance', t('nav.collections')) : t('nav.finance'), tv('finance')),
        navItem('verification', t('nav.verification'), tv('verification')),
      ],
    },
    {
      label: t('navSections.reports'),
      items: [navItem('accounts', t('nav.accounts'), tv('accounts'))],
    },
    {
      label: t('navSections.afterSales'),
      items: [
        navItem('warranty', t('nav.warranty'), tv('warranty')),
        navItem('replacements', t('nav.replacements'), tv('replacements')),
        navItem('rewards', t('nav.rewards'), tv('rewards')),
      ],
    },
    {
      label: t('nav.hospitality'),
      items: [
        navItem('hosp_floor', t('nav.hospFloor'), tv('hosp_floor')),
        navItem('hosp_waiter', t('nav.hospWaiter'), tv('hosp_waiter')),
        navItem('hosp_kitchen', t('nav.hospKitchen'), tv('hosp_kitchen')),
        navItem('hosp_queue', t('nav.hospQueue'), tv('hosp_queue')),
        navItem('hosp_parcels', t('nav.hospParcels'), tv('hosp_parcels')),
        navItem('hosp_menu', t('nav.hospMenu'), tv('hosp_menu')),
        navItem('hosp_members', t('nav.hospMembers'), tv('hosp_members')),
      ],
    },
  ];
  const navItems = navSections.flatMap(s => s.items).filter(i => i.show);

  const getAccess = (tabId: string): AccessLevel =>
    resolveTabAccess(tabId, userConfig as { permissions?: unknown; role?: string; businessType?: string } | null);
  const canAccess = (tabId: string) => getAccess(tabId) !== 'hidden';

  const companionFeatures =
    isServiceCloudMobile() && (userConfig?.businessType as string) !== 'service'
      ? normalizeMobileFeatures(userConfig?.mobileFeatures, userConfig?.businessType as string | undefined)
      : null;
  const companionAllows = (tabId: string) =>
    !companionFeatures || tabId === 'settings' || mobileFeatureAllowsTab(tabId, companionFeatures);
  const visibleNavItems = navItems.filter(item => {
    if (!canAccess(item.id)) return false;
    if (!companionAllows(item.id)) return false;
    return true;
  });

  const navPos = navPosTick >= 0 ? getNavPositionPref() : 'left';
  const navH = isNavHorizontal(navPos);
  const drawerRight = navPos === 'right';
  const visibleTabIdSet = useMemo(() => new Set(visibleNavItems.map(i => i.id)), [visibleNavItems]);
  const navItemById = useMemo(() => {
    const map = new Map<string, (typeof visibleNavItems)[number]>();
    for (const item of visibleNavItems) map.set(item.id, item);
    return map;
  }, [visibleNavItems]);
  const horizontalGroups = useMemo(() => visibleHorizontalNavGroups(visibleTabIdSet), [visibleTabIdSet]);
  const [horizontalMenuOpen, setHorizontalMenuOpen] = useState<HorizontalNavGroupId | null>(null);
  const [horizontalMenuAnchor, setHorizontalMenuAnchor] = useState<ShellDropdownAnchor | null>(null);
  const horizontalNavMenusRef = useRef<HTMLDivElement>(null);
  const horizontalMenuPanelRef = useRef<HTMLDivElement>(null);
  const userMenuNavRef = useRef<HTMLDivElement>(null);
  const userMenuMainRef = useRef<HTMLDivElement>(null);
  const userMenuPanelRef = useRef<HTMLDivElement>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<ShellDropdownAnchor | null>(null);
  const horizontalMenuOpenItems = useMemo(() => {
    if (!horizontalMenuOpen) return [];
    return horizontalNavGroupTabIds(horizontalMenuOpen)
      .map(id => navItemById.get(id))
      .filter((item): item is NonNullable<typeof item> => !!item);
  }, [horizontalMenuOpen, navItemById]);
  useEffect(() => {
    if (!navH) {
      setHorizontalMenuOpen(null);
      setHorizontalMenuAnchor(null);
    }
  }, [navH, navPosTick]);
  useEffect(() => {
    if (!horizontalMenuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (horizontalNavMenusRef.current?.contains(target)) return;
      if (horizontalMenuPanelRef.current?.contains(target)) return;
      setHorizontalMenuOpen(null);
      setHorizontalMenuAnchor(null);
    };
    const onScroll = () => {
      setHorizontalMenuOpen(null);
      setHorizontalMenuAnchor(null);
    };
    const timer = window.setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [horizontalMenuOpen]);
  useEffect(() => {
    if (!userMenuOpen) setUserMenuAnchor(null);
  }, [userMenuOpen]);
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userMenuNavRef.current?.contains(target) || userMenuMainRef.current?.contains(target)) return;
      if (userMenuPanelRef.current?.contains(target)) return;
      setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    const timer = window.setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  // Cap OS notification tap → open tab (or just bring app to foreground)
  useEffect(() => {
    const onOsNav = (e: Event) => {
      const hrefTab = (e as CustomEvent<{ hrefTab?: string }>).detail?.hrefTab;
      if (hrefTab && canAccess(hrefTab) && companionAllows(hrefTab)) setActiveTab(hrefTab as Tab);
    };
    window.addEventListener('dg-os-notification-navigate', onOsNav);
    return () => window.removeEventListener('dg-os-notification-navigate', onOsNav);
  }, []);

  useEffect(() => {
    if (!user) return;
    // Normalize legacy dashboard tab → analytics (primary nav id)
    if (activeTab === 'dashboard' && canAccess('analytics') && companionAllows('analytics')) {
      setActiveTabRaw('analytics');
      return;
    }
    const tabHidden = activeTab !== 'settings' && !tv(activeTab);
    if (!canAccess(activeTab) || tabHidden || !companionAllows(activeTab)) {
      const preferred = (['analytics', 'distribution', 'finance', 'inventory'] as Tab[]).find(
        t => canAccess(t) && tv(t) && companionAllows(t),
      );
      const fromNav = visibleNavItems.find(n => canAccess(n.id) && tv(n.id) && companionAllows(n.id))?.id as
        Tab | undefined;
      // Never force analytics when companion pack hides it — settings is always allowed.
      setActiveTabRaw(preferred ?? fromNav ?? 'settings');
    }
  }, [activeTab, user]);

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
  const [slugLookupNetworkError, setSlugLookupNetworkError] = useState(false);

  useEffect(() => {
    if (urlSlug && !user && urlSlug !== 'admin') {
      setSlugLookupNetworkError(false);
      api
        .tenantBySlug(urlSlug)
        .then(t => {
          setTenantBranding(t);
          setSlugNotFound(false);
          setSlugLookupNetworkError(false);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          const network = /connection lost|failed to fetch|network|abort|timeout/i.test(msg);
          // Network / wrong API host must not look like an "invalid slug"
          setSlugLookupNetworkError(network);
          setSlugNotFound(true);
          // Deleted / unknown company: drop remembered slug so Choose company is not a bounce loop
          if (!network) clearLastCompanySlug();
          const ctx = slugEntryApiContext(urlSlug);
          void reportSlugOnboardingFailure({
            action: 'slug.lookup',
            kind: network ? 'network' : 'not_found',
            reason: msg || (network ? 'Cannot reach server' : 'Company not found'),
            ...ctx,
          });
        });
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

  // Cloud ERP is available in browser + installed PWA (iPhone has no App Store build).
  // Electron / Cap / standalone PWA still preferred; install tip is shown via PwaInstallPrompt.

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

    // Slug URL but tenant not found (or API unreachable)
    if (urlSlug && slugNotFound) {
      const lookupError = slugLookupNetworkError
        ? `Cannot reach server looking up /${urlSlug}`
        : `Company not found: /${urlSlug}`;
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#151619] via-[#1A1D21] to-[#151619] flex items-center justify-center p-4">
          <div className="text-center">
            <div className="inline-flex w-16 h-16 bg-gray-700 rounded-2xl items-center justify-center font-bold text-2xl text-gray-400 mb-4">
              ?
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              {slugLookupNetworkError ? 'Cannot reach server' : 'Company Not Found'}
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              {slugLookupNetworkError ? (
                <>
                  Could not look up <span className="font-mono text-gray-300">/{urlSlug}</span>. Check internet and try
                  again.
                </>
              ) : (
                <>
                  No company registered with URL <span className="font-mono text-gray-300">/{urlSlug}</span>
                </>
              )}
            </p>
            <a
              href={isServiceCloudDesktop() || isServiceCloudMobile() ? cloudSlugHomeHref() : '/'}
              onClick={() => {
                clearLastCompanySlug();
              }}
              className="px-6 py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark transition-colors"
            >
              {isServiceCloudDesktop() || isServiceCloudMobile() ? 'Choose company' : 'Go to Dhandho Home'}
            </a>
            <CapSlugOnboardingShare lastError={lookupError} note="Company slug lookup" />
          </div>
        </div>
      );
    }

    // Slug URL — show branded tenant login
    if (urlSlug && tenantBranding) {
      const changeCompany =
        isServiceCloudDesktop() || isServiceCloudMobile()
          ? () => {
              clearLastCompanySlug();
              window.location.href = cloudSlugHomeHref();
            }
          : undefined;
      return (
        <ToastProvider>
          <Suspense fallback={<LazyFallback />}>
            <LoginScreen onLogin={handleLogin} tenant={tenantBranding} onChangeCompany={changeCompany} />
          </Suspense>
          <PwaInstallPrompt />
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

    // Cloud Electron / Online Cap: company slug entry (never marketing landing)
    if (isServiceCloudDesktop() || isServiceCloudMobile()) {
      return <CompanySlugEntry />;
    }

    // Any OS: installed PWA with a remembered company → that tenant's login.
    // All other browser tabs (and fresh PWA) get marketing landing — never gate `/`
    // on display-mode alone (false positives hid the landing site-wide).
    if (isPwaStandalone()) {
      const last = getLastCompanySlug();
      if (last) {
        window.location.replace(`/${last}`);
        return (
          <div className="min-h-[100dvh] flex items-center justify-center bg-[#151619]">
            <LoadingSpinner size="lg" />
          </div>
        );
      }
    }

    // Public web (+ fresh PWA): marketing landing — Windows / Mac / Linux / mobile browsers
    return (
      <Suspense fallback={<LazyFallback />}>
        <LandingPage />
        <PwaInstallPrompt />
      </Suspense>
    );
  }

  /** Emergent phone IA: Offline Mobile + online Service Cloud Capacitor (not manufacturer cloud). */
  const servicePhoneUx = isServicePhoneUx(userConfig?.businessType as string | undefined);
  const desktopGlass = isDesktopGlassUi(userConfig?.businessType as string | undefined);
  /** Cap non-service glass header (Analytics / Accounts mock) — denser Live · search · notify · refresh · avatar */
  const capGlassHeader = isMobileAppShell() && !servicePhoneUx;
  const avatarInitials = (() => {
    const name = user?.name?.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (capGlassHeader && parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
    }
    if (capGlassHeader) return name.slice(0, 2).toUpperCase();
    return (name.charAt(0) || '?').toUpperCase();
  })();
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
    finance: serviceProductUx ? tc('finance', t('nav.collections')) : t('nav.finance'),
    inventory: t('nav.stock'),
  };
  const mobileNavItems = mobileNavIds
    .map(id => visibleNavItems.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .slice(0, 4);
  const mobileMoreActive = !mobileNavItems.some(i => isNavItemActive(i.id, activeTab)) && activeTab !== 'settings';

  const subscriptionBanner = (() => {
    const subEnd = (userConfig?.subscriptionEndsAt || userConfig?.trialEndsAt) as string | undefined;
    if (!subEnd) return null;
    const days = Math.ceil((new Date(subEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days > 15) return null;
    const isTrial = !!userConfig?.trialEndsAt && !userConfig?.subscriptionEndsAt;
    return (
      <div
        className={cn(
          'shrink-0 px-4 py-2 text-center text-sm font-medium z-[60]',
          days <= 0
            ? 'bg-rose-600 text-white'
            : days <= 7
              ? 'bg-rose-50 text-rose-700'
              : desktopGlass
                ? 'bg-[color-mix(in_srgb,var(--dg-warning)_18%,transparent)] dg-warning'
                : 'bg-amber-50 text-amber-700',
        )}
      >
        {days <= 0
          ? `Your ${isTrial ? 'trial' : 'subscription'} has expired. Contact Dhandho to renew.`
          : `Your ${isTrial ? 'trial' : 'subscription'} expires in ${days} day${days === 1 ? '' : 's'}. Contact Dhandho to renew.`}
      </div>
    );
  })();

  const renderAppHeaderChrome = (placement: 'main' | 'nav') => {
    const inNavBar = placement === 'nav';
    const menuUp = inNavBar && navPos === 'bottom';
    return (
      <div className={cn('flex items-center gap-0.5 sm:gap-2 shrink-0 min-w-0', inNavBar && 'lg:gap-2')}>
        {isServiceCloudMobile() && user && !servicePhoneUx && (
          <ServiceCloudLiveBadge variant="header" userId={user.id} companySessionLock={false} />
        )}
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className={cn(
            'sm:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg',
            capGlassHeader ? 'hover:bg-[var(--dg-input)] dg-m-muted' : 'hover:bg-gray-100 text-gray-500',
          )}
          aria-label="Search"
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className={cn(
            'hidden sm:flex items-center gap-2 px-3 py-1.5 transition-colors text-sm min-w-0',
            desktopGlass
              ? cn(
                  'rounded-full border border-[var(--dg-card-border)] bg-[var(--dg-input)] dg-muted',
                  inNavBar ? 'lg:min-w-[10rem] lg:max-w-[14rem]' : 'min-w-[16rem] lg:min-w-[22rem]',
                )
              : cn('bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500', inNavBar && 'lg:max-w-[14rem]'),
          )}
        >
          <Search size={15} className="shrink-0" />
          <span className={cn(desktopGlass && 'flex-1 text-left truncate')}>
            {desktopGlass ? 'Search across business entities...' : 'Search...'}
          </span>
          <kbd
            className={cn(
              'text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0',
              desktopGlass ? 'border-[var(--dg-card-border)] dg-faint' : 'bg-white border-gray-200 text-gray-400',
              inNavBar && 'lg:hidden',
            )}
          >
            ⌘K
          </kbd>
        </button>
        <div
          className={cn(
            'hidden lg:flex items-center gap-2 px-3 py-1 rounded-full border shrink-0',
            desktopGlass
              ? 'bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] border-[color-mix(in_srgb,var(--dg-primary)_28%,transparent)]'
              : 'bg-amber-50 border-amber-100',
          )}
        >
          <div
            className={cn(
              'w-2 h-2 rounded-full animate-pulse',
              desktopGlass ? 'bg-[var(--dg-primary)]' : 'bg-amber-400',
            )}
          />
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
              desktopGlass ? 'dg-primary' : 'text-amber-700',
            )}
          >
            {(() => {
              const raw = String(userConfig?.planName || 'Standard').trim();
              return /plan$/i.test(raw) ? raw : `${raw} Plan`;
            })()}
          </span>
        </div>
        {/* Global FY indicator — click to jump to Analytics to change */}
        {user &&
          !servicePhoneUx &&
          (() => {
            const saved = readReportingPeriod();
            const fy = indianFyRange();
            const label = saved?.label || fy.label;
            return (
              <button
                type="button"
                onClick={() => {
                  if (canAccess('analytics')) setActiveTab('analytics' as Tab);
                }}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0"
                title="Click to change financial year in Analytics"
              >
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider whitespace-nowrap">
                  {label}
                </span>
              </button>
            );
          })()}
        <NotificationCenter
          portaled={inNavBar && navH}
          openBelow={navPos !== 'bottom'}
          onNavigate={tab => {
            if (canAccess(tab)) setActiveTab(tab as Tab);
          }}
          canAccessTab={canAccess}
        />
        {isServiceCloudMobile() && user && !servicePhoneUx && (
          <ServiceCloudConfigRefresh
            userId={user.id}
            onConfigRefreshed={merged => {
              setUser(merged as typeof user);
            }}
          />
        )}
        <div
          ref={inNavBar ? userMenuNavRef : userMenuMainRef}
          className="relative flex items-center gap-2 sm:gap-3 shrink-0"
        >
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              if (userMenuOpen) {
                setUserMenuOpen(false);
                setUserMenuAnchor(null);
                return;
              }
              setUserMenuOpen(true);
              if ((inNavBar && navH) || window.matchMedia('(min-width: 1024px)').matches) {
                setUserMenuAnchor(shellDropdownAnchor(e.currentTarget));
              }
            }}
            className={cn(
              'flex items-center gap-2 sm:gap-3 rounded-xl p-1 transition-colors',
              capGlassHeader ? 'hover:bg-[var(--dg-input)]' : 'hover:bg-gray-100',
            )}
            aria-label="Account menu"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            id={inNavBar ? 'account-menu-button-nav' : 'account-menu-button'}
          >
            <div className={cn('text-right hidden sm:block', inNavBar && 'lg:max-w-[7rem]')}>
              <p className="text-sm font-semibold truncate">{user?.name ?? 'Guest'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role ?? 'Not signed in'}</p>
            </div>
            <div
              className={cn(
                'w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 shadow-sm flex items-center justify-center text-white font-bold text-[11px] sm:text-sm shrink-0',
                desktopGlass || capGlassHeader
                  ? 'dg-bg-primary border-[var(--dg-card-border)]'
                  : 'bg-gradient-to-tr from-brand to-[#FFB347] border-white',
              )}
            >
              {avatarInitials}
            </div>
          </button>
          {userMenuOpen && !userMenuAnchor && (
            <div
              key={`user-menu-${placement}`}
              role="menu"
              aria-labelledby={inNavBar ? 'account-menu-button-nav' : 'account-menu-button'}
              className={cn(
                'dg-menu-enter absolute right-0 z-[100] w-52 rounded-xl shadow-xl py-1 overflow-hidden',
                menuUp ? 'bottom-full mb-2' : 'top-full mt-2',
                desktopGlass
                  ? 'dg-glass-card border border-[var(--dg-card-border)]'
                  : 'bg-white border border-gray-100',
              )}
            >
              <div
                className={cn(
                  'px-4 py-3 border-b',
                  desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-100',
                )}
              >
                <p className={cn('text-sm font-semibold truncate', desktopGlass ? 'dg-ink' : 'text-gray-900')}>
                  {user?.name}
                </p>
                <p className={cn('text-xs truncate', desktopGlass ? 'dg-muted' : 'text-gray-500')}>{user?.email}</p>
              </div>
              <div className="py-1">
                {canAccess('settings') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('settings');
                      setUserMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm',
                      desktopGlass ? 'dg-ink hover:bg-[var(--dg-input)]' : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <Settings size={15} className={desktopGlass ? 'dg-faint' : 'text-gray-400'} />
                    {t('nav.settings')}
                  </button>
                )}
              </div>
              <div className={cn('border-t py-1', desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-100')}>
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
    );
  };

  return (
    <ToastProvider>
      <ServiceCloudGate
        enabled={
          // Cap Online + Cloud Electron for any cloud business type.
          // Service: company-wide Netflix lock. Non-service: device claim only (no company freeze).
          isServiceCloudClient()
        }
      >
        {appShutter && (
          <Suspense fallback={null}>
            <AppShutterIntro companyName={appShutter} onDone={() => setAppShutter(null)} />
          </Suspense>
        )}
        <div className="flex flex-col h-[100dvh] max-h-[100dvh] min-h-0">
          {subscriptionBanner}
          <div
            className={cn(
              'app-shell flex flex-1 min-h-0 font-sans overflow-hidden',
              navH && 'lg:overflow-visible',
              desktopGlass ? 'dg-desktop-glass' : capGlassHeader ? 'dg-mobile-glass' : 'bg-[#F8F9FA] text-[#1A1A1A]',
              drawerRight && 'lg:flex-row-reverse',
              navPos === 'top' && 'lg:flex-col',
              navPos === 'bottom' && 'lg:flex-col-reverse',
            )}
            data-nav-pos={navPos}
          >
            {/* Mobile sidebar backdrop */}
            {isSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-[1px] dg-fade-enter"
                onClick={() => setIsSidebarOpen(false)}
                aria-hidden="true"
              />
            )}
            {/* Sidebar — drawer on phone, rail or bar on desktop */}
            <aside
              className={cn(
                'transition-transform duration-300 z-50 flex flex-col',
                navH && 'lg:flex-row lg:items-stretch',
                desktopGlass
                  ? 'dg-glass-sidebar shadow-none'
                  : capGlassHeader
                    ? cn(
                        'bg-[var(--dg-header)] shadow-xl lg:shadow-none',
                        drawerRight
                          ? 'border-l border-[var(--dg-card-border)]'
                          : 'border-r border-[var(--dg-card-border)]',
                        navH && 'lg:border-l-0 lg:border-r-0',
                        navPos === 'top' && 'lg:border-b lg:border-[var(--dg-card-border)]',
                        navPos === 'bottom' && 'lg:border-t lg:border-[var(--dg-card-border)]',
                      )
                    : cn(
                        'bg-white shadow-xl lg:shadow-none',
                        drawerRight ? 'border-l border-gray-200' : 'border-r border-gray-200',
                        navH && 'lg:border-l-0 lg:border-r-0',
                        navPos === 'top' && 'lg:border-b lg:border-gray-200',
                        navPos === 'bottom' && 'lg:border-t lg:border-gray-200',
                      ),
                'fixed lg:relative',
                drawerRight ? 'inset-y-0 right-0' : 'inset-y-0 left-0',
                'h-[100dvh] max-h-[100dvh]',
                navH && 'lg:inset-x-0 lg:left-0 lg:right-0 lg:inset-y-auto lg:max-h-none lg:min-h-0',
                navH && 'lg:h-14 lg:overflow-visible',
                isSidebarOpen
                  ? cn('w-[min(70vw,15rem)] translate-x-0', navH ? 'lg:w-full' : 'lg:w-64')
                  : cn(
                      'w-16 lg:translate-x-0',
                      drawerRight ? 'translate-x-full' : '-translate-x-full',
                      navH && 'lg:w-full',
                    ),
              )}
            >
              {/* Sticky brand / profile */}
              <div
                className={cn(
                  'shrink-0 px-3 lg:px-4 flex items-center justify-between gap-2 pt-[max(0.5rem,var(--safe-top))] pb-2 lg:h-16 lg:pt-0 lg:pb-0',
                  desktopGlass ? 'border-b border-[var(--dg-card-border)]' : 'border-b border-gray-100',
                  navH && 'lg:border-b-0 lg:border-r lg:h-auto lg:self-stretch lg:max-w-[11rem]',
                )}
              >
                {((isSidebarOpen && !navH) || navH) && (
                  <div className={cn('flex items-center gap-2.5 min-w-0', !isSidebarOpen && navH && 'max-lg:hidden')}>
                    <div
                      className={cn(
                        'lg:hidden w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                        desktopGlass ? 'dg-bg-primary' : 'bg-gradient-to-tr from-brand to-[#FFB347]',
                      )}
                    >
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
                  className={cn(
                    'p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors cursor-pointer text-gray-500 shrink-0',
                    navH && 'lg:hidden',
                  )}
                  aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
                >
                  {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>

              {/* Scrollable menu */}
              <nav
                className={cn(
                  'flex-1 min-h-0 px-2.5 lg:px-3 py-2 lg:py-3 overflow-y-auto overscroll-contain',
                  navH && 'lg:overflow-visible lg:flex lg:flex-row lg:items-center lg:gap-1 lg:py-0 lg:px-2',
                )}
              >
                {navH && horizontalGroups.length > 0 && (
                  <div
                    ref={horizontalNavMenusRef}
                    className="hidden lg:flex lg:items-center lg:gap-1 lg:flex-1 lg:min-w-0 lg:relative lg:z-[80]"
                  >
                    {horizontalGroups.map(g => {
                      const groupItems = horizontalNavGroupTabIds(g.id)
                        .map(id => navItemById.get(id))
                        .filter((item): item is NonNullable<typeof item> => !!item);
                      if (!groupItems.length) return null;
                      const menuOpen = horizontalMenuOpen === g.id;
                      const groupActive = groupItems.some(item => isNavItemActive(item.id, activeTab));
                      return (
                        <div key={g.id} className="relative shrink-0">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              if (menuOpen) {
                                setHorizontalMenuOpen(null);
                                setHorizontalMenuAnchor(null);
                                return;
                              }
                              setHorizontalMenuOpen(g.id);
                              setHorizontalMenuAnchor(shellDropdownAnchor(e.currentTarget));
                            }}
                            className={cn(
                              'flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors min-h-[36px]',
                              groupActive || menuOpen
                                ? desktopGlass
                                  ? 'dg-bg-primary shadow-sm'
                                  : 'bg-brand text-white shadow-sm'
                                : desktopGlass
                                  ? 'dg-muted hover:opacity-100'
                                  : 'text-gray-600 hover:bg-gray-100',
                            )}
                            aria-expanded={menuOpen}
                          >
                            <span>{t(g.labelKey)}</span>
                            <ChevronDown
                              size={14}
                              className={cn('shrink-0 transition-transform', menuOpen && 'rotate-180')}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={cn(navH && 'lg:hidden')}>
                  {navSections.map(section => {
                    // Cap Online companion: same mobile_features filter as bottom nav / command palette
                    const sectionItems = section.items.filter(i => i.show && canAccess(i.id) && companionAllows(i.id));
                    if (!sectionItems.length) return null;
                    const isCollapsed = section.label ? collapsedSections.has(section.label) : false;
                    const hasActiveChild = sectionItems.some(i => activeTab === i.id);
                    return (
                      <div
                        key={section.label || '_top'}
                        className={cn(
                          section.label ? 'mt-2 first:mt-0' : '',
                          navH && 'lg:mt-0 lg:flex lg:items-center lg:shrink-0',
                        )}
                      >
                        {isSidebarOpen && section.label && (
                          <button
                            type="button"
                            onClick={() => toggleSection(section.label)}
                            className={cn(
                              'w-full flex items-center justify-between px-2.5 py-1.5 mb-0.5 rounded-lg hover:bg-gray-50 transition-colors min-h-9',
                              navH && 'lg:hidden',
                            )}
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
                        {navH && section.label ? (
                          <div className="hidden lg:block w-px self-stretch min-h-6 bg-gray-200 mx-1 shrink-0" />
                        ) : null}
                        {!isSidebarOpen && section.label && (
                          <div className={cn('my-1.5 mx-2 border-t border-gray-100', navH && 'lg:hidden')} />
                        )}
                        {(!isCollapsed || !isSidebarOpen || navH) && (
                          <div
                            className={cn(
                              'space-y-0.5',
                              navH && 'lg:flex lg:flex-row lg:items-center lg:gap-0.5 lg:space-y-0',
                            )}
                          >
                            {sectionItems.map(item => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setActiveTab(item.id as Tab);
                                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                }}
                                className={cn(
                                  'flex items-center gap-2.5 px-2.5 lg:px-3 py-2 min-h-[44px] rounded-lg transition-all text-[13px] group relative',
                                  navH ? 'w-full lg:w-auto lg:shrink-0 lg:min-h-0 lg:py-1.5' : 'w-full',
                                  isNavItemActive(item.id, activeTab)
                                    ? desktopGlass
                                      ? 'dg-nav-active font-semibold pl-[7px]'
                                      : navH
                                        ? 'bg-brand/10 text-brand font-semibold'
                                        : drawerRight
                                          ? 'bg-brand/10 text-brand font-semibold border-r-[3px] border-r-brand pr-[7px]'
                                          : 'bg-brand/10 text-brand font-semibold border-l-[3px] border-l-brand pl-[7px]'
                                    : desktopGlass
                                      ? 'dg-muted hover:opacity-100'
                                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                                )}
                              >
                                <item.icon
                                  size={18}
                                  strokeWidth={isNavItemActive(item.id, activeTab) ? 2.5 : 2}
                                  className="shrink-0"
                                />
                                {isSidebarOpen && <span className="truncate">{item.label}</span>}
                                {!isSidebarOpen && (
                                  <span
                                    className={cn(
                                      'absolute px-2 py-1 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50',
                                      navH
                                        ? 'top-full mt-2 left-1/2 -translate-x-1/2'
                                        : drawerRight
                                          ? 'right-full mr-2'
                                          : 'left-full ml-2',
                                    )}
                                  >
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
                </div>
              </nav>

              {/* Pinned footer: chatbot (cloud), settings, status — header chrome when horizontal */}
              <div
                className={cn(
                  'shrink-0 pb-[max(0.5rem,var(--safe-bottom))] lg:pb-2',
                  desktopGlass
                    ? 'border-t border-[var(--dg-card-border)] bg-transparent'
                    : 'border-t border-gray-100 bg-white',
                  navH &&
                    'lg:flex lg:items-center lg:gap-2 lg:border-t-0 lg:border-l lg:pb-0 lg:pr-3 lg:pl-2 lg:ml-auto lg:shrink-0 lg:relative lg:z-[80]',
                )}
              >
                {navH && (
                  <div className="hidden lg:flex lg:items-center lg:min-w-0">{renderAppHeaderChrome('nav')}</div>
                )}
                {!serviceMobile &&
                  tv('chatbot') &&
                  getChatbotPref() &&
                  // Cap Online companion: SA mobile_features.chatbot; desktop / service Cap use tab_config only
                  // ChatWidget portals FAB + panel to document.body (avoids sidebar stacking / empty footer gap)
                  (!companionFeatures || companionFeatures.chatbot) && (
                    <div className={cn(navH && 'lg:hidden')}>
                      <Suspense fallback={null}>
                        <ChatWidget desktopGlass={desktopGlass} />
                      </Suspense>
                    </div>
                  )}
                {/* Sync: on-prem desktop + Offline Mobile only — never Cloud Electron chrome changes */}
                {(serviceMobile ||
                  ((window as unknown as Record<string, unknown>).electronAPI as Record<string, unknown> | undefined)
                    ?.deploymentMode === 'onprem') && (
                  <div className={cn('px-2.5 lg:px-3 pt-2', navH && 'lg:hidden')}>
                    <OnlineStatus collapsed={!isSidebarOpen} adapter={serviceMobile ? smOnlineAdapter : undefined} />
                  </div>
                )}
                {/* Service Cap Online — Live + Refresh stay in drawer (Emergent chrome). Non-service: App header. */}
                {isServiceCloudMobile() && user && servicePhoneUx && (
                  <div className={cn('px-2.5 lg:px-3 pt-2', navH && 'lg:hidden')}>
                    <ServiceCloudLiveBadge
                      collapsed={!isSidebarOpen}
                      userId={user.id}
                      companySessionLock={(userConfig?.businessType as string) === 'service'}
                      onConfigRefreshed={merged => {
                        setUser(merged as typeof user);
                      }}
                    />
                  </div>
                )}
                {canAccess('settings') && !navH && (
                  <div className={cn('px-2.5 lg:px-3 pt-2', navH && 'lg:pt-0 lg:px-2')}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('settings');
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 lg:px-3 py-2 min-h-[44px] rounded-lg transition-all text-[13px]',
                        navH ? 'w-full lg:w-auto lg:min-h-0 lg:py-1.5' : 'w-full',
                        activeTab === 'settings'
                          ? desktopGlass
                            ? 'dg-nav-active font-semibold pl-[7px]'
                            : navH
                              ? 'bg-brand/10 text-brand font-semibold'
                              : drawerRight
                                ? 'bg-brand/10 text-brand font-semibold border-r-[3px] border-r-brand pr-[7px]'
                                : 'bg-brand/10 text-brand font-semibold border-l-[3px] border-l-brand pl-[7px]'
                          : desktopGlass
                            ? 'dg-muted hover:opacity-100'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      <Settings size={18} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
                      {isSidebarOpen && <span>{t('nav.settings')}</span>}
                    </button>
                  </div>
                )}
                {isSidebarOpen && (
                  <div className={cn('px-3 pt-2 pb-1 text-center', navH && 'lg:hidden')}>
                    <p className={cn('text-[10px]', desktopGlass ? 'dg-faint' : 'text-gray-400')}>
                      {t('common.poweredBy')}
                    </p>
                  </div>
                )}
              </div>
            </aside>

            {/* Main Content */}
            <main className={cn('flex-1 overflow-y-auto relative', navH && 'lg:min-h-0 min-w-0')}>
              <header
                className={cn(
                  'sticky top-0 z-30 px-3 sm:px-8 pb-2.5 sm:pb-4 flex items-center justify-between gap-2 app-header-safe',
                  navH && 'lg:hidden',
                  desktopGlass
                    ? 'dg-glass-header'
                    : capGlassHeader
                      ? 'border-b border-[var(--dg-card-border)] bg-[var(--dg-header)] backdrop-blur-md'
                      : 'bg-white/90 backdrop-blur-md border-b border-gray-100',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={cn(
                      'p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors lg:hidden shrink-0',
                      capGlassHeader ? 'hover:bg-[var(--dg-input)] dg-m-muted' : 'hover:bg-gray-100',
                    )}
                    aria-label="Open menu"
                  >
                    <Menu size={20} />
                  </button>
                  <div className="min-w-0">
                    <h1
                      className={cn(
                        'text-sm sm:text-2xl font-bold truncate leading-tight tracking-tight',
                        capGlassHeader && 'dg-m-ink',
                      )}
                    >
                      {t(`nav.${activeTab}`)}
                    </h1>
                    <p
                      className={cn(
                        'text-[9px] truncate sm:hidden leading-tight mt-0.5',
                        capGlassHeader ? 'dg-m-faint' : 'text-gray-400',
                      )}
                    >
                      {user?.companyName}
                    </p>
                  </div>
                </div>
                <div className={cn('flex items-center gap-0.5 sm:gap-3 shrink-0', navH && 'lg:hidden')}>
                  {renderAppHeaderChrome('main')}
                </div>
              </header>

              <div className="app-mobile-content p-3 sm:p-4 lg:p-8">
                <ErrorBoundary key={`${activeTab}-${tabKey}`} onReset={() => setTabKey(k => k + 1)}>
                  <Suspense fallback={<LazyFallback />}>
                    <div key={`${activeTab}-${tabKey}`}>
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
                          businessType={
                            (userConfig?.businessType as string) || (serviceProductUx ? 'service' : 'manufacturer')
                          }
                          launch={mastersLaunch}
                          onLaunchConsumed={() => setMastersLaunch(null)}
                        />
                      )}
                      {canAccess(activeTab) && activeTab === 'sales' && <SalesEntryView user={user} />}
                      {canAccess(activeTab) && activeTab === 'purchases' && (
                        <PurchasesView
                          accessLevel={getAccess('purchases')}
                          onOpenAccountsStatement={openAccountsStatement}
                        />
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
                      {canAccess(activeTab) && activeTab === 'invoices' && (
                        <InvoicesView onOpenFinance={() => setActiveTab('finance')} />
                      )}
                      {canAccess(activeTab) &&
                        activeTab === 'finance' &&
                        (serviceProductUx || (userConfig?.businessType as string) === 'hotel_restaurant' ? (
                          <InvoiceFinanceView accessLevel={getAccess('finance')} />
                        ) : (
                          <VendorFinanceView user={user} accessLevel={getAccess('finance')} />
                        ))}
                      {canAccess(activeTab) && activeTab === 'hosp_floor' && <HospitalityFloorView />}
                      {canAccess(activeTab) && activeTab === 'hosp_waiter' && <HospitalityWaiterView />}
                      {canAccess(activeTab) && activeTab === 'hosp_kitchen' && <HospitalityKitchenView />}
                      {canAccess(activeTab) && activeTab === 'hosp_queue' && <HospitalityQueueView />}
                      {canAccess(activeTab) && activeTab === 'hosp_parcels' && <HospitalityParcelsView />}
                      {canAccess(activeTab) && activeTab === 'hosp_menu' && <HospitalityMenuAdminView />}
                      {canAccess(activeTab) && activeTab === 'hosp_members' && <HospitalityMembersView />}
                      {canAccess(activeTab) &&
                        activeTab === 'analytics' &&
                        ((userConfig?.businessType as string) === 'hotel_restaurant' ? (
                          <HospitalityAnalyticsView />
                        ) : (
                          <AnalyticsView setActiveTab={setActiveTab} onNavigateEntity={navigateFromGlobalSearch} />
                        ))}
                      {canAccess(activeTab) &&
                        tv('accounts') &&
                        activeTab === 'accounts' &&
                        ((userConfig?.businessType as string) === 'hotel_restaurant' ? (
                          <HospitalityAccountsView />
                        ) : (
                          <AccountsView
                            accessLevel={getAccess('accounts')}
                            booksAccess={
                              isMiracleBooksFamilyVisible(tabConfig) && tv('books') ? getAccess('books') : 'hidden'
                            }
                            initialTab={accountsInitialTab}
                          />
                        ))}
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
              className={cn(
                'app-bottom-nav fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t lg:hidden safe-bottom',
                capGlassHeader
                  ? 'bg-[var(--dg-header)] border-[var(--dg-card-border)] shadow-[0_-2px_16px_rgba(0,0,0,0.2)]'
                  : 'bg-white/95 border-gray-200 shadow-[0_-2px_16px_rgba(0,0,0,0.05)]',
              )}
              aria-label="Primary"
            >
              <div className="flex items-stretch justify-around px-0.5 pt-0.5 pb-0">
                {mobileNavItems.map(item => {
                  const active = isNavItemActive(item.id, activeTab);
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
              serviceMobile={serviceProductUx}
              businessType={(userConfig?.businessType as string) || undefined}
              mastersVisible={tv('masters')}
            />
          </Suspense>
        )}
        {navH && horizontalMenuOpen && horizontalMenuAnchor && horizontalMenuOpenItems.length > 0 && (
          <ShellDropdownPortal
            anchor={horizontalMenuAnchor}
            openBelow={navPos !== 'bottom'}
            panelRef={horizontalMenuPanelRef}
            forceOpaque={desktopGlass}
            className={cn(
              'min-w-[12rem] rounded-xl border py-1 shadow-lg',
              desktopGlass ? 'dg-glass-card dg-opaque-menu border-[var(--dg-card-border)]' : 'bg-white border-gray-200',
            )}
          >
            {horizontalMenuOpenItems.map(item => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  setActiveTab(item.id as Tab);
                  setHorizontalMenuOpen(null);
                  setHorizontalMenuAnchor(null);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors',
                  isNavItemActive(item.id, activeTab)
                    ? desktopGlass
                      ? 'dg-nav-active font-semibold'
                      : 'bg-brand/10 text-brand font-semibold'
                    : desktopGlass
                      ? 'dg-muted hover:opacity-100'
                      : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <item.icon size={16} strokeWidth={isNavItemActive(item.id, activeTab) ? 2.5 : 2} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </ShellDropdownPortal>
        )}
        {userMenuOpen && userMenuAnchor && (
          <ShellDropdownPortal
            anchor={userMenuAnchor}
            openBelow={!navH || navPos !== 'bottom'}
            align="right"
            panelRef={userMenuPanelRef}
            forceOpaque={desktopGlass}
            aria-labelledby={navH ? 'account-menu-button-nav' : 'account-menu-button'}
            className={cn(
              'dg-menu-enter w-52 rounded-xl shadow-xl py-1 overflow-hidden',
              desktopGlass
                ? 'dg-glass-card dg-opaque-menu border border-[var(--dg-card-border)]'
                : 'bg-white border border-gray-100',
            )}
          >
            <div
              className={cn('px-4 py-3 border-b', desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-100')}
            >
              <p className={cn('text-sm font-semibold truncate', desktopGlass ? 'dg-ink' : 'text-gray-900')}>
                {user?.name}
              </p>
              <p className={cn('text-xs truncate', desktopGlass ? 'dg-muted' : 'text-gray-500')}>{user?.email}</p>
            </div>
            <div className="py-1">
              {canAccess('settings') && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setActiveTab('settings');
                    setUserMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm',
                    desktopGlass ? 'dg-ink hover:bg-[var(--dg-input)]' : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <Settings size={15} className={desktopGlass ? 'dg-faint' : 'text-gray-400'} />
                  {t('nav.settings')}
                </button>
              )}
            </div>
            <div className={cn('border-t py-1', desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-100')}>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleLogout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 font-medium"
              >
                <LogOut size={15} />
                {t('common.logout')}
              </button>
            </div>
          </ShellDropdownPortal>
        )}
        <PwaInstallPrompt />
      </ServiceCloudGate>
    </ToastProvider>
  );
}
