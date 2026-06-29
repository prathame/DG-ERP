import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Barcode, Package, Users, ShoppingCart, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import { useDebounce } from '../../hooks/useDebounce';
import type { Tab } from '../../types';

type SearchResult = {
  products: { id: string; name: string; price: number; stock: number; type: 'product' }[];
  customers: { id: string; name: string; phone: string; email: string; type: 'customer' }[];
  vendors: { id: string; name: string; contact: string; phone: string; type: 'vendor' }[];
  barcodes: { barcode: string; productName: string; productId: string; status: string; type: 'barcode' }[];
  challans?: { batchId: string; vendorName: string; date: string; units: number; type: 'challan' }[];
};

export function GlobalSearchBar({ setActiveTab }: { setActiveTab: (tab: Tab) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 200);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 1) { setResults(null); setOpen(false); return; }
    setLoading(true);
    api.search.global(debouncedQuery)
      .then((r) => { setResults(r); setOpen(true); })
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasResults = results && (results.products.length > 0 || results.customers.length > 0 || results.vendors.length > 0 || results.barcodes.length > 0 || (results.challans?.length ?? 0) > 0);

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        className="pl-10 pr-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:ring-2 focus:ring-brand transition-all w-36 sm:w-56 md:w-72 focus:w-56 sm:focus:w-72 md:focus:w-96"
        autoComplete="off"
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />}
      <AnimatePresence>
        {open && hasResults && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-full mt-2 right-0 w-[calc(100vw-2rem)] sm:w-[400px] bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
          >
            {results.barcodes.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Barcodes</p>
                {results.barcodes.map((b) => (
                  <button key={b.barcode} type="button" onClick={() => { setQuery(b.barcode); setOpen(false); setActiveTab('inventory'); }} className="w-full px-4 py-2.5 text-left hover:bg-orange-50 flex items-center gap-3 transition-colors">
                    <Barcode size={16} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium truncate">{b.barcode}</p>
                      <p className="text-xs text-gray-500 truncate">{b.productName} <span className={cn("ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold", b.status === 'InStock' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>{b.status}</span></p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {(results.challans?.length ?? 0) > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Challans</p>
                {results.challans!.map((c) => (
                  <button key={c.batchId} type="button" onClick={() => { setQuery(''); setOpen(false); setActiveTab('distribution'); }} className="w-full px-4 py-2.5 text-left hover:bg-orange-50 flex items-center gap-3 transition-colors">
                    <FileText size={16} className="text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.batchId}</p>
                      <p className="text-xs text-gray-500 truncate">{c.vendorName} &middot; {c.date} &middot; {c.units} units</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {results.products.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Products</p>
                {results.products.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setQuery(p.name); setOpen(false); setActiveTab('inventory'); }} className="w-full px-4 py-2.5 text-left hover:bg-orange-50 flex items-center gap-3 transition-colors">
                    <Package size={16} className="text-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{'₹'}{p.price.toLocaleString()} &middot; {p.stock} in stock</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {results.customers.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Customers</p>
                {results.customers.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setQuery(''); setOpen(false); setActiveTab('dashboard'); }} className="w-full px-4 py-2.5 text-left hover:bg-orange-50 flex items-center gap-3 transition-colors">
                    <Users size={16} className="text-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 truncate">{c.phone || c.email || '-'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {results.vendors.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Vendors</p>
                {results.vendors.map((v) => (
                  <button key={v.id} type="button" onClick={() => { setQuery(''); setOpen(false); setActiveTab('dashboard'); }} className="w-full px-4 py-2.5 text-left hover:bg-orange-50 flex items-center gap-3 transition-colors">
                    <ShoppingCart size={16} className="text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{v.name}</p>
                      <p className="text-xs text-gray-500 truncate">{v.contact || v.phone || '-'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
        {open && query.length >= 1 && !loading && !hasResults && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute top-full mt-2 right-0 w-[calc(100vw-2rem)] sm:w-[400px] bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 text-center z-50">
            <Search className="mx-auto mb-2 text-gray-300" size={28} />
            <p className="text-sm text-gray-500">No results for "<span className="font-medium text-gray-700">{query}</span>"</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
