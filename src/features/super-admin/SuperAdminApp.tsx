import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  BarChart3,
  LogOut,
  Menu,
  X,
  FileText,
  IndianRupee,
  BookOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ToastProvider } from '../../components/ui';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { SuperAdminAuditLog } from './SuperAdminAuditLog';
import { SuperAdminBilling } from './SuperAdminBilling';
import { TenantDetailView } from './TenantDetailView';
import { PlanManagementView } from './PlanManagementView';
import { GuideView } from './GuideView';
import { TenantsView } from './TenantsView';
import { SAAnalyticsView } from './SAAnalyticsView';
import { session } from '../../lib/session';

type AdminTab = 'dashboard' | 'tenants' | 'plans' | 'billing' | 'audit' | 'analytics' | 'guide';

interface SuperAdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface SuperAdminAppProps {
  user: SuperAdminUser;
  onLogout: () => void;
}

export function SuperAdminApp({ user, onLogout }: SuperAdminAppProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  /** Desktop rail expanded (lg+) — unchanged desktop behavior */
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  /** Phone/tablet drawer */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tenants', label: 'Tenants', icon: Building2 },
    { id: 'plans', label: 'Plans', icon: CreditCard },
    { id: 'billing', label: 'Billing', icon: IndianRupee },
    { id: 'audit', label: 'Audit Log', icon: FileText },
    { id: 'guide', label: 'Guide', icon: BookOpen },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const handleSelectTenant = (id: string) => {
    setSelectedTenantId(id);
  };

  const handleBackFromDetail = () => {
    setSelectedTenantId(null);
  };

  const handleLogout = () => {
    session.removeToken();
    onLogout();
  };

  const goTab = (id: AdminTab) => {
    setActiveTab(id);
    if (id !== 'tenants') setSelectedTenantId(null);
    setMobileNavOpen(false);
  };

  const renderContent = () => {
    if (activeTab === 'tenants' && selectedTenantId) {
      return <TenantDetailView tenantId={selectedTenantId} onBack={handleBackFromDetail} />;
    }
    switch (activeTab) {
      case 'dashboard':
        return <SuperAdminDashboard />;
      case 'tenants':
        return <TenantsView onSelectTenant={handleSelectTenant} />;
      case 'plans':
        return <PlanManagementView />;
      case 'billing':
        return <SuperAdminBilling />;
      case 'audit':
        return <SuperAdminAuditLog />;
      case 'guide':
        return <GuideView />;
      case 'analytics':
        return <SAAnalyticsView />;
      default:
        return <SuperAdminDashboard />;
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-[100dvh] bg-gray-50 flex">
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-[1px]"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-col bg-[#151619] transition-all duration-300',
            'w-[min(88vw,16rem)] lg:w-auto',
            sidebarExpanded ? 'lg:w-64' : 'lg:w-20',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0">
              DG
            </div>
            {(sidebarExpanded || mobileNavOpen) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="overflow-hidden min-w-0 lg:block"
              >
                <p className="text-white font-bold text-sm leading-tight">Dhandho Admin</p>
                <p className="text-gray-500 text-xs">Super Admin Panel</p>
              </motion.div>
            )}
            <button
              type="button"
              className="ml-auto p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white lg:hidden"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              const showLabel = sidebarExpanded || mobileNavOpen;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTab(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-brand text-white shadow-lg shadow-brand/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  <item.icon size={20} className="shrink-0" />
                  {showLabel && <span className={cn(!sidebarExpanded && 'lg:hidden')}>{item.label}</span>}
                  {!sidebarExpanded && <span className="hidden lg:inline sr-only">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-3 py-4">
            {(sidebarExpanded || mobileNavOpen) && (
              <div className={cn('px-3 mb-3', !sidebarExpanded && 'lg:hidden')}>
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <LogOut size={20} className="shrink-0" />
              {(sidebarExpanded || mobileNavOpen) && (
                <span className={cn(!sidebarExpanded && 'lg:hidden')}>Logout</span>
              )}
            </button>
          </div>
        </aside>

        <main
          className={cn(
            'flex-1 min-w-0 transition-all duration-300',
            'ml-0',
            sidebarExpanded ? 'lg:ml-64' : 'lg:ml-20',
          )}
        >
          <header
            className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 sm:px-6 pb-3 sm:pb-4"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (window.matchMedia('(min-width: 1024px)').matches) setSidebarExpanded(o => !o);
                  else setMobileNavOpen(o => !o);
                }}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors"
                aria-label="Toggle menu"
              >
                <Menu size={20} className={cn('lg:hidden', mobileNavOpen && 'hidden')} />
                <X size={20} className={cn('lg:hidden', !mobileNavOpen && 'hidden')} />
                <Menu size={20} className={cn('hidden lg:block', sidebarExpanded && 'lg:hidden')} />
                <X size={20} className={cn('hidden', sidebarExpanded && 'lg:block')} />
              </button>
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate lg:hidden">
                  {navItems.find(n => n.id === activeTab)?.label}
                </p>
                <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() ?? 'A'}
                </div>
              </div>
            </div>
          </header>

          <div
            className="p-4 sm:p-6 lg:p-8 overflow-x-hidden"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
          >
            {renderContent()}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
