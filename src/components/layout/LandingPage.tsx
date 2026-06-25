import { motion } from 'motion/react';
import {
  Package, ShoppingCart, Truck, Receipt, IndianRupee, MessageSquare,
  Palette, Moon, ShieldCheck, BarChart3, Users, Zap,
  ArrowRight, Check, Star,
} from 'lucide-react';

const FEATURES = [
  { icon: Package, title: 'Inventory Management', desc: 'Auto-barcode ranges, stock tracking, batch management with prefix-based generation' },
  { icon: ShoppingCart, title: 'Sales & Billing', desc: 'Barcode scan sales, GST tax invoices with CGST/SGST breakdown, split billing' },
  { icon: Truck, title: 'Distribution', desc: 'Spreadsheet-style vendor distribution with per-row discount and GST toggles' },
  { icon: IndianRupee, title: 'Vendor Finance', desc: 'Payment tracking, balance management, automated WhatsApp payment reminders' },
  { icon: Palette, title: 'Custom Branding', desc: 'Company logo, accent colors, bank details, signatory — fully branded bills per tenant' },
  { icon: ShieldCheck, title: 'Warranty & Rewards', desc: 'Auto-warranty on sale, replacement tracking, vendor reward points system' },
  { icon: MessageSquare, title: 'ERP Chatbot', desc: '30+ natural language commands — sales today, low stock, top vendors, and more' },
  { icon: Moon, title: 'Dark Mode', desc: 'Light and dark theme with one-click toggle, persisted across sessions' },
];

const STEPS = [
  { num: '01', title: 'Create Tenant', desc: 'Super admin creates a company with plan, admin credentials, and unique URL' },
  { num: '02', title: 'Branded Login', desc: 'Tenant gets a branded URL like /your-company with custom logo and colors' },
  { num: '03', title: 'Start Working', desc: 'Admin adds products, vendors get auto-login, team starts managing inventory and sales' },
];

const PLANS = [
  { name: 'Trial', price: 'Free', period: '14 days', features: ['20 Products', '3 Vendors', '2 Users', 'All Features'], highlight: false },
  { name: 'Starter', price: '₹999', period: '/month', features: ['50 Products', '5 Vendors', '3 Users', 'Core Features'], highlight: false },
  { name: 'Professional', price: '₹2,999', period: '/month', features: ['500 Products', '25 Vendors', '15 Users', 'Warranty + Rewards + Finance'], highlight: true },
  { name: 'Enterprise', price: '₹9,999', period: '/month', features: ['Unlimited Products', 'Unlimited Vendors', 'Unlimited Users', 'Chatbot + API + Priority Support'], highlight: false },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0B0D] text-white overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A0B0D]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-sm">DG</div>
            <span className="font-bold text-lg">DG ERP</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin" className="px-5 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors">Admin Login</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-[#F27D26]/10 via-transparent to-purple-900/10 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-[#F27D26]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-gray-400 mb-8">
              <Star size={12} className="text-[#F27D26]" /> Multi-Tenant SaaS ERP Platform
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
              <span className="text-white">DG ERP</span>
              <br />
              <span className="bg-gradient-to-r from-[#F27D26] to-[#FFB347] bg-clip-text text-transparent">Management</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Industry-agnostic ERP for Inventory, Sales, Distribution, Warranty & Rewards.
              Onboard unlimited companies — each with isolated data and fully branded experience.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/admin" className="group px-8 py-4 bg-[#F27D26] text-white rounded-xl font-bold text-lg hover:bg-[#D96A1C] transition-all flex items-center gap-2 shadow-lg shadow-[#F27D26]/20">
                Get Started <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#features" className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-white/10 transition-all">
                Explore Features
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { val: '23+', label: 'Database Tables' },
            { val: '22', label: 'API Route Files' },
            { val: '30+', label: 'Chatbot Commands' },
            { val: '100%', label: 'Data Isolation' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-[#F27D26]">{s.val}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Everything You Need</h2>
            <p className="mt-3 text-gray-400 text-lg">Comprehensive ERP features for any industry</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="p-6 bg-white/[0.03] border border-white/5 rounded-2xl hover:border-[#F27D26]/30 hover:bg-white/[0.05] transition-all group"
              >
                <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#F27D26]/20 transition-colors">
                  <f.icon size={20} className="text-[#F27D26]" />
                </div>
                <h3 className="font-bold text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">How It Works</h2>
            <p className="mt-3 text-gray-400 text-lg">Get your company running in minutes</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-[#F27D26] to-[#FFB347] rounded-2xl flex items-center justify-center font-bold text-2xl mx-auto mb-4 shadow-lg shadow-[#F27D26]/20">
                  {s.num}
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Simple Pricing</h2>
            <p className="mt-3 text-gray-400 text-lg">Start free, scale as you grow</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={`p-6 rounded-2xl border transition-all ${p.highlight ? 'bg-[#F27D26]/10 border-[#F27D26]/30 shadow-lg shadow-[#F27D26]/10' : 'bg-white/[0.03] border-white/5'}`}
              >
                {p.highlight && <p className="text-[10px] font-bold text-[#F27D26] uppercase tracking-wider mb-3">Most Popular</p>}
                <h3 className="font-bold text-lg">{p.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className="text-sm text-gray-500">{p.period}</span>
                </div>
                <ul className="space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-400">
                      <Check size={14} className="text-[#F27D26] shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-12 bg-gradient-to-br from-[#F27D26]/10 to-purple-900/10 border border-white/5 rounded-3xl">
            <BarChart3 size={40} className="text-[#F27D26] mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-3">Ready to Manage Your Business?</h2>
            <p className="text-gray-400 mb-8">Contact us to get your company onboarded with a branded ERP portal</p>
            <a href="/admin" className="inline-flex items-center gap-2 px-8 py-4 bg-[#F27D26] text-white rounded-xl font-bold text-lg hover:bg-[#D96A1C] transition-all shadow-lg shadow-[#F27D26]/20">
              Admin Portal <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-xs">DG</div>
            <span className="font-bold">DG ERP Management</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="/admin" className="hover:text-white transition-colors">Admin</a>
          </div>
          <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} DG ERP Management. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
