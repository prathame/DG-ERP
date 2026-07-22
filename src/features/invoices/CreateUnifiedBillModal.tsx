import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import type { Product, Vendor } from '../../types';
import {
  useToast,
  AppModal,
  ModalActions,
  ModalActionButton,
  FormSection,
  FormGrid,
  FormField,
  formControlClass,
} from '../../components/ui';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { suggestHsnRate } from '../../lib/hsnRates';
import { isGstBillingEnabled } from '../../lib/billSettingsFlags';
import { scheduleBakeCapBillPdfCache, type CapBillPdfCacheDoc } from '../../lib/capBillPdfCache';
import { printStandaloneInvoice } from '../../lib/printStandaloneInvoice';
import { reportActionFailed } from '../../lib/reportActionFailure';
import { session } from '../../lib/session';
import { useBusinessConfig } from '../../lib/businessTypeConfig';

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  items: Array<{
    description: string;
    hsnSac?: string;
    qty: number;
    rate: number;
    gstPercent: number;
    discountPercent?: number;
    productId?: string;
    taxable?: number;
    tax?: number;
    total?: number;
  }>;
  subtotal: number;
  taxTotal: number;
  taxCgst?: number;
  taxSgst?: number;
  taxIgst?: number;
  isInterstate?: boolean;
  gstEnabled?: boolean;
  grandTotal: number;
  notes?: string;
  terms?: string;
  status: string;
  invoiceDate: string;
  dueDate?: string;
};

type BillLine = {
  productId: string;
  description: string;
  hsnSac: string;
  qty: number;
  rate: number;
  gstPercent: number;
  discountPercent: number;
};

type PriceRule = {
  id: string;
  productId: string;
  vendorId?: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  isActive: boolean;
};

function asApiList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

const emptyRow = (gstOn = true): BillLine => ({
  productId: '',
  description: '',
  hsnSac: '',
  qty: 1,
  rate: 0,
  gstPercent: gstOn ? 18 : 0,
  discountPercent: 0,
});

function lineTaxable(qty: number, rate: number, discountPercent: number): number {
  const disc = Math.min(100, Math.max(0, discountPercent || 0));
  return Math.round((((qty || 0) * (rate || 0) * (100 - disc)) / 100) * 100) / 100;
}

function resolveCatalogPrice(product: Product, rules: PriceRule[], vendorId: string | null, qty: number): number {
  const q = qty > 0 ? qty : 1;
  const candidates = rules.filter(
    r =>
      r.isActive !== false &&
      r.productId === product.id &&
      r.minQty <= q &&
      (r.maxQty == null || r.maxQty >= q) &&
      (!r.vendorId || (vendorId && r.vendorId === vendorId)),
  );
  candidates.sort((a, b) => {
    const aV = vendorId && a.vendorId === vendorId ? 0 : 1;
    const bV = vendorId && b.vendorId === vendorId ? 0 : 1;
    if (aV !== bV) return aV - bV;
    return b.minQty - a.minQty;
  });
  return candidates[0]?.price ?? product.price ?? 0;
}

function classifyLines(rows: BillLine[]) {
  const inventory = rows.filter(r => r.productId && r.qty > 0);
  const custom = rows.filter(r => !r.productId && r.description.trim() && r.rate > 0);
  return { inventory, custom };
}

/**
 * Non-service only: one create flow for Invoices.
 * Vendor + inventory → sale (createBatch); custom / unmatched vendor → standalone invoice.
 * Mixed inventory + custom with a matched vendor → choice dialog (split or remove one type).
 */
