import React, { useState } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Tab, USER_STORAGE_KEY } from './types';
import { ToastProvider } from './components/ui';
import { LoginScreen, GlobalSearchBar, NotificationBell } from './components/layout';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; vendorId?: string | null; autoWhatsapp?: boolean } | null>(() => {
    try {
      const s = sessionStorage.getItem(USER_STORAGE_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const ux = user as Record<string, unknown>;
  const warrantyEnabled = ux?.warrantyEnabled !== false;
  const replacementEnabled = ux?.replacementEnabled !== false;
  const rewardsEnabled = ux?.rewardsEnabled !== false;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales Entry', icon: ShoppingCart },
    { id: 'distribution', label: 'Distribution', icon: Package },
    { id: 'masters', label: 'Masters', icon: Users },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'accounts', label: 'Accounts', icon: CreditCard },
    { id: 'finance', label: 'Finance', icon: IndianRupee },
    ...(warrantyEnabled ? [{ id: 'warranty', label: 'Warranty', icon: ShieldCheck }] : []),
    ...(replacementEnabled ? [{ id: 'replacements', label: 'Replacements', icon: RefreshCw }] : []),
    ...(rewardsEnabled ? [{ id: 'rewards', label: 'Rewards', icon: Gift }] : []),
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

  if (!user) {
    return (
      <ToastProvider>
        <LoginScreen onLogin={(u) => { sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u)); setUser(u); }} />
      </ToastProvider>
    );
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
              <div className="w-8 h-8 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-lg">S</div>
              <span className="font-bold text-xl tracking-tight">SPLENDOR</span>
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
              {isSidebarOpen && <span className="font-medium">Settings</span>}
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold capitalize">{activeTab}</h1>
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
                    <button type="button" onClick={() => { sessionStorage.removeItem(USER_STORAGE_KEY); setUser(null); setUserMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 font-medium">
                      <LogOut size={16} />
                      Logout
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
          {activeTab === 'finance' && <VendorFinanceView user={user} />}
          {activeTab === 'settings' && <SettingsView user={user} onUserChange={setUser} />}
        </div>
      </main>
      <ChatWidget />
    </div>
    </ToastProvider>
  );
}
