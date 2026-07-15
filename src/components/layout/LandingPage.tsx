import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { ShutterIntro } from './ShutterIntro';
import { DeskIllustration } from './DeskIllustration';
import {
  Package, ShoppingCart, Truck, Receipt, IndianRupee, BarChart3, Users,
  ArrowRight, Check, Mail, Phone, MessageCircle, Moon, Sun, Send,
  Store, Factory, Warehouse, Briefcase, Zap, Shield, Globe, FileText,
  ChevronRight, Database, Cloud, Cpu, Lock,
} from 'lucide-react';

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = to / 40;
    const timer = setInterval(() => {
      start = Math.min(start + step, to);
      setVal(Math.floor(start));
      if (start >= to) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [inView, to]);
  return <span ref={ref}>{prefix}{val}{suffix}</span>;
}

// ── Enquiry form ──────────────────────────────────────────────────────────────
function EnquiryForm({ dark }: { dark: boolean }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const subject = encodeURIComponent(`Dhandho Enquiry — ${form.name} (${form.company || 'N/A'})`);
    const body = `Name: ${form.name}\nPhone: ${form.phone}\nEmail: ${form.email || 'N/A'}\nCompany: ${form.company || 'N/A'}\n\n${form.message}`;
    window.open(`https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com&su=${subject}&body=${encodeURIComponent(body)}`, '_blank');
    setTimeout(() => { setSent(true); setSending(false); }, 500);
  };

  const inp = `w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${dark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-brand/60' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-brand/60'}`;

  if (sent) return (
    <div className={`p-8 rounded-2xl border text-center ${dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100 shadow-sm'}`}>
      <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <Check size={28} className="text-green-500" />
      </div>
      <h3 className="font-bold text-xl mb-2">Sent!</h3>
      <p className={`text-sm mb-4 ${dark ? 'text-white/40' : 'text-gray-500'}`}>We'll get back to you within 24 hours.</p>
      <button type="button" onClick={() => { setSent(false); setForm({ name: '', phone: '', email: '', company: '', message: '' }); }} className="text-sm text-brand hover:underline">Send another</button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={`p-6 sm:p-8 rounded-2xl border ${dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100 shadow-sm'}`}>
      <h3 className="font-bold text-lg mb-1">Start Free Trial</h3>
      <p className={`text-sm mb-5 ${dark ? 'text-white/40' : 'text-gray-500'}`}>No credit card. Setup in 5 minutes.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="Your name *" />
        <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inp} placeholder="+91 98765 43210 *" />
        <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inp} placeholder="Email (optional)" />
        <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className={inp} placeholder="Business name" />
      </div>
      <textarea rows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className={`${inp} resize-none mb-4`} placeholder="Tell us about your business..." />
      <button type="submit" disabled={sending} className="w-full py-3.5 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
        <Send size={16} /> {sending ? 'Sending...' : 'Get Started Free'}
      </button>
      <p className={`text-xs text-center mt-3 ${dark ? 'text-white/30' : 'text-gray-400'}`}>
        Or WhatsApp: <a href="https://wa.me/918806907616" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">+91 88069 07616</a>
      </p>
    </form>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function LandingPage() {
  const [shutterDone, setShutterDone] = useState(false);
  const handleShutterDone = () => setShutterDone(true);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [lang, setLang] = useState<'en' | 'hi' | 'gu'>('en');
  const [heroLang, setHeroLang] = useState(0);
  const [heroAuto, setHeroAuto] = useState(true);

  const toggleTheme = () => {
    const d = document.documentElement.classList.toggle('dark');
    localStorage.setItem('dhandho_theme', d ? 'dark' : 'light');
    setDark(d);
  };

  useEffect(() => {
    if (!heroAuto) return;
    const t = setInterval(() => setHeroLang(h => (h + 1) % 3), 7000);
    return () => clearInterval(t);
  }, [heroAuto]);

  const L = (en: string, hi: string, gu: string) => lang === 'en' ? en : lang === 'gu' ? gu : hi;

  // Theme tokens
  const bg = dark ? 'bg-[#09090B]' : 'bg-[#FAFAFA]';
  const text = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-white/50' : 'text-gray-500';
  const faint = dark ? 'text-white/30' : 'text-gray-400';
  const border = dark ? 'border-white/8' : 'border-gray-200';
  const card = dark ? 'bg-white/[0.03] border-white/8' : 'bg-white border-gray-100 shadow-sm';
  const cardHov = dark ? 'hover:bg-white/[0.06] hover:border-white/15' : 'hover:shadow-md hover:border-brand/20';
  const navBg = dark ? 'bg-[#09090B]/80' : 'bg-white/80';
  const pill = dark ? 'bg-white/8 text-white/60 hover:bg-white/12' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';

  const LANGS = [
    { code: 'en' as const, label: 'EN' },
    { code: 'hi' as const, label: 'हि' },
    { code: 'gu' as const, label: 'ગુ' },
  ];

  const HERO = [
    { h1: 'Run your business,', h2: 'not your software.', sub: 'Inventory · GST · Accounts · Distribution — one platform for every Indian business.' },
    { h1: 'बिज़नेस चलाओ,', h2: 'software नहीं।', sub: 'Inventory · GST · हिसाब-किताब · Distribution — एक platform पर।' },
    { h1: 'ધંધો ચલાવો,', h2: 'software નહિ।', sub: 'Inventory · GST · હિસાબ · Distribution — એક platform.' },
  ];

  const TYPES = [
    { icon: Store, title: L('Retail Shop','दुकान / Retail','દુકાન / Retail'), color: 'from-blue-500/20 to-blue-500/5', dot: 'bg-blue-500', items: [L('Barcode billing','बारकोड billing','બારકોડ billing'), L('Stock alerts','स्टॉक alerts','સ્ટોક alerts'), L('WhatsApp bills','WhatsApp bills','WhatsApp bills'), 'GST invoice'] },
    { icon: Warehouse, title: L('Dealer / Wholesaler','डीलर / होलसेलर','ડીલર / હોલસેલર'), color: 'from-emerald-500/20 to-emerald-500/5', dot: 'bg-emerald-500', items: [L('Vendor portal','वेंडर portal','વેન્ડર portal'), L('Batch payment','Batch payment','Batch payment'), L('Outstanding','बकाया','બાકી'), L('Quotation→Dispatch','Quote→Dispatch','Quote→Dispatch')] },
    { icon: Factory, title: L('Manufacturer','निर्माता','નિર્માતા'), color: 'from-violet-500/20 to-violet-500/5', dot: 'bg-violet-500', items: ['P&L / Balance Sheet', 'GSTR-1 / GSTR-3B', 'E-Invoice & E-Way Bill', L('Supplier management','Supplier management','Supplier management')] },
    { icon: Briefcase, title: L('Service / Consulting','सर्विस / कंसल्टिंग','સર્વિસ / કન્સલ્ટિંગ'), color: 'from-orange-500/20 to-orange-500/5', dot: 'bg-orange-500', items: [L('Standalone invoices','Standalone invoices','Standalone invoices'), L('Partial payments','आंशिक payment','આંશિક payment'), L('Expense tracking','Expense tracking','Expense tracking'), L('Accounts','Accounts','Accounts')] },
  ];

  const FEATURES = [
    { icon: Package, title: L('Inventory','स्टॉक','સ્ટોક'), desc: L('Auto-barcode, pack size, batch printing, CSV import, stock alerts, HSN suggest','Auto-barcode, pack size, batch printing, CSV import, stock alerts','Auto-barcode, pack size, batch printing, CSV import, stock alerts') },
    { icon: ShoppingCart, title: L('Purchases','खरीद','ખરીદ'), desc: L('Supplier management, purchase batches, GSTR-2B invoice matching','Supplier management, purchase batches, GSTR-2B invoice matching','Supplier management, purchase batches, GSTR-2B invoice matching') },
    { icon: Truck, title: L('Distribution','वितरण','વિતરણ'), desc: L('Batch challan, vendor payment tracking, custom pricing, E-Invoice JSON','Batch challan, vendor payment tracking, custom pricing','Batch challan, vendor payment tracking, custom pricing') },
    { icon: FileText, title: L('Invoices','इनवॉइस','ઇનવૉઇસ'), desc: L('Standalone invoices, 3 PDF presets, auto-numbering, Draft→Sent→Paid flow','Standalone invoices, PDF presets, Draft→Sent→Paid flow','Standalone invoices, PDF presets, Draft→Sent→Paid flow') },
    { icon: IndianRupee, title: L('Finance','फाइनेंस','ફાઇનાન્સ'), desc: L('Vendor receivables, age-wise outstanding, partial payments, bulk WhatsApp reminders','Vendor receivables, age-wise outstanding, bulk WhatsApp reminders','Vendor receivables, age-wise outstanding, bulk WhatsApp reminders') },
    { icon: BarChart3, title: L('Accounts','हिसाब','હિસાબ'), desc: L('P&L, Balance Sheet, Cash Flow, Ledger, Day Book — auto-generated from transactions','P&L, Balance Sheet, Cash Flow, Ledger, Day Book — auto-generated','P&L, Balance Sheet, Cash Flow, Ledger, Day Book — auto-generated') },
    { icon: Receipt, title: L('GST Reports','GST Reports','GST Reports'), desc: L('GSTR-1, GSTR-3B, GSTR-2B reconciliation, E-Invoice, E-Way Bill JSON','GSTR-1, GSTR-3B, GSTR-2B reconciliation, E-Invoice, E-Way Bill JSON','GSTR-1, GSTR-3B, GSTR-2B reconciliation, E-Invoice, E-Way Bill JSON') },
    { icon: Users, title: L('Payroll','पेरोल','પેરોલ'), desc: L('Staff directory, salary, advance, bonus payments, WhatsApp salary slips','Staff directory, salary, advance, bonus, WhatsApp salary slips','Staff directory, salary, advance, bonus, WhatsApp salary slips') },
    { icon: Zap, title: L('Bank Statements','बैंक Statements','બેન્ક Statements'), desc: L('Upload ICICI/HDFC/SBI XLS or XLSX — auto-parse, match UPI to vendors','Upload ICICI/HDFC/SBI XLS/XLSX — auto-parse, match UPI to vendors','Upload ICICI/HDFC/SBI XLS/XLSX — auto-parse, match UPI to vendors') },
    { icon: Shield, title: L('Rewards & Warranty','Rewards & Warranty','Rewards & Warranty'), desc: L('Customer reward points, QR redemption, serial-linked warranty with expiry alerts','Customer reward points, QR redemption, warranty with expiry alerts','Customer reward points, QR redemption, warranty with expiry alerts') },
    { icon: Globe, title: L('3 Languages','3 भाषाएं','3 ભાષાઓ'), desc: L('Full English, Hindi, Gujarati — switch from settings, entire UI changes','Full English, Hindi, Gujarati — settings से switch','Full English, Hindi, Gujarati — settings માંથી switch') },
    { icon: Cloud, title: L('Cloud + Desktop','Cloud + Desktop','Cloud + Desktop'), desc: L('Browser app + Electron desktop (Windows/Mac). On-prem version with local database available','Browser + Electron desktop (Windows/Mac). On-prem version available','Browser + Electron desktop (Windows/Mac). On-prem version available') },
  ];

  const h = HERO[heroLang] || HERO[0];

  return (
    <div className={`min-h-screen ${bg} ${text} overflow-x-hidden`}>
      {!shutterDone && <ShutterIntro onDone={handleShutterDone} />}

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 ${navBg} backdrop-blur-xl border-b ${border}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand rounded-lg grid place-items-center font-bold text-xs text-white">D</div>
            <span className="font-bold tracking-tight">Dhandho</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {['#business','#features','#pricing','#contact'].map((href, i) => (
              <a key={href} href={href} className={`px-3 py-2 text-sm rounded-lg transition-colors ${muted} hover:${text}`}>
                {[L('Business','व्यापार','વ્યાપાર'), 'Features', L('Pricing','कीमत','કિંમત'), L('Contact','संपर्क','સંપર્ક')][i]}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>
              {LANGS.map(l => (
                <button key={l.code} type="button" onClick={() => setLang(l.code)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${lang === l.code ? 'bg-brand text-white' : `${muted} hover:text-current`}`}>{l.label}</button>
              ))}
            </div>
            <button type="button" onClick={toggleTheme} className={`p-2 rounded-lg ${muted} hover:text-current transition-colors`}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <a href="#contact" className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-bold rounded-lg transition-colors hidden sm:block">{L('Try Free','ट्राय करें','Try Free')}</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: dark ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)' : 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(242,125,38,0.12) 0%, transparent 65%)', transform: 'translate(20%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 65%)', transform: 'translate(-30%, 30%)' }} />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-10">
          {/* Left — text */}
          <div className="max-w-3xl mx-auto lg:mx-0 text-center lg:text-left">
            {/* Badge */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium mb-6" style={{ borderColor: 'rgba(242,125,38,0.3)', background: 'rgba(242,125,38,0.08)', color: '#F27D26' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              🇮🇳 {L('Made in India · Cloud + Desktop · 3 Languages', 'Made in India · Cloud + Desktop · 3 Languages', 'Made in India · Cloud + Desktop · 3 Languages')}
            </motion.div>

            {/* Language selector */}
            <div className="flex justify-center gap-1.5 mb-6">
              {[
                { idx: 0, label: 'English' },
                { idx: 1, label: 'हिन्दी' },
                { idx: 2, label: 'ગુજ' },
              ].map(l => (
                <button key={l.idx} type="button" onClick={() => { setHeroLang(l.idx); setHeroAuto(false); setLang((['en','hi','gu'] as const)[l.idx]); }} className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${heroLang === l.idx ? 'bg-brand text-white' : pill}`}>{l.label}</button>
              ))}
            </div>

            {/* Headline */}
            <motion.div key={heroLang} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <h1 className={`text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5 ${heroLang === 0 ? 'leading-[1.1]' : 'leading-relaxed'}`}>
                {h.h1}<br />
                <span className="bg-gradient-to-r from-brand via-orange-400 to-violet-500 bg-clip-text text-transparent">{h.h2}</span>
              </h1>
              <p className={`text-base sm:text-lg md:text-xl ${muted} max-w-2xl mx-auto leading-relaxed mb-8`}>{h.sub}</p>
            </motion.div>

            {/* CTAs */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href="#contact" className="group w-full sm:w-auto px-7 py-3.5 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand/20">
                {L('Start Free Trial','फ्री ट्रायल','Free Trial')} <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a href="#features" className={`w-full sm:w-auto px-7 py-3.5 rounded-xl font-bold text-base border transition-colors text-center ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                {L('Explore Features','Features देखें','Features જુઓ')}
              </a>
            </motion.div>
            <p className={`mt-4 text-xs ${faint}`}>{L('No credit card · Cancel anytime','No credit card · कभी भी cancel','No credit card · ગમે ત્યારે cancel')}</p>
          </div>

          {/* Desk illustration — right column */}
          <div className="hidden lg:flex justify-center items-center">
            <DeskIllustration dark={dark} />
          </div>

          </div>{/* end hero grid */}

          {/* App preview */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }} className="max-w-3xl mx-auto">
            <div className={`rounded-2xl border overflow-hidden shadow-2xl ${dark ? 'border-white/10 bg-gray-900/60' : 'border-gray-200 bg-white'} backdrop-blur-sm`}>
              {/* Window chrome */}
              <div className={`px-4 py-3 flex items-center gap-3 border-b ${dark ? 'border-white/5 bg-black/20' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400/70"/><div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70"/><div className="w-2.5 h-2.5 rounded-full bg-green-400/70"/></div>
                <div className={`flex-1 text-center text-[11px] font-mono ${faint}`}>dhandho.app/acme-industries</div>
              </div>
              {/* Dashboard mockup */}
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Today's Revenue", val: '₹2.4L', delta: '+12%', color: 'text-emerald-500', bg: dark ? 'bg-emerald-500/10' : 'bg-emerald-50' },
                  { label: 'Distributions', val: '38', delta: '↑ 8 today', color: 'text-blue-500', bg: dark ? 'bg-blue-500/10' : 'bg-blue-50' },
                  { label: 'Outstanding', val: '₹84K', delta: '6 vendors', color: 'text-orange-500', bg: dark ? 'bg-orange-500/10' : 'bg-orange-50' },
                  { label: 'Stock Items', val: '1,247', delta: '3 low stock', color: 'text-violet-500', bg: dark ? 'bg-violet-500/10' : 'bg-violet-50' },
                ].map(s => (
                  <div key={s.label} className={`p-3 rounded-xl ${s.bg}`}>
                    <p className={`text-[10px] ${muted} mb-1`}>{s.label}</p>
                    <p className={`text-lg sm:text-xl font-bold ${s.color}`}>{s.val}</p>
                    <p className={`text-[10px] ${faint}`}>{s.delta}</p>
                  </div>
                ))}
              </div>
              <div className={`px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3`}>
                <div className={`p-3 rounded-xl border ${dark ? 'border-white/5 bg-white/3' : 'border-gray-100 bg-gray-50'}`}>
                  <p className={`text-[10px] font-bold mb-2 ${muted}`}>Recent Distributions</p>
                  {['Anand Agri · 120 units · ₹18,000','Gujarat Seeds · 80 units · ₹12,400','Patel Traders · 200 units · ₹31,000'].map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 py-1.5 ${i > 0 ? `border-t ${dark ? 'border-white/5' : 'border-gray-100'}` : ''}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${['bg-blue-400','bg-emerald-400','bg-violet-400'][i]}`} />
                      <span className={`text-[10px] ${muted}`}>{r}</span>
                    </div>
                  ))}
                </div>
                <div className={`p-3 rounded-xl border ${dark ? 'border-white/5 bg-white/3' : 'border-gray-100 bg-gray-50'}`}>
                  <p className={`text-[10px] font-bold mb-2 ${muted}`}>GST Summary — July</p>
                  {[['Output Tax (CGST+SGST)','₹41,200'],['ITC Available','₹18,600'],['Net Payable','₹22,600']].map(([l, v]) => (
                    <div key={l} className={`flex justify-between py-1.5 border-b last:border-0 ${dark ? 'border-white/5' : 'border-gray-100'}`}>
                      <span className={`text-[10px] ${muted}`}>{l}</span>
                      <span className={`text-[10px] font-bold`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-4 flex-wrap">
              {[<><Cpu size={12} className="text-brand" /> Cloud-native</>, <><Lock size={12} className="text-emerald-500" /> GST Ready</>, <><Database size={12} className="text-violet-500" /> On-Prem option</>].map((item, i) => (
                <span key={i} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${dark ? 'border-white/8 text-white/40' : 'border-gray-200 text-gray-500'}`}>{item}</span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <div className={`border-y ${border} py-8 sm:py-10`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { val: 15, suf: '+', label: L('Modules','Modules','Modules') },
            { val: 38, suf: '', label: L('DB Tables','DB Tables','DB Tables') },
            { val: 493, suf: '', label: L('E2E Tests','E2E Tests','E2E Tests') },
            { val: 3, suf: '', label: L('Languages','भाषाएं','ભાષાઓ') },
          ].map(s => (
            <div key={s.label}>
              <p className="text-3xl sm:text-4xl font-bold text-brand"><Counter to={s.val} suffix={s.suf} /></p>
              <p className={`text-xs mt-1 ${faint}`}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Business types ──────────────────────────────────────────────────── */}
      <section id="business" className={`py-16 sm:py-24 px-4 sm:px-6 ${dark ? '' : 'bg-white'}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className={`text-xs font-bold uppercase tracking-widest text-brand mb-3`}>Built for your business</p>
            <h2 className="text-3xl sm:text-4xl font-bold">{L('Every business type, one platform','हर business type, एक platform','દરેક business type, એક platform')}</h2>
            <p className={`mt-3 text-lg ${muted}`}>{L('Tab visibility, labels, and features adapt to your business type','Tab visibility, labels, features — सब आपके business type के हिसाब से','Tab visibility, labels, features — તમારા business type પ્રમાણે')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {TYPES.map((t, i) => (
              <motion.div key={t.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className={`relative p-5 rounded-2xl border overflow-hidden transition-all ${card} ${cardHov}`}>
                <div className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r ${t.color}`} />
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center mb-4`}>
                  <t.icon size={20} className={t.dot.replace('bg-','text-')} />
                </div>
                <h3 className="font-bold mb-3">{t.title}</h3>
                <div className="space-y-1.5">
                  {t.items.map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Check size={12} className="text-brand shrink-0" />
                      <span className={`text-xs ${muted}`}>{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className={`py-16 sm:py-24 px-4 sm:px-6`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className={`text-xs font-bold uppercase tracking-widest text-brand mb-3`}>Full feature set</p>
            <h2 className="text-3xl sm:text-4xl font-bold">{L('Everything your business needs','हर ज़रूरत की feature','દરેક જરૂરિયાતની feature')}</h2>
            <p className={`mt-3 text-lg ${muted}`}>{L('15+ modules, all in one login','15+ modules, एक ही login','15+ modules, એક જ login')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                className={`p-5 rounded-2xl border flex gap-4 transition-all ${card} ${cardHov}`}>
                <div className="w-9 h-9 bg-brand/10 rounded-xl flex items-center justify-center shrink-0">
                  <f.icon size={18} className="text-brand" />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                  <p className={`text-xs leading-relaxed ${faint}`}>{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────────────── */}
      <section className={`py-16 sm:py-24 px-4 sm:px-6 ${dark ? 'bg-white/[0.02]' : 'bg-white'}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">{L('End-to-end, one place','एक जगह, पूरा cycle','એક જગ્યાએ, પૂરો cycle')}</h2>
            <p className={`mt-3 text-lg ${muted}`}>{L('From purchase to P&L — every step tracked','Purchase से P&L तक — हर step tracked','Purchase થી P&L સુધી — દરેક step tracked')}</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { icon: ShoppingCart, label: L('Purchase','खरीदो','ખરીદો'), color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { icon: Package, label: L('Stock','स्टॉक','સ્ટોક'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: FileText, label: L('Quote','कोटेशन','કોટેશન'), color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
              { icon: Truck, label: L('Dispatch','भेजो','મોકલો'), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: IndianRupee, label: L('Collect','वसूलो','વસૂલો'), color: 'text-brand', bg: 'bg-brand/10' },
              { icon: BarChart3, label: 'P&L', color: 'text-violet-500', bg: 'bg-violet-500/10' },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className={`relative p-4 rounded-2xl border text-center ${card} group`}>
                {i < 5 && <ChevronRight size={12} className={`hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 ${faint}`} />}
                <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform`}>
                  <s.icon size={20} className={s.color} />
                </div>
                <p className={`font-bold text-xs`}>{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack highlight ─────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className={`text-xs font-bold uppercase tracking-widest text-brand mb-3`}>Cloud-native architecture</p>
            <h2 className="text-3xl sm:text-4xl font-bold">{L('Modern tech, Indian needs','Modern tech, Indian ज़रूरतें','Modern tech, Indian જરૂરિયાત')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Cloud, title: L('Cloud SaaS','Cloud SaaS','Cloud SaaS'), desc: L('Browser-based, zero install. Multi-tenant PostgreSQL with row-level security — each business\'s data is isolated.','Browser-based, zero install. Multi-tenant PostgreSQL — हर business का data isolated।','Browser-based, zero install. Multi-tenant PostgreSQL — દરેક business નો data isolated.'), tag: 'React 19 + Node.js + PG' },
              { icon: Database, title: L('On-Prem Desktop','On-Prem Desktop','On-Prem Desktop'), desc: L('Electron app (~180MB) with embedded PostgreSQL. Runs offline. Activated via license key, syncs heartbeat to cloud.','Electron app with embedded PostgreSQL. Offline ready। License key से activate।','Electron app with embedded PostgreSQL. Offline ready. License key થી activate.'), tag: 'Electron + embedded PG' },
              { icon: Lock, title: L('GST Compliant','GST Compliant','GST Compliant'), desc: L('GSTR-1, GSTR-3B, GSTR-2B reconciliation, E-Invoice (IRN), E-Way Bill — JSON generated, ready to upload to government portal.','GSTR-1, GSTR-3B, GSTR-2B, E-Invoice, E-Way Bill JSON — government portal ke liye ready।','GSTR-1, GSTR-3B, GSTR-2B, E-Invoice, E-Way Bill JSON — government portal માટે ready.'), tag: 'GST API ready' },
            ].map((c, i) => (
              <motion.div key={c.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`p-6 rounded-2xl border ${card}`}>
                <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center mb-4">
                  <c.icon size={20} className="text-brand" />
                </div>
                <div className="inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-bold mb-3" style={{ background: 'rgba(242,125,38,0.1)', color: '#F27D26' }}>{c.tag}</div>
                <h3 className="font-bold mb-2">{c.title}</h3>
                <p className={`text-sm leading-relaxed ${faint}`}>{c.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className={`py-16 sm:py-24 px-4 sm:px-6 ${dark ? 'bg-white/[0.02]' : 'bg-white'}`}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className={`text-xs font-bold uppercase tracking-widest text-brand mb-3`}>Simple pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold">{L('Fits every budget','सबके बजट में','બધાના budget માં')}</h2>
            <p className={`mt-3 text-lg ${muted}`}>{L('Free trial, no credit card. Contact us for pricing.','Free trial, no credit card। Pricing के लिए contact करें।','Free trial, no credit card. Pricing માટે contact કરો.')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name: L('Free Trial','Free Trial','Free Trial'), price: '₹0', period: L('/ 14 days','/ 14 दिन','/ 14 દિવસ'), desc: L('All features, no card','सब features, no card','બધા features, no card'), feats: [L('All modules','सब modules','બધા modules'), '50 products', '5 vendors', 'Email support'], highlight: false, cta: L('Start Free','शुरू करें','Free Start') },
              { name: L('Standard','Standard','Standard'), price: L('Contact','संपर्क','સંપર્ક'), period: '', desc: L('Growing businesses','बढ़ते व्यापार के लिए','વધતા business માટે'), feats: [L('Unlimited products','Unlimited products','Unlimited products'), '15 vendors', L('Vendor portal','Vendor portal','Vendor portal'), L('Priority support','Priority support','Priority support'), L('All reports','All reports','All reports')], highlight: true, cta: L('Get Quote','Quote लें','Quote મેળવો') },
              { name: L('Professional','Professional','Professional'), price: L('Contact','संपर्क','સંપર્ક'), period: '', desc: L('Manufacturers & large dealers','बड़े manufacturers के लिए','મોટા manufacturers માટે'), feats: [L('Everything unlimited','સব unlimited','Everything unlimited'), 'E-Invoice & E-Way Bill', L('AI Chatbot','AI Chatbot','AI Chatbot'), L('Custom branding','Custom branding','Custom branding'), L('On-prem option','On-prem option','On-prem option')], highlight: false, cta: L('Get Quote','Quote लें','Quote મેળવો') },
            ].map((p, i) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`p-6 rounded-2xl border relative ${p.highlight ? (dark ? 'border-brand/40 bg-brand/5' : 'border-brand/30 bg-brand/3 shadow-lg shadow-brand/10') : card}`}>
                {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 bg-brand text-white text-[10px] font-bold rounded-full uppercase tracking-wide">{L('Popular','Popular','Popular')}</span></div>}
                <h3 className="font-bold text-lg mb-1">{p.name}</h3>
                <div className="flex items-baseline gap-1 mb-1"><span className="text-3xl font-bold">{p.price}</span><span className={`text-sm ${faint}`}>{p.period}</span></div>
                <p className={`text-sm ${faint} mb-5`}>{p.desc}</p>
                <div className="space-y-2 mb-6">
                  {p.feats.map(f => <div key={f} className="flex items-center gap-2"><Check size={13} className="text-brand shrink-0" /><span className={`text-sm ${muted}`}>{f}</span></div>)}
                </div>
                <a href="#contact" className={`block text-center py-3 rounded-xl font-bold text-sm transition-colors ${p.highlight ? 'bg-brand hover:bg-brand-dark text-white' : `border ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}`}>{p.cta}</a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────────────── */}
      <section id="contact" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className={`text-xs font-bold uppercase tracking-widest text-brand mb-3`}>Get started</p>
            <h2 className="text-3xl sm:text-4xl font-bold">{L('Let\'s talk','बात करें','વાત કરો')}</h2>
            <p className={`mt-3 text-lg ${muted}`}>{L('Free trial · Setup in 5 min · Reply within 24h','Free trial · 5 min setup · 24h में reply','Free trial · 5 min setup · 24h માં reply')}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
            <div className="lg:col-span-2 flex flex-col gap-4">
              {[
                { icon: Phone, label: 'Phone', val: '+91 88069 07616', href: 'tel:+918806907616', color: 'text-brand' },
                { icon: MessageCircle, label: 'WhatsApp', val: '+91 88069 07616', href: 'https://wa.me/918806907616', color: 'text-green-500' },
                { icon: Mail, label: 'Email', val: 'patelprathamesh007@gmail.com', href: 'https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com', color: 'text-brand' },
              ].map(c => (
                <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${card} ${cardHov}`}>
                  <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center shrink-0"><c.icon size={18} className={c.color} /></div>
                  <div><p className={`text-xs ${faint}`}>{c.label}</p><p className="font-medium text-sm">{c.val}</p></div>
                </a>
              ))}
              <div className={`p-4 rounded-2xl border ${dark ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50'} mt-2`}>
                <p className="text-2xl mb-2">🦁</p>
                <p className="font-bold text-sm">{L('Designed in Rajkot, built for Bharat','Rajkot में बना, Bharat के लिए','Rajkot માં DesIgn, Bharat માટે')}</p>
                <p className={`text-xs mt-1 ${faint}`}>{L('India\'s industrial heartland. Software for every shopkeeper, dealer, and manufacturer.','India के industrial heartland से। हर दुकानदार, dealer, manufacturer के लिए।','India ના industrial heartland થી. દરેક દુકાનદાર, dealer, manufacturer માટે.')}</p>
              </div>
            </div>
            <div className="lg:col-span-3"><EnquiryForm dark={dark} /></div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className={`border-t ${border} py-8 px-4 sm:px-6`}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand rounded-md grid place-items-center font-bold text-xs text-white">D</div>
            <span className="font-bold text-sm">Dhandho</span>
            <span className={`text-xs ${faint}`}>🇮🇳</span>
          </div>
          <div className={`flex items-center gap-5 text-xs ${faint}`}>
            {['#features','#pricing','#contact','/privacy','/terms'].map((href, i) => (
              <a key={href} href={href} className="hover:text-brand transition-colors">
                {['Features', L('Pricing','कीमत','કિંમત'), L('Contact','संपर्क','સંપર્ક'), L('Privacy','Privacy','Privacy'), L('Terms','Terms','Terms')][i]}
              </a>
            ))}
          </div>
          <div className={`flex items-center gap-3 ${faint}`}>
            <a href="tel:+918806907616" className="hover:text-brand transition-colors"><Phone size={15} /></a>
            <a href="https://wa.me/918806907616" target="_blank" rel="noopener noreferrer" className="hover:text-green-500 transition-colors"><MessageCircle size={15} /></a>
            <a href="https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand transition-colors"><Mail size={15} /></a>
          </div>
        </div>
        <p className={`text-center text-xs mt-5 ${faint}`}>© {new Date().getFullYear()} Dhandho · {L('Built with love for Indian businesses','भारतीय businesses के लिए बना','ભારતીય businesses માટે બનેલું')}</p>
      </footer>
    </div>
  );
}