export function CreateUnifiedBillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const cfg = useBusinessConfig();
  const isDirectSell = cfg.type === 'dealer' || cfg.type === 'retail' || cfg.type === 'silver_casting';
  const partyLabel = isDirectSell ? 'Customer' : 'Vendor';
  const saleLabel = isDirectSell ? 'sale' : 'distribution';
  const defaultGstRate = ((session.getUser() as Record<string, unknown> | null)?.defaultGstRate as number) ?? 18;

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState({
    customerName: '',
    customerGstin: '',
    customerAddress: '',
    customerPhone: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    notes: '',
    terms: '',
  });
  const [vendorId, setVendorId] = useState('');
  const [gstBilling, setGstBilling] = useState(() => isGstBillingEnabled(null));
  const [rows, setRows] = useState<BillLine[]>(() => [emptyRow(isGstBillingEnabled(null))]);
  const [amountPaid, setAmountPaid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [mixDialog, setMixDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'draft' | 'sent'>('sent');
  const resolveTokenRef = useRef<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchApi<{ number: string }>('/invoices/next-number')
      .then(r => {
        if (!cancelled) setInvoiceNumber(r.number);
      })
      .catch(() => {});
    api.settings
      .getBillSettings()
      .then(s => {
        if (cancelled) return;
        const on = isGstBillingEnabled(s);
        setGstBilling(on);
        setRows(prev =>
          prev.map(r => ({
            ...r,
            gstPercent: on ? r.gstPercent || 18 : 0,
            hsnSac: on ? r.hsnSac : '',
          })),
        );
      })
      .catch(() => {});
    Promise.allSettled([api.vendors.list(), api.products.list(), fetchApi<PriceRule[]>('/price-lists')]).then(
      results => {
        if (cancelled) return;
        setVendors(asApiList<Vendor>(results[0].status === 'fulfilled' ? results[0].value : []));
        setProducts(asApiList<Product>(results[1].status === 'fulfilled' ? results[1].value : []));
        const rules = asApiList<PriceRule>(results[2].status === 'fulfilled' ? results[2].value : []);
        setPriceRules(rules.filter(r => r && r.isActive !== false));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveRowPrice = (idx: number, productId: string, nextVendorId: string | null, quantity: number) => {
    if (!productId || quantity <= 0) return;
    const token = (resolveTokenRef.current[idx] = (resolveTokenRef.current[idx] || 0) + 1);
    const qs = new URLSearchParams({ productId, quantity: String(quantity) });
    if (nextVendorId) qs.set('vendorId', nextVendorId);
    fetchApi<{ price: number }>(`/price-lists/resolve?${qs}`)
      .then(d => {
        if (resolveTokenRef.current[idx] !== token) return;
        if (!d || typeof d.price !== 'number') return;
        setRows(prev => {
          const row = prev[idx];
          if (!row || row.productId !== productId || (row.qty || 0) !== quantity) return prev;
          return prev.map((r, i) => (i === idx ? { ...r, rate: d.price } : r));
        });
      })
      .catch(() => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        const rate = resolveCatalogPrice(p, priceRules, nextVendorId, quantity);
        setRows(prev => {
          const row = prev[idx];
          if (!row || row.productId !== productId) return prev;
          return prev.map((r, i) => (i === idx ? { ...r, rate } : r));
        });
      });
  };

  const selectVendor = (id: string) => {
    setVendorId(id);
    if (!id) return;
    const v = vendors.find(x => x.id === id);
    if (!v) return;
    setForm(f => ({
      ...f,
      customerName: v.name,
      customerPhone: v.phone || f.customerPhone,
      customerAddress: v.address || f.customerAddress,
      customerGstin: v.gstNumber || (v as { gstin?: string }).gstin || f.customerGstin,
    }));
    rows.forEach((r, i) => {
      if (r.productId) resolveRowPrice(i, r.productId, id, r.qty || 1);
    });
  };

  const applyCatalogItem = (idx: number, productId: string) => {
    if (!productId) {
      setRows(prev =>
        prev.map((r, i) => (i === idx ? { ...emptyRow(gstBilling), qty: r.qty || 1, description: r.description } : r)),
      );
      return;
    }
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const qty = rows[idx]?.qty || 1;
    const rate = resolveCatalogPrice(p, priceRules, vendorId || null, qty);
    const hint = p.hsnCode ? suggestHsnRate(p.hsnCode) : null;
    setRows(prev =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              productId: p.id,
              description: p.name,
              hsnSac: gstBilling ? p.hsnCode || r.hsnSac || '' : '',
              qty,
              rate,
              gstPercent: gstBilling ? (p.gstRate ?? hint?.rate ?? r.gstPercent ?? 18) : 0,
            }
          : r,
      ),
    );
    resolveRowPrice(idx, p.id, vendorId || null, qty);
  };

  const updateRowQty = (idx: number, qty: number) => {
    setRows(prev =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, qty };
        if (r.productId) {
          const p = products.find(x => x.id === r.productId);
          if (p) next.rate = resolveCatalogPrice(p, priceRules, vendorId || null, qty);
        }
        return next;
      }),
    );
    const row = rows[idx];
    if (row?.productId && qty > 0) resolveRowPrice(idx, row.productId, vendorId || null, qty);
  };

  const totals = rows.reduce(
    (acc, r) => {
      const taxable = lineTaxable(r.qty, r.rate, r.discountPercent);
      const tax = Math.round(((taxable * (r.gstPercent || 0)) / 100) * 100) / 100;
      return { subtotal: acc.subtotal + taxable, tax: acc.tax + tax, grand: acc.grand + taxable + tax };
    },
    { subtotal: 0, tax: 0, grand: 0 },
  );

  const createSale = async (inventory: BillLine[]) => {
    const paid = parseFloat(amountPaid) || 0;
    await api.distribution.createBatch({
      vendorId,
      distributionDate: form.invoiceDate,
      amountPaid: paid > 0 ? paid : undefined,
      gstRate: defaultGstRate,
      items: inventory.map(row => ({
        productId: row.productId,
        quantity: row.qty,
        discountPercent: row.discountPercent > 0 ? row.discountPercent : undefined,
        withGst: gstBilling && (row.gstPercent || 0) > 0,
        customPrice: row.rate > 0 ? row.rate : undefined,
      })),
    });
  };

  const createStandaloneInvoice = async (customRows: BillLine[], status: 'draft' | 'sent') => {
    const created = await fetchApi<Invoice>('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        invoiceNumber,
        gstEnabled: gstBilling,
        items: customRows.map(({ description, hsnSac, qty, rate, gstPercent, discountPercent, productId }) => ({
          description: description.trim() || products.find(p => p.id === productId)?.name || 'Item',
          hsnSac: gstBilling ? hsnSac : '',
          qty,
          rate,
          gstPercent: gstBilling ? gstPercent : 0,
          discountPercent: discountPercent || 0,
          ...(productId ? { productId } : {}),
        })),
        status,
        partyType: vendorId ? 'vendor' : null,
        partyId: vendorId || null,
      }),
    });
    if (created?.id) scheduleBakeCapBillPdfCache(created as CapBillPdfCacheDoc);
    return created;
  };

  const finishCreated = () => {
    setCreatedInvoice(null);
    onCreated();
  };

  const runSave = async (status: 'draft' | 'sent', mode: 'auto' | 'split' = 'auto') => {
    if (!form.customerName.trim()) {
      toast(`${partyLabel} name is required`, 'error');
      return;
    }
    const { inventory, custom } = classifyLines(rows);
    if (inventory.length === 0 && custom.length === 0) {
      toast('Add at least one product or custom line', 'error');
      return;
    }

    // Matched vendor + mix → never silently proceed
    if (mode === 'auto' && vendorId && inventory.length > 0 && custom.length > 0) {
      setPendingStatus(status);
      setMixDialog(true);
      return;
    }

    // Sale when vendor matched and (auto inventory-only, or split inventory half).
    const wantSale =
      !!vendorId && inventory.length > 0 && (mode === 'split' || (mode === 'auto' && custom.length === 0));

    let invoiceRows: BillLine[] = [];
    if (mode === 'split') invoiceRows = custom;
    else if (!wantSale) invoiceRows = [...inventory, ...custom];
    else invoiceRows = []; // auto sale-only: no invoice half

    setSubmitting(true);
    setMixDialog(false);
    try {
      if (wantSale) {
        await createSale(inventory);
        toast(
          `${isDirectSell ? 'Sale' : 'Distribution'} saved — ${inventory.length} inventory line(s). See Sales for this ${partyLabel.toLowerCase()}.`,
          'success',
        );
      }

      if (invoiceRows.length) {
        const created = await createStandaloneInvoice(invoiceRows, status);
        toast(`Invoice ${created?.invoiceNumber || invoiceNumber} created`, 'success');
        if (created?.items && Array.isArray(created.items) && !wantSale) {
          setCreatedInvoice(created);
          setSubmitting(false);
          return;
        }
      }

      onCreated();
    } catch (err) {
      toast((err as Error).message, 'error');
      void reportActionFailed('invoice.save', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (status: 'draft' | 'sent') => void runSave(status, 'auto');

  const clearCustomLines = () => {
    setRows(prev => {
      const kept = prev.filter(r => r.productId);
      return kept.length ? kept : [emptyRow(gstBilling)];
    });
    setMixDialog(false);
    toast('Custom lines removed. Review inventory lines, then save again.', 'success');
  };

  const clearInventoryLines = () => {
    setRows(prev => {
      const kept = prev.filter(r => !r.productId && r.description.trim());
      return kept.length ? kept : [emptyRow(gstBilling)];
    });
    setMixDialog(false);
    toast('Inventory lines removed. Review custom lines, then save again.', 'success');
  };

  const printCreated = async () => {
    if (!createdInvoice) return;
    try {
      await printStandaloneInvoice(createdInvoice, { businessType: cfg.type });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Print failed', 'error');
      void reportActionFailed('invoice.print', err, { invoiceNumber: createdInvoice.invoiceNumber });
    }
  };

  const productOptions = (qty: number) =>
    products
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => {
        const listPrice = resolveCatalogPrice(p, priceRules, vendorId || null, qty || 1);
        const stock = p.remainingInventory ?? p.stock ?? 0;
        return {
          value: p.id,
          label: p.name,
          sublabel: `₹${listPrice.toLocaleString()} · ${stock} in stock`,
        };
      });

  const footer = createdInvoice ? (
    <ModalActions>
      <ModalActionButton variant="ghost" onClick={finishCreated}>
        Done
      </ModalActionButton>
      <ModalActionButton variant="primary" onClick={() => void printCreated()}>
        Print / PDF
      </ModalActionButton>
    </ModalActions>
  ) : (
    <ModalActions>
      <ModalActionButton variant="ghost" onClick={onClose}>
        Cancel
      </ModalActionButton>
      <ModalActionButton variant="secondary" disabled={submitting} onClick={() => handleSubmit('draft')}>
        {submitting ? 'Saving…' : 'Save as Draft'}
      </ModalActionButton>
      <ModalActionButton variant="primary" disabled={submitting} onClick={() => handleSubmit('sent')}>
        {submitting ? 'Saving…' : 'Create & Send'}
      </ModalActionButton>
    </ModalActions>
  );

  const routeHint = (() => {
    const { inventory, custom } = classifyLines(rows);
    if (vendorId && inventory.length > 0 && custom.length === 0) {
      return `Matched ${partyLabel.toLowerCase()} + inventory → will record a ${saleLabel} under Sales.`;
    }
    if (vendorId && custom.length > 0 && inventory.length === 0) {
      return `Matched ${partyLabel.toLowerCase()} + custom lines → standalone invoice (Invoices only).`;
    }
    if (vendorId && inventory.length > 0 && custom.length > 0) {
      return 'Mixed inventory and custom lines — you will choose Split or Remove on save.';
    }
    if (!vendorId && form.customerName.trim()) {
      return 'Custom / unmatched party → standalone invoice under Invoices.';
    }
    return `Type a ${partyLabel.toLowerCase()} — pick a match for ${saleLabel}s, or leave custom for a standalone invoice.`;
  })();

  return (
    <>
      <AppModal
        title={createdInvoice ? 'Invoice created' : 'New Invoice'}
        subtitle={
          createdInvoice ? (
            <span className="font-mono">{createdInvoice.invoiceNumber}</span>
          ) : (
            <span>One flow for {saleLabel}s and standalone invoices</span>
          )
        }
        onClose={createdInvoice ? finishCreated : onClose}
        footer={footer}
        size="lg"
        zIndex={100}
      >
        <div className="space-y-4">
          {createdInvoice ? (
            <div className="text-center py-8 space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Check size={24} />
              </div>
              <p className="font-bold text-lg">Invoice {createdInvoice.invoiceNumber} is ready</p>
              <p className="text-sm text-gray-500">
                {createdInvoice.customerName} · ₹{Number(createdInvoice.grandTotal || 0).toLocaleString('en-IN')}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                {routeHint}
              </p>

              <FormSection title={partyLabel} description="Type to search — pick a match or keep as custom">
                <FormGrid>
                  <FormField label={`${partyLabel} Name`} required className="sm:col-span-2">
                    <SearchSelect
                      allowCustom
                      value={vendorId}
                      onChange={selectVendor}
                      inputValue={form.customerName}
                      onInputChange={text => {
                        setForm(f => ({ ...f, customerName: text }));
                      }}
                      placeholder={`Type ${partyLabel.toLowerCase()} name…`}
                      emptyHint={
                        vendors.length === 0
                          ? `No ${partyLabel.toLowerCase()}s yet — type a name, or add in Masters`
                          : undefined
                      }
                      customLabel={partyLabel.toLowerCase()}
                      options={vendors
                        .filter(v => v && v.id && v.id !== 'OWNER' && v.name)
                        .map(v => ({
                          value: v.id,
                          label: v.name,
                          sublabel: v.phone || undefined,
                        }))}
                      className="w-full [&_input]:min-h-11 [&_input]:rounded-xl [&_input]:px-3 [&_input]:sm:px-4"
                    />
                  </FormField>
                  <FormField label="GSTIN">
                    <input
                      value={form.customerGstin}
                      onChange={e => setForm({ ...form, customerGstin: e.target.value.toUpperCase() })}
                      maxLength={15}
                      className={cn(formControlClass, 'font-mono')}
                      placeholder="Optional"
                    />
                  </FormField>
                  <FormField label="Phone">
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                      className={formControlClass}
                      placeholder="Optional"
                    />
                  </FormField>
                  <FormField label="Address" className="sm:col-span-2">
                    <input
                      value={form.customerAddress}
                      onChange={e => setForm({ ...form, customerAddress: e.target.value })}
                      className={formControlClass}
                      placeholder="Street, City, State"
                    />
                  </FormField>
                  <FormField label="Date" required>
                    <input
                      type="date"
                      value={form.invoiceDate}
                      onChange={e => setForm({ ...form, invoiceDate: e.target.value })}
                      className={formControlClass}
                      required
                    />
                  </FormField>
                  {vendorId && (
                    <FormField label="Amount Paid (sale)">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={amountPaid}
                        onChange={e => setAmountPaid(e.target.value)}
                        className={formControlClass}
                        placeholder="0.00 — used when this becomes a sale"
                      />
                    </FormField>
                  )}
                </FormGrid>
              </FormSection>

              <FormSection
                title="Line Items"
                description="Type to match inventory, or keep as a custom line (no stock)"
              >
                <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-bold text-gray-400 uppercase">
                        <th className="px-3 py-2 text-left min-w-[220px]">Item</th>
                        {gstBilling && <th className="px-3 py-2 w-24">HSN/SAC</th>}
                        <th className="px-3 py-2 w-16">Qty</th>
                        <th className="px-3 py-2 w-24">Rate</th>
                        <th className="px-3 py-2 w-16">Disc%</th>
                        {gstBilling && <th className="px-3 py-2 w-16">GST%</th>}
                        <th className="px-3 py-2 w-24 text-right">Total</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, idx) => {
                        const taxable = lineTaxable(row.qty, row.rate, row.discountPercent);
                        const tax = Math.round(((taxable * (row.gstPercent || 0)) / 100) * 100) / 100;
                        return (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <SearchSelect
                                allowCustom
                                value={row.productId}
                                inputValue={row.description}
                                onInputChange={text =>
                                  setRows(prev => prev.map((r, i) => (i === idx ? { ...r, description: text } : r)))
                                }
                                onChange={pid => {
                                  if (!pid) {
                                    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, productId: '' } : r)));
                                    return;
                                  }
                                  applyCatalogItem(idx, pid);
                                }}
                                placeholder="Type product or custom item…"
                                customLabel="custom item"
                                options={productOptions(row.qty || 1)}
                                className="w-full"
                              />
                              <p className="text-[10px] text-gray-400 mt-1">
                                {row.productId
                                  ? 'Inventory line'
                                  : row.description.trim()
                                    ? 'Custom line (no stock)'
                                    : '—'}
                              </p>
                            </td>
                            {gstBilling && (
                              <td className="px-3 py-2">
                                <input
                                  value={row.hsnSac}
                                  onChange={e => {
                                    const v = e.target.value;
                                    const hint = suggestHsnRate(v);
                                    setRows(prev =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? {
                                              ...r,
                                              hsnSac: v,
                                              ...(hint && r.gstPercent === 18 ? { gstPercent: hint.rate } : {}),
                                            }
                                          : r,
                                      ),
                                    );
                                  }}
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                                  placeholder="9983"
                                />
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                value={row.qty || ''}
                                onChange={e => updateRowQty(idx, parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                value={row.rate || ''}
                                onChange={e =>
                                  setRows(prev =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, rate: parseFloat(e.target.value) || 0 } : r,
                                    ),
                                  )
                                }
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={row.discountPercent || ''}
                                onChange={e =>
                                  setRows(prev =>
                                    prev.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            discountPercent: Math.min(
                                              100,
                                              Math.max(0, parseFloat(e.target.value) || 0),
                                            ),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                                placeholder="0"
                              />
                            </td>
                            {gstBilling && (
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={28}
                                  value={row.gstPercent}
                                  onChange={e =>
                                    setRows(prev =>
                                      prev.map((r, i) =>
                                        i === idx ? { ...r, gstPercent: parseInt(e.target.value) || 0 } : r,
                                      ),
                                    )
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                                />
                              </td>
                            )}
                            <td className="px-3 py-2 text-right text-sm font-medium">
                              {taxable + tax > 0 ? `₹${(taxable + tax).toLocaleString()}` : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {rows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-rose-400 hover:text-rose-600 min-h-9 min-w-9"
                                  aria-label="Remove line"
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() => setRows(prev => [...prev, emptyRow(gstBilling)])}
                  className="mt-2 text-sm font-bold text-brand min-h-11 inline-flex items-center"
                >
                  + Add Line
                </button>
                <div className="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">₹{totals.subtotal.toLocaleString()}</span>
                  </div>
                  {gstBilling && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tax</span>
                      <span className="font-medium">₹{totals.tax.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="font-medium text-gray-700">Total</span>
                    <span className="font-bold text-brand">₹{totals.grand.toLocaleString()}</span>
                  </div>
                </div>
              </FormSection>

              <FormGrid>
                <FormField label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className={cn(formControlClass, 'min-h-[4rem]')}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField label="Terms & Conditions">
                  <textarea
                    value={form.terms}
                    onChange={e => setForm({ ...form, terms: e.target.value })}
                    rows={2}
                    className={cn(formControlClass, 'min-h-[4rem]')}
                    placeholder="Optional"
                  />
                </FormField>
              </FormGrid>
            </>
          )}
        </div>
      </AppModal>

      <AnimatePresence>
        {mixDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setMixDialog(false)}
            role="presentation"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mix-bill-title"
              className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md px-6 pt-6 pb-[max(1.5rem,var(--safe-bottom))] sm:p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-xl shrink-0 bg-amber-100" aria-hidden="true">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div>
                  <h3 id="mix-bill-title" className="font-bold text-gray-900">
                    Inventory and custom lines together
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    This bill mixes inventory items (goes to Sales as a {saleLabel}) with custom items (standalone
                    invoice). Choose how to continue — mixed lines are not saved as one document.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void runSave(pendingStatus, 'split')}
                  className="w-full py-2.5 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand/90 disabled:opacity-60"
                >
                  Split — {isDirectSell ? 'Sale' : 'Distribution'} + invoice
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={clearCustomLines}
                  className="w-full py-2.5 border border-gray-200 rounded-xl font-medium text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  Remove custom lines (keep inventory)
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={clearInventoryLines}
                  className="w-full py-2.5 border border-gray-200 rounded-xl font-medium text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  Remove inventory lines (keep custom)
                </button>
                <button
                  type="button"
                  onClick={() => setMixDialog(false)}
                  className="w-full py-2.5 text-gray-500 rounded-xl font-medium text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
