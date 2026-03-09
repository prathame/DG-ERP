import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  Gift, 
  Package, 
  Users, 
  ShoppingCart, 
  CreditCard, 
  FileText, 
  Settings, 
  Menu, 
  X,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  History,
  ArrowUpDown,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Product, Transaction, Warranty, RewardPoint } from './types';
import { api } from './api';

type Tab = 'dashboard' | 'warranty' | 'rewards' | 'inventory' | 'accounts' | 'masters';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'masters', label: 'Masters', icon: Users },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'accounts', label: 'Accounts', icon: CreditCard },
    { id: 'warranty', label: 'Warranty', icon: ShieldCheck },
    { id: 'rewards', label: 'Rewards', icon: Gift },
  ];

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-[#151619] text-white transition-all duration-300 flex flex-col z-50",
          isSidebarOpen ? "w-64" : "w-20"
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
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 hover:bg-white/10 rounded-md transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as Tab)}
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

        <div className="p-4 border-t border-white/5">
          <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-all">
            <Settings size={22} />
            {isSidebarOpen && <span className="font-medium">Settings</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold capitalize">{activeTab}</h1>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Premium Plan</span>
            </div>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search anything..." 
                className="pl-10 pr-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:ring-2 focus:ring-[#F27D26] transition-all w-64"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">Kalbii Admin</p>
                <p className="text-xs text-gray-500">Super Admin</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#F27D26] to-[#FFB347] border-2 border-white shadow-sm" />
            </div>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <DashboardView key="dashboard" />}
            {activeTab === 'warranty' && <WarrantyView key="warranty" />}
            {activeTab === 'rewards' && <RewardsView key="rewards" />}
            {activeTab === 'inventory' && <InventoryView key="inventory" />}
            {activeTab === 'accounts' && <AccountsView key="accounts" />}
            {activeTab === 'masters' && <MastersView key="masters" />}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function DashboardView() {
  const [stats, setStats] = useState<{ label: string; value: string; change: string; icon: typeof TrendingUp; color: string; bg: string }[]>([]);
  const [chartData, setChartData] = useState<{ name: string; sales: number; claims: number }[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.dashboard.stats(),
      api.dashboard.chart(),
      api.transactions.list(),
    ])
      .then(([s, c, t]) => {
        setStats([
          { label: 'Total Revenue', value: `₹${(s.totalRevenue / 1e6).toFixed(1)}M`, change: '+12.5%', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active Warranties', value: s.activeWarranties.toLocaleString(), change: '+8.2%', icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pending Claims', value: s.pendingClaims.toString(), change: '-2.4%', icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Reward Points Issued', value: s.rewardPointsIssued >= 1000 ? `${(s.rewardPointsIssued / 1000).toFixed(1)}K` : s.rewardPointsIssued.toString(), change: '+15.1%', icon: Gift, color: 'text-purple-600', bg: 'bg-purple-50' },
        ]);
        setChartData(c.length ? c : [
          { name: 'Jan', sales: 4000, claims: 240 },
          { name: 'Feb', sales: 3000, claims: 139 },
          { name: 'Mar', sales: 2000, claims: 980 },
          { name: 'Apr', sales: 2780, claims: 390 },
          { name: 'May', sales: 1890, claims: 480 },
          { name: 'Jun', sales: 2390, claims: 380 },
        ]);
        setTransactions(t.slice(0, 5));
      })
      .catch(() => {
        setStats([
          { label: 'Total Revenue', value: '₹0', change: '0%', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active Warranties', value: '0', change: '0%', icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pending Claims', value: '0', change: '0%', icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Reward Points Issued', value: '0', change: '0%', icon: Gift, color: 'text-purple-600', bg: 'bg-purple-50' },
        ]);
        setChartData([{ name: 'Jan', sales: 0, claims: 0 }]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-500">Loading...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-xl", stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
              <span className={cn("text-xs font-bold px-2 py-1 rounded-full", stat.change.startsWith('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                {stat.change}
              </span>
            </div>
            <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">Sales & Claims Overview</h3>
            <select className="text-sm bg-gray-50 border-none rounded-lg px-3 py-1 focus:ring-2 focus:ring-[#F27D26]">
              <option>Last 6 Months</option>
              <option>Last Year</option>
            </select>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F27D26" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#F27D26" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="claims" stroke="#1A1A1A" strokeWidth={3} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Recent Transactions</h3>
          <div className="space-y-6">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-2 rounded-lg",
                    t.type === 'Sales' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  )}>
                    {t.type === 'Sales' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{t.description}</p>
                    <p className="text-xs text-gray-500">{t.date}</p>
                  </div>
                </div>
                <p className={cn("text-sm font-bold", t.type === 'Sales' ? 'text-emerald-600' : 'text-rose-600')}>
                  {t.type === 'Sales' ? '+' : '-'}₹{t.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-3 text-sm font-bold text-[#F27D26] hover:bg-[#F27D26]/5 rounded-xl transition-colors">
            View All Transactions
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function WarrantyView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [formData, setFormData] = useState({ serialNumber: '', customerName: '', customerPhone: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.warranties.list({ search: search || undefined, status: statusFilter !== 'All Status' ? statusFilter : undefined })
      .then(setWarranties)
      .catch(() => setWarranties([]))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  const refreshWarranties = () => {
    api.warranties.list({ search: search || undefined, status: statusFilter !== 'All Status' ? statusFilter : undefined })
      .then(setWarranties);
  };

  const handleActivateWarranty = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    api.warranties.create(formData)
      .then(() => {
        setIsModalOpen(false);
        setFormData({ serialNumber: '', customerName: '', customerPhone: '' });
        refreshWarranties();
      })
      .catch((err) => alert(err.message))
      .finally(() => setSubmitting(false));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Warranty Management</h2>
          <p className="text-sm text-gray-500">Track and manage product warranties and claims</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            <FileText size={18} />
            Export Report
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold hover:bg-[#D96A1C] transition-colors shadow-lg shadow-[#F27D26]/20"
          >
            <Plus size={18} />
            Activate New Warranty
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* ... existing table code ... */}
        <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by Serial Number or Customer Name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26] transition-all"
            />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#F27D26]"
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Expired</option>
            <option>Under Claim</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                <th className="px-6 py-4">Serial Number</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Activation Date</th>
                <th className="px-6 py-4">Expiry Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Loading...</td></tr>
              ) : (
              warranties.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                        <Package size={16} className="text-gray-400" />
                      </div>
                      <span className="text-sm font-bold">{w.serialNumber || `SP-5HP-00${w.id}`}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-bold">{w.customerName}</p>
                      <p className="text-xs text-gray-500">{w.customerPhone}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{w.activationDate}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{w.expiryDate}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-1 rounded-full",
                      w.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 
                      w.status === 'Expired' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'
                    )}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-xs font-bold text-[#F27D26] hover:underline">View Details</button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">Activate Warranty</h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <form className="space-y-6" onSubmit={handleActivateWarranty}>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Serial Number</label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="e.g. SP-5HP-001" 
                        value={formData.serialNumber}
                        onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#F27D26] outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Customer Name</label>
                      <input 
                        type="text" 
                        placeholder="John Doe" 
                        value={formData.customerName}
                        onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#F27D26] outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Phone Number</label>
                      <input 
                        type="tel" 
                        placeholder="+91 98765 43210" 
                        value={formData.customerPhone}
                        onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#F27D26] outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Purchase Invoice</label>
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-[#F27D26] hover:bg-[#F27D26]/5 transition-all cursor-pointer">
                      <FileText className="mx-auto mb-2 text-gray-400" size={32} />
                      <p className="text-sm font-medium text-gray-600">Click to upload or drag & drop</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, JPG or PNG (max. 5MB)</p>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#F27D26] text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-[#F27D26]/20 hover:bg-[#D96A1C] transition-all transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {submitting ? 'Activating...' : 'Activate Warranty'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RewardsView() {
  const [rewards, setRewards] = useState<RewardPoint[]>([]);
  const [balance, setBalance] = useState(0);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.rewards.list(filter !== 'All' ? filter : undefined),
      api.rewards.balance(),
    ])
      .then(([r, b]) => {
        setRewards(r);
        setBalance(b.balance);
      })
      .catch(() => setRewards([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#151619] text-white p-8 rounded-3xl relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F27D26] blur-[80px] opacity-20" />
            <div className="relative z-10">
              <p className="text-gray-400 text-sm font-medium mb-2">Total Points Balance</p>
              <h2 className="text-4xl font-bold mb-8">{balance.toLocaleString()} <span className="text-lg font-normal text-gray-500">pts</span></h2>
              <div className="flex gap-4">
                <button className="flex-1 bg-[#F27D26] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#D96A1C] transition-colors">
                  Redeem Now
                </button>
                <button className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors">
                  History
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-center group">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mx-auto mb-2 shadow-sm group-hover:scale-110 transition-transform">
                  <Plus className="text-[#F27D26]" size={20} />
                </div>
                <span className="text-xs font-bold">Add Points</span>
              </button>
              <button className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-center group">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mx-auto mb-2 shadow-sm group-hover:scale-110 transition-transform">
                  <Users className="text-[#F27D26]" size={20} />
                </div>
                <span className="text-xs font-bold">Dealer Targets</span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">Points History</h3>
            <div className="flex gap-2">
              {(['All', 'Earned', 'Redeemed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-full",
                    filter === f ? "bg-[#F27D26] text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {loading ? (
              <div className="py-12 text-center text-gray-500">Loading...</div>
            ) : (
            rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    r.type === 'Earned' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  )}>
                    {r.type === 'Earned' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                  </div>
                  <div>
                    <p className="font-bold">{r.description}</p>
                    <p className="text-xs text-gray-500">{r.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("font-bold text-lg", r.type === 'Earned' ? 'text-emerald-600' : 'text-rose-600')}>
                    {r.type === 'Earned' ? '+' : '-'}{r.points}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{r.type}</p>
                </div>
              </div>
            ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InventoryView() {
  const [sortBy, setSortBy] = useState<keyof Product>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [products, setProducts] = useState<Product[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.products.list()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const sortedProducts = [...products].sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];
    
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    }
    return 0;
  });

  const toggleSort = (field: keyof Product) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleDelete = () => {
    if (productToDelete) {
      api.products.delete(productToDelete.id)
        .then(() => {
          setProducts(products.filter(p => p.id !== productToDelete.id));
          setProductToDelete(null);
        })
        .catch((err) => alert(err.message));
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Inventory Management</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold shadow-lg shadow-[#F27D26]/20">
          <Plus size={18} /> Add Product
        </button>
      </div>

      {/* Sorting Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 overflow-x-auto">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Sort By:</span>
        <div className="flex items-center gap-2">
          {[
            { label: 'Name', key: 'name' },
            { label: 'Price', key: 'price' },
            { label: 'Stock', key: 'stock' },
            { label: 'Category', key: 'category' }
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => toggleSort(item.key as keyof Product)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                sortBy === item.key 
                  ? "bg-[#F27D26] text-white shadow-md shadow-[#F27D26]/20" 
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              )}
            >
              {item.label}
              {sortBy === item.key && (
                <ArrowUpDown size={14} className={cn("transition-transform", sortOrder === 'desc' && "rotate-180")} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center text-gray-500">Loading...</div>
        ) : (
        sortedProducts.map((p) => (
          <div key={p.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group">
            <button 
              onClick={() => setProductToDelete(p)}
              className="absolute top-4 right-4 p-2 bg-rose-50 text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-100"
            >
              <Trash2 size={18} />
            </button>
            <div className="w-full aspect-square bg-gray-50 rounded-xl mb-4 flex items-center justify-center overflow-hidden">
               <img 
                src={`https://picsum.photos/seed/pump${p.id}/400/400`} 
                alt={p.name} 
                className="w-full h-full object-cover mix-blend-multiply opacity-80"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#F27D26] uppercase tracking-wider">{p.category}</p>
              <h3 className="font-bold text-lg">{p.name}</h3>
              <p className="text-xs text-gray-400 font-mono">{p.serialNumber}</p>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between">
              <div className={cn(
                "px-3 py-2 rounded-xl transition-colors",
                p.stock < 10 ? "bg-amber-50 border border-amber-100" : ""
              )}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Current Stock</p>
                  {p.stock < 10 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full uppercase tracking-tight">
                      <AlertTriangle size={10} />
                      Low
                    </span>
                  )}
                </div>
                <p className={cn(
                  "font-bold text-lg leading-none",
                  p.stock < 10 ? "text-amber-700" : "text-gray-900"
                )}>
                  {p.stock} <span className="text-xs font-normal opacity-60">units</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Price</p>
                <p className="font-bold text-lg text-emerald-600 leading-none">₹{p.price.toLocaleString()}</p>
              </div>
            </div>
          </div>
        ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProductToDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-8"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-2">Delete Product?</h3>
                <p className="text-gray-500 mb-8">
                  Are you sure you want to delete <span className="font-bold text-gray-900">"{productToDelete.name}"</span>? This action cannot be undone.
                </p>
                <div className="flex gap-4 w-full">
                  <button 
                    onClick={() => setProductToDelete(null)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDelete}
                    className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AccountsView() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.transactions.list()
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold">Financial Ledger</h2>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><History size={20} className="text-gray-400" /></button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><FileText size={20} className="text-gray-400" /></button>
          </div>
        </div>
        <div className="space-y-1">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading...</div>
          ) : (
          transactions.map((t, i) => (
            <div key={t.id} className={cn(
              "flex items-center justify-between p-4 rounded-xl transition-all",
              i % 2 === 0 ? 'bg-gray-50/50' : 'bg-transparent'
            )}>
              <div className="flex items-center gap-6">
                <span className="text-xs font-mono text-gray-400 w-12">{t.id}</span>
                <span className="text-sm font-medium text-gray-600 w-24">{t.date}</span>
                <span className="text-sm font-bold w-48 truncate">{t.description}</span>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                  t.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                )}>
                  {t.status}
                </span>
              </div>
              <span className={cn(
                "font-bold",
                t.type === 'Sales' ? 'text-emerald-600' : 'text-rose-600'
              )}>
                {t.type === 'Sales' ? '+' : '-'}₹{t.amount.toLocaleString()}
              </span>
            </div>
          ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MastersView() {
  const masters = [
    { name: 'Customer Master', count: 450, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Vendor Master', count: 85, icon: ShoppingCart, icon2: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    { name: 'Item Master', count: 120, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { name: 'Bank Master', count: 4, icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      {masters.map((m, i) => (
        <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn("p-4 rounded-2xl transition-transform group-hover:scale-110", m.bg)}>
                <m.icon className={m.color} size={28} />
              </div>
              <div>
                <h3 className="font-bold text-lg">{m.name}</h3>
                <p className="text-sm text-gray-500">{m.count} records found</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-[#F27D26] group-hover:text-white transition-colors">
              <Plus size={20} />
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}
