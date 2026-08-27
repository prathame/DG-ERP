import React, { Fragment, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Plus,
  Pencil,
  ArrowLeft,
  Search,
  IndianRupee,
  Trash2,
  Receipt,
  Truck,
  UserPlus,
  Printer,
} from 'lucide-react';
import { cn, formatDate, exportToCsv, getTabLabel, openPrintWindow, printBillInWindow } from '../../lib/utils';
import { generatePurchaseSelfInvoiceHtml, generatePurchaseBillHtml } from '../../lib/billTemplates';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { isDesktopGlassUi } from '../../lib/desktopGlass';
import { isServicePhoneUx } from '../../platforms/service-cloud/mode';
import { api, fetchApi } from '../../api';
import type { Product } from '../../types';
import { purchaseUnitPrices } from '../../lib/gstInclusivePrice';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { QuickAddProductModal } from '../../components/ui/QuickAddProductModal';
import { supplierMatchesPurchaseSearch } from '../../lib/purchaseSearch';

function purchaseUnitCost(rowCost: string, product?: Product): number {
  if (rowCost) return parseFloat(rowCost) || 0;
  const buy = Number(product?.costPrice);
  if (buy > 0) return buy;
  return Number(product?.price) || 0;
}

type PurchaseRow = {
  productId: string;
  productQuery: string;
  quantity: number;
  packs: number;
  loosePieces: number;
  costPrice: string;
  withGst: boolean;
  lotNumber: string;
  expiryDate: string;
};

const emptyPurchaseRow = (): PurchaseRow => ({
  productId: '',
  productQuery: '',
  quantity: 1,
  packs: 0,
  loosePieces: 0,
  costPrice: '',
  withGst: true,
  lotNumber: '',
  expiryDate: '',
});

function applyProductToRow(row: PurchaseRow, productId: string, products: Product[]): PurchaseRow {
  const prod = products.find(x => x.id === productId);
  const cost = prod && Number(prod.costPrice) > 0 ? String(prod.costPrice) : '';
  return {
    ...row,
    productId,
    productQuery: prod?.name ?? row.productQuery,
    costPrice: productId ? cost : '',
    withGst: prod ? Number(prod.gstRate) > 0 : true,
  };
}

function linePurchase(row: PurchaseRow, p: Product | undefined, isRcm: boolean) {
  const ps = p?.packSize ?? 1;
  const actualQty = ps > 1 ? row.packs * ps + row.loosePieces : row.quantity;
  const entered = purchaseUnitCost(row.costPrice, p);
  const unit = purchaseUnitPrices({
    enteredCost: entered,
    gstRate: p?.gstRate,
    withGst: row.withGst || isRcm,
    priceIncludesGst: !!p?.priceIncludesGst,
    isRcm,
  });
  const qty = actualQty || 0;
  return {
    actualQty: qty,
    unit,
    gross: unit.cost * qty,
    gst: unit.gst * qty,
    billed: (isRcm ? unit.cost : unit.billed) * qty,
  };
}
import {
  useToast,
  LoadingSpinner,
  PaidBadge,
  isBillFullyPaid,
  AppModal,
  ModalActions,
  ModalActionButton,
  FormGrid,
  FormField,
  formControlClass,
  LineItemCard,
  type LineItemCardField,
  MobilePillTabs,
  MobileListRow,
  MobileEmptyState,
  MobileFab,
} from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useConfirm } from '../../hooks/useConfirm';
import { DesktopPurchasesModule } from './DesktopPurchasesModule';
import { BooksExpensesHint } from './BooksExpensesHint';
import type { CreateLaunch } from '../../lib/quickAdd';
import { session } from '../../lib/session';

interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string | null;
}
interface PurchaseBatch {
  batchId: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  productNames: string[];
  total: number;
  billValue: number;
  amountPaid: number;
  balanceRemaining: number;
  isRcm?: boolean;
  invoiceNumber?: string | null;
}

