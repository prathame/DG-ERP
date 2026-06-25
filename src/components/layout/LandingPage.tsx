import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Package, ShoppingCart, Truck, Receipt, IndianRupee, MessageSquare,
  Palette, Moon, ShieldCheck, BarChart3, Users, Zap,
  ArrowRight, Check, Star, Mail, Phone, Send, MessageCircle, Sun,
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

function EnquiryForm({ dark }: { dark: boolean }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const inputCls = dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-[#1A1A1A] placeholder-gray-400';
  const formCardCls = dark ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-200 shadow-sm';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const subject = encodeURIComponent(`DG ERP Enquiry from ${form.name} — ${form.company || 'N/A'}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone || 'N/A'}\nCompany: ${form.company || 'N/A'}\n\nMessage:\n${form.message}`
    );
    window.open(`mailto:patelprathamesh007@gmail.com?subject=${subject}&body=${body}`, '_self');
    setTimeout(() => { setSent(true); setSending(false); }, 500);
  };

  if (sent) {
    return (
      <div className={`p-8 border rounded-2xl text-center ${formCardCls}`}>
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} className="text-green-500" /></div>
        <h3 className="font-bold text-xl mb-2">Thank You!</h3>
        <p className={`text-sm mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Your email client should have opened with the enquiry. If not, email us directly at:</p>
        <a href="mailto:patelprathamesh007@gmail.com" className="text-[#F27D26] font-medium hover:underline">patelprathamesh007@gmail.com</a>
        <div className="mt-6">
          <button type="button" onClick={() => { setSent(false); setForm({ name: '', email: '', phone: '', company: '', message: '' }); }} className="text-sm text-gray-500 hover:text-white transition-colors">Send another enquiry</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`p-8 border rounded-2xl space-y-4 ${formCardCls}`}>
      <h3 className="font-bold text-lg mb-1">Send Enquiry</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Name *</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#F27D26] focus:border-transparent ${inputCls}`} placeholder="Your name" />
        </div>
        <div>
          <label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Email *</label>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#F27D26] focus:border-transparent ${inputCls}`} placeholder="you@example.com" />
        </div>
        <div>
          <label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#F27D26] focus:border-transparent ${inputCls}`} placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Company Name</label>
          <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#F27D26] focus:border-transparent ${inputCls}`} placeholder="Your Company Ltd." />
        </div>
      </div>
      <div>
        <label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Message *</label>
        <textarea required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#F27D26] focus:border-transparent resize-none ${inputCls}`} placeholder="Tell us about your business and what you're looking for..." />
      </div>
      <button type="submit" disabled={sending} className="w-full py-4 bg-[#F27D26] text-white rounded-xl font-bold text-lg hover:bg-[#D96A1C] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
        <Send size={18} /> {sending ? 'Sending...' : 'Send Enquiry'}
      </button>
      <p className="text-xs text-gray-600 text-center">Or WhatsApp us directly at <a href="https://wa.me/918806907616?text=Hi%2C%20I%20want%20to%20know%20more%20about%20DG%20ERP" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">+91 88069 07616</a></p>
    </form>
  );
}

