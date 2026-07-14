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
  Monitor,
  BookOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ToastProvider } from '../../components/ui';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { SuperAdminAuditLog } from './SuperAdminAuditLog';
import { SuperAdminBilling } from './SuperAdminBilling';
import { TenantListView } from './TenantListView';
import { TenantDetailView } from './TenantDetailView';
import { PlanManagementView } from './PlanManagementView';
import { OnPremView } from './OnPremView';
import { GuideView } from './GuideView';
import { session } from '../../lib/session';

type AdminTab = 'dashboard' | 'tenants' | 'plans' | 'billing' | 'audit' | 'analytics' | 'onprem' | 'guide';

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tenants', label: 'Tenants', icon: Building2 },
    { id: 'plans', label: 'Plans', icon: CreditCard },
    { id: 'billing', label: 'Billing', icon: IndianRupee },
    { id: 'onprem', label: 'On-Prem', icon: Monitor },
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

  const renderContent = () => {
    if (activeTab === 'tenants' && selectedTenantId) {
      return <TenantDetailView tenantId={selectedTenantId} onBack={handleBackFromDetail} />;
    }
    switch (activeTab) {
      case 'dashboard':
        return <SuperAdminDashboard />;
      case 'tenants':
        return <TenantListView onSelectTenant={handleSelectTenant} />;
      case 'plans':
        return <PlanManagementView />;
      case 'billing':
        return <SuperAdminBilling />;
      case 'audit':
        return <SuperAdminAuditLog />;
      case 'onprem':
        return <OnPremView saToken={session.getToken() || ''} />;
      case 'guide':
        return <GuideView />;
      case 'analytics':
        return (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BarChart3 size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-medium">Analytics Coming Soon</p>
            <p className="text-sm mt-1">Advanced platform analytics will be available here</p>
          </div>
        );
      default:
        return <SuperAdminDashboard />;
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex flex-col bg-[#151619] transition-all duration-300",
            sidebarOpen ? "w-64" : "w-20"
          )}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0">
              DG
            </div>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden">
                <p className="text-white font-bold text-sm leading-tight">DG ERP Admin</p>
                <p className="text-gray-500 text-xs">Super Admin Panel</p>
              </motion.div>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 py-4 px-3 space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id !== 'tenants') setSelectedTenantId(null);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-brand text-white shadow-lg shadow-brand/20"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon size={20} />
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* User / Logout */}
          <div className="border-t border-white/10 px-3 py-4">
            {sidebarOpen && (
              <div className="px-3 mb-3">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <LogOut size={20} />
              {sidebarOpen && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={cn(
            "flex-1 transition-all duration-300",
            sidebarOpen ? "ml-64" : "ml-20"
          )}
        >
          {/* Top bar */}
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {user.name?.charAt(0)?.toUpperCase() ?? 'A'}
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-6 lg:p-8">
            {renderContent()}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
