import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Package, ShoppingCart, Truck, Receipt, IndianRupee, MessageSquare, Smartphone,
  Moon, ShieldCheck, BarChart3, Users, Languages, Building2, Shield,
  ArrowRight, Check, Star, Mail, Phone, Send, MessageCircle, Sun, Search,
  Store, Factory, Warehouse, FileText, Zap, Heart, Globe, BookOpen,
} from 'lucide-react';

function EnquiryForm({ dark }: { dark: boolean }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const inputCls = dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-[#1A1A1A] placeholder-gray-400';
  const formCardCls = dark ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-200 shadow-sm';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setSending(true);
    const subject = encodeURIComponent(`DG Business Enquiry from ${form.name} — ${form.company || 'N/A'}`);
    const body = `Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone || 'N/A'}\nCompany: ${form.company || 'N/A'}\n\nMessage:\n${form.message}`;
    window.open(`https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    setTimeout(() => { setSent(true); setSending(false); }, 500);
  };

  if (sent) return (
    <div className={`p-8 border rounded-2xl text-center ${formCardCls}`}>
      <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} className="text-green-500" /></div>
      <h3 className="font-bold text-xl mb-2">Dhanyavaad! Thank You!</h3>
      <p className={`text-sm mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>We'll get back to you within 24 hours.</p>
      <button type="button" onClick={() => { setSent(false); setForm({ name: '', email: '', phone: '', company: '', message: '' }); }} className="text-sm text-[#F27D26] hover:underline">Send another</button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={`p-8 border rounded-2xl space-y-4 ${formCardCls}`}>
      <h3 className="font-bold text-lg mb-1">Start Your Free Trial</h3>
      <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'} -mt-2 mb-2`}>No credit card needed. Start managing in 5 minutes.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="Aapka naam" /></div>
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Phone *</label><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="+91 98765 43210" /></div>
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="you@example.com" /></div>
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Business Name</label><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="Aapki dukaan / company" /></div>
      </div>
      <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Message</label><textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={`w-full px-4 py-3 border rounded-xl resize-none ${inputCls}`} placeholder="Business type, products, team size..." /></div>
      <button type="submit" disabled={sending} className="w-full py-4 bg-[#F27D26] text-white rounded-xl font-bold text-lg hover:bg-[#D96A1C] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"><Send size={18} /> {sending ? 'Sending...' : 'Get Started Free'}</button>
      <p className="text-xs text-gray-500 text-center">Or WhatsApp us: <a href="https://wa.me/918806907616?text=Hi%2C%20I%20want%20DG%20ERP%20for%20my%20business" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline font-medium">+91 88069 07616</a></p>
    </form>
  );
}

export function LandingPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [lang, setLang] = useState<'en' | 'hi' | 'gu'>('hi');
  const [heroLang, setHeroLang] = useState(0);
  const toggleTheme = () => { const d = document.documentElement.classList.toggle('dark'); localStorage.setItem('dg_erp_theme', d ? 'dark' : 'light'); setDark(d); };
  const nextLang = () => setLang(lang === 'en' ? 'hi' : lang === 'hi' ? 'gu' : 'en');
  const isGu = lang === 'gu';
  const isEn = lang === 'en';
  const langLabel = lang === 'en' ? 'EN' : lang === 'hi' ? 'हि' : 'ગુ';

  React.useEffect(() => {
    const timer = setInterval(() => setHeroLang(h => (h + 1) % 3), 4000);
    return () => clearInterval(timer);
  }, []);

  const bg = dark ? 'bg-[#0A0B0D]' : 'bg-[#FAFAFA]';
  const navBg = dark ? 'bg-[#0A0B0D]/80' : 'bg-white/80';
  const navBorder = dark ? 'border-white/5' : 'border-gray-200';
  const text = dark ? 'text-white' : 'text-[#1A1A1A]';
  const textMuted = dark ? 'text-gray-400' : 'text-gray-600';
  const textFaint = dark ? 'text-gray-500' : 'text-gray-400';
  const cardBg = dark ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100 shadow-sm';
  const cardHover = dark ? 'hover:border-[#F27D26]/30 hover:bg-white/[0.05]' : 'hover:border-[#F27D26]/30 hover:shadow-md';
  const sectionAlt = dark ? 'bg-white/[0.02]' : 'bg-white';
  const badgeBg = dark ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-[#F27D26]/5 border-[#F27D26]/20 text-[#F27D26]';
  const btnSecondary = dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 text-[#1A1A1A] hover:bg-gray-50';
  const navLink = dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-[#1A1A1A]';
  const adminBtn = dark ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10' : 'bg-[#F27D26] border-[#F27D26] text-white hover:bg-[#D96A1C]';

  return (
    <div className={`min-h-screen ${bg} ${text} overflow-x-hidden transition-colors duration-300`}>
      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 ${navBg} backdrop-blur-xl border-b ${navBorder}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm text-white">DG</div>
            <span className="font-bold text-base sm:text-lg">DG Business</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <a href="#business" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>For Business</a>
            <a href="#features" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>Features</a>
            <a href="#pricing" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>Pricing</a>
            <a href="#contact" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>Contact</a>
            <button type="button" onClick={nextLang} className={`px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold border ${dark ? 'border-white/10 text-gray-300' : 'border-gray-200 text-gray-600'}`}>{langLabel}</button>
            <button type="button" onClick={toggleTheme} className={`p-1.5 sm:p-2 rounded-lg ${navLink}`}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 sm:pt-28 pb-14 sm:pb-20 px-4 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF9933]/10 via-transparent to-[#138808]/10 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-[#F27D26]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 sm:px-5 py-1.5 sm:py-2 bg-gradient-to-r from-[#FF9933] via-white to-[#138808] text-[#1A1A1A] rounded-full text-xs sm:text-sm font-bold mb-4 sm:mb-6 shadow-lg">
              🇮🇳 {['Made in India, for Indian Businesses', 'भारत में बना, भारतीयों के लिए', 'ભારતમાં બનેલું, ભારતીયો માટે'][heroLang]}
            </div>
            <div className="relative h-[200px] sm:h-[180px] md:h-[200px] overflow-hidden">
              {[
                { line1: 'From Shop to Factory', line2: 'Your Business, Simplified', sub: 'From small shops to large manufacturers — inventory, billing, GST, vendor management, accounting all in one place.' },
                { line1: 'दुकान हो या फैक्ट्री', line2: 'बिज़नेस आसान बनाओ', sub: 'छोटी दुकान से लेकर बड़े manufacturer तक — inventory, billing, GST, vendor management सब एक जगह।' },
                { line1: 'દુકાન હોય કે ફેક્ટરી', line2: 'બિઝનેસ સરળ બનાવો', sub: 'નાની દુકાનથી લઈને મોટા manufacturer સુધી — inventory, billing, GST, vendor management બધું એક જગ્યાએ।' },
              ].map((h, i) => (
                <motion.div key={i} initial={false} animate={{ opacity: heroLang === i ? 1 : 0, y: heroLang === i ? 0 : 20 }} transition={{ duration: 0.5 }} className={`absolute inset-0 ${heroLang === i ? '' : 'pointer-events-none'}`}>
                  <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-tight">
                    <span className="text-2xl sm:text-3xl md:text-4xl">{h.line1}</span><br />
                    <span className="bg-gradient-to-r from-[#F27D26] to-[#FFB347] bg-clip-text text-transparent">{h.line2}</span>
                  </h1>
                  <p className={`mt-3 sm:mt-4 text-sm sm:text-lg md:text-xl ${textMuted} max-w-3xl mx-auto leading-relaxed px-2`}>{h.sub}</p>
                </motion.div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              {['EN', 'हिं', 'ગુ'].map((l, i) => (
                <button key={i} type="button" onClick={() => setHeroLang(i)} className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${heroLang === i ? 'bg-[#F27D26] text-white scale-110' : `${dark ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-500'}`}`}>{l}</button>
              ))}
            </div>
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <a href="#contact" className="group w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-[#F27D26] text-white rounded-xl font-bold text-base sm:text-lg hover:bg-[#D96A1C] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#F27D26]/20">
                {isEn ? 'Start Free Trial' : isGu ? 'ફ્રી ટ્રાયલ શરૂ કરો' : 'फ्री ट्रायल शुरू करें'} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#features" className={`w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 border rounded-xl font-bold text-base sm:text-lg transition-all text-center ${btnSecondary}`}>{isEn ? 'See Features' : isGu ? 'Features જુઓ' : 'Features देखें'}</a>
            </div>
            <p className={`mt-4 text-sm ${textFaint}`}>No credit card required • Setup in 5 minutes • Cancel anytime</p>
          </motion.div>
        </div>
      </section>

      {/* Trust Stats */}
      <section className={`py-8 sm:py-10 border-y ${navBorder}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6 text-center">
          {[
            { val: '15+', label: 'Modules' },
            { val: '₹0', label: 'To Start' },
            { val: '3', label: 'Languages' },
            { val: '100%', label: 'Cloud Based' },
            { val: '🇮🇳', label: 'Made in India' },
          ].map(s => (
            <div key={s.label}><p className="text-2xl md:text-3xl font-bold text-[#F27D26]">{s.val}</p><p className={`text-xs mt-1 ${textFaint}`}>{s.label}</p></div>
          ))}
        </div>
      </section>

      {/* For Every Business */}
      <section id="business" className={`py-12 sm:py-20 px-4 sm:px-6 ${sectionAlt}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">{isEn ? 'For Every Business Type' : isGu ? 'દરેક બિઝનેસ માટે' : 'हर बिज़नेस के लिए'}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{isEn ? 'Whether shop, dealer, or manufacturer — software that works for you' : isGu ? 'દુકાન હોય, ડીલર હોય, કે manufacturer — તમારા કામનું software' : 'चाहे दुकान हो, डीलर हो, या manufacturer — आपके काम का software'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Store, title: 'दुकान / Retail Shop', desc: 'बिजली की दुकान, hardware shop, किराना store — barcode scan करो, bill दो, stock track करो। इतना simple।', features: ['Barcode billing', 'Stock alerts', 'WhatsApp bills', 'GST invoice'], color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: Warehouse, title: 'डीलर / Distributor', desc: 'Products लाओ supplier से, distribute करो retailers को। Payment track करो — कौन कितना देना है, कौन से batch में।', features: ['Vendor portal', 'Batch-level payment', 'Outstanding reports', 'Quotation → Distribution'], color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: Factory, title: 'निर्माता / Manufacturer', desc: 'Production से लेकर dealer तक — purchase, inventory, distribution, billing, accounting सब automated।', features: ['Supplier management', 'P&L / Balance Sheet', 'GST GSTR-1 reports', 'Pack size support'], color: 'text-purple-500', bg: 'bg-purple-500/10' },
            ].map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`p-6 border rounded-2xl ${cardBg} ${cardHover} transition-all`}>
                <div className={`w-14 h-14 ${b.bg} rounded-2xl flex items-center justify-center mb-4`}><b.icon size={28} className={b.color} /></div>
                <h3 className="font-bold text-lg mb-2">{b.title}</h3>
                <p className={`text-sm ${textFaint} mb-4 leading-relaxed`}>{b.desc}</p>
                <div className="space-y-1.5">
                  {b.features.map(f => (
                    <div key={f} className="flex items-center gap-2"><Check size={14} className="text-[#F27D26] shrink-0" /><span className={`text-xs ${textMuted}`}>{f}</span></div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* End-to-End Flow */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">पूरा बिज़नेस एक जगह</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>Purchase से लेकर payment तक — हर step tracked</p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
            {[
              { icon: ShoppingCart, label: 'खरीदो', sub: 'Supplier से खरीदो', color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { icon: Package, label: 'स्टॉक', sub: 'Stock manage करो', color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: FileText, label: 'कोटेशन', sub: 'Quote भेजो', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
              { icon: Truck, label: 'वितरण', sub: 'Vendor को दो', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: IndianRupee, label: 'भुगतान', sub: 'पैसा track करो', color: 'text-[#F27D26]', bg: 'bg-[#F27D26]/10' },
              { icon: BarChart3, label: 'हिसाब', sub: 'P&L, Balance Sheet', color: 'text-purple-500', bg: 'bg-purple-500/10' },
            ].map((step, i) => (
              <motion.div key={step.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className={`relative p-4 border rounded-2xl text-center ${cardBg} ${cardHover} group`}>
                {i < 5 && <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10"><ArrowRight size={12} className={textFaint} /></div>}
                <div className={`w-11 h-11 ${step.bg} rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform`}><step.icon size={22} className={step.color} /></div>
                <p className="font-bold text-xs">{step.label}</p>
                <p className={`text-[10px] ${textFaint} mt-0.5`}>{step.sub}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className={`py-12 sm:py-20 px-4 sm:px-6 ${sectionAlt}`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">सारी Features, एक Platform</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>जो Tally में नहीं, जो Miracle में नहीं — वो सब यहीं है</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Package, title: 'Inventory Management', desc: 'Auto-barcode, pack size (box/carton), batch printing, CSV import, stock alerts' },
              { icon: ShoppingCart, title: 'Purchase Tracking', desc: 'Supplier management, purchase bills, cost tracking, payables (kitna dena hai)' },
              { icon: Truck, title: 'Distribution', desc: 'Vendor distribution with batch-level payment tracking, custom pricing, discount' },
              { icon: FileText, title: 'Quotations', desc: 'Create quotes, WhatsApp se share karo, accept hone pe convert to distribution' },
              { icon: IndianRupee, title: 'Vendor Finance', desc: 'Kaun kitna dena hai, age-wise outstanding, batch-level payment, reminders' },
              { icon: BarChart3, title: 'Accounts', desc: 'P&L, Balance Sheet, Cash Flow, General Ledger — auto-generated, no manual entry' },
              { icon: Receipt, title: 'GST Reports', desc: 'Sales register, GSTR-1 format B2B/B2C/HSN summary, distribution register, stock valuation' },
              { icon: Search, title: 'Smart Search', desc: 'Barcode scan ya type karo — product, vendor, customer, challan — sab instant mile' },
              { icon: Users, title: 'Vendor Portal', desc: 'Dealers ko alag login do, woh apna stock aur sales dekh sakein — separate dashboard' },
              { icon: MessageSquare, title: 'AI Chatbot', desc: '"Aaj ki sale kitni hai?" — Hindi mein poocho, toh Hindi mein jawab dega' },
              { icon: Shield, title: 'Enterprise Security', desc: 'JWT auth, bcrypt-12, HSTS, CSP, rate limiting, tenant isolation, audit trail' },
              { icon: Languages, title: '3 Languages', desc: 'English, Hindi, Gujarati — switch karo settings se, poora UI badal jayega' },
              { icon: Smartphone, title: 'Mobile Ready', desc: 'Phone pe chale, tablet pe chale — bottom nav, touch-friendly, install as app' },
              { icon: Globe, title: 'Cloud Based', desc: 'Koi server nahi rakhna, koi installation nahi — browser kholo aur shuru karo' },
              { icon: Building2, title: 'Multi-Tenant SaaS', desc: 'Ek software se 100 companies chala sakte ho — har ek ka data alag, URL alag' },
              { icon: Heart, title: 'Affordable', desc: 'Chhoti dukaan ke budget mein — free trial, no hidden charges, cancel anytime' },
            ].map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                className={`p-5 border rounded-2xl transition-all group ${cardBg} ${cardHover}`}>
                <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center mb-3 group-hover:bg-[#F27D26]/20 transition-colors"><f.icon size={20} className="text-[#F27D26]" /></div>
                <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                <p className={`text-xs ${textFaint} leading-relaxed`}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">सबके बजट में</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>छोटी दुकान से लेकर बड़ी factory तक — affordable plans</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'फ्री ट्रायल', price: '₹0', period: '14 दिन', desc: 'सभी features try करो free में', features: ['All modules', '50 products', '5 vendors', 'Email support'], cta: 'शुरू करें', highlight: false },
              { name: 'स्टैंडर्ड', price: '₹999', period: '/महीना', desc: 'बढ़ते businesses के लिए', features: ['Unlimited products', '15 vendors', 'Vendor portal', 'Priority support', 'Pack size', 'Reports'], cta: 'शुरू करें', highlight: true },
              { name: 'प्रोफेशनल', price: '₹1,999', period: '/महीना', desc: 'बड़े manufacturers के लिए', features: ['Everything unlimited', 'Accounts module', 'Multi-language', 'Quotations', 'Chatbot', 'Custom branding'], cta: 'संपर्क करें', highlight: false },
            ].map((p, i) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`p-6 border rounded-2xl ${p.highlight ? (dark ? 'bg-[#F27D26]/10 border-[#F27D26]/30 ring-2 ring-[#F27D26]/20' : 'bg-[#F27D26]/5 border-[#F27D26]/30 shadow-lg shadow-[#F27D26]/10 ring-2 ring-[#F27D26]/20') : cardBg}`}>
                {p.highlight && <div className="text-center mb-3"><span className="px-3 py-1 bg-[#F27D26] text-white text-xs font-bold rounded-full">Most Popular</span></div>}
                <h3 className="font-bold text-lg">{p.name}</h3>
                <div className="mt-2 mb-1"><span className="text-3xl font-bold">{p.price}</span><span className={`text-sm ${textFaint}`}>{p.period}</span></div>
                <p className={`text-sm ${textFaint} mb-4`}>{p.desc}</p>
                <div className="space-y-2 mb-6">
                  {p.features.map(f => <div key={f} className="flex items-center gap-2"><Check size={14} className="text-[#F27D26]" /><span className={`text-sm ${textMuted}`}>{f}</span></div>)}
                </div>
                <a href="#contact" className={`block text-center py-3 rounded-xl font-bold transition-colors ${p.highlight ? 'bg-[#F27D26] text-white hover:bg-[#D96A1C]' : `border ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}`}>{p.cta}</a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why DG Business */}
      <section className={`py-12 sm:py-20 px-4 sm:px-6 ${sectionAlt}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Tally और Miracle से आगे</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>पुराने software को replace करो modern cloud ERP से</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { emoji: '☁️', title: 'Cloud — कोई Installation नहीं', desc: 'Tally में software install करो, license खरीदो, backup लो। DG Business में सिर्फ browser खोलो।' },
              { emoji: '📱', title: 'मोबाइल पे चले', desc: 'Miracle सिर्फ desktop पे चलता है। DG Business phone पे भी tablet पे भी — कहीं से भी काम करो।' },
              { emoji: '🔐', title: 'वेंडर पोर्टल', desc: 'अपने dealers को उनका login दो — वो अपना stock, sales, payments खुद देख लें। Miracle में नहीं है।' },
              { emoji: '🤖', title: 'AI चैटबॉट', desc: '"Low stock क्या है?" पूछो chatbot से — वो database check करके जवाब देगा। Real-time।' },
              { emoji: '💰', title: 'Batch-Level भुगतान', desc: 'हर distribution batch का payment अलग track करो — कौन सा batch paid, कौन सा pending। Crystal clear।' },
              { emoji: '📊', title: 'ऑटो हिसाब-किताब', desc: 'P&L, Balance Sheet, Cash Flow — automatically generate होता है transactions से। No manual entry।' },
            ].map((w, i) => (
              <motion.div key={w.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className={`p-5 border rounded-2xl flex gap-4 ${cardBg} ${cardHover}`}>
                <span className="text-3xl shrink-0">{w.emoji}</span>
                <div><h3 className="font-bold text-sm mb-1">{w.title}</h3><p className={`text-xs ${textFaint} leading-relaxed`}>{w.desc}</p></div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">શરૂ કરો / शुरू करें</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>આજે જ free trial લો — 5 minute માં setup થઈ જશે</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            <div className="lg:col-span-2 space-y-6">
              <div className={`p-6 border rounded-2xl space-y-5 ${cardBg}`}>
                <h3 className="font-bold text-lg">Baat Karein</h3>
                <p className={`text-sm ${textFaint}`}>Call karo, WhatsApp karo, ya email karo — hum 24 ghante mein reply karenge.</p>
                <div className="space-y-4 pt-2">
                  <a href="tel:+918806907616" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-[#F27D26]`}>
                    <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center shrink-0"><Phone size={18} className="text-[#F27D26]" /></div>
                    <div><p className={`text-xs ${textFaint}`}>Phone</p><p className="font-medium">+91 88069 07616</p></div>
                  </a>
                  <a href="https://wa.me/918806907616?text=Hi%2C%20mujhe%20DG%20ERP%20chahiye%20mere%20business%20ke%20liye" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-green-400`}>
                    <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0"><MessageCircle size={18} className="text-green-500" /></div>
                    <div><p className={`text-xs ${textFaint}`}>WhatsApp</p><p className="font-medium">+91 88069 07616</p></div>
                  </a>
                  <a href="https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-[#F27D26]`}>
                    <div className="w-10 h-10 bg-[#F27D26]/10 rounded-xl flex items-center justify-center shrink-0"><Mail size={18} className="text-[#F27D26]" /></div>
                    <div><p className={`text-xs ${textFaint}`}>Email</p><p className="font-medium">patelprathamesh007@gmail.com</p></div>
                  </a>
                </div>
              </div>
            </div>
            <div className="lg:col-span-3"><EnquiryForm dark={dark} /></div>
          </div>
        </div>
      </section>

      {/* Rajkot Pride */}
      <section className={`py-16 px-6 ${sectionAlt}`}>
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p className="text-4xl mb-4">🏭</p>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              {isGu ? 'રાજકોટની ધરતી પરથી, દુનિયા માટે' : 'राजकोट की धरती से, दुनिया के लिए'}
            </h2>
            <p className={`text-lg ${textMuted} max-w-2xl mx-auto leading-relaxed`}>
              {isGu ? 'રાજકોટ — industrialisation નું હૃદય। અહીંના દરેક ઉદ્યોગપતિ, દુકાનદાર, અને manufacturer ને ધ્યાનમાં રાખીને બનાવેલું software। મોજેલો રાજકોટ! 🦁' : 'राजकोट — industrialisation का दिल। यहाँ के हर उद्योगपति, दुकानदार, और manufacturer को ध्यान में रखकर बनाया गया software। मोजेलो राजकोट! 🦁'}
            </p>
            <div className={`mt-6 inline-flex items-center gap-3 px-6 py-3 rounded-2xl border ${cardBg}`}>
              <span className="text-2xl">🦁</span>
              <div className="text-left">
                <p className="font-bold text-sm">{isGu ? 'રાજકોટમાં ડિઝાઇન, ભારત માટે બનેલું' : 'राजकोट में डिज़ाइन, भारत के लिए बना'}</p>
                <p className={`text-xs ${textFaint}`}>Designed in Rajkot, Built for Bharat</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t ${navBorder} py-8 sm:py-10 px-4 sm:px-6`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#F27D26] rounded-lg flex items-center justify-center font-bold text-xs text-white">DG</div>
              <div><span className="font-bold">DG Business</span><span className={`text-xs ${textFaint} ml-2`}>🇮🇳 Made with pride in India</span></div>
            </div>
            <div className={`flex items-center gap-6 text-sm ${textFaint}`}>
              <a href="#features" className={`${navLink}`}>Features</a>
              <a href="#pricing" className={`${navLink}`}>Pricing</a>
              <a href="#contact" className={`${navLink}`}>Contact</a>
              <a href="/privacy" className={`${navLink}`}>Privacy</a>
              <a href="/terms" className={`${navLink}`}>Terms</a>
            </div>
            <div className={`flex items-center gap-4 ${textFaint}`}>
              <a href="tel:+918806907616" className="hover:text-[#F27D26]"><Phone size={16} /></a>
              <a href="https://wa.me/918806907616" target="_blank" rel="noopener noreferrer" className="hover:text-green-500"><MessageCircle size={16} /></a>
              <a href="https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#F27D26]"><Mail size={16} /></a>
            </div>
          </div>
          <p className={`text-xs ${textFaint} text-center mt-6`}>&copy; {new Date().getFullYear()} DG Business Management. Designed for Indian businesses, built with love.</p>
        </div>
      </footer>
    </div>
  );
}