export function LandingPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggleTheme = () => {
    const nowDark = document.documentElement.classList.toggle('dark');
    sessionStorage.setItem('dg_erp_theme', nowDark ? 'dark' : 'light');
    setDark(nowDark);
  };

  // Theme-aware colors
  const bg = dark ? 'bg-[#0A0B0D]' : 'bg-[#F8F9FA]';
  const navBg = dark ? 'bg-[#0A0B0D]/80' : 'bg-white/80';
  const navBorder = dark ? 'border-white/5' : 'border-gray-200';
  const text = dark ? 'text-white' : 'text-[#1A1A1A]';
  const textMuted = dark ? 'text-gray-400' : 'text-gray-600';
  const textFaint = dark ? 'text-gray-500' : 'text-gray-400';
  const textFooter = dark ? 'text-gray-600' : 'text-gray-400';
  const cardBg = dark ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-200 shadow-sm';
  const cardHover = dark ? 'hover:border-[#F27D26]/30 hover:bg-white/[0.05]' : 'hover:border-[#F27D26]/30 hover:shadow-md';
  const sectionAlt = dark ? 'bg-white/[0.02]' : 'bg-gray-50';
  const inputBg = dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-[#1A1A1A] placeholder-gray-400';
  const badgeBg = dark ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-[#F27D26]/5 border-[#F27D26]/20 text-[#F27D26]';
  const btnSecondary = dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 text-[#1A1A1A] hover:bg-gray-50';
  const navLink = dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-[#1A1A1A]';
  const adminBtn = dark ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10' : 'bg-[#F27D26] border-[#F27D26] text-white hover:bg-[#D96A1C]';
  const highlightCard = dark ? 'bg-[#F27D26]/10 border-[#F27D26]/30' : 'bg-[#F27D26]/5 border-[#F27D26]/30 shadow-lg shadow-[#F27D26]/10';

  return (
    <div className={`min-h-screen ${bg} ${text} overflow-x-hidden transition-colors duration-300`}>
      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 ${navBg} backdrop-blur-xl border-b ${navBorder} transition-colors duration-300`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-sm text-white">DG</div>
            <span className="font-bold text-lg">DG ERP</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#features" className={`px-4 py-2 text-sm font-semibold ${navLink} transition-colors hidden md:block`}>Features</a>
            <a href="#contact" className={`px-4 py-2 text-sm font-semibold ${navLink} transition-colors hidden md:block`}>Contact</a>
            <button type="button" onClick={toggleTheme} className={`p-2 rounded-lg ${navLink} transition-colors`} title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a href="/admin" className={`px-5 py-2 text-sm font-semibold border rounded-lg transition-colors ${adminBtn}`}>Admin Login</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-[#F27D26]/10 via-transparent to-purple-900/10 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-[#F27D26]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className={`inline-flex items-center gap-2 px-4 py-1.5 border rounded-full text-xs font-medium mb-8 ${badgeBg}`}>
              <Star size={12} className="text-[#F27D26]" /> Multi-Tenant SaaS ERP Platform
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
              DG ERP
              <br />
              <span className="bg-gradient-to-r from-[#F27D26] to-[#FFB347] bg-clip-text text-transparent">Management</span>
            </h1>
            <p className={`mt-6 text-lg md:text-xl ${textMuted} max-w-2xl mx-auto leading-relaxed`}>
              Industry-agnostic ERP for Inventory, Sales, Distribution, Warranty & Rewards.
              Onboard unlimited companies — each with isolated data and fully branded experience.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/admin" className="group px-8 py-4 bg-[#F27D26] text-white rounded-xl font-bold text-lg hover:bg-[#D96A1C] transition-all flex items-center gap-2 shadow-lg shadow-[#F27D26]/20">
                Get Started <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#features" className={`px-8 py-4 border rounded-xl font-bold text-lg transition-all ${btnSecondary}`}>
                Explore Features
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className={`py-12 border-y ${navBorder}`}>
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { val: '23+', label: 'Database Tables' },
            { val: '22', label: 'API Route Files' },
            { val: '30+', label: 'Chatbot Commands' },
            { val: '100%', label: 'Data Isolation' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-[#F27D26]">{s.val}</p>
              <p className={`text-sm mt-1 ${textFaint}`}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Everything You Need</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>Comprehensive ERP features for any industry</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className={`p-6 border rounded-2xl transition-all group ${cardBg} ${cardHover}`}
              >
                <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#F27D26]/20 transition-colors">
                  <f.icon size={20} className="text-[#F27D26]" />
                </div>
                <h3 className="font-bold text-sm mb-2">{f.title}</h3>
                <p className={`text-xs ${textFaint} leading-relaxed`}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={`py-24 px-6 ${sectionAlt}`}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">How It Works</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>Get your company running in minutes</p>
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
                <div className="w-16 h-16 bg-gradient-to-br from-[#F27D26] to-[#FFB347] rounded-2xl flex items-center justify-center font-bold text-2xl text-white mx-auto mb-4 shadow-lg shadow-[#F27D26]/20">
                  {s.num}
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className={`text-sm ${textFaint}`}>{s.desc}</p>
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
            <p className={`mt-3 ${textMuted} text-lg`}>Start free, scale as you grow</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={`p-6 rounded-2xl border transition-all ${p.highlight ? highlightCard : cardBg}`}
              >
                {p.highlight && <p className="text-[10px] font-bold text-[#F27D26] uppercase tracking-wider mb-3">Most Popular</p>}
                <h3 className="font-bold text-lg">{p.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className={`text-sm ${textFaint}`}>{p.period}</span>
                </div>
                <ul className="space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${textMuted}`}>
                      <Check size={14} className="text-[#F27D26] shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / Enquiry */}
      <section id="contact" className={`py-24 px-6 ${sectionAlt}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Contact Us</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>Get in touch to onboard your company</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            {/* Contact Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className={`p-6 border rounded-2xl space-y-5 ${cardBg}`}>
                <h3 className="font-bold text-lg mb-1">Get In Touch</h3>
                <p className={`text-sm ${textFaint}`}>Have questions about DG ERP? Want to onboard your company? Reach out to us.</p>
                <div className="space-y-4 pt-2">
                  <a href="mailto:patelprathamesh007@gmail.com" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-[#F27D26] transition-colors`}>
                    <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center shrink-0"><Mail size={18} className="text-[#F27D26]" /></div>
                    <div><p className={`text-xs ${textFooter}`}>Email</p><p className="text-sm font-medium">patelprathamesh007@gmail.com</p></div>
                  </a>
                  <a href="tel:+918806907616" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-[#F27D26] transition-colors`}>
                    <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center shrink-0"><Phone size={18} className="text-[#F27D26]" /></div>
                    <div><p className={`text-xs ${textFooter}`}>Phone</p><p className="text-sm font-medium">+91 88069 07616</p></div>
                  </a>
                  <a href="https://wa.me/918806907616?text=Hi%2C%20I%20want%20to%20know%20more%20about%20DG%20ERP" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-green-400 transition-colors`}>
                    <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0"><MessageCircle size={18} className="text-green-500" /></div>
                    <div><p className={`text-xs ${textFooter}`}>WhatsApp</p><p className="text-sm font-medium">+91 88069 07616</p></div>
                  </a>
                </div>
              </div>
            </div>

            {/* Enquiry Form */}
            <div className="lg:col-span-3">
              <EnquiryForm dark={dark} />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t ${navBorder} py-10 px-6`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-xs text-white">DG</div>
              <span className="font-bold">DG ERP Management</span>
            </div>
            <div className={`flex items-center gap-6 text-sm ${textFaint}`}>
              <a href="#features" className={`${navLink} transition-colors`}>Features</a>
              <a href="#contact" className={`${navLink} transition-colors`}>Contact</a>
              <a href="/admin" className={`${navLink} transition-colors`}>Admin</a>
            </div>
            <div className={`flex items-center gap-4 ${textFooter}`}>
              <a href="mailto:patelprathamesh007@gmail.com" className="hover:text-[#F27D26] transition-colors"><Mail size={16} /></a>
              <a href="tel:+918806907616" className="hover:text-[#F27D26] transition-colors"><Phone size={16} /></a>
              <a href="https://wa.me/918806907616" target="_blank" rel="noopener noreferrer" className="hover:text-green-500 transition-colors"><MessageCircle size={16} /></a>
            </div>
          </div>
          <p className={`text-xs ${textFooter} text-center mt-6`}>&copy; {new Date().getFullYear()} DG ERP Management. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