export function PurchasesView({
  accessLevel = 'full',
  onOpenAccountsStatement,
  launchCreate,
  onLaunchConsumed,
}: {
  accessLevel?: 'hidden' | 'view' | 'print' | 'full';
  /** Deep-link into Accounts (e.g. pnl, cashbook) when Books expenses live there. */
  onOpenAccountsStatement?: (tab: string) => void;
  launchCreate?: CreateLaunch | null;
  onLaunchConsumed?: () => void;
} = {}) {
  const canEdit = accessLevel === 'full';
  const { toast } = useToast();
  const cfg = useBusinessConfig();
  const desktopGlass = isDesktopGlassUi(cfg.type);
  const servicePhoneUx = isServicePhoneUx(cfg.type);
  const purchasesLabel = getTabLabel('purchases', 'Purchases & Expenses');
  const { confirm, ConfirmRenderer } = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<PurchaseBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<Record<string, unknown> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [booksDeskReady, setBooksDeskReady] = useState(false);
  const emptySupplierForm = () => ({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
  });
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    date: new Date().toISOString().slice(0, 10),
    amountPaid: '',
    invoiceNumber: '',
    isRcm: false,
  });
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([emptyPurchaseRow()]);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [quickAddProduct, setQuickAddProduct] = useState<{ idx: number; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [searchText, setSearchText] = useState('');
  const [section, setSection] = useState<'purchases' | 'expenses'>('purchases');

  useEffect(() => {
    if (launchCreate !== 'purchase') return;
    setSection('purchases');
    setModalOpen(true);
    onLaunchConsumed?.();
  }, [launchCreate, onLaunchConsumed]);

  const [expenses, setExpenses] = useState<
    {
      id: string;
      category: string;
      description?: string;
      amount: number;
      expenseDate: string;
      paymentMethod: string;
      notes?: string;
      source?: 'ops' | 'books';
    }[]
  >([]);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: '',
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    notes: '',
  });
  const expenseCategories = [
    'Electricity',
    'Rent',
    'Petrol / Diesel',
    'Phone / Internet',
    'Office Supplies',
    'Repairs & Maintenance',
    'Transport / Freight',
    'Insurance',
    'Packaging',
    'Marketing',
    'Legal / Professional',
    'Miscellaneous',
  ];
  const [paymentModal, setPaymentModal] = useState<{
    batchId: string;
    supplierId: string;
    billValue: number;
    balanceRemaining: number;
  } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [financeMap, setFinanceMap] = useState<
    Record<string, { totalPurchasedValue: number; totalPaid: number; balance: number }>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const closeSupplierModal = () => {
    setSupplierModal(false);
    setEditingSupplierId(null);
    setSupplierForm(emptySupplierForm());
  };

  const openAddSupplier = () => {
    setEditingSupplierId(null);
    setSupplierForm(emptySupplierForm());
    setSupplierModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplierId(s.id);
    setSupplierForm({
      name: s.name || '',
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      gstNumber: s.gstNumber || '',
    });
    setSupplierModal(true);
  };

  useEscapeKey(() => {
    if (paymentModal) {
      setPaymentModal(null);
      return true;
    }
    if (supplierModal) {
      closeSupplierModal();
      return true;
    }
    if (modalOpen) {
      setModalOpen(false);
      return true;
    }
    if (selectedBatchId) {
      setSelectedBatchId(null);
      return true;
    }
    return false;
  });

  const load = () => {
    setLoadError(null);
    Promise.all([
      fetchApi<Supplier[]>('/suppliers'),
      fetchApi<PurchaseBatch[]>('/purchases/batches'),
      api.products.list(),
    ])
      .then(([s, b, p]) => {
        setSuppliers(s);
        setBatches(b);
        setProducts(p);
      })
      .then(() => {
        fetchApi<{ supplierId: string; totalPurchasedValue: number; totalPaid: number; balance: number }[]>(
          '/supplier-finance/summary',
        )
          .then(fs => {
            const m: Record<string, { totalPurchasedValue: number; totalPaid: number; balance: number }> = {};
            for (const f of fs)
              m[f.supplierId] = {
                totalPurchasedValue: Number(f.totalPurchasedValue) || 0,
                totalPaid: Number(f.totalPaid) || 0,
                balance: Number(f.balance) || 0,
              };
            setFinanceMap(m);
          })
          .catch(() => {});
      })
      .catch(err => setLoadError(err.message || 'Failed to load data'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setLoading(true);
    load();
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchApi<{ ledgers?: number; vouchers?: number }>('/books/summary')
      .then(s => {
        if (!cancelled) setBooksDeskReady((Number(s?.ledgers) || 0) + (Number(s?.vouchers) || 0) > 0);
      })
      .catch(() => {
        if (!cancelled) setBooksDeskReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (section === 'expenses')
      api.expenses
        .list()
        .then(setExpenses)
        .catch(() => {});
  }, [section]);

  const booksExpensesHint =
    booksDeskReady && section === 'expenses' ? (
      <BooksExpensesHint
        compact={servicePhoneUx || !desktopGlass}
        onOpenProfitLoss={onOpenAccountsStatement ? () => onOpenAccountsStatement('pnl') : undefined}
        onOpenCashBook={onOpenAccountsStatement ? () => onOpenAccountsStatement('cashbook') : undefined}
      />
    ) : null;

  const defaultGstRate = 18;
  const purchaseTotals = purchaseRows.reduce(
    (acc, r) => {
      const p = products.find(x => x.id === r.productId);
      const line = linePurchase(r, p, purchaseForm.isRcm);
      acc.gross += line.gross;
      acc.gst += line.gst;
      acc.billed += line.billed;
      acc.items += line.actualQty;
      return acc;
    },
    { gross: 0, gst: 0, billed: 0, items: 0 },
  );

  const createSupplierFromTypedName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = suppliers.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setPurchaseForm(f => ({ ...f, supplierId: existing.id }));
      setSupplierQuery(existing.name);
      return;
    }
    try {
      const created = (await fetchApi('/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })) as Supplier;
      toast('Supplier added', 'success');
      setSuppliers(prev => [...prev, created]);
      setPurchaseForm(f => ({ ...f, supplierId: created.id }));
      setSupplierQuery(created.name);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const purchaseProductOptions = products
    .filter(pr => pr && pr.id && pr.name)
    .map(pr => ({
      value: pr.id,
      label: pr.name,
      sublabel: `₹${Number(pr.price || 0).toLocaleString('en-IN')}${(pr.packSize ?? 1) > 1 ? ` · ${pr.packName}=${pr.packSize}` : ''}`,
    }));

  const purchaseProductSelect = (row: PurchaseRow, idx: number, className?: string) => (
    <SearchSelect
      allowCustom
      value={row.productId}
      inputValue={row.productQuery}
      onInputChange={text =>
        setPurchaseRows(prev =>
          prev.map((r, i) => {
            if (i !== idx) return r;
            const exact = products.find(p => p.name.toLowerCase() === text.trim().toLowerCase());
            if (exact) return applyProductToRow({ ...r, productQuery: text }, exact.id, products);
            return { ...r, productQuery: text, productId: '' };
          }),
        )
      }
      onChange={pid => {
        if (!pid) {
          setPurchaseRows(prev => prev.map((r, i) => (i === idx ? { ...r, productId: '' } : r)));
          return;
        }
        setPurchaseRows(prev => prev.map((r, i) => (i === idx ? applyProductToRow(r, pid, products) : r)));
      }}
      onCreateNew={typed => setQuickAddProduct({ idx, name: typed })}
      placeholder="Type product name…"
      createNewLabel="product"
      customLabel="product"
      emptyHint={products.length === 0 ? 'No products yet — type a name to add one' : undefined}
      options={purchaseProductOptions}
      className={className || 'w-full'}
    />
  );

  const printPurchaseBill = async (bd: Record<string, unknown>) => {
    const rawItems = (Array.isArray(bd.items) ? bd.items : []) as Record<string, unknown>[];
    if (rawItems.length === 0) {
      toast('This purchase has no line items to print', 'error');
      return;
    }
    const supplier = suppliers.find(s => s.id === String(bd.supplierId || ''));
    const items = rawItems.map(it => {
      const qty = Number(it.quantity) || 0;
      const cost = Number(it.costPrice) || 0;
      const billed = Number(it.billedPrice ?? cost);
      const taxable = Math.round(cost * qty * 100) / 100;
      const total = Math.round(billed * qty * 100) / 100;
      const tax = Math.round((total - taxable) * 100) / 100;
      return {
        name: String(it.productName || 'Item'),
        qty,
        rate: cost,
        gstPercent: it.withGst ? defaultGstRate : 0,
        taxable,
        tax,
        total,
      };
    });
    const subtotal = items.reduce((s, it) => s + it.taxable, 0);
    const taxTotal = items.reduce((s, it) => s + it.tax, 0);
    const grandTotal = Number(bd.billValue) || items.reduce((s, it) => s + it.total, 0);
    const billNo = String(bd.invoiceNumber || '').trim() || `Purchase ${formatDate(String(bd.purchaseDate || ''))}`;
    try {
      const billSettings = ((await api.settings.getBillSettings().catch(() => ({}))) || {}) as Record<string, unknown>;
      const user = (session.getUser() || {}) as {
        companyName?: string;
        address?: string;
        phone?: string;
        email?: string;
        gstNumber?: string;
      };
      const html = generatePurchaseBillHtml({
        invoiceNumber: billNo,
        purchaseDate: String(bd.purchaseDate || ''),
        supplierName: String(bd.supplierName || supplier?.name || 'Supplier'),
        supplierAddress: supplier?.address,
        supplierPhone: supplier?.phone,
        supplierGstin: supplier?.gstNumber,
        items,
        subtotal,
        taxTotal,
        grandTotal,
        paidAmount: Number(bd.amountPaid) || 0,
        outstanding: Number(bd.balanceRemaining) || 0,
        company: {
          companyName: user.companyName,
          address: user.address,
          phone: user.phone,
          email: user.email,
          gstNumber: user.gstNumber,
        },
        billSettings,
      });
      const w = openPrintWindow('Purchase Bill…');
      if (w) printBillInWindow(w, html, billNo);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name) {
      toast('Enter supplier name', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (editingSupplierId) {
        await fetchApi(`/suppliers/${editingSupplierId}`, {
          method: 'PUT',
          body: JSON.stringify(supplierForm),
        });
        toast('Supplier updated', 'success');
      } else {
        await fetchApi('/suppliers', { method: 'POST', body: JSON.stringify(supplierForm) });
        toast('Supplier added', 'success');
      }
      closeSupplierModal();
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const supplierModalNode = supplierModal ? (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={closeSupplierModal} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
        <h3 className="text-lg font-bold mb-4">{editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}</h3>
        <form onSubmit={handleSaveSupplier} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input
              required
              value={supplierForm.name}
              onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person</label>
              <input
                value={supplierForm.contactPerson}
                onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                value={supplierForm.phone}
                onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">GSTIN</label>
            <input
              value={supplierForm.gstNumber}
              onChange={e => setSupplierForm({ ...supplierForm, gstNumber: e.target.value })}
              placeholder="e.g. 24AABCU9603R1ZM"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <input
              value={supplierForm.address}
              onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeSupplierModal}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold text-sm disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editingSupplierId ? 'Save Changes' : 'Add Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  const handleCreatePurchase = async () => {
    const typedSupplier = supplierQuery.trim();
    let supplierId = purchaseForm.supplierId;
    if (!supplierId && typedSupplier) {
      const existing = suppliers.find(s => s.name.toLowerCase() === typedSupplier.toLowerCase());
      if (existing) supplierId = existing.id;
    }
    if (!supplierId && !typedSupplier) {
      toast('Select a supplier', 'error');
      return;
    }
    const validRows = purchaseRows.filter(r => r.productId && (r.quantity > 0 || r.packs > 0 || r.loosePieces > 0));
    if (validRows.length === 0) {
      toast('Add at least one product', 'error');
      return;
    }
    const paid = parseFloat(purchaseForm.amountPaid) || 0;
    if (paid > purchaseTotals.billed) {
      toast(`Amount paid (₹${paid}) exceeds bill (₹${purchaseTotals.billed})`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (!supplierId) {
        const createdSupplier = (await fetchApi('/suppliers', {
          method: 'POST',
          body: JSON.stringify({ name: typedSupplier }),
        })) as Supplier;
        supplierId = createdSupplier.id;
        setSuppliers(prev => [...prev, createdSupplier]);
      }
      const created = (await fetchApi('/purchases/batch', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          purchaseDate: purchaseForm.date,
          gstRate: defaultGstRate,
          invoiceNumber: purchaseForm.invoiceNumber || undefined,
          isRcm: purchaseForm.isRcm || undefined,
          amountPaid: paid > 0 ? paid : undefined,
          items: validRows.map(r => {
            const rp = products.find(x => x.id === r.productId);
            const ps = rp?.packSize ?? 1;
            return {
              productId: r.productId,
              quantity: ps > 1 ? r.packs * ps + r.loosePieces : r.quantity,
              costPrice: r.costPrice ? parseFloat(r.costPrice) : undefined,
              withGst: purchaseForm.isRcm ? true : r.withGst,
              gstRate: rp?.gstRate,
              priceIncludesGst: rp?.priceIncludesGst,
              lotNumber: r.lotNumber || undefined,
              expiryDate: r.expiryDate || undefined,
            };
          }),
        }),
      })) as { invoiceNumber?: string | null; isRcm?: boolean };
      setModalOpen(false);
      setPurchaseRows([emptyPurchaseRow()]);
      setSupplierQuery('');
      setPurchaseForm({
        supplierId: '',
        date: new Date().toISOString().slice(0, 10),
        amountPaid: '',
        invoiceNumber: '',
        isRcm: false,
      });
      load();
      const si = created?.isRcm && created.invoiceNumber ? ` · Self-invoice ${created.invoiceNumber}` : '';
      toast(`Purchase recorded — ${validRows.length} product(s), ${purchaseTotals.items} items${si}`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  if (loadError)
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-12 text-center">
        <p className="text-rose-600 font-medium mb-2">Failed to load purchases</p>
        <p className="text-sm text-gray-500 mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
        >
          Retry
        </button>
      </div>
    );

  // Supplier list with finance
  const supplierStats = suppliers
    .map(s => {
      const f = financeMap[s.id];
      const sBatches = batches.filter(b => b.supplierId === s.id);
      const lastOrderDate = sBatches.reduce<string | null>((latest, b) => {
        if (!latest || b.purchaseDate > latest) return b.purchaseDate;
        return latest;
      }, null);
      return {
        ...s,
        totalPurchased: f?.totalPurchasedValue ?? 0,
        totalPaid: f?.totalPaid ?? 0,
        balance: f?.balance ?? 0,
        batchCount: sBatches.length,
        lastOrderDate,
      };
    })
    .filter(s => {
      const isPaid = s.balance <= 0 && s.totalPurchased > 0;
      if (paymentFilter === 'paid') {
        if (!isPaid) return false;
      } else if (paymentFilter === 'unpaid') {
        if (s.totalPurchased > 0 && isPaid) return false;
        if (s.totalPurchased === 0 && s.batchCount === 0) return false;
      }
      if (
        !supplierMatchesPurchaseSearch(
          s.name,
          batches.filter(b => b.supplierId === s.id),
          searchText,
        )
      )
        return false;
      return true;
    });

  const openExpenseModal = () => {
    setExpenseForm({
      category: '',
      description: '',
      amount: '',
      expenseDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      notes: '',
    });
    setExpenseModal(true);
  };

  const deleteExpense = async (id: string) => {
    if (!(await confirm({ message: 'Delete this expense? This cannot be undone.' }))) return;
    try {
      await api.expenses.delete(id);
      toast('Deleted', 'success');
      api.expenses.list().then(setExpenses);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const deleteSupplier = async (id: string, name: string) => {
    if (
      !(await confirm({
        title: 'Delete supplier',
        message: `Delete ${name}? Their purchase bills will also be removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    try {
      await fetchApi(`/suppliers/${id}`, { method: 'DELETE' });
      toast('Supplier deleted', 'success');
      if (selectedSupplierId === id) setSelectedSupplierId(null);
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // Selected supplier view
  if (selectedSupplierId) {
    const supplierBatches = batches.filter(b => b.supplierId === selectedSupplierId);
    const supplierName =
      supplierBatches[0]?.supplierName ?? suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'Supplier';

    if (selectedBatchId && batchDetail) {
      const bd = batchDetail;
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBatchId(null);
                    setBatchDetail(null);
                  }}
                  className="p-2 hover:bg-gray-200 rounded-lg"
                >
                  <ArrowLeft size={20} className="text-gray-600" />
                </button>
                <h3 className="font-bold text-lg">{supplierName}</h3>
                {isBillFullyPaid(Number(bd.billValue), Number(bd.balanceRemaining)) && <PaidBadge />}
                {bd.invoiceNumber ? (
                  <span className="font-mono font-bold text-sm">{String(bd.invoiceNumber)}</span>
                ) : null}
                <span className="text-xs text-gray-500">Purchase — {formatDate(bd.purchaseDate as string)}</span>
                {bd.isRcm ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    RCM{bd.invoiceNumber ? ` · ${String(bd.invoiceNumber)}` : ''}
                  </span>
                ) : null}
                {bd.isRcm && bd.invoiceNumber ? (
                  <button
                    type="button"
                    onClick={() => {
                      const items = ((bd.items as Record<string, unknown>[]) || []).map(it => {
                        const qty = Number(it.quantity) || 0;
                        const cost = Number(it.costPrice) || 0;
                        const billed = Number(it.billedPrice ?? cost);
                        return {
                          name: String(it.productName || 'Item'),
                          qty,
                          taxable: Math.round(cost * qty * 100) / 100,
                          tax: Math.round(Math.max(0, billed - cost) * qty * 100) / 100,
                        };
                      });
                      const html = generatePurchaseSelfInvoiceHtml({
                        invoiceNumber: String(bd.invoiceNumber),
                        supplierName: String(bd.supplierName || supplierName || 'Supplier'),
                        purchaseDate: formatDate(bd.purchaseDate as string),
                        items,
                      });
                      const w = openPrintWindow('Self invoice…');
                      if (w) printBillInWindow(w, html, String(bd.invoiceNumber));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg"
                  >
                    <Receipt size={16} /> Print self invoice
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void printPurchaseBill(bd)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-brand bg-orange-50 hover:bg-orange-100 rounded-lg"
                >
                  <Printer size={16} /> Print purchase bill
                </button>
                {Number(bd.balanceRemaining) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentModal({
                        batchId: selectedBatchId,
                        supplierId: selectedSupplierId,
                        billValue: Number(bd.billValue),
                        balanceRemaining: Number(bd.balanceRemaining),
                      });
                      setPaymentForm({
                        amount: String(bd.balanceRemaining),
                        paymentDate: new Date().toISOString().slice(0, 10),
                        paymentMethod: 'Cash',
                        referenceNumber: '',
                        notes: '',
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                  >
                    <IndianRupee size={16} /> Record Payment
                  </button>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-600">
                  <strong>{bd.total as number}</strong> items
                </span>
                <span className="text-sm font-bold text-brand ml-2">
                  Bill: ₹{Number(bd.billValue).toLocaleString('en-IN')}
                </span>
                {Number(bd.amountPaid) > 0 && (
                  <span className="text-sm text-emerald-600 font-medium ml-2">
                    Paid: ₹{Number(bd.amountPaid).toLocaleString('en-IN')}
                  </span>
                )}
                {Number(bd.balanceRemaining) > 0 && (
                  <span className="text-sm text-rose-500 font-medium ml-2">
                    Due: ₹{Number(bd.balanceRemaining).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">Products</div>
              {((bd.items as Record<string, unknown>[]) || []).map((item, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.productName as string}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity as number} units • ₹{Number(item.costPrice).toLocaleString('en-IN')}/unit
                      {item.withGst ? ' +GST' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {paymentModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setPaymentModal(null)} />
              <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <IndianRupee size={28} />
                </div>
                <h3 className="text-lg font-bold text-center mb-1">Record Payment to Supplier</h3>
                <p className="text-sm text-gray-500 text-center mb-4">
                  Bill: ₹{paymentModal.billValue.toLocaleString('en-IN')} • Due: ₹
                  {paymentModal.balanceRemaining.toLocaleString('en-IN')}
                </p>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const amt = parseFloat(paymentForm.amount);
                    if (!amt || amt <= 0) {
                      toast('Enter valid amount', 'error');
                      return;
                    }
                    setPaymentSubmitting(true);
                    fetchApi(`/supplier-finance/${paymentModal.supplierId}/payments`, {
                      method: 'POST',
                      body: JSON.stringify({
                        amount: amt,
                        paymentDate: paymentForm.paymentDate,
                        paymentMethod: paymentForm.paymentMethod,
                        referenceNumber: paymentForm.referenceNumber || undefined,
                        notes: paymentForm.notes || undefined,
                        batchId: paymentModal.batchId,
                      }),
                    })
                      .then(() => {
                        setPaymentModal(null);
                        load();
                        fetchApi(`/purchases/batch/${selectedBatchId}`).then(d =>
                          setBatchDetail(d as Record<string, unknown>),
                        );
                        toast('Payment recorded', 'success');
                      })
                      .catch(err => toast(err.message, 'error'))
                      .finally(() => setPaymentSubmitting(false));
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={paymentForm.amount}
                      onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <input
                        type="date"
                        value={paymentForm.paymentDate}
                        onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                      <select
                        value={paymentForm.paymentMethod}
                        onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                      >
                        <option>Cash</option>
                        <option>Bank Transfer</option>
                        <option>UPI</option>
                        <option>Cheque</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Reference</label>
                    <input
                      value={paymentForm.referenceNumber}
                      onChange={e => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModal(null)}
                      className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={paymentSubmitting}
                      className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-60"
                    >
                      {paymentSubmitting ? 'Saving...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      );
    }

    const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedSupplierId(null)}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h3 className="font-bold text-lg flex-1 min-w-0 truncate">{supplierName}</h3>
            {canEdit && selectedSupplier && (
              <>
                <button
                  type="button"
                  onClick={() => openEditSupplier(selectedSupplier)}
                  className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                  title="Edit supplier"
                  aria-label="Edit supplier"
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteSupplier(selectedSupplier.id, selectedSupplier.name)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                  title="Delete supplier"
                  aria-label="Delete supplier"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">
              Purchases ({supplierBatches.length})
            </div>
            {supplierBatches.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">No purchases from this supplier</div>
            ) : (
              supplierBatches.map(batch => (
                <button
                  key={batch.batchId}
                  type="button"
                  onClick={() => {
                    setSelectedBatchId(batch.batchId);
                    fetchApi(`/purchases/batch/${batch.batchId}`)
                      .then(d => setBatchDetail(d as Record<string, unknown>))
                      .catch(err => toast(err.message, 'error'));
                  }}
                  className={cn(
                    'w-full px-6 py-4 text-left hover:bg-gray-50 flex items-center justify-between gap-4 transition-colors',
                    isBillFullyPaid(batch.billValue, batch.balanceRemaining) && 'opacity-60',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">
                        {batch.invoiceNumber ? (
                          <span className="font-mono">{batch.invoiceNumber}</span>
                        ) : (
                          <>Purchase — {formatDate(batch.purchaseDate)}</>
                        )}
                      </p>
                      {batch.isRcm && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          RCM
                        </span>
                      )}
                      {isBillFullyPaid(batch.billValue, batch.balanceRemaining) && <PaidBadge size="sm" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(batch.purchaseDate)} • {batch.productNames.join(' • ')} • {batch.total} item
                      {batch.total !== 1 ? 's' : ''} • ₹{batch.billValue.toLocaleString('en-IN')}
                      {batch.amountPaid > 0 && !isBillFullyPaid(batch.billValue, batch.balanceRemaining) && (
                        <span className="text-emerald-600"> • ₹{batch.amountPaid.toLocaleString('en-IN')} paid</span>
                      )}
                      {batch.balanceRemaining > 0 && (
                        <span className="text-rose-500"> • ₹{batch.balanceRemaining.toLocaleString('en-IN')} due</span>
                      )}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        {supplierModalNode}
        {ConfirmRenderer}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn('space-y-6', desktopGlass && 'space-y-0')}
    >
      {desktopGlass ? (
        <DesktopPurchasesModule
          section={section}
          onSectionChange={setSection}
          expenseCount={expenses.length}
          expenses={expenses}
          canEdit={canEdit}
          onAddExpense={openExpenseModal}
          onDeleteExpense={deleteExpense}
          paymentFilter={paymentFilter}
          onPaymentFilter={f => {
            setPaymentFilter(f);
            setSelectedSupplierId(null);
          }}
          searchText={searchText}
          onSearchText={setSearchText}
          suppliers={supplierStats}
          onSelectSupplier={setSelectedSupplierId}
          onAddSupplier={openAddSupplier}
          onEditSupplier={s => {
            const full = suppliers.find(x => x.id === s.id);
            if (full) openEditSupplier(full);
          }}
          onDeleteSupplier={s => deleteSupplier(s.id, s.name)}
          onNewPurchase={() => setModalOpen(true)}
          showBooksExpensesHint={booksDeskReady}
          onOpenProfitLoss={onOpenAccountsStatement ? () => onOpenAccountsStatement('pnl') : undefined}
          onOpenCashBook={onOpenAccountsStatement ? () => onOpenAccountsStatement('cashbook') : undefined}
        />
      ) : servicePhoneUx ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold flex items-center gap-1.5 text-gray-900">
                <ShoppingBag size={18} className="text-brand shrink-0" /> {purchasesLabel}
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Suppliers, purchases & business expenses</p>
            </div>
            {section === 'purchases' && canEdit && (
              <button
                type="button"
                onClick={openAddSupplier}
                aria-label="Add supplier"
                className="shrink-0 h-8 w-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-500 active:bg-gray-50"
              >
                <UserPlus size={15} />
              </button>
            )}
          </div>

          <MobilePillTabs
            items={[
              { id: 'purchases', label: 'Purchases' },
              { id: 'expenses', label: 'Expenses' },
            ]}
            value={section}
            onChange={id => setSection(id as 'purchases' | 'expenses')}
          />

          {section === 'purchases' ? (
            <>
              <div className="flex items-center gap-1.5">
                {(['unpaid', 'paid'] as const).map(tab => {
                  const active = paymentFilter === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setPaymentFilter(tab);
                        setSelectedSupplierId(null);
                      }}
                      className={cn(
                        'h-7 px-3 rounded-full text-[11px] font-bold border transition-colors',
                        active
                          ? tab === 'unpaid'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-500',
                      )}
                    >
                      {tab === 'unpaid' ? 'Unpaid' : 'Paid'}
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search supplier or bill no…"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-gray-200 text-[13px] focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>

              {supplierStats.length === 0 ? (
                <MobileEmptyState
                  icon={<ShoppingBag />}
                  title={searchText.trim() ? 'No matching bills' : 'No suppliers yet'}
                  subtitle={
                    searchText.trim()
                      ? 'Try another supplier name or bill number'
                      : 'Add your first supplier to start recording purchases'
                  }
                  actionLabel={searchText.trim() ? undefined : 'Add Supplier'}
                  onAction={searchText.trim() ? undefined : openAddSupplier}
                />
              ) : (
                <div className="space-y-1.5">
                  {supplierStats.map(s => (
                    <Fragment key={s.id}>
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <MobileListRow
                          icon={<Truck />}
                          title={s.name}
                          subtitle={
                            s.batchCount === 0
                              ? 'No purchases yet'
                              : `${s.batchCount} purchase${s.batchCount !== 1 ? 's' : ''}`
                          }
                          trailing={
                            s.totalPurchased > 0
                              ? s.balance > 0
                                ? `₹${s.balance.toLocaleString('en-IN')}`
                                : 'Paid'
                              : undefined
                          }
                          meta={s.balance > 0 ? 'Due' : undefined}
                          onClick={() => setSelectedSupplierId(s.id)}
                        />
                        {canEdit && (
                          <div className="flex justify-end gap-0.5 border-t border-gray-50 px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => openEditSupplier(s)}
                              className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-lg"
                              title="Edit supplier"
                              aria-label="Edit supplier"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSupplier(s.id, s.name)}
                              className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg"
                              title="Delete supplier"
                              aria-label="Delete supplier"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          ) : expenses.length === 0 ? (
            <div className="space-y-3">
              {booksExpensesHint}
              <MobileEmptyState
                icon={<Receipt />}
                title="No expenses yet"
                subtitle="Add rent, electricity, and other costs — they also post to Accounts."
                actionLabel={canEdit ? 'Add Expense' : undefined}
                onAction={canEdit ? openExpenseModal : undefined}
              />
            </div>
          ) : (
            <>
              {booksExpensesHint}
              <div className="space-y-1.5">
                {expenses.map(e => (
                  <div
                    key={e.id}
                    className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-2.5 py-2"
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-orange-50 text-brand flex items-center justify-center">
                      <Receipt size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-gray-900 truncate flex items-center gap-1.5">
                        <span className="truncate">{e.category}</span>
                        {e.source === 'books' && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1">
                            Accts
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate mt-0.5">
                        {formatDate(e.expenseDate)} · {e.paymentMethod}
                        {e.description ? ` · ${e.description}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-gray-900 tabular-nums">
                        ₹{e.amount.toLocaleString('en-IN')}
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => deleteExpense(e.id)}
                          aria-label="Delete expense"
                          className="p-1 text-gray-300 active:text-rose-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Total</span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  ₹{expenses.reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}
                </span>
              </div>
            </>
          )}

          {canEdit && (
            <MobileFab
              label={section === 'purchases' ? 'New Purchase' : 'Add Expense'}
              iconOnly
              onClick={() => (section === 'purchases' ? setModalOpen(true) : openExpenseModal())}
            />
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShoppingBag size={22} /> {purchasesLabel}
              </h2>
              <p className="text-sm text-gray-500">Track purchases from suppliers + business expenses</p>
            </div>
            <div className="flex gap-2">
              {section === 'purchases' && canEdit && (
                <>
                  <button
                    type="button"
                    onClick={openAddSupplier}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50"
                  >
                    <Plus size={16} /> Add Supplier
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
                  >
                    <ShoppingBag size={16} /> New Purchase
                  </button>
                </>
              )}
              {section === 'expenses' && canEdit && (
                <button
                  type="button"
                  onClick={openExpenseModal}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
                >
                  <Plus size={16} /> Add Expense
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setSection('purchases')}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${section === 'purchases' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Purchases
            </button>
            <button
              type="button"
              onClick={() => setSection('expenses')}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${section === 'expenses' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Expenses
            </button>
          </div>

          {section === 'expenses' && (
            <div className="space-y-4">
              {booksExpensesHint}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {expenses.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No expenses yet</p>
                    <p className="text-sm mt-1.5 max-w-sm mx-auto">
                      Add day-to-day costs here — they also post to Accounts.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b">
                            <th className="px-4 py-3">Category</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Notes</th>
                            {canEdit && <th className="px-4 py-3 w-10"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {expenses.map(e => (
                            <tr key={e.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-bold">
                                  {e.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-sm">{e.description || '—'}</td>
                              <td className="px-4 py-3 text-right font-bold">₹{e.amount.toLocaleString('en-IN')}</td>
                              <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(e.expenseDate)}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{e.paymentMethod}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{e.notes || '—'}</td>
                              {canEdit && (
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => deleteExpense(e.id)}
                                    className="p-1 text-rose-400 hover:text-rose-600"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">
                      Total: ₹{expenses.reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {section === 'purchases' && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                {(['unpaid', 'paid'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setPaymentFilter(tab);
                      setSelectedSupplierId(null);
                    }}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-bold transition-all',
                      paymentFilter === tab
                        ? tab === 'unpaid'
                          ? 'bg-rose-500 text-white'
                          : 'bg-emerald-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    {tab === 'unpaid' ? 'Unpaid' : 'Paid'}
                  </button>
                ))}
                <div className="relative flex-1 min-w-[150px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search supplier or bill no…"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              {suppliers.length === 0 || supplierStats.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
                  <ShoppingBag size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium mb-2">
                    {suppliers.length === 0 ? 'No suppliers yet' : 'No matching bills'}
                  </p>
                  <p className="text-sm mb-4">
                    {suppliers.length === 0
                      ? 'Add your first supplier to start recording purchases'
                      : 'Try another supplier name or bill number'}
                  </p>
                  {suppliers.length === 0 ? (
                    <button
                      type="button"
                      onClick={openAddSupplier}
                      className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark transition-colors"
                    >
                      + Add Supplier
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {supplierStats.map(s => (
                    <div
                      key={s.id}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSupplierId(s.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{s.name}</p>
                          {s.totalPurchased > 0 && (
                            <div className="mt-2 flex gap-4 text-sm flex-wrap">
                              <span className="text-blue-600">
                                <strong>₹{s.totalPurchased.toLocaleString('en-IN')}</strong> purchased
                              </span>
                              <span className="text-emerald-600">
                                <strong>₹{s.totalPaid.toLocaleString('en-IN')}</strong> paid
                              </span>
                              {s.balance > 0 ? (
                                <span className="text-rose-600">
                                  <strong>₹{s.balance.toLocaleString('en-IN')}</strong> due
                                </span>
                              ) : (
                                s.totalPurchased > 0 && <PaidBadge size="sm" />
                              )}
                            </div>
                          )}
                          {s.batchCount === 0 && <p className="mt-2 text-xs text-gray-400">No purchases yet</p>}
                        </button>
                        {canEdit && (
                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditSupplier(s)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                              title="Edit supplier"
                              aria-label="Edit supplier"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSupplier(s.id, s.name)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                              title="Delete supplier"
                              aria-label="Delete supplier"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Expense Modal */}
      <AnimatePresence>
        {expenseModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setExpenseModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6"
            >
              <h3 className="text-lg font-bold mb-4">Add Expense</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Category *</label>
                  <select
                    value={expenseForm.category}
                    onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Select category</option>
                    {expenseCategories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Description</label>
                  <input
                    value={expenseForm.description}
                    onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    placeholder="e.g. July electricity bill"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    value={expenseForm.amount}
                    onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    placeholder="2500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Date</label>
                    <input
                      type="date"
                      value={expenseForm.expenseDate}
                      onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Method</label>
                    <select
                      value={expenseForm.paymentMethod}
                      onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    >
                      <option>Cash</option>
                      <option>Bank Transfer</option>
                      <option>UPI</option>
                      <option>Cheque</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Notes</label>
                  <input
                    value={expenseForm.notes}
                    onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setExpenseModal(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!expenseForm.category) {
                      toast('Select a category', 'error');
                      return;
                    }
                    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
                      toast('Enter valid amount', 'error');
                      return;
                    }
                    try {
                      await api.expenses.create({
                        category: expenseForm.category,
                        description: expenseForm.description || undefined,
                        amount: Number(expenseForm.amount),
                        expenseDate: expenseForm.expenseDate,
                        paymentMethod: expenseForm.paymentMethod,
                        notes: expenseForm.notes || undefined,
                      });
                      toast('Expense recorded', 'success');
                      setExpenseModal(false);
                      api.expenses.list().then(setExpenses);
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}
                  className="flex-1 py-2 bg-brand text-white rounded-xl font-bold"
                >
                  Save Expense
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Purchase Modal */}
      <AnimatePresence>
        {modalOpen && (
          <AppModal
            title="New Purchase from Supplier"
            onClose={() => setModalOpen(false)}
            zIndex={100}
            size="lg"
            footer={
              <ModalActions>
                <ModalActionButton variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </ModalActionButton>
                <ModalActionButton variant="primary" disabled={submitting} onClick={handleCreatePurchase}>
                  {submitting ? 'Saving…' : `Record Purchase (${purchaseTotals.items})`}
                </ModalActionButton>
              </ModalActions>
            }
          >
            <div className="space-y-4">
              <FormGrid className="sm:grid-cols-3">
                <FormField label="Supplier" required className="sm:col-span-1">
                  <SearchSelect
                    allowCustom
                    value={purchaseForm.supplierId}
                    inputValue={supplierQuery}
                    onInputChange={text => {
                      setSupplierQuery(text);
                      const match = suppliers.find(s => s.name.toLowerCase() === text.trim().toLowerCase());
                      setPurchaseForm(f => ({ ...f, supplierId: match?.id ?? '' }));
                    }}
                    onChange={id => {
                      if (!id) return;
                      const s = suppliers.find(x => x.id === id);
                      setPurchaseForm(f => ({ ...f, supplierId: id }));
                      setSupplierQuery(s?.name ?? supplierQuery);
                    }}
                    onCreateNew={name => void createSupplierFromTypedName(name)}
                    placeholder="Type supplier name…"
                    createNewLabel="supplier"
                    customLabel="supplier"
                    emptyHint={suppliers.length === 0 ? 'No suppliers yet — type a name to add one' : undefined}
                    options={suppliers
                      .filter(s => s.id && s.name)
                      .map(s => ({
                        value: s.id,
                        label: s.name,
                        sublabel: s.gstNumber || s.phone || undefined,
                      }))}
                    className="w-full [&_input]:min-h-11 [&_input]:rounded-xl [&_input]:px-3"
                  />
                </FormField>
                <FormField label={purchaseForm.isRcm ? 'Self-invoice no.' : 'Invoice No.'}>
                  <input
                    value={purchaseForm.invoiceNumber}
                    onChange={e => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                    className={cn(formControlClass, 'font-mono')}
                    placeholder={purchaseForm.isRcm ? 'Auto SI/FY/#### if blank' : 'e.g. INV-001'}
                  />
                </FormField>
                <FormField label="Date">
                  <input
                    type="date"
                    value={purchaseForm.date}
                    onChange={e => setPurchaseForm({ ...purchaseForm, date: e.target.value })}
                    className={formControlClass}
                  />
                </FormField>
              </FormGrid>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={purchaseForm.isRcm}
                  onChange={e => setPurchaseForm({ ...purchaseForm, isRcm: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Reverse charge (RCM) — GST remitted by you, not the supplier
              </label>

              {/* Mobile line cards */}
              <div className="sm:hidden space-y-3">
                {purchaseRows.map((row, idx) => {
                  const p = products.find(x => x.id === row.productId);
                  const ps = p?.packSize ?? 1;
                  const hasPack = ps > 1;
                  const line = linePurchase(row, p, purchaseForm.isRcm);
                  const billed = line.billed;
                  const fields: LineItemCardField[] = [
                    {
                      key: 'product',
                      label: 'Product',
                      wide: true,
                      node: purchaseProductSelect(row, idx),
                    },
                  ];
                  if (hasPack) {
                    fields.push(
                      {
                        key: 'packs',
                        label: p?.packName || 'Packs',
                        node: (
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={row.packs || ''}
                            onChange={e =>
                              setPurchaseRows(
                                purchaseRows.map((r, i) =>
                                  i === idx ? { ...r, packs: parseInt(e.target.value) || 0 } : r,
                                ),
                              )
                            }
                            className={formControlClass}
                          />
                        ),
                      },
                      {
                        key: 'loose',
                        label: 'Loose pcs',
                        node: (
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={row.loosePieces || ''}
                            onChange={e =>
                              setPurchaseRows(
                                purchaseRows.map((r, i) =>
                                  i === idx ? { ...r, loosePieces: parseInt(e.target.value) || 0 } : r,
                                ),
                              )
                            }
                            className={formControlClass}
                          />
                        ),
                      },
                    );
                  } else {
                    fields.push({
                      key: 'qty',
                      label: 'Quantity',
                      node: (
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={row.quantity || ''}
                          onChange={e =>
                            setPurchaseRows(
                              purchaseRows.map((r, i) =>
                                i === idx ? { ...r, quantity: parseInt(e.target.value) || 0 } : r,
                              ),
                            )
                          }
                          className={formControlClass}
                        />
                      ),
                    });
                  }
                  fields.push(
                    {
                      key: 'cost',
                      label: 'Cost Price',
                      node: (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          inputMode="decimal"
                          value={row.costPrice}
                          onChange={e =>
                            setPurchaseRows(
                              purchaseRows.map((r, i) => (i === idx ? { ...r, costPrice: e.target.value } : r)),
                            )
                          }
                          placeholder={p ? `₹${Number(p.costPrice) > 0 ? p.costPrice : p.price}` : '—'}
                          className={formControlClass}
                        />
                      ),
                    },
                    {
                      key: 'gst',
                      label: 'GST',
                      node: (
                        <label className="flex items-center gap-2 min-h-11 text-sm">
                          <input
                            type="checkbox"
                            checked={row.withGst}
                            onChange={e =>
                              setPurchaseRows(
                                purchaseRows.map((r, i) => (i === idx ? { ...r, withGst: e.target.checked } : r)),
                              )
                            }
                            className="rounded text-brand w-5 h-5"
                          />
                          Include GST{p?.gstRate != null ? ` ${p.gstRate}%` : ''}
                        </label>
                      ),
                    },
                    {
                      key: 'lot',
                      label: 'Batch / lot',
                      node: (
                        <input
                          type="text"
                          value={row.lotNumber}
                          onChange={e =>
                            setPurchaseRows(
                              purchaseRows.map((r, i) => (i === idx ? { ...r, lotNumber: e.target.value } : r)),
                            )
                          }
                          placeholder="Batch no."
                          className={formControlClass}
                        />
                      ),
                    },
                    {
                      key: 'expiry',
                      label: 'Expiry',
                      node: (
                        <input
                          type="date"
                          value={row.expiryDate}
                          onChange={e =>
                            setPurchaseRows(
                              purchaseRows.map((r, i) => (i === idx ? { ...r, expiryDate: e.target.value } : r)),
                            )
                          }
                          className={formControlClass}
                        />
                      ),
                    },
                  );
                  return (
                    <div key={idx}>
                      <LineItemCard
                        index={idx}
                        title={p?.name || `Product ${idx + 1}`}
                        amountLabel={billed > 0 ? `₹${billed.toLocaleString('en-IN')}` : undefined}
                        canRemove={purchaseRows.length > 1}
                        onRemove={() => setPurchaseRows(purchaseRows.filter((_, i) => i !== idx))}
                        fields={fields}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr className="text-xs font-bold text-gray-400 uppercase">
                      <th className="px-3 py-3 w-8">#</th>
                      <th className="px-3 py-3">Product</th>
                      <th className="px-3 py-3 w-20">Qty</th>
                      <th className="px-3 py-3 w-24">Cost Price</th>
                      <th className="px-3 py-3 w-12 text-center">GST</th>
                      <th className="px-3 py-3 w-24">Batch / expiry</th>
                      <th className="px-3 py-3 w-28 text-right">Billed</th>
                      <th className="px-3 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchaseRows.map((row, idx) => {
                      const p = products.find(x => x.id === row.productId);
                      const ps = p?.packSize ?? 1;
                      const hasPack = ps > 1;
                      const line = linePurchase(row, p, purchaseForm.isRcm);
                      const actualQty = line.actualQty;
                      const billed = line.billed;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2">{purchaseProductSelect(row, idx)}</td>
                          <td className="px-3 py-2">
                            {hasPack ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.packs || ''}
                                  onChange={e =>
                                    setPurchaseRows(
                                      purchaseRows.map((r, i) =>
                                        i === idx ? { ...r, packs: parseInt(e.target.value) || 0 } : r,
                                      ),
                                    )
                                  }
                                  className="w-12 px-1 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                                  placeholder="0"
                                />
                                <span className="text-[9px] text-gray-400">{p?.packName}</span>
                                <span className="text-gray-300">+</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={row.loosePieces || ''}
                                  onChange={e =>
                                    setPurchaseRows(
                                      purchaseRows.map((r, i) =>
                                        i === idx ? { ...r, loosePieces: parseInt(e.target.value) || 0 } : r,
                                      ),
                                    )
                                  }
                                  className="w-12 px-1 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                                  placeholder="0"
                                />
                                <span className="text-[9px] text-gray-400">pcs</span>
                                {actualQty > 0 && <span className="text-[9px] text-emerald-500">={actualQty}</span>}
                              </div>
                            ) : (
                              <input
                                type="number"
                                min={1}
                                value={row.quantity || ''}
                                onChange={e =>
                                  setPurchaseRows(
                                    purchaseRows.map((r, i) =>
                                      i === idx ? { ...r, quantity: parseInt(e.target.value) || 0 } : r,
                                    ),
                                  )
                                }
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={row.costPrice}
                              onChange={e =>
                                setPurchaseRows(
                                  purchaseRows.map((r, i) => (i === idx ? { ...r, costPrice: e.target.value } : r)),
                                )
                              }
                              placeholder={p ? `₹${Number(p.costPrice) > 0 ? p.costPrice : p.price}` : '—'}
                              className={cn(
                                'w-full px-2 py-1.5 border rounded-lg text-sm text-center',
                                row.costPrice ? 'border-amber-300 bg-amber-50' : 'border-gray-200',
                              )}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.withGst}
                              onChange={e =>
                                setPurchaseRows(
                                  purchaseRows.map((r, i) => (i === idx ? { ...r, withGst: e.target.checked } : r)),
                                )
                              }
                              className="rounded text-brand"
                              title={p?.gstRate != null ? `${p.gstRate}%` : 'GST'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.lotNumber}
                              onChange={e =>
                                setPurchaseRows(
                                  purchaseRows.map((r, i) => (i === idx ? { ...r, lotNumber: e.target.value } : r)),
                                )
                              }
                              placeholder="Lot"
                              className="w-full px-2 py-1 mb-1 border border-gray-200 rounded-lg text-sm"
                            />
                            <input
                              type="date"
                              value={row.expiryDate}
                              onChange={e =>
                                setPurchaseRows(
                                  purchaseRows.map((r, i) => (i === idx ? { ...r, expiryDate: e.target.value } : r)),
                                )
                              }
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-bold">
                            {billed > 0 ? `₹${billed.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {purchaseRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setPurchaseRows(purchaseRows.filter((_, i) => i !== idx))}
                                className="p-1 text-rose-400 hover:text-rose-600 rounded"
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
                onClick={() => setPurchaseRows([...purchaseRows, emptyPurchaseRow()])}
                className="text-sm font-bold text-brand min-h-11 inline-flex items-center"
              >
                + Add Product
              </button>
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs sm:text-sm text-gray-600">
                  {purchaseTotals.items} items · Gross ₹{purchaseTotals.gross.toLocaleString('en-IN')} · GST ₹
                  {purchaseTotals.gst.toLocaleString('en-IN')}
                  {purchaseForm.isRcm ? ' (RCM)' : ''}
                </span>
                <span className="text-lg font-bold text-brand tabular-nums">
                  ₹{purchaseTotals.billed.toLocaleString('en-IN')}
                  {purchaseForm.isRcm ? (
                    <span className="block text-xs font-medium text-gray-500 text-right">
                      Supplier bill (excl. GST)
                    </span>
                  ) : null}
                </span>
              </div>
              <FormField label="Amount Paid (₹)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={purchaseForm.amountPaid}
                  onChange={e => setPurchaseForm({ ...purchaseForm, amountPaid: e.target.value })}
                  placeholder="0"
                  className={formControlClass}
                />
              </FormField>
            </div>
          </AppModal>
        )}
      </AnimatePresence>

      {supplierModalNode}
      {quickAddProduct && (
        <QuickAddProductModal
          initialName={quickAddProduct.name}
          defaultGstRate={defaultGstRate}
          onClose={() => setQuickAddProduct(null)}
          onCreated={prod => {
            const next = products.some(p => p.id === prod.id) ? products : [prod, ...products];
            setProducts(next);
            setPurchaseRows(prev =>
              prev.map((r, i) => (i === quickAddProduct.idx ? applyProductToRow(r, prod.id, next) : r)),
            );
            setQuickAddProduct(null);
          }}
        />
      )}
      {ConfirmRenderer}
    </motion.div>
  );
}
