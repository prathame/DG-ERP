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
      <h3 className="font-bold text-xl mb-2">Thank You!</h3>
      <p className={`text-sm mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>We'll get back to you within 24 hours.</p>
      <button type="button" onClick={() => { setSent(false); setForm({ name: '', email: '', phone: '', company: '', message: '' }); }} className="text-sm text-brand hover:underline">Send another</button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={`p-8 border rounded-2xl space-y-4 ${formCardCls}`}>
      <h3 className="font-bold text-lg mb-1">Start Your Free Trial</h3>
      <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'} -mt-2 mb-2`}>No credit card needed. Start managing in 5 minutes.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="Your name" /></div>
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Phone *</label><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="+91 98765 43210" /></div>
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="you@example.com" /></div>
        <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Business Name</label><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`w-full px-4 py-3 border rounded-xl ${inputCls}`} placeholder="Your shop / company" /></div>
      </div>
      <div><label className={`text-xs font-bold uppercase block mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Message</label><textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={`w-full px-4 py-3 border rounded-xl resize-none ${inputCls}`} placeholder="Business type, products, team size..." /></div>
      <button type="submit" disabled={sending} className="w-full py-4 bg-brand text-white rounded-xl font-bold text-lg hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"><Send size={18} /> {sending ? 'Sending...' : 'Get Started Free'}</button>
      <p className="text-xs text-gray-500 text-center">Or WhatsApp us: <a href="https://wa.me/918806907616?text=Hi%2C%20I%20want%20DG%20Business%20for%20my%20business" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline font-medium">+91 88069 07616</a></p>
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
  const L = (en: string, hi: string, gu: string) => isEn ? en : isGu ? gu : hi;

  const [heroAutoPlay, setHeroAutoPlay] = useState(true);
  React.useEffect(() => {
    if (!heroAutoPlay) return;
    const timer = setInterval(() => setHeroLang(h => (h + 1) % 3), 8000);
    return () => clearInterval(timer);
  }, [heroAutoPlay]);

  const bg = dark ? 'bg-[#0A0B0D]' : 'bg-[#FAFAFA]';
  const navBg = dark ? 'bg-[#0A0B0D]/80' : 'bg-white/80';
  const navBorder = dark ? 'border-white/5' : 'border-gray-200';
  const text = dark ? 'text-white' : 'text-[#1A1A1A]';
  const textMuted = dark ? 'text-gray-400' : 'text-gray-600';
  const textFaint = dark ? 'text-gray-500' : 'text-gray-400';
  const cardBg = dark ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100 shadow-sm';
  const cardHover = dark ? 'hover:border-brand/30 hover:bg-white/[0.05]' : 'hover:border-brand/30 hover:shadow-md';
  const sectionAlt = dark ? 'bg-white/[0.02]' : 'bg-white';
  const badgeBg = dark ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-brand/5 border-brand/20 text-brand';
  const btnSecondary = dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 text-[#1A1A1A] hover:bg-gray-50';
  const navLink = dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-[#1A1A1A]';
  const adminBtn = dark ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10' : 'bg-brand border-brand text-white hover:bg-brand-dark';

  return (
    <div className={`min-h-screen ${bg} ${text} overflow-x-hidden transition-colors duration-300`}>
      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 ${navBg} backdrop-blur-xl border-b ${navBorder}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-brand rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm text-white">DG</div>
            <span className="font-bold text-base sm:text-lg">DG Business</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <a href="#business" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>For Business</a>
            <a href="#features" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>Features</a>
            <a href="#pricing" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>Pricing</a>
            <a href="#contact" className={`px-3 py-2 text-sm font-medium ${navLink} hidden md:block`}>Contact</a>
            <button type="button" onClick={() => { nextLang(); setHeroAutoPlay(false); setHeroLang(lang === 'en' ? 1 : lang === 'hi' ? 2 : 0); }} className={`px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold border ${dark ? 'border-white/10 text-gray-300' : 'border-gray-200 text-gray-600'}`}>{langLabel}</button>
            <button type="button" onClick={toggleTheme} className={`p-1.5 sm:p-2 rounded-lg ${navLink}`}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 sm:pt-28 pb-14 sm:pb-20 px-4 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF9933]/10 via-transparent to-[#138808]/10 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-brand/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand text-white rounded-full text-xs font-bold mb-3 shadow-lg">
              🚀 {L('Coming Soon — Launching Shortly!', 'जल्द आ रहा है!', 'ટૂંક સમયમાં આવી રહ્યું છે!')}
            </div>
            <div className="inline-flex items-center gap-2 px-4 sm:px-5 py-1.5 sm:py-2 bg-gradient-to-r from-[#FF9933] via-white to-[#138808] text-[#1A1A1A] rounded-full text-xs sm:text-sm font-bold mb-4 sm:mb-6 shadow-lg">
              🇮🇳 {L('Made in India, for Indian Businesses', 'भारत में बना, भारतीयों के लिए', 'ભારતમાં બનેલું, ભારતીયો માટે')}
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
                    <span className="bg-gradient-to-r from-brand to-brand-light bg-clip-text text-transparent">{h.line2}</span>
                  </h1>
                  <p className={`mt-3 sm:mt-4 text-sm sm:text-lg md:text-xl ${textMuted} max-w-3xl mx-auto leading-relaxed px-2`}>{h.sub}</p>
                </motion.div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              {['EN', 'हिं', 'ગુ'].map((l, i) => (
                <button key={i} type="button" onClick={() => { setHeroLang(i); setHeroAutoPlay(false); }} className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${heroLang === i ? 'bg-brand text-white scale-110' : `${dark ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-500'}`}`}>{l}</button>
              ))}
            </div>
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <a href="#contact" className="group w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-brand text-white rounded-xl font-bold text-base sm:text-lg hover:bg-brand-dark transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20">
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6 text-center">
          {[
            { val: '15+', label: 'Modules' },
            { val: '₹0', label: 'To Start' },
            { val: '3', label: 'Languages' },
            { val: '100%', label: 'Cloud Based' },
            { val: '🇮🇳', label: 'Made in India' },
          ].map(s => (
            <div key={s.label}><p className="text-2xl md:text-3xl font-bold text-brand">{s.val}</p><p className={`text-xs mt-1 ${textFaint}`}>{s.label}</p></div>
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
              { icon: Store, title: L('Retail Shop', 'दुकान / Retail Shop', 'દુકાન / Retail Shop'), desc: L('Electrical shop, hardware store, kirana — scan barcode, generate bill, track stock. That simple.', 'बिजली की दुकान, hardware shop — barcode scan करो, bill दो, stock track करो। इतना simple।', 'બિજલીની દુકાન, hardware shop — barcode scan કરો, bill આપો, stock track કરો।'), features: ['Barcode billing', 'Stock alerts', 'WhatsApp bills', 'GST invoice'], color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: Warehouse, title: L('Dealer / Distributor', 'डीलर / Distributor', 'ડીલર / Distributor'), desc: L('Buy from suppliers, distribute to retailers. Track payments — who owes how much, which batch.', 'Products लाओ supplier से, distribute करो retailers को। Payment track करो — कौन कितना देना है।', 'Products લાવો supplier પાસેથી, distribute કરો। Payment track કરો।'), features: ['Vendor portal', 'Batch-level payment', 'Outstanding reports', 'Quotation → Distribution'], color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: Factory, title: L('Manufacturer', 'निर्माता / Manufacturer', 'નિર્માતા / Manufacturer'), desc: L('From production to dealer — purchase, inventory, distribution, billing, accounting all automated.', 'Production से लेकर dealer तक — purchase, inventory, distribution, billing, accounting सब automated।', 'Production થી dealer સુધી — purchase, inventory, distribution, billing, accounting બધું automated।'), features: ['Supplier management', 'P&L / Balance Sheet', 'GST GSTR-1 reports', 'Pack size support'], color: 'text-purple-500', bg: 'bg-purple-500/10' },
            ].map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`p-6 border rounded-2xl ${cardBg} ${cardHover} transition-all`}>
                <div className={`w-14 h-14 ${b.bg} rounded-2xl flex items-center justify-center mb-4`}><b.icon size={28} className={b.color} /></div>
                <h3 className="font-bold text-lg mb-2">{b.title}</h3>
                <p className={`text-sm ${textFaint} mb-4 leading-relaxed`}>{b.desc}</p>
                <div className="space-y-1.5">
                  {b.features.map(f => (
                    <div key={f} className="flex items-center gap-2"><Check size={14} className="text-brand shrink-0" /><span className={`text-xs ${textMuted}`}>{f}</span></div>
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
            <h2 className="text-3xl md:text-4xl font-bold">{L('Complete Business in One Place', 'पूरा बिज़नेस एक जगह', 'પૂરો બિઝનેસ એક જગ્યાએ')}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{L('From purchase to payment — every step tracked', 'Purchase से लेकर payment तक — हर step tracked', 'Purchase થી payment સુધી — દરેક step tracked')}</p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
            {[
              { icon: ShoppingCart, label: L('Purchase', 'खरीदो', 'ખરીદો'), sub: L('Buy from supplier', 'Supplier से खरीदो', 'Supplier પાસેથી ખરીદો'), color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { icon: Package, label: L('Stock', 'स्टॉक', 'સ્ટોક'), sub: L('Manage stock', 'Stock manage करो', 'Stock manage કરો'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: FileText, label: L('Quote', 'कोटेशन', 'કોટેશન'), sub: L('Send quote', 'Quote भेजो', 'Quote મોકલો'), color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
              { icon: Truck, label: L('Distribute', 'वितरण', 'વિતરણ'), sub: L('Send to vendor', 'Vendor को दो', 'Vendor ને આપો'), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: IndianRupee, label: L('Payment', 'भुगतान', 'ચુકવણી'), sub: L('Track money', 'पैसा track करो', 'પૈસા track કરો'), color: 'text-brand', bg: 'bg-brand/10' },
              { icon: BarChart3, label: L('Accounts', 'हिसाब', 'હિસાબ'), sub: 'P&L, Balance Sheet', color: 'text-purple-500', bg: 'bg-purple-500/10' },
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

      {/* Warehouse & Role Access */}
      <section className={`py-12 sm:py-20 px-4 sm:px-6 ${sectionAlt}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">{L('Factory to Vendor — Tracked', 'फैक्ट्री से वेंडर तक — ट्रैक्ड', 'ફેક્ટરી થી વેન્ડર સુધી — ટ્રેક્ડ')}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{L('Every role sees only what they need. Every dispatch is tracked.', 'हर role को सिर्फ वही दिखे जो ज़रूरी है। हर dispatch ट्रैक हो।', 'દરેક role ને ફક્ત જરૂરી જ દેખાય। દરેક dispatch ટ્રેક થાય।')}</p>
          </div>
          <div className={`p-6 sm:p-8 border rounded-2xl ${cardBg}`}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 text-center">
              {[
                { icon: Building2, title: L('Admin', 'एडमिन', 'એડમિન'), desc: L('Creates distribution, sets prices, manages everything', 'Distribution बनाए, price सेट करे, सब manage करे', 'Distribution બનાવે, price સેટ કરે, બધું manage કરે'), badge: L('Full Access', 'पूरा एक्सेस', 'પૂરો એક્સેસ'), badgeColor: 'bg-emerald-100 text-emerald-700' },
                { icon: Warehouse, title: L('Warehouse', 'वेयरहाउस', 'વેરહાઉસ'), desc: L('Sees pending dispatches, prints challan, marks dispatched', 'Pending dispatch देखे, challan print करे, dispatch mark करे', 'Pending dispatch જુએ, challan print કરે, dispatch mark કરે'), badge: L('View + Print', 'देखे + प्रिंट', 'જુએ + પ્રિન્ટ'), badgeColor: 'bg-blue-100 text-blue-700' },
                { icon: Truck, title: L('Dispatch', 'डिस्पैच', 'ડિસ્પેચ'), desc: L('Goods leave factory → Status: Dispatched → Vendor notified', 'माल फैक्ट्री से निकले → Status: Dispatched → Vendor को पता चले', 'માલ ફેક્ટરીથી નીકળે → Status: Dispatched → Vendor ને ખબર પડે'), badge: L('Tracked', 'ट्रैक्ड', 'ટ્રેક્ડ'), badgeColor: 'bg-amber-100 text-amber-700' },
                { icon: Users, title: L('Vendor', 'वेंडर', 'વેન્ડર'), desc: L('Receives goods, confirms delivery — all on their own dashboard', 'माल मिले, delivery confirm करे — अपने dashboard से', 'માલ મળે, delivery confirm કરે — પોતાના dashboard થી'), badge: L('View Only', 'सिर्फ देखे', 'ફક્ત જુએ'), badgeColor: 'bg-purple-100 text-purple-700' },
              ].map((role, i) => (
                <motion.div key={role.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className="relative">
                  {i < 3 && <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10"><ArrowRight size={16} className={textFaint} /></div>}
                  <div className={`w-14 h-14 ${i === 0 ? 'bg-emerald-500/10' : i === 1 ? 'bg-blue-500/10' : i === 2 ? 'bg-amber-500/10' : 'bg-purple-500/10'} rounded-2xl flex items-center justify-center mx-auto mb-3`}>
                    <role.icon size={28} className={i === 0 ? 'text-emerald-500' : i === 1 ? 'text-blue-500' : i === 2 ? 'text-amber-500' : 'text-purple-500'} />
                  </div>
                  <h3 className="font-bold text-sm mb-1">{role.title}</h3>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-2 ${role.badgeColor}`}>{role.badge}</span>
                  <p className={`text-xs ${textFaint} leading-relaxed`}>{role.desc}</p>
                </motion.div>
              ))}
            </div>
            <div className={`mt-6 pt-4 border-t ${navBorder} text-center`}>
              <p className={`text-xs ${textFaint}`}>{L('4 access levels per module: Hidden → View Only → View + Print → Full Access. Admin customizes per user.', '4 access levels: Hidden → सिर्फ देखे → देखे + प्रिंट → पूरा एक्सेस। Admin हर user के लिए customize करे।', '4 access levels: Hidden → ફક્ત જુએ → જુએ + પ્રિન્ટ → પૂરો એક્સેસ. Admin દરેક user માટે customize કરે.')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className={`py-12 sm:py-20 px-4 sm:px-6 ${sectionAlt}`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">{L('All Features, One Platform', 'सारी Features, एक Platform', 'બધી Features, એક Platform')}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{L("What old software can't do — we do it all", 'जो पुराने software में नहीं — वो सब यहीं है', 'જે જૂના software માં નથી — એ બધું અહીં છે')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Package, title: 'Inventory Management', desc: L('Auto-barcode, pack size (box/carton), batch printing, CSV import, stock alerts', 'Auto-barcode, pack size (box/carton), batch printing, CSV import, stock alerts', 'Auto-barcode, pack size (box/carton), batch printing, CSV import, stock alerts') },
              { icon: ShoppingCart, title: 'Purchase Tracking', desc: L('Supplier management, purchase bills, cost tracking, payables tracking', 'Supplier management, purchase bills, cost tracking, payables (kitna dena hai)', 'Supplier management, purchase bills, cost tracking, payables tracking') },
              { icon: Truck, title: 'Distribution', desc: L('Vendor distribution with batch-level payment tracking, custom pricing, discount', 'Vendor distribution with batch-level payment tracking, custom pricing, discount', 'Vendor distribution with batch-level payment tracking, custom pricing, discount') },
              { icon: FileText, title: L('Quotes & Orders', 'कोटेशन और ऑर्डर', 'કોટેશન અને ઓર્ડર'), desc: L('Create quotes, share via WhatsApp, take orders, fulfill to distribution — full sales cycle', 'Quote बनाओ, WhatsApp से share करो, order लो, distribution में convert करो', 'Quote બનાવો, WhatsApp થી share કરો, order લો, distribution માં convert કરો') },
              { icon: IndianRupee, title: L('Vendor Finance', 'वेंडर फाइनेंस', 'વેન્ડર ફાઇનાન્સ'), desc: L('Track who owes how much, age-wise outstanding, batch-level payment, reminders', 'Kaun kitna dena hai, age-wise outstanding, batch-level payment, reminders', 'કોણ કેટલા દેવા છે, age-wise outstanding, batch-level payment, reminders') },
              { icon: BarChart3, title: L('Accounts & Day Book', 'हिसाब और डे बुक', 'હિસાબ અને ડે બુક'), desc: L('P&L, Balance Sheet, Cash Flow, Ledger, Day Book, Credit/Debit Notes — all auto-generated', 'P&L, Balance Sheet, Cash Flow, Ledger, Day Book — सब auto-generated', 'P&L, Balance Sheet, Cash Flow, Ledger, Day Book — બધું auto-generated') },
              { icon: Receipt, title: L('E-Invoice & E-Way Bill', 'E-Invoice और E-Way Bill', 'E-Invoice અને E-Way Bill'), desc: L('Generate GST E-Invoice and E-Way Bill JSON — upload directly to government portal', 'GST E-Invoice aur E-Way Bill JSON generate karo — government portal pe upload karo', 'GST E-Invoice અને E-Way Bill JSON generate કરો — government portal પર upload કરો') },
              { icon: Search, title: 'Smart Search', desc: L('Scan barcode or type — product, vendor, customer, challan — all found instantly', 'Barcode scan ya type karo — product, vendor, customer, challan — sab instant mile', 'Barcode scan કરો કે type કરો — product, vendor, customer — બધું instant મળે') },
              { icon: Users, title: 'Vendor Portal', desc: L('Give dealers their own login — they can see their stock and sales on a separate dashboard', 'Dealers ko alag login do, woh apna stock aur sales dekh sakein — separate dashboard', 'Dealers ને અલગ login આપો, એ પોતાનો stock અને sales જોઈ શકે') },
              { icon: MessageSquare, title: 'AI Chatbot', desc: L('"What\'s today\'s sale?" — ask in any language and get instant answers from your data', '"Aaj ki sale kitni hai?" — Hindi mein poocho, Hindi mein jawab dega', '"આજનો sale કેટલો?" — ગુજરાતીમાં પૂછો, ગુજરાતીમાં જવાબ') },
              { icon: Shield, title: L('UPI QR & Price List', 'UPI QR और Price List', 'UPI QR અને Price List'), desc: L('UPI payment QR code on every bill. Vendor-wise and slab pricing — auto-applied during distribution', 'हर bill पर UPI QR code। Vendor-wise और slab pricing — distribution में auto apply', 'દરેક bill પર UPI QR code। Vendor-wise અને slab pricing — distribution માં auto apply') },
              { icon: Languages, title: '3 Languages', desc: L('English, Hindi, Gujarati — switch from settings and the entire UI changes', 'English, Hindi, Gujarati — switch karo settings se, poora UI badal jayega', 'English, Hindi, Gujarati — settings માંથી switch કરો, આખું UI બદલાશે') },
              { icon: Smartphone, title: 'Mobile Ready', desc: L('Works on phone, works on tablet — bottom nav, touch-friendly, install as app', 'Phone pe chale, tablet pe chale — bottom nav, touch-friendly, install as app', 'Phone પર ચાલે, tablet પર ચાલે — bottom nav, touch-friendly, install as app') },
              { icon: Globe, title: 'Cloud Based', desc: L('No server to maintain, no installation needed — open browser and start working', 'Koi server nahi rakhna, koi installation nahi — browser kholo aur shuru karo', 'કોઈ server રાખવો નહિ, installation નહિ — browser ખોલો અને શરૂ કરો') },
              { icon: Building2, title: 'Multi-Tenant SaaS', desc: L('Run 100 companies from one software — each with separate data and URL', 'Ek software se 100 companies chala sakte ho — har ek ka data alag, URL alag', 'એક software થી 100 companies ચલાવો — દરેકનો data અલગ, URL અલગ') },
              { icon: Heart, title: 'Affordable', desc: L('Fits a small shop\'s budget — free trial, no hidden charges, cancel anytime', 'Chhoti dukaan ke budget mein — free trial, no hidden charges, cancel anytime', 'નાની દુકાનના budget માં — free trial, no hidden charges, cancel anytime') },
            ].map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                className={`p-5 border rounded-2xl transition-all group ${cardBg} ${cardHover}`}>
                <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center mb-3 group-hover:bg-brand/20 transition-colors"><f.icon size={20} className="text-brand" /></div>
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
            <h2 className="text-3xl md:text-4xl font-bold">{L('Fits Every Budget', 'सबके बजट में', 'બધાના બજેટમાં')}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{L('From small shops to large factories — affordable plans', 'छोटी दुकान से लेकर बड़ी factory तक — affordable plans', 'નાની દુકાનથી મોટી factory સુધી — affordable plans')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Free Trial', price: '₹0', period: '14 days', desc: 'All features free for 14 days', features: ['All modules', '50 products', '5 vendors', 'Email support'], cta: 'Join Waitlist', highlight: false },
              { name: 'Standard', price: 'Contact Us', period: '', desc: 'Growing businesses', features: ['Unlimited products', '15 vendors', 'Vendor portal', 'Priority support', 'Pack size', 'Reports'], cta: 'Join Waitlist', highlight: true },
              { name: 'Professional', price: 'Contact Us', period: '', desc: 'Large manufacturers', features: ['Everything unlimited', 'Accounts + Day Book', 'E-Invoice & E-Way Bill', 'Orders + Price List', 'Chatbot', 'Custom branding'], cta: 'Join Waitlist', highlight: false },
            ].map((p, i) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`p-6 border rounded-2xl ${p.highlight ? (dark ? 'bg-brand/10 border-brand/30 ring-2 ring-brand/20' : 'bg-brand/5 border-brand/30 shadow-lg shadow-brand/10 ring-2 ring-brand/20') : cardBg}`}>
                {p.highlight && <div className="text-center mb-3"><span className="px-3 py-1 bg-brand text-white text-xs font-bold rounded-full">Most Popular</span></div>}
                <h3 className="font-bold text-lg">{p.name}</h3>
                <div className="mt-2 mb-1"><span className="text-3xl font-bold">{p.price}</span><span className={`text-sm ${textFaint}`}>{p.period}</span></div>
                <p className={`text-sm ${textFaint} mb-4`}>{p.desc}</p>
                <div className="space-y-2 mb-6">
                  {p.features.map(f => <div key={f} className="flex items-center gap-2"><Check size={14} className="text-brand" /><span className={`text-sm ${textMuted}`}>{f}</span></div>)}
                </div>
                <a href="#contact" className={`block text-center py-3 rounded-xl font-bold transition-colors ${p.highlight ? 'bg-brand text-white hover:bg-brand-dark' : `border ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}`}>{p.cta}</a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why DG Business */}
      <section className={`py-12 sm:py-20 px-4 sm:px-6 ${sectionAlt}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">{L('Beyond Old Software', 'पुराने Software से आगे', 'જૂના Software થી આગળ')}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{L('Replace legacy software with modern cloud business management', 'पुराने software को replace करो modern cloud ERP से', 'જૂના software ને replace કરો modern cloud ERP થી')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { emoji: '☁️', title: L('Cloud — No Installation', 'Cloud — कोई Installation नहीं', 'Cloud — કોઈ Installation નહિ'), desc: L('Old software needs install, license, backup. DG Business — just open the browser.', 'पुराने software में install करो, license खरीदो, backup लो। DG Business में सिर्फ browser खोलो।', 'જૂના software માં install કરો, license ખરીદો। DG Business માં ફક્ત browser ખોલો।') },
              { emoji: '📱', title: L('Works on Mobile', 'मोबाइल पे चले', 'મોબાઈલ પર ચાલે'), desc: L('Old software runs only on desktop. DG Business works on phone and tablet — work from anywhere.', 'पुराने software सिर्फ desktop पे चलते हैं। DG Business phone पे भी tablet पे भी।', 'જૂના software ફક્ત desktop પર ચાલે. DG Business phone અને tablet પર પણ ચાલે.') },
              { emoji: '🔐', title: L('Vendor Portal', 'वेंडर पोर्टल', 'વેન્ડર પોર્ટલ'), desc: L('Give dealers their own login — they can view their stock, sales, payments. Not in old software.', 'अपने dealers को उनका login दो — वो अपना stock, sales, payments खुद देख लें।', 'Dealers ને એમનું login આપો — એ પોતાનો stock, sales, payments જોઈ શકે.') },
              { emoji: '🤖', title: L('AI Chatbot', 'AI चैटबॉट', 'AI ચેટબોટ'), desc: L('"What\'s low stock?" Ask the chatbot — it checks the database and answers. Real-time.', '"Low stock क्या है?" पूछो chatbot से — वो database check करके जवाब देगा। Real-time।', '"Low stock શું છે?" chatbot ને પૂછો — એ database check કરીને જવાબ આપશે.') },
              { emoji: '💰', title: L('Batch-Level Payment', 'Batch-Level भुगतान', 'Batch-Level ચુકવણી'), desc: L('Track payment for each distribution batch separately — which batch paid, which pending. Crystal clear.', 'हर distribution batch का payment अलग track करो — कौन सा batch paid, कौन सा pending।', 'દરેક distribution batch નું payment અલગ track કરો — ક્યો batch paid, ક્યો pending.') },
              { emoji: '📊', title: L('Auto Accounting', 'ऑटो हिसाब-किताब', 'ઓટો હિસાબ-કિતાબ'), desc: L('P&L, Balance Sheet, Cash Flow — automatically generated from transactions. No manual entry.', 'P&L, Balance Sheet, Cash Flow — automatically generate होता है transactions से। No manual entry।', 'P&L, Balance Sheet, Cash Flow — transactions માંથી automatically generate. No manual entry.') },
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
            <h2 className="text-3xl md:text-4xl font-bold">{L('Get Started', 'शुरू करें', 'શરૂ કરો')}</h2>
            <p className={`mt-3 ${textMuted} text-lg`}>{L('Get a free trial today — setup in 5 minutes', 'आज ही free trial लो — 5 minute में setup हो जाएगा', 'આજે જ free trial લો — 5 minute માં setup થઈ જશે')}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            <div className="lg:col-span-2 space-y-6">
              <div className={`p-6 border rounded-2xl space-y-5 ${cardBg}`}>
                <h3 className="font-bold text-lg">{L("Let's Talk", 'बात करें', 'વાત કરો')}</h3>
                <p className={`text-sm ${textFaint}`}>{L('Call, WhatsApp, or email us — we reply within 24 hours.', 'Call karo, WhatsApp karo, ya email karo — hum 24 ghante mein reply karenge.', 'Call કરો, WhatsApp કરો, કે email કરો — અમે 24 કલાકમાં reply કરીશું.')}</p>
                <div className="space-y-4 pt-2">
                  <a href="tel:+918806907616" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-brand`}>
                    <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center shrink-0"><Phone size={18} className="text-brand" /></div>
                    <div><p className={`text-xs ${textFaint}`}>Phone</p><p className="font-medium">+91 88069 07616</p></div>
                  </a>
                  <a href="https://wa.me/918806907616?text=Hi%2C%20I%20want%20DG%20Business%20for%20my%20business" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-green-400`}>
                    <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0"><MessageCircle size={18} className="text-green-500" /></div>
                    <div><p className={`text-xs ${textFaint}`}>WhatsApp</p><p className="font-medium">+91 88069 07616</p></div>
                  </a>
                  <a href="https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 text-sm ${textMuted} hover:text-brand`}>
                    <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center shrink-0"><Mail size={18} className="text-brand" /></div>
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
              {L('From the Land of Rajkot, for the World', 'राजकोट की धरती से, दुनिया के लिए', 'રાજકોટની ધરતી પરથી, દુનિયા માટે')}
            </h2>
            <p className={`text-lg ${textMuted} max-w-2xl mx-auto leading-relaxed`}>
              {L('Rajkot — the heart of industrialisation. Software built for every entrepreneur, shopkeeper, and manufacturer here. Rangilu Rajkot! 🦁', 'राजकोट — industrialisation का दिल। यहाँ के हर उद्योगपति, दुकानदार, और manufacturer को ध्यान में रखकर बनाया गया software। रंगीलो राजकोट! 🦁', 'રાજકોટ — industrialisation નું હૃદય। અહીંના દરેક ઉદ્યોગપતિ, દુકાનદાર, અને manufacturer ને ધ્યાનમાં રાખીને બનાવેલું software। રંગીલું રાજકોટ! 🦁 🦁')}
            </p>
            <div className={`mt-6 inline-flex items-center gap-3 px-6 py-3 rounded-2xl border ${cardBg}`}>
              <span className="text-2xl">🦁</span>
              <div className="text-left">
                <p className="font-bold text-sm">{L('Designed in Rajkot, Built for India', 'राजकोट में डिज़ाइन, भारत के लिए बना', 'રાજકોટમાં ડિઝાઇન, ભારત માટે બનેલું')}</p>
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
              <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center font-bold text-xs text-white">DG</div>
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
              <a href="tel:+918806907616" className="hover:text-brand"><Phone size={16} /></a>
              <a href="https://wa.me/918806907616" target="_blank" rel="noopener noreferrer" className="hover:text-green-500"><MessageCircle size={16} /></a>
              <a href="https://mail.google.com/mail/?view=cm&to=patelprathamesh007@gmail.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand"><Mail size={16} /></a>
            </div>
          </div>
          <p className={`text-xs ${textFaint} text-center mt-6`}>&copy; {new Date().getFullYear()} DG Business Management. Designed for Indian businesses, built with love.</p>
        </div>
      </footer>
    </div>
  );
}
