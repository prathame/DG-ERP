import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package,
  Plus,
  Download,
  Printer,
  MessageCircle,
  Mail,
  ArrowLeft,
  Pencil,
  Trash2,
  Search,
  IndianRupee,
  MoreVertical,
  Truck,
  FileCheck,
  QrCode,
} from 'lucide-react';
import {
  cn,
  exportToCsv,
  openPrintWindow,
  writePrintHtml,
  shareViaWhatsApp,
  shareViaEmail,
  formatDistributionChallanText,
  formatVendorPaymentReminderText,
  sessionCompanyName,
  formatDate,
  getTabLabel,
  resolveIrnQrPayload,
} from '../../lib/utils';
import { api, fetchApi, DistributionRecord, DistributionBatch, DistributionBatchDetail } from '../../api';
import type { Product } from '../../types';
import { useToast, LoadingSpinner, PaidBadge, PaidStamp, isBillFullyPaid } from '../../components/ui';
import { generateDistributionChallanHtml, buildDistributionBillSlice } from '../../lib/billTemplates';
import { buildGstPrintOptions } from '../../lib/buildGstPrintOptions';
import { deliveryPrintAvailability, printDistributionDocs } from '../../lib/printDistributionDocs';
import { shareDistributionDocsWhatsApp } from '../../lib/shareDistributionWhatsApp';
import { whatsAppInvoiceShareToast } from '../../lib/printStandaloneInvoice';
import { deliveryDocKind, deliveryDocLabel, deliveryDocNos } from '../../lib/deliveryDocKind';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { session } from '../../lib/session';
import { useConfirm } from '../../hooks/useConfirm';
import { CreateDistributionModal } from './CreateDistributionModal';
import { DesktopDistributionPanel } from './DesktopDistributionPanel';
import {
  DesktopBatchDetailGlass,
  DesktopProductBarcodeGlass,
  DesktopVendorSummaryGlass,
} from './DesktopDistributionDetails';
import { isDesktopGlassUi } from '../../lib/desktopGlass';
import {
  DEFAULT_REMINDER_SETTINGS,
  canSendPaymentReminder,
  filterVendorsForReminder,
  type CompanyReminderSettings,
} from '../../lib/paymentReminders';
import {
  adjustUnitPriceForGstToggle,
  displayUnitPriceForGst,
  linePricesAfterDiscount,
} from '../../lib/gstInclusivePrice';

/** Non-service list/detail badge: Tax Invoice / Bill of Supply / Mixed (+ doc nos when dual). */
function DeliveryDocBadge({
  batch,
  size = 'sm',
  /** Detail half-tabs: show only the active half (omit when that half has 0 units — no fake BoS). */
  activeHalf,
}: {
  batch: Pick<DistributionBatch, 'batchId' | 'gstUnits' | 'nonGstUnits' | 'gstApplied' | 'total' | 'deliverySet'>;
  size?: 'sm' | 'md';
  activeHalf?: 'gst' | 'bos';
}) {
  const gstUnits = typeof batch.gstUnits === 'number' ? batch.gstUnits : batch.gstApplied ? batch.total : 0;
  const nonGstUnits = typeof batch.nonGstUnits === 'number' ? batch.nonGstUnits : batch.gstApplied ? 0 : batch.total;
  const nos =
    batch.deliverySet?.gstDocNo || batch.deliverySet?.nonGstDocNo
      ? { gstDocNo: batch.deliverySet.gstDocNo, nonGstDocNo: batch.deliverySet.nonGstDocNo }
      : deliveryDocNos(batch.batchId, gstUnits, nonGstUnits);
  const pad = size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]';

  if (activeHalf) {
    const count = activeHalf === 'gst' ? gstUnits : nonGstUnits;
    if (count <= 0) return null;
    const label = deliveryDocLabel(activeHalf);
    const docNo = activeHalf === 'gst' ? nos.gstDocNo : nos.nonGstDocNo;
    if (!label) return null;
    return (
      <span
        className={cn(
          pad,
          'rounded-full font-bold inline-flex items-center gap-1',
          activeHalf === 'gst' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700',
        )}
        title={docNo || label}
      >
        {label}
        {size === 'md' && docNo && <span className="font-mono opacity-80">{docNo}</span>}
      </span>
    );
  }

  const kind = deliveryDocKind(gstUnits, nonGstUnits);
  if (kind === 'unknown') return null;
  const label = deliveryDocLabel(kind);
  const title = [nos.gstDocNo, nos.nonGstDocNo].filter(Boolean).join(' · ') || label;
  if (kind === 'mixed') {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap" title={title}>
        <span className={cn(pad, 'rounded-full font-bold bg-violet-100 text-violet-800')}>{label}</span>
        <span className={cn(pad, 'rounded-full font-bold bg-emerald-50 text-emerald-700')}>GST</span>
        <span className={cn(pad, 'rounded-full font-bold bg-slate-100 text-slate-700')}>BoS</span>
        {size === 'md' && (nos.gstDocNo || nos.nonGstDocNo) && (
          <span className="text-[10px] text-gray-500 font-mono">
            {[nos.gstDocNo, nos.nonGstDocNo].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className={cn(
        pad,
        'rounded-full font-bold inline-flex items-center gap-1',
        kind === 'gst' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700',
      )}
      title={title}
    >
      {label}
      {size === 'md' && kind === 'gst' && nos.gstDocNo && <span className="font-mono opacity-80">{nos.gstDocNo}</span>}
      {size === 'md' && kind === 'bos' && nos.nonGstDocNo && (
        <span className="font-mono opacity-80">{nos.nonGstDocNo}</span>
      )}
    </span>
  );
}

// ── E-Invoice + E-Way Bill buttons (per distribution batch) ──────────────────
function EInvoiceButtons({
  batchId,
  initialIrn,
  initialQr,
  initialEwb,
  quiet = false,
}: {
  batchId: string;
  initialIrn?: string | null;
  initialQr?: string | null;
  initialEwb?: string | null;
  /** Muted chip styling for non-service in-flow detail toolbar */
  quiet?: boolean;
}) {
  const { toast } = useToast();
  const [irn, setIrn] = useState(initialIrn || '');
  const [qr, setQr] = useState(() => resolveIrnQrPayload({ irnQr: initialQr, qrCode: initialQr }));
  const [ewbNo, setEwbNo] = useState(initialEwb || '');
  const [generating, setGenerating] = useState<'irn' | 'ewb' | null>(null);
  const [showEwbModal, setShowEwbModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [ewbForm, setEwbForm] = useState({ vehicleNo: '', distance: '', transportMode: '1', transporterName: '' });

  useEffect(() => {
    setIrn(initialIrn || '');
    setQr(resolveIrnQrPayload({ irnQr: initialQr, qrCode: initialQr }));
    setEwbNo(initialEwb || '');
  }, [batchId, initialIrn, initialQr, initialEwb]);

  const generateIrn = async () => {
    setGenerating('irn');
    try {
      const r = await api.gst.generateIrn(batchId);
      setIrn(r.irn);
      setQr(resolveIrnQrPayload(r));
      toast(`E-Invoice generated${r.mode === 'mock' ? ' (mock)' : ''}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'IRN generation failed', 'error');
    } finally {
      setGenerating(null);
    }
  };

  const generateEwb = async () => {
    if (!ewbForm.vehicleNo.trim()) {
      toast('Vehicle number required', 'error');
      return;
    }
    if (!ewbForm.distance.trim()) {
      toast('Distance (km) required', 'error');
      return;
    }
    setGenerating('ewb');
    try {
      const r = await api.gst.generateEwb({
        batchId,
        vehicleNo: ewbForm.vehicleNo.trim().toUpperCase(),
        distance: Number(ewbForm.distance),
        transportMode: ewbForm.transportMode,
        transporterName: ewbForm.transporterName,
      });
      setEwbNo(r.ewbNo);
      setShowEwbModal(false);
      toast(`E-Way Bill ${r.ewbNo}${r.mode === 'mock' ? ' (mock)' : ''}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'EWB generation failed', 'error');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <>
      {/* IRN button */}
      <button
        type="button"
        onClick={generateIrn}
        disabled={generating === 'irn'}
        className={
          quiet
            ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 bg-transparent hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-50'
            : 'flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50'
        }
        title="Generate E-Invoice IRN"
      >
        <FileCheck size={13} /> {generating === 'irn' ? 'Generating…' : irn ? 'Re-IRN' : 'E-Invoice'}
      </button>

      {/* EWB button */}
      <button
        type="button"
        onClick={() => setShowEwbModal(true)}
        disabled={generating === 'ewb'}
        className={
          quiet
            ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 bg-transparent hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-50'
            : 'flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors disabled:opacity-50'
        }
        title="Generate E-Way Bill"
      >
        <Truck size={13} /> {ewbNo ? `EWB ${ewbNo.slice(-4)}` : 'E-Way Bill'}
      </button>

      {/* IRN result panel */}
      {irn && (
        <div
          className={
            quiet
              ? 'flex items-center gap-2 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-[11px]'
              : 'flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs'
          }
        >
          <QrCode size={13} className={quiet ? 'text-gray-500 shrink-0' : 'text-indigo-600 shrink-0'} />
          <span
            className={cn('font-mono truncate max-w-[120px]', quiet ? 'text-gray-600' : 'text-indigo-700')}
            title={irn}
          >
            IRN: {irn.slice(0, 12)}…
          </span>
          {qr && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className={cn('hover:underline text-[10px] shrink-0', quiet ? 'text-gray-600' : 'text-indigo-600')}
            >
              View QR
            </button>
          )}
        </div>
      )}

      {/* IRN QR modal — in-app (window.open is blocked in Electron / by pop-up blockers) */}
      {showQrModal && qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setShowQrModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <h3 className="font-bold text-lg mb-1 flex items-center justify-center gap-2">
              <QrCode size={20} className="text-indigo-600" /> E-Invoice QR
            </h3>
            <p className="text-xs text-gray-500 font-mono mb-4 break-all" title={irn}>
              IRN: {irn}
            </p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(resolveIrnQrPayload({ qrCode: qr }))}`}
              alt="E-Invoice QR code"
              width={240}
              height={240}
              className="mx-auto rounded-lg border border-gray-100"
            />
            <p className="text-[11px] text-gray-400 mt-3">Scan with GST / e-invoice apps</p>
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full py-2.5 border border-gray-200 rounded-xl font-medium hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* EWB modal */}
      {showEwbModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setShowEwbModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Truck size={20} className="text-teal-600" /> Generate E-Way Bill
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vehicle No *</label>
                  <input
                    value={ewbForm.vehicleNo}
                    onChange={e => setEwbForm({ ...ewbForm, vehicleNo: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-brand"
                    placeholder="GJ01AB1234"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Distance (km) *</label>
                  <input
                    type="number"
                    value={ewbForm.distance}
                    onChange={e => setEwbForm({ ...ewbForm, distance: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                    placeholder="150"
                    min="1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transport Mode</label>
                <select
                  value={ewbForm.transportMode}
                  onChange={e => setEwbForm({ ...ewbForm, transportMode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                >
                  <option value="1">Road</option>
                  <option value="2">Rail</option>
                  <option value="3">Air</option>
                  <option value="4">Ship</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">
                  Transporter Name (optional)
                </label>
                <input
                  value={ewbForm.transporterName}
                  onChange={e => setEwbForm({ ...ewbForm, transporterName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                  placeholder="ABC Logistics"
                />
              </div>
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Mode: <strong>see Settings → GST API</strong>. To use real NIC API, configure credentials in Settings.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowEwbModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={generateEwb}
                disabled={generating === 'ewb'}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-colors disabled:opacity-60"
              >
                {generating === 'ewb' ? 'Generating…' : 'Generate EWB'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DistributionView({
  user,
  accessLevel = 'full',
  businessType = 'manufacturer',
}: {
  user: { id: string; role?: string; vendorId?: string } | null;
  accessLevel?: 'hidden' | 'view' | 'print' | 'full';
  businessType?: string;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const canEdit = accessLevel === 'full';
  const canPrint = accessLevel === 'print' || accessLevel === 'full';
  const vendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const isVendorUser = !!vendorId;
  const isDirectSell = businessType === 'dealer' || businessType === 'retail' || businessType === 'silver_casting';
  /** Service keeps modal/panel UX; all other business types use in-place replace navigation. */
  const isServiceBiz = businessType === 'service';
  const desktopGlass = isDesktopGlassUi(businessType);
  // Dual-doc / Split Bill foundation is for goods (non-service) only — service uses standalone invoices
  const canUseSplitBill = !isServiceBiz;
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [batches, setBatches] = useState<DistributionBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<{
    totalBeforeDistribution: number;
    availableInInventory: number;
    totalDistributed: number;
    vendorStats: {
      vendorId: string;
      vendorName: string;
      distributed: number;
      sold: number;
      replaced: number;
      damaged: number;
      availableWithVendor: number;
    }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [includeGst, setIncludeGst] = useState(true);
  const [splitBillModal, setSplitBillModal] = useState<{ bill: import('../../api').DistributionBillData } | null>(null);
  const [splitGstQty, setSplitGstQty] = useState(0);
  const [splitSaving, setSplitSaving] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(vendorId ?? null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchProductId, setSelectedBatchProductId] = useState<string | null>(null);
  /** Non-service detail: which delivery-set half is shown (Tax Invoice vs Bill of Supply). */
  const [deliveryHalf, setDeliveryHalf] = useState<'gst' | 'bos'>('gst');
  const [editBatchModal, setEditBatchModal] = useState<DistributionBatchDetail | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editRows, setEditRows] = useState<
    {
      productId: string;
      productName: string;
      quantity: number;
      minQuantity: number;
      discount: number;
      withGst: boolean;
      customPrice: string;
      priceIncludesGst: boolean;
      gstRate: number;
      availableStock: number;
      isNew?: boolean;
    }[]
  >([]);
  const editHeaderGstRef = useRef<HTMLInputElement>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ idx: number; name: string; qty: number } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'unpaid' | 'paid'>('unpaid');
  const [distSearch, setDistSearch] = useState('');
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState<string | null>(null);
  const [financeMap, setFinanceMap] = useState<
    Record<
      string,
      {
        totalDistributedValue: number;
        totalPaid: number;
        balance: number;
        vendorPhone?: string;
        vendorName?: string;
        lastSent?: string | null;
      }
    >
  >({});
  const [reminderSettings, setReminderSettings] = useState<CompanyReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [batchActionsOpen, setBatchActionsOpen] = useState(false);
  const batchActionsBtnRef = useRef<HTMLButtonElement>(null);
  const [batchActionsPos, setBatchActionsPos] = useState<{
    top: number;
    left: number;
    maxHeight?: number;
  } | null>(null);
  const [batchPaymentModal, setBatchPaymentModal] = useState<{
    batchId: string;
    vendorId: string;
    billValue: number;
    balanceRemaining: number;
  } | null>(null);
  const [eWayBillModal, setEWayBillModal] = useState<string | null>(null);
  const [eWayForm, setEWayForm] = useState({
    vehicleNo: '',
    transportMode: 'Road',
    distance: '',
    transporterName: '',
    transporterId: '',
  });
  const [batchPaymentForm, setBatchPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });
  const [batchPaymentSubmitting, setBatchPaymentSubmitting] = useState(false);
  const [createInitialVendorId, setCreateInitialVendorId] = useState<string | undefined>();
  const [vendorAddress, setVendorAddress] = useState<string | null>(null);

  useEscapeKey(() => {
    if (eWayBillModal) {
      setEWayBillModal(null);
      return true;
    }
    if (batchPaymentModal) {
      setBatchPaymentModal(null);
      return true;
    }
    if (splitBillModal) {
      setSplitBillModal(null);
      return true;
    }
    if (editBatchModal) {
      setEditBatchModal(null);
      return true;
    }
    if (modalOpen) {
      setModalOpen(false);
      return true;
    }
    if (selectedBatchProductId) {
      setSelectedBatchProductId(null);
      return true;
    }
    if (selectedBatchId) {
      setSelectedBatchId(null);
      return true;
    }
    // Non-service in-place nav: Escape returns to vendor tiles (service modal uses backdrop).
    if (!isServiceBiz && selectedVendorId && !vendorId) {
      setSelectedVendorId(null);
      return true;
    }
    return false;
  });

  // Cap Online / glass: portal ⋮ menu, clamp to viewport; glass prefers above so it never covers totals.
  useEffect(() => {
    if (!batchActionsOpen || isServiceBiz) {
      setBatchActionsPos(null);
      return;
    }
    const MENU_W = 220;
    const PAD = 8;
    const EST_H = 300;
    const update = () => {
      const el = batchActionsBtnRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let left = rect.right - MENU_W;
      left = Math.max(PAD, Math.min(left, window.innerWidth - MENU_W - PAD));

      const spaceBelow = window.innerHeight - rect.bottom - PAD;
      const spaceAbove = rect.top - PAD;
      // Glass batch header sits above the totals card — open upward when there's room.
      const preferAbove = desktopGlass && spaceAbove >= 160;

      let top: number;
      let maxHeight: number | undefined;
      if (preferAbove || (spaceBelow < EST_H && spaceAbove > spaceBelow)) {
        const h = Math.min(EST_H, Math.max(160, spaceAbove - 4));
        maxHeight = spaceAbove < EST_H ? h : undefined;
        top = Math.max(PAD, rect.top - (maxHeight ?? EST_H) - 4);
      } else {
        top = rect.bottom + 4;
        if (spaceBelow < EST_H) maxHeight = Math.max(160, spaceBelow - 4);
      }
      setBatchActionsPos({ top, left, maxHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [batchActionsOpen, isServiceBiz, desktopGlass]);

  const challanOptions = (forVendorId: string) => {
    const f = financeMap[forVendorId];
    return {
      showGst: includeGst,
      fullyPaid: f ? isBillFullyPaid(f.totalDistributedValue, f.balance) : false,
    };
  };

  const sendVendorPaymentReminder = (v: {
    vendorId: string;
    vendorName: string;
    vendorPhone: string;
    balance: number;
    lastSent?: string | null;
  }) => {
    const gate = canSendPaymentReminder({
      settings: reminderSettings,
      balance: v.balance,
      phone: v.vendorPhone,
      lastSent: v.lastSent,
    });
    if (!gate.ok) {
      toast(gate.reason || 'Cannot send reminder', 'info');
      return;
    }
    shareViaWhatsApp(
      v.vendorPhone,
      formatVendorPaymentReminderText({
        vendorName: v.vendorName,
        balance: v.balance,
        companyName: sessionCompanyName(),
      }),
    );
    api.vendorFinance.markReminderSent(v.vendorId).catch(() => {});
    setFinanceMap(prev => {
      const cur = prev[v.vendorId];
      if (!cur) return prev;
      return { ...prev, [v.vendorId]: { ...cur, lastSent: new Date().toISOString().slice(0, 10) } };
    });
  };

  const remindAllOutstandingVendors = async () => {
    const candidates = Object.keys(financeMap).flatMap(id => {
      const f = financeMap[id];
      if (!(f.balance > 0) || !f.vendorPhone) return [];
      return [
        {
          vendorId: id,
          vendorName: f.vendorName || 'Vendor',
          vendorPhone: f.vendorPhone,
          balance: f.balance,
          lastSent: f.lastSent ?? null,
        },
      ];
    });
    const { eligible, skipped } = filterVendorsForReminder(candidates, reminderSettings);
    if (!eligible.length) {
      const why = skipped[0]?.reason || 'No vendors eligible for reminders';
      toast(
        skipped.length
          ? `No reminders sent — ${skipped.length} skipped (e.g. ${why})`
          : 'No vendors with outstanding balance and phone number',
        'info',
      );
      return;
    }
    if (
      !(await confirm({
        title: 'Remind all',
        message: `Send WhatsApp payment reminders to ${eligible.length} vendor${eligible.length > 1 ? 's' : ''}?${
          skipped.length ? ` (${skipped.length} skipped — below min due or within cadence)` : ''
        }`,
        confirmLabel: `Remind ${eligible.length}`,
        variant: 'info',
      }))
    )
      return;
    const companyName = sessionCompanyName();
    const today = new Date().toISOString().slice(0, 10);
    for (const v of eligible) {
      shareViaWhatsApp(
        v.vendorPhone,
        formatVendorPaymentReminderText({
          vendorName: v.vendorName,
          balance: v.balance,
          companyName,
        }),
      );
      api.vendorFinance.markReminderSent(v.vendorId).catch(() => {});
    }
    setFinanceMap(prev => {
      const next = { ...prev };
      for (const v of eligible) {
        if (next[v.vendorId]) next[v.vendorId] = { ...next[v.vendorId], lastSent: today };
      }
      return next;
    });
    toast(
      skipped.length
        ? `Opened WhatsApp for ${eligible.length}; skipped ${skipped.length}`
        : `Opened WhatsApp for ${eligible.length} vendors`,
      'success',
    );
  };

  const load = () => {
    Promise.all([
      api.distribution.list(vendorId),
      api.distribution.batches(vendorId),
      api.distribution.summary(),
      vendorId ? Promise.resolve([]) : api.products.list(),
    ])
      .then(([d, b, s, p]) => {
        setDistributions(d);
        setBatches(b);
        setSummary(s);
        setProducts(p);
        if (vendorId) setSelectedVendorId(vendorId);
      })
      .then(() => {
        if (!vendorId) {
          api.vendorFinance
            .summary()
            .then(fs => {
              const map: Record<
                string,
                {
                  totalDistributedValue: number;
                  totalPaid: number;
                  balance: number;
                  vendorPhone?: string;
                  vendorName?: string;
                  lastSent?: string | null;
                }
              > = {};
              for (const f of fs)
                map[f.vendorId] = {
                  totalDistributedValue: f.totalDistributedValue,
                  totalPaid: f.totalPaid,
                  balance: f.balance,
                  vendorPhone: f.vendorPhone || undefined,
                  vendorName: f.vendorName,
                  lastSent: f.reminder?.lastSent ?? null,
                };
              setFinanceMap(map);
            })
            .catch(() => {});
        } else {
          api.vendorFinance
            .detail(vendorId)
            .then(d => {
              setFinanceMap({
                [vendorId]: {
                  totalDistributedValue: d.totalDistributedValue,
                  totalPaid: d.totalPaid,
                  balance: d.balance,
                  vendorPhone: d.vendor.phone || undefined,
                  vendorName: d.vendor.name,
                  lastSent: d.reminder?.lastSent ?? null,
                },
              });
            })
            .catch(() => {});
        }
      })
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    load();
  }, [vendorId]);

  useEffect(() => {
    if (!desktopGlass || !selectedVendorId || isVendorUser) {
      setVendorAddress(null);
      return;
    }
    let cancelled = false;
    api.vendorFinance
      .detail(selectedVendorId)
      .then(d => {
        if (!cancelled) setVendorAddress(d.vendor.address || null);
      })
      .catch(() => {
        if (!cancelled) setVendorAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopGlass, selectedVendorId, isVendorUser]);

  useEffect(() => {
    if (isServiceBiz || isVendorUser) return;
    api.reminderSettings
      .get()
      .then(r =>
        setReminderSettings({
          enabled: r.enabled,
          minDueAmount: Number(r.minDueAmount) || 0,
          cadenceDays: Math.max(1, Number(r.cadenceDays) || 15),
        }),
      )
      .catch(() => setReminderSettings(DEFAULT_REMINDER_SETTINGS));
  }, [isServiceBiz, isVendorUser]);

  const defaultGstRate = ((user as Record<string, unknown>)?.defaultGstRate as number) ?? 18;

  const confirmDeleteBatch = (batchId: string) => setDeleteBatchConfirm(batchId);
  const handleDeleteBatch = async (batchId: string) => {
    setDeleteBatchConfirm(null);
    setDeleteSubmitting(true);
    try {
      await api.distribution.deleteBatch(batchId);
      setEditBatchModal(null);
      setSelectedBatchId(null);
      setSelectedBatchProductId(null);
      load();
      toast('Distribution deleted', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openEdit = (batch: DistributionBatch) => {
    api.distribution
      .getBatch(batch.batchId)
      .then(detail => {
        setEditBatchModal(detail);
        setEditDate(detail.distributionDate);
        setEditRows(
          detail.items.map(i => {
            const p = products.find(pr => pr.id === i.productId);
            const gstRate = i.gstRate ?? p?.gstRate ?? defaultGstRate;
            const priceIncludesGst = i.priceIncludesGst ?? !!p?.priceIncludesGst;
            const unit =
              i.unitPrice != null && Number(i.unitPrice) > 0
                ? Number(i.unitPrice)
                : displayUnitPriceForGst(p?.price ?? 0, {
                    withGst: i.withGst,
                    priceIncludesGst,
                    gstRate,
                  });
            return {
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              minQuantity: i.minQuantity,
              discount: i.discountPercent,
              withGst: i.withGst,
              customPrice: unit ? String(unit) : '',
              priceIncludesGst,
              gstRate,
              availableStock: i.availableStock,
            };
          }),
        );
      })
      .catch(err => toast(err.message, 'error'));
  };

  const updateEditRow = (idx: number, field: string, value: string | number | boolean) => {
    setEditRows(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const editRowMoney = (row: (typeof editRows)[number]) => {
    const p = products.find(x => x.id === row.productId);
    const rate = row.gstRate || p?.gstRate || defaultGstRate;
    const includes = row.priceIncludesGst || !!p?.priceIncludesGst;
    const unit = row.customPrice
      ? parseFloat(row.customPrice)
      : displayUnitPriceForGst(p?.price ?? 0, {
          withGst: row.withGst,
          priceIncludesGst: includes,
          gstRate: rate,
        });
    return linePricesAfterDiscount({
      unitPrice: unit || 0,
      quantity: row.quantity || 0,
      discountPercent: row.discount || 0,
      withGst: row.withGst,
      priceIncludesGst: includes && row.withGst,
      gstRate: rate,
    });
  };

  const editTotals = editRows.reduce(
    (acc, r) => {
      const m = editRowMoney(r);
      acc.gross += m.gross;
      acc.discount += m.discount;
      acc.net += m.net;
      acc.gst += m.gst;
      acc.billed += m.billed;
      acc.items += r.quantity || 0;
      return acc;
    },
    { gross: 0, discount: 0, net: 0, gst: 0, billed: 0, items: 0 },
  );

  const editAllGst = editRows.length > 0 && editRows.every(r => r.withGst);
  const editSomeGst = editRows.some(r => r.withGst);
  useEffect(() => {
    if (editHeaderGstRef.current) {
      editHeaderGstRef.current.indeterminate = editSomeGst && !editAllGst;
    }
  }, [editSomeGst, editAllGst]);

  const pageTitle = getTabLabel('distribution', isDirectSell ? 'Sales' : 'Distribution');
  const pageSubtitle = vendorId
    ? 'Your distributed products'
    : isDirectSell
      ? 'Track your sales'
      : 'Assign products to vendors for sale';
  const createLabel = isDirectSell ? 'Record Sale' : 'Distribute to Vendor';
  const exportDistributionCsv = () => {
    if (!distributions.length) return;
    exportToCsv(
      distributions.map(d => ({
        id: d.id,
        barcode: d.barcode,
        productName: d.productName,
        vendorName: d.vendorName,
        distributionDate: d.distributionDate,
        status: d.status,
      })),
      'distribution',
    );
  };
  const resetPaymentFilter = (tab: 'unpaid' | 'paid') => {
    setPaymentFilter(tab);
    setSelectedVendorId(null);
    setSelectedBatchId(null);
  };
  const filteredVendorStats =
    summary?.vendorStats?.filter(v => {
      if (v.distributed === 0) return false;
      if (vendorId && v.vendorId !== vendorId) return false;
      const f = financeMap[v.vendorId];
      const isPaid = f ? f.balance <= 0 : false;
      if (paymentFilter === 'paid' ? !isPaid : isPaid) return false;
      if (distSearch) {
        const q = distSearch.toLowerCase();
        if (v.vendorName.toLowerCase().includes(q)) return true;
        return distributions.some(d => d.vendorId === v.vendorId && (d.productName || '').toLowerCase().includes(q));
      }
      return true;
    }) ?? [];
  const remindAllCount =
    !isVendorUser && !isServiceBiz && reminderSettings.enabled && paymentFilter === 'unpaid'
      ? filterVendorsForReminder(
          Object.keys(financeMap).flatMap(id => {
            const f = financeMap[id];
            if (!(f.balance > 0) || !f.vendorPhone) return [];
            return [
              {
                vendorId: id,
                vendorPhone: f.vendorPhone,
                balance: f.balance,
                lastSent: f.lastSent ?? null,
              },
            ];
          }),
          reminderSettings,
        ).eligible.length
      : 0;
  /** Non-service in-place detail replaces the list; desktop glass list hides while drilling in. */
  const inPlaceNav = !isServiceBiz;
  const showDesktopList = desktopGlass && !(inPlaceNav && selectedVendorId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(desktopGlass ? 'space-y-8 w-full max-w-none' : 'space-y-6')}
    >
      {showDesktopList ? (
        <DesktopDistributionPanel
          title={pageTitle}
          subtitle={pageSubtitle}
          isDirectSell={isDirectSell}
          paymentFilter={paymentFilter}
          onPaymentFilter={resetPaymentFilter}
          search={distSearch}
          onSearch={setDistSearch}
          canExport={distributions.length > 0}
          onExportCsv={exportDistributionCsv}
          canCreate={!vendorId && canEdit}
          onCreate={() => {
            setCreateInitialVendorId(undefined);
            setModalOpen(true);
          }}
          createLabel={createLabel}
          remindAllCount={remindAllCount}
          onRemindAll={remindAllCount > 0 ? () => void remindAllOutstandingVendors() : null}
          loading={loading}
          loadError={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(null);
            load();
          }}
          vendors={filteredVendorStats.map(v => {
            const f = financeMap[v.vendorId];
            return {
              vendorId: v.vendorId,
              vendorName: v.vendorName,
              distributed: v.distributed,
              sold: v.sold,
              replaced: v.replaced ?? 0,
              damaged: v.damaged ?? 0,
              availableWithVendor: v.availableWithVendor,
              billAmount: f?.totalDistributedValue ?? 0,
              paidAmount: f?.totalPaid ?? 0,
              balance: f?.balance ?? 0,
            };
          })}
          onSelectVendor={id => {
            setSelectedVendorId(id);
            setSelectedBatchId(null);
            setSelectedBatchProductId(null);
          }}
        />
      ) : !desktopGlass ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold">{pageTitle}</h2>
              <p className="text-sm text-gray-500">{pageSubtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportDistributionCsv}
                disabled={!distributions.length}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} /> Export CSV
              </button>
              {!vendorId && canEdit && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
                >
                  <Plus size={18} /> {createLabel}
                </button>
              )}
            </div>
          </div>

          {/* Payment filter + search */}
          <div className="flex items-center gap-3 flex-wrap">
            {(['unpaid', 'paid'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => resetPaymentFilter(tab)}
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
                placeholder="Search vendor or product..."
                value={distSearch}
                onChange={e => setDistSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
              />
            </div>
            {remindAllCount > 0 && (
              <button
                type="button"
                onClick={() => void remindAllOutstandingVendors()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700"
              >
                <MessageCircle size={16} /> Remind all ({remindAllCount})
              </button>
            )}
          </div>
        </>
      ) : null}

      {/* Vendor cards — service: modal overlay; non-service: replace whole view in-place */}
      {(() => {
        const selectedVendorContent =
          selectedVendorId &&
          (() => {
            const vendorBatches = batches.filter(b => b.vendorId === selectedVendorId);
            const vendorName =
              vendorBatches[0]?.vendorName ??
              distributions.find(d => d.vendorId === selectedVendorId)?.vendorName ??
              'Vendor';
            const stats = summary?.vendorStats?.find(v => v.vendorId === selectedVendorId);
            const selectedBatch = selectedBatchId ? vendorBatches.find(b => b.batchId === selectedBatchId) : null;
            const batchItems = selectedBatchId
              ? distributions.filter(d => (d.batchId ?? d.id) === selectedBatchId)
              : [];

            const billParams = (batchId: string) => ({ batchId, vendorId: selectedVendorId! });
            const batchCanDelete = selectedBatch
              ? selectedBatch.sold + selectedBatch.replaced + selectedBatch.damaged === 0
              : false;

            if (selectedBatch) {
              const batchGstUnits =
                typeof selectedBatch.gstUnits === 'number'
                  ? selectedBatch.gstUnits
                  : batchItems.filter(d => d.gstApplied === true).length;
              const batchNonGstUnits =
                typeof selectedBatch.nonGstUnits === 'number'
                  ? selectedBatch.nonGstUnits
                  : batchItems.filter(d => d.gstApplied !== true).length;
              const useHalfTabs = inPlaceNav;
              const halfItems = useHalfTabs
                ? batchItems.filter(d => (deliveryHalf === 'gst' ? d.gstApplied === true : d.gstApplied !== true))
                : batchItems;
              const halfBillValue = halfItems.reduce(
                (s, d) => s + (Number(d.billedPrice) || Number(d.netPrice) || 0),
                0,
              );
              const halfSold = halfItems.filter(u => u.status === 'Sold').length;
              const halfHasLines = halfItems.length > 0;
              const halfTotalLabel = deliveryHalf === 'gst' ? 'Tax Invoice total' : 'Bill of Supply total';

              const byProduct = halfItems.reduce(
                (acc, d) => {
                  const key = d.productId;
                  if (!acc[key])
                    acc[key] = { productId: key, productName: d.productName, units: [] as typeof batchItems };
                  acc[key].units.push(d);
                  return acc;
                },
                {} as Record<string, { productId: string; productName: string; units: typeof batchItems }>,
              );
              type ByProductVal = { productId: string; productName: string; units: typeof batchItems };
              const productList = (Object.values(byProduct) as ByProductVal[]).map(p => ({
                ...p,
                total: p.units.length,
                sold: p.units.filter(u => u.status === 'Sold').length,
                replaced: p.units.filter(u => u.status === 'Replaced').length,
                damaged: p.units.filter(u => u.status === 'Damaged').length,
                withVendor: p.units.filter(u => u.status === 'Distributed').length,
              }));
              const selectedProduct = selectedBatchProductId ? byProduct[selectedBatchProductId] : null;

              // Desktop glass drill-downs (vendor tile → batch → barcodes). Cap/phone keep card layout below.
              if (desktopGlass) {
                const ds = ((selectedBatch as Record<string, unknown>).dispatchStatus as string) || 'pending';
                const nos =
                  selectedBatch.deliverySet?.gstDocNo || selectedBatch.deliverySet?.nonGstDocNo
                    ? {
                        gstDocNo: selectedBatch.deliverySet.gstDocNo,
                        nonGstDocNo: selectedBatch.deliverySet.nonGstDocNo,
                      }
                    : deliveryDocNos(selectedBatch.batchId, batchGstUnits, batchNonGstUnits);
                const activeDocNo = deliveryHalf === 'gst' ? nos.gstDocNo : nos.nonGstDocNo;
                const activeDocLabel = deliveryHalf === 'gst' ? 'Tax Invoice (GST)' : 'Bill of Supply (non-GST)';

                if (selectedProduct) {
                  return (
                    <DesktopProductBarcodeGlass
                      productName={selectedProduct.productName}
                      units={selectedProduct.units.map(u => ({
                        id: u.id,
                        barcode: u.barcode,
                        status: u.status,
                      }))}
                      sold={selectedProduct.units.filter(u => u.status === 'Sold').length}
                      withVendor={selectedProduct.units.filter(u => u.status === 'Distributed').length}
                      replaced={selectedProduct.units.filter(u => u.status === 'Replaced').length}
                      damaged={selectedProduct.units.filter(u => u.status === 'Damaged').length}
                      canEdit={!isVendorUser && canEdit}
                      onBack={() => setSelectedBatchProductId(null)}
                      onEdit={!isVendorUser && canEdit ? () => openEdit(selectedBatch) : null}
                    />
                  );
                }

                const glassBtn =
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-card-hover)] transition-colors';
                const glassBtnPrimary =
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg dg-bg-primary hover:opacity-90 transition-colors';

                const glassMoreMenu = !isVendorUser ? (
                  <div className="relative shrink-0">
                    <button
                      ref={batchActionsBtnRef}
                      type="button"
                      onClick={() => setBatchActionsOpen(!batchActionsOpen)}
                      className={glassBtn}
                      title="More actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {batchActionsOpen && (
                      <>
                        <div className="fixed inset-0 z-[50]" onClick={() => setBatchActionsOpen(false)} />
                        {(() => {
                          // Portal + opaque panel: dg-glass-card tokens don't apply on document.body.
                          const panel = (
                            <div
                              className="z-[51] rounded-xl shadow-lg py-1 min-w-[180px] border border-gray-200 bg-white text-gray-900"
                              style={
                                batchActionsPos
                                  ? {
                                      position: 'fixed',
                                      top: batchActionsPos.top,
                                      left: batchActionsPos.left,
                                      width: 220,
                                      maxHeight: batchActionsPos.maxHeight,
                                      overflowY: batchActionsPos.maxHeight ? 'auto' : undefined,
                                    }
                                  : { position: 'fixed', visibility: 'hidden' }
                              }
                            >
                              {canPrint && useHalfTabs && (
                                <button
                                  type="button"
                                  disabled={!halfHasLines}
                                  onClick={() => {
                                    if (!halfHasLines) return;
                                    setBatchActionsOpen(false);
                                    const kind = deliveryHalf === 'gst' ? 'gst' : 'bos';
                                    api.distribution
                                      .getBill(billParams(selectedBatch.batchId))
                                      .then(bill => {
                                        const avail = deliveryPrintAvailability(bill);
                                        const paid = challanOptions(selectedVendorId!).fullyPaid;
                                        if (kind === 'gst' && !avail.hasGst) {
                                          toast('No Tax Invoice lines on this delivery', 'info');
                                          return;
                                        }
                                        if (kind === 'bos' && !avail.hasBos) {
                                          toast('No Bill of Supply lines on this delivery', 'info');
                                          return;
                                        }
                                        return printDistributionDocs(bill, kind, paid);
                                      })
                                      .catch(err => toast(err.message, 'error'));
                                  }}
                                  className={cn(
                                    'w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50',
                                    !halfHasLines && 'opacity-50 cursor-not-allowed',
                                  )}
                                >
                                  <Printer size={14} />{' '}
                                  {deliveryHalf === 'gst' ? 'Print Tax Invoice' : 'Print Bill of Supply'}
                                </button>
                              )}
                              {canPrint && !useHalfTabs && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchActionsOpen(false);
                                    api.distribution
                                      .getBill(billParams(selectedBatch.batchId))
                                      .then(async bill => {
                                        const avail = deliveryPrintAvailability(bill);
                                        const paid = challanOptions(selectedVendorId!).fullyPaid;
                                        if (avail.isDual) await printDistributionDocs(bill, 'both', paid);
                                        else if (avail.hasGst) await printDistributionDocs(bill, 'gst', paid);
                                        else await printDistributionDocs(bill, 'bos', paid);
                                      })
                                      .catch(err => toast(err.message, 'error'));
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <Printer size={14} /> Print invoice(s)
                                </button>
                              )}
                              {canUseSplitBill && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchActionsOpen(false);
                                    api.distribution
                                      .getBill(billParams(selectedBatch.batchId))
                                      .then(bill => {
                                        setSplitBillModal({ bill });
                                        setSplitGstQty(
                                          bill.savedGstUnits > 0
                                            ? bill.savedGstUnits
                                            : Math.ceil(bill.totalQuantity / 2),
                                        );
                                      })
                                      .catch(err => toast(err.message, 'error'));
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <Package size={14} /> Adjust GST split
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchActionsOpen(false);
                                  api.distribution
                                    .getBill(billParams(selectedBatch.batchId))
                                    .then(async bill => {
                                      const avail = deliveryPrintAvailability(bill);
                                      const kind = avail.isDual ? 'both' : avail.hasGst ? 'gst' : 'bos';
                                      try {
                                        toast('Preparing PDF…', 'info');
                                        const { how, errorHint } = await shareDistributionDocsWhatsApp(bill, kind);
                                        if (how === 'cancelled') return;
                                        toast(
                                          whatsAppInvoiceShareToast(how, errorHint),
                                          how === 'pdf_fallback' ? 'info' : 'success',
                                        );
                                      } catch (err) {
                                        toast((err as Error).message, 'error');
                                      }
                                    })
                                    .catch(err => toast(err.message, 'error'));
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-emerald-600"
                              >
                                <MessageCircle size={14} /> WhatsApp Challan
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchActionsOpen(false);
                                  api.distribution
                                    .getBill(billParams(selectedBatch.batchId))
                                    .then(bill => {
                                      const email = bill.vendor.email || '';
                                      if (!email) {
                                        toast('No vendor email on record — enter email manually', 'info');
                                      }
                                      shareViaEmail(
                                        email,
                                        `Distribution Challan ${bill.challanId} — ${bill.company.name}`,
                                        formatDistributionChallanText(bill),
                                      );
                                    })
                                    .catch(err => toast(err.message, 'error'));
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Mail size={14} /> Email Challan
                              </button>
                              {(!useHalfTabs || deliveryHalf === 'gst') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchActionsOpen(false);
                                    fetch(`/api/distribution/einvoice?batchId=${selectedBatch.batchId}`, {
                                      headers: {
                                        Authorization: `Bearer ${session.getToken()}`,
                                        'X-Tenant-ID': session.getTenantId() || '',
                                      },
                                    })
                                      .then(r => r.json())
                                      .then(data => {
                                        const blob = new Blob([JSON.stringify(data, null, 2)], {
                                          type: 'application/json',
                                        });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `E-Invoice-${selectedBatch.batchId}.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        toast('E-Invoice JSON downloaded', 'success');
                                      })
                                      .catch(err => toast(err.message, 'error'));
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <Download size={14} /> E-Invoice JSON
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchActionsOpen(false);
                                  setEWayBillModal(selectedBatch.batchId);
                                  setEWayForm({
                                    vehicleNo: '',
                                    transportMode: 'Road',
                                    distance: '',
                                    transporterName: '',
                                    transporterId: '',
                                  });
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Truck size={14} /> E-Way Bill
                              </button>
                              {canEdit && batchCanDelete && (
                                <>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBatchActionsOpen(false);
                                      confirmDeleteBatch(selectedBatch.batchId);
                                    }}
                                    disabled={deleteSubmitting}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-rose-50 flex items-center gap-2 text-rose-600"
                                  >
                                    <Trash2 size={14} /> Delete
                                  </button>
                                </>
                              )}
                            </div>
                          );
                          return createPortal(panel, document.body);
                        })()}
                      </>
                    )}
                  </div>
                ) : null;

                const glassDispatchToolbar = (
                  <>
                    {canPrint && ds === 'pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          fetchApi(`/distribution/batch/${selectedBatch.batchId}/dispatch`, {
                            method: 'PUT',
                            body: JSON.stringify({ status: 'dispatched' }),
                          })
                            .then((d: Record<string, unknown>) => {
                              if (d.ok) {
                                toast('Marked as dispatched', 'success');
                                load();
                              } else toast(String(d.error), 'error');
                            })
                            .catch(err => toast(err.message, 'error'));
                        }}
                        className={glassBtnPrimary}
                      >
                        <Truck size={14} /> Mark Dispatched
                      </button>
                    )}
                    {canPrint && ds === 'dispatched' && (
                      <button
                        type="button"
                        onClick={() => {
                          fetchApi(`/distribution/batch/${selectedBatch.batchId}/dispatch`, {
                            method: 'PUT',
                            body: JSON.stringify({ status: 'delivered' }),
                          })
                            .then((d: Record<string, unknown>) => {
                              if (d.ok) {
                                toast('Marked as delivered', 'success');
                                load();
                              } else toast(String(d.error), 'error');
                            })
                            .catch(err => toast(err.message, 'error'));
                        }}
                        className={glassBtn}
                      >
                        <Package size={14} /> Mark Delivered
                      </button>
                    )}
                    <input
                      type="text"
                      placeholder="EWB Number"
                      defaultValue={((selectedBatch as Record<string, unknown>).ewbNumber as string) || ''}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        fetchApi(`/distribution/batch/${selectedBatch.batchId}/ewb`, {
                          method: 'PUT',
                          body: JSON.stringify({ ewbNumber: val || null }),
                        })
                          .then(() => {
                            if (val) toast('EWB number saved', 'success');
                          })
                          .catch(() => {});
                      }}
                      className="w-full px-2 py-1.5 text-xs border border-[var(--dg-card-border)] rounded-lg font-mono bg-[var(--dg-bg)] dg-ink focus:ring-2 focus:ring-[var(--dg-primary)]"
                      maxLength={15}
                    />
                    {(!useHalfTabs || deliveryHalf === 'gst') && (
                      <EInvoiceButtons
                        batchId={selectedBatch.batchId}
                        initialIrn={selectedBatch.irn}
                        initialQr={selectedBatch.irnQr}
                        initialEwb={selectedBatch.ewbNumber}
                        quiet
                      />
                    )}
                  </>
                );

                return (
                  <DesktopBatchDetailGlass
                    vendorName={selectedBatch.vendorName}
                    dateLabel={formatDate(selectedBatch.distributionDate)}
                    dispatchStatus={ds}
                    docNo={useHalfTabs ? activeDocNo : nos.gstDocNo || nos.nonGstDocNo}
                    docLabel={
                      useHalfTabs
                        ? halfHasLines
                          ? activeDocLabel
                          : null
                        : deliveryDocLabel(deliveryDocKind(batchGstUnits, batchNonGstUnits)) || null
                    }
                    totalAmount={useHalfTabs && halfHasLines ? halfBillValue : selectedBatch.billValue}
                    balanceDue={selectedBatch.balanceRemaining}
                    amountPaid={selectedBatch.amountPaid}
                    fullyPaid={isBillFullyPaid(selectedBatch.billValue, selectedBatch.balanceRemaining)}
                    halfUnits={useHalfTabs ? halfItems.length : selectedBatch.total}
                    halfSold={useHalfTabs ? halfSold : selectedBatch.sold}
                    halfBillValue={halfBillValue}
                    halfTotalLabel={halfTotalLabel}
                    deliveryTotal={selectedBatch.billValue}
                    useHalfTabs={useHalfTabs}
                    deliveryHalf={deliveryHalf}
                    batchGstUnits={batchGstUnits}
                    batchNonGstUnits={batchNonGstUnits}
                    halfHasLines={halfHasLines}
                    products={productList}
                    onBack={() => {
                      setSelectedBatchId(null);
                      setSelectedBatchProductId(null);
                    }}
                    onHalfChange={half => {
                      setDeliveryHalf(half);
                      setSelectedBatchProductId(null);
                    }}
                    onSelectProduct={id => setSelectedBatchProductId(id)}
                    headerActions={
                      <>
                        {!isVendorUser && canEdit && selectedBatch.balanceRemaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setBatchPaymentModal({
                                batchId: selectedBatch.batchId,
                                vendorId: selectedBatch.vendorId,
                                billValue: selectedBatch.billValue,
                                balanceRemaining: selectedBatch.balanceRemaining,
                              });
                              setBatchPaymentForm({
                                amount: String(selectedBatch.balanceRemaining),
                                paymentDate: new Date().toISOString().slice(0, 10),
                                paymentMethod: 'Cash',
                                referenceNumber: '',
                                notes: '',
                              });
                            }}
                            className={glassBtnPrimary}
                            title="Record payment for this batch"
                          >
                            <IndianRupee size={14} /> Record Payment
                          </button>
                        )}
                        {!isVendorUser && canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(selectedBatch)}
                            className={glassBtn}
                            title="Edit distribution"
                          >
                            <Pencil size={14} /> Edit
                          </button>
                        )}
                        {glassMoreMenu}
                      </>
                    }
                    dispatchToolbar={glassDispatchToolbar}
                  />
                );
              }

              return (
                <div
                  className={cn(
                    desktopGlass
                      ? 'dg-glass-card rounded-2xl overflow-hidden'
                      : 'bg-white rounded-2xl border border-gray-100 shadow-sm',
                  )}
                >
                  <div
                    className={cn(
                      'px-6 py-4 border-b space-y-2',
                      desktopGlass
                        ? 'bg-[var(--dg-input)] border-[var(--dg-card-border)]'
                        : 'bg-gray-50 border-gray-100',
                    )}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedBatchProductId) setSelectedBatchProductId(null);
                            else setSelectedBatchId(null);
                          }}
                          className={cn(
                            'p-2 rounded-lg transition-colors',
                            desktopGlass ? 'hover:bg-[var(--dg-card-hover)]' : 'hover:bg-gray-200',
                          )}
                        >
                          <ArrowLeft size={20} className={desktopGlass ? 'dg-muted' : 'text-gray-600'} />
                        </button>
                        <h3 className={cn('font-bold text-lg', desktopGlass && 'dg-ink')}>
                          {selectedProduct ? selectedProduct.productName : selectedBatch.vendorName}
                        </h3>
                        {!selectedBatchProductId &&
                          isBillFullyPaid(selectedBatch.billValue, selectedBatch.balanceRemaining) && <PaidBadge />}
                        {!selectedBatchProductId && (
                          <span className="text-xs text-gray-500">
                            Distribution — {formatDate(selectedBatch.distributionDate)}
                          </span>
                        )}
                        {!selectedBatchProductId && inPlaceNav && (
                          <DeliveryDocBadge batch={selectedBatch} size="md" activeHalf={deliveryHalf} />
                        )}
                        {!selectedBatchProductId &&
                          (() => {
                            const ds =
                              ((selectedBatch as Record<string, unknown>).dispatchStatus as string) || 'pending';
                            const badge = (
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                                  ds === 'dispatched'
                                    ? 'bg-blue-100 text-blue-700'
                                    : ds === 'delivered'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700',
                                )}
                              >
                                {ds === 'dispatched'
                                  ? 'Dispatched'
                                  : ds === 'delivered'
                                    ? 'Delivered'
                                    : 'Pending Dispatch'}
                              </span>
                            );
                            const secondary = (
                              <>
                                {canPrint && ds === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      fetchApi(`/distribution/batch/${selectedBatch.batchId}/dispatch`, {
                                        method: 'PUT',
                                        body: JSON.stringify({ status: 'dispatched' }),
                                      })
                                        .then((d: Record<string, unknown>) => {
                                          if (d.ok) {
                                            toast('Marked as dispatched', 'success');
                                            load();
                                          } else toast(String(d.error), 'error');
                                        })
                                        .catch(err => toast(err.message, 'error'));
                                    }}
                                    className={
                                      inPlaceNav
                                        ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md'
                                        : 'flex items-center gap-1 px-2 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg'
                                    }
                                  >
                                    <Truck size={12} /> Mark Dispatched
                                  </button>
                                )}
                                {canPrint && ds === 'dispatched' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      fetchApi(`/distribution/batch/${selectedBatch.batchId}/dispatch`, {
                                        method: 'PUT',
                                        body: JSON.stringify({ status: 'delivered' }),
                                      })
                                        .then((d: Record<string, unknown>) => {
                                          if (d.ok) {
                                            toast('Marked as delivered', 'success');
                                            load();
                                          } else toast(String(d.error), 'error');
                                        })
                                        .catch(err => toast(err.message, 'error'));
                                    }}
                                    className={
                                      inPlaceNav
                                        ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md'
                                        : 'flex items-center gap-1 px-2 py-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg'
                                    }
                                  >
                                    <Package size={12} /> Mark Delivered
                                  </button>
                                )}
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    placeholder="EWB Number"
                                    defaultValue={
                                      ((selectedBatch as Record<string, unknown>).ewbNumber as string) || ''
                                    }
                                    onBlur={e => {
                                      const val = e.target.value.trim();
                                      fetchApi(`/distribution/batch/${selectedBatch.batchId}/ewb`, {
                                        method: 'PUT',
                                        body: JSON.stringify({ ewbNumber: val || null }),
                                      })
                                        .then(() => {
                                          if (val) toast('EWB number saved', 'success');
                                        })
                                        .catch(() => {});
                                    }}
                                    className={
                                      inPlaceNav
                                        ? 'w-32 px-2 py-1 text-[11px] border border-gray-200 rounded-md font-mono focus:ring-2 focus:ring-brand'
                                        : 'w-36 px-2 py-1 text-xs border border-gray-200 rounded-lg font-mono focus:ring-2 focus:ring-brand'
                                    }
                                    maxLength={15}
                                  />
                                </div>
                                <EInvoiceButtons
                                  batchId={selectedBatch.batchId}
                                  initialIrn={selectedBatch.irn}
                                  initialQr={selectedBatch.irnQr}
                                  initialEwb={selectedBatch.ewbNumber}
                                  quiet={inPlaceNav}
                                />
                              </>
                            );
                            return inPlaceNav ? (
                              badge
                            ) : (
                              <>
                                {badge}
                                {secondary}
                              </>
                            );
                          })()}
                        {/* Primary actions stay in the title row */}
                        {!isVendorUser && canEdit && !selectedBatchProductId && selectedBatch.balanceRemaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setBatchPaymentModal({
                                batchId: selectedBatch.batchId,
                                vendorId: selectedBatch.vendorId,
                                billValue: selectedBatch.billValue,
                                balanceRemaining: selectedBatch.balanceRemaining,
                              });
                              setBatchPaymentForm({
                                amount: String(selectedBatch.balanceRemaining),
                                paymentDate: new Date().toISOString().slice(0, 10),
                                paymentMethod: 'Cash',
                                referenceNumber: '',
                                notes: '',
                              });
                            }}
                            className={
                              inPlaceNav
                                ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-md transition-colors'
                                : 'flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors'
                            }
                            title="Record payment for this batch"
                          >
                            <IndianRupee size={inPlaceNav ? 14 : 16} /> Record Payment
                          </button>
                        )}
                        {!isVendorUser && canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(selectedBatch)}
                            className={
                              inPlaceNav
                                ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 bg-transparent border border-gray-200 hover:bg-gray-100 rounded-md transition-colors'
                                : 'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors'
                            }
                            title="Edit distribution"
                          >
                            <Pencil size={inPlaceNav ? 14 : 16} /> Edit
                          </button>
                        )}
                        {!isVendorUser && !selectedBatchProductId && (
                          <div className="relative shrink-0">
                            <button
                              ref={batchActionsBtnRef}
                              type="button"
                              onClick={() => setBatchActionsOpen(!batchActionsOpen)}
                              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                              title="More actions"
                            >
                              <MoreVertical size={18} className="text-gray-600" />
                            </button>
                            {batchActionsOpen && (
                              <>
                                <div className="fixed inset-0 z-[50]" onClick={() => setBatchActionsOpen(false)} />
                                {(() => {
                                  const panel = (
                                    <div
                                      className={cn(
                                        'z-[51] bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]',
                                        !inPlaceNav && 'absolute right-0 top-full mt-1',
                                      )}
                                      style={
                                        inPlaceNav
                                          ? batchActionsPos
                                            ? {
                                                position: 'fixed',
                                                top: batchActionsPos.top,
                                                left: batchActionsPos.left,
                                                width: 220,
                                                maxHeight: batchActionsPos.maxHeight,
                                                overflowY: batchActionsPos.maxHeight ? 'auto' : undefined,
                                              }
                                            : { position: 'fixed', visibility: 'hidden' }
                                          : undefined
                                      }
                                    >
                                      {canPrint && useHalfTabs && (
                                        <button
                                          type="button"
                                          disabled={!halfHasLines}
                                          onClick={() => {
                                            if (!halfHasLines) return;
                                            setBatchActionsOpen(false);
                                            const kind = deliveryHalf === 'gst' ? 'gst' : 'bos';
                                            api.distribution
                                              .getBill(billParams(selectedBatch.batchId))
                                              .then(bill => {
                                                const avail = deliveryPrintAvailability(bill);
                                                const paid = challanOptions(selectedVendorId!).fullyPaid;
                                                if (kind === 'gst' && !avail.hasGst) {
                                                  toast('No Tax Invoice lines on this delivery', 'info');
                                                  return;
                                                }
                                                if (kind === 'bos' && !avail.hasBos) {
                                                  toast('No Bill of Supply lines on this delivery', 'info');
                                                  return;
                                                }
                                                return printDistributionDocs(bill, kind, paid);
                                              })
                                              .catch(err => toast(err.message, 'error'));
                                          }}
                                          className={cn(
                                            'w-full px-4 py-2 text-left text-sm flex items-center gap-2',
                                            halfHasLines ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed',
                                            deliveryHalf === 'gst' ? 'text-emerald-700' : 'text-amber-700',
                                          )}
                                          title={
                                            halfHasLines
                                              ? undefined
                                              : deliveryHalf === 'gst'
                                                ? 'No Tax Invoice lines to print'
                                                : 'No Bill of Supply lines to print'
                                          }
                                        >
                                          <Printer size={14} />{' '}
                                          {deliveryHalf === 'gst' ? 'Print Tax Invoice' : 'Print Bill of Supply'}
                                          {!halfHasLines && (
                                            <span className="ml-auto text-[10px] font-normal text-gray-400">none</span>
                                          )}
                                        </button>
                                      )}
                                      {canPrint && !useHalfTabs && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchActionsOpen(false);
                                            api.distribution
                                              .getBill(billParams(selectedBatch.batchId))
                                              .then(async bill => {
                                                const avail = deliveryPrintAvailability(bill);
                                                const paid = challanOptions(selectedVendorId!).fullyPaid;
                                                if (avail.isDual) {
                                                  await printDistributionDocs(bill, 'both', paid);
                                                } else if (avail.hasGst) {
                                                  await printDistributionDocs(bill, 'gst', paid);
                                                } else {
                                                  await printDistributionDocs(bill, 'bos', paid);
                                                }
                                              })
                                              .catch(err => toast(err.message, 'error'));
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-brand"
                                        >
                                          <Printer size={14} /> Print invoice(s)
                                        </button>
                                      )}
                                      {canPrint && !useHalfTabs && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchActionsOpen(false);
                                            api.distribution
                                              .getBill(billParams(selectedBatch.batchId))
                                              .then(bill => {
                                                const avail = deliveryPrintAvailability(bill);
                                                const paid = challanOptions(selectedVendorId!).fullyPaid;
                                                if (!avail.hasGst) {
                                                  toast('No Tax Invoice lines on this delivery', 'info');
                                                  return;
                                                }
                                                return printDistributionDocs(bill, 'gst', paid);
                                              })
                                              .catch(err => toast(err.message, 'error'));
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-emerald-700"
                                        >
                                          <Printer size={14} /> Print Tax Invoice
                                        </button>
                                      )}
                                      {canPrint && !useHalfTabs && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchActionsOpen(false);
                                            api.distribution
                                              .getBill(billParams(selectedBatch.batchId))
                                              .then(bill => {
                                                const avail = deliveryPrintAvailability(bill);
                                                const paid = challanOptions(selectedVendorId!).fullyPaid;
                                                if (!avail.hasBos) {
                                                  toast('No Bill of Supply lines on this delivery', 'info');
                                                  return;
                                                }
                                                return printDistributionDocs(bill, 'bos', paid);
                                              })
                                              .catch(err => toast(err.message, 'error'));
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-amber-700"
                                        >
                                          <Printer size={14} /> Print Bill of Supply
                                        </button>
                                      )}
                                      {canUseSplitBill && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchActionsOpen(false);
                                            api.distribution
                                              .getBill(billParams(selectedBatch.batchId))
                                              .then(bill => {
                                                setSplitBillModal({ bill });
                                                setSplitGstQty(
                                                  bill.savedGstUnits > 0
                                                    ? bill.savedGstUnits
                                                    : Math.ceil(bill.totalQuantity / 2),
                                                );
                                              })
                                              .catch(err => toast(err.message, 'error'));
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-purple-600"
                                        >
                                          <Package size={14} /> Adjust GST split
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBatchActionsOpen(false);
                                          api.distribution
                                            .getBill(billParams(selectedBatch.batchId))
                                            .then(async bill => {
                                              const avail = deliveryPrintAvailability(bill);
                                              const kind = avail.isDual ? 'both' : avail.hasGst ? 'gst' : 'bos';
                                              try {
                                                toast('Preparing PDF…', 'info');
                                                const { how, errorHint } = await shareDistributionDocsWhatsApp(
                                                  bill,
                                                  kind,
                                                );
                                                if (how === 'cancelled') return;
                                                toast(
                                                  whatsAppInvoiceShareToast(how, errorHint),
                                                  how === 'pdf_fallback' ? 'info' : 'success',
                                                );
                                              } catch (err) {
                                                toast((err as Error).message, 'error');
                                              }
                                            })
                                            .catch(err => toast(err.message, 'error'));
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-green-600"
                                      >
                                        <MessageCircle size={14} /> WhatsApp Challan
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBatchActionsOpen(false);
                                          api.distribution
                                            .getBill(billParams(selectedBatch.batchId))
                                            .then(bill => {
                                              const email = bill.vendor.email || '';
                                              if (!email) {
                                                toast('No vendor email on record — enter email manually', 'info');
                                              }
                                              shareViaEmail(
                                                email,
                                                `Distribution Challan ${bill.challanId} — ${bill.company.name}`,
                                                formatDistributionChallanText(bill),
                                              );
                                            })
                                            .catch(err => toast(err.message, 'error'));
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
                                      >
                                        <Mail size={14} /> Email Challan
                                      </button>
                                      {(!useHalfTabs || deliveryHalf === 'gst') && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchActionsOpen(false);
                                            fetch(`/api/distribution/einvoice?batchId=${selectedBatch.batchId}`, {
                                              headers: {
                                                Authorization: `Bearer ${session.getToken()}`,
                                                'X-Tenant-ID': session.getTenantId() || '',
                                              },
                                            })
                                              .then(r => r.json())
                                              .then(data => {
                                                const blob = new Blob([JSON.stringify(data, null, 2)], {
                                                  type: 'application/json',
                                                });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `E-Invoice-${selectedBatch.batchId}.json`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                                toast('E-Invoice JSON downloaded', 'success');
                                              })
                                              .catch(err => toast(err.message, 'error'));
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-indigo-600"
                                        >
                                          <Download size={14} /> E-Invoice JSON
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBatchActionsOpen(false);
                                          setEWayBillModal(selectedBatch.batchId);
                                          setEWayForm({
                                            vehicleNo: '',
                                            transportMode: 'Road',
                                            distance: '',
                                            transporterName: '',
                                            transporterId: '',
                                          });
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-teal-600"
                                      >
                                        <Truck size={14} /> E-Way Bill
                                      </button>
                                      {canEdit && batchCanDelete && (
                                        <>
                                          <div className="border-t border-gray-100 my-1" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setBatchActionsOpen(false);
                                              confirmDeleteBatch(selectedBatch.batchId);
                                            }}
                                            disabled={deleteSubmitting}
                                            className="w-full px-4 py-2 text-left text-sm hover:bg-rose-50 flex items-center gap-2 text-rose-600"
                                          >
                                            <Trash2 size={14} /> Delete
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  );
                                  return inPlaceNav ? createPortal(panel, document.body) : panel;
                                })()}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Half-tab status lives under the tabs (title → tabs → one status line → products). */}
                      {(!useHalfTabs || selectedProduct) && (
                        <div className={cn('text-right', inPlaceNav && 'shrink-0')}>
                          {selectedProduct ? (
                            <span className="text-sm text-gray-600">
                              <span className="font-medium">{selectedProduct.units.length}</span> unit
                              {selectedProduct.units.length !== 1 ? 's' : ''} •{' '}
                              <span className="text-emerald-600 font-medium">
                                {selectedProduct.units.filter(u => u.status === 'Sold').length}
                              </span>{' '}
                              sold
                              {selectedProduct.units.filter(u => u.status === 'Replaced').length > 0 && (
                                <>
                                  {' '}
                                  •{' '}
                                  <span className="text-amber-600 font-medium">
                                    {selectedProduct.units.filter(u => u.status === 'Replaced').length}
                                  </span>{' '}
                                  replaced
                                </>
                              )}
                              {selectedProduct.units.filter(u => u.status === 'Damaged').length > 0 && (
                                <>
                                  {' '}
                                  •{' '}
                                  <span className="text-rose-600 font-medium">
                                    {selectedProduct.units.filter(u => u.status === 'Damaged').length}
                                  </span>{' '}
                                  damaged
                                </>
                              )}
                              {' • '}
                              <span className="text-blue-600 font-medium">
                                {selectedProduct.units.filter(u => u.status === 'Distributed').length}
                              </span>{' '}
                              with vendor
                            </span>
                          ) : (
                            <>
                              <span className="text-sm text-gray-600 block">
                                <span className="font-medium">{selectedBatch.total}</span> distributed •{' '}
                                <span className="text-emerald-600 font-medium">{selectedBatch.sold}</span> sold
                                {selectedBatch.replaced > 0 && (
                                  <>
                                    {' '}
                                    • <span className="text-amber-600 font-medium">{selectedBatch.replaced}</span>{' '}
                                    replaced
                                  </>
                                )}
                                {selectedBatch.damaged > 0 && (
                                  <>
                                    {' '}
                                    • <span className="text-rose-600 font-medium">{selectedBatch.damaged}</span> damaged
                                  </>
                                )}
                                {' • '}
                                <span className="text-blue-600 font-medium">
                                  {selectedBatch.availableWithVendor}
                                </span>{' '}
                                with vendor
                              </span>
                              <span className="text-sm font-bold text-brand">
                                Bill: ₹{selectedBatch.billValue.toLocaleString()}
                              </span>
                              {selectedBatch.amountPaid > 0 && (
                                <span className="text-sm text-emerald-600 font-medium ml-2">
                                  Paid: ₹{selectedBatch.amountPaid.toLocaleString()}
                                </span>
                              )}
                              {selectedBatch.balanceRemaining > 0 && (
                                <span className="text-sm text-rose-500 font-medium ml-2">
                                  Due: ₹{selectedBatch.balanceRemaining.toLocaleString()}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {inPlaceNav && !selectedBatchProductId && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-gray-200/70">
                        {(() => {
                          const ds = ((selectedBatch as Record<string, unknown>).dispatchStatus as string) || 'pending';
                          return (
                            <>
                              {canPrint && ds === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    fetchApi(`/distribution/batch/${selectedBatch.batchId}/dispatch`, {
                                      method: 'PUT',
                                      body: JSON.stringify({ status: 'dispatched' }),
                                    })
                                      .then((d: Record<string, unknown>) => {
                                        if (d.ok) {
                                          toast('Marked as dispatched', 'success');
                                          load();
                                        } else toast(String(d.error), 'error');
                                      })
                                      .catch(err => toast(err.message, 'error'));
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                >
                                  <Truck size={12} /> Mark Dispatched
                                </button>
                              )}
                              {canPrint && ds === 'dispatched' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    fetchApi(`/distribution/batch/${selectedBatch.batchId}/dispatch`, {
                                      method: 'PUT',
                                      body: JSON.stringify({ status: 'delivered' }),
                                    })
                                      .then((d: Record<string, unknown>) => {
                                        if (d.ok) {
                                          toast('Marked as delivered', 'success');
                                          load();
                                        } else toast(String(d.error), 'error');
                                      })
                                      .catch(err => toast(err.message, 'error'));
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                >
                                  <Package size={12} /> Mark Delivered
                                </button>
                              )}
                              <input
                                type="text"
                                placeholder="EWB Number"
                                defaultValue={((selectedBatch as Record<string, unknown>).ewbNumber as string) || ''}
                                onBlur={e => {
                                  const val = e.target.value.trim();
                                  fetchApi(`/distribution/batch/${selectedBatch.batchId}/ewb`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ ewbNumber: val || null }),
                                  })
                                    .then(() => {
                                      if (val) toast('EWB number saved', 'success');
                                    })
                                    .catch(() => {});
                                }}
                                className="w-32 px-2 py-1 text-[11px] border border-gray-200 rounded-md font-mono focus:ring-2 focus:ring-brand"
                                maxLength={15}
                              />
                              {/* IRN / e-invoice only on Tax Invoice (GST) half */}
                              {deliveryHalf === 'gst' && (
                                <EInvoiceButtons
                                  batchId={selectedBatch.batchId}
                                  initialIrn={selectedBatch.irn}
                                  initialQr={selectedBatch.irnQr}
                                  initialEwb={selectedBatch.ewbNumber}
                                  quiet
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  {useHalfTabs && !selectedBatchProductId && (
                    <div className="px-6 pt-3 pb-3 border-b border-gray-100 space-y-2.5">
                      <div
                        className="inline-flex p-0.5 rounded-lg bg-gray-100 border border-gray-200"
                        role="tablist"
                        aria-label="Delivery document half"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={deliveryHalf === 'gst'}
                          onClick={() => {
                            setDeliveryHalf('gst');
                            setSelectedBatchProductId(null);
                          }}
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold rounded-md transition-colors',
                            deliveryHalf === 'gst'
                              ? 'bg-white text-emerald-800 shadow-sm'
                              : 'text-gray-600 hover:text-gray-800',
                          )}
                        >
                          GST (Tax Invoice)
                          <span className="ml-1 font-medium opacity-70">({batchGstUnits})</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={deliveryHalf === 'bos'}
                          onClick={() => {
                            setDeliveryHalf('bos');
                            setSelectedBatchProductId(null);
                          }}
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold rounded-md transition-colors',
                            deliveryHalf === 'bos'
                              ? 'bg-white text-slate-800 shadow-sm'
                              : 'text-gray-600 hover:text-gray-800',
                          )}
                        >
                          Non-GST (Bill of Supply)
                          <span className="ml-1 font-medium opacity-70">({batchNonGstUnits})</span>
                        </button>
                      </div>
                      {halfHasLines && (
                        <p className="text-sm text-gray-600 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span>
                            <span className="font-medium">{halfItems.length}</span>{' '}
                            {deliveryHalf === 'gst' ? 'GST' : 'non-GST'} unit
                            {halfItems.length !== 1 ? 's' : ''}
                            {' · '}
                            <span className="text-emerald-600 font-medium">{halfSold}</span> sold
                          </span>
                          <span className="font-bold text-brand">
                            {halfTotalLabel}: ₹{halfBillValue.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-500">
                            Delivery total ₹{selectedBatch.billValue.toLocaleString()}
                            {selectedBatch.balanceRemaining > 0 &&
                              ` · ₹${selectedBatch.balanceRemaining.toLocaleString()} due`}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  {!selectedBatchProductId ? (
                    !halfHasLines && useHalfTabs ? (
                      <div className="px-6 py-12 text-center text-sm text-gray-500">
                        {deliveryHalf === 'gst'
                          ? 'No Tax Invoice (GST) lines on this delivery'
                          : 'No Bill of Supply (non-GST) lines on this delivery'}
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        <div className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">
                          {useHalfTabs
                            ? deliveryHalf === 'gst'
                              ? 'Tax Invoice products'
                              : 'Bill of Supply products'
                            : 'Products'}
                        </div>
                        {productList.map(p => (
                          <button
                            key={p.productId}
                            type="button"
                            onClick={() => setSelectedBatchProductId(p.productId)}
                            className="w-full px-6 py-4 text-left hover:bg-gray-50 flex items-center justify-between transition-colors"
                          >
                            <span className="font-medium">{p.productName}</span>
                            <span className="text-sm text-gray-600">
                              <span className="font-medium">{p.total}</span> unit
                              {p.total !== 1 ? 's' : ''} • <span className="text-emerald-600">{p.sold} sold</span>
                              {p.replaced > 0 && <span className="text-amber-600"> • {p.replaced} replaced</span>}
                              {p.damaged > 0 && <span className="text-rose-600"> • {p.damaged} damaged</span>}
                              <span className="text-blue-600"> • {p.withVendor} with vendor</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  ) : selectedProduct ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50">
                            <th className="px-6 py-4">#</th>
                            <th className="px-6 py-4">Barcode</th>
                            <th className="px-6 py-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedProduct.units.map((d, idx) => (
                            <tr key={d.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm text-gray-500">{idx + 1}</td>
                              <td className="px-6 py-4 font-mono text-sm">{d.barcode}</td>
                              <td className="px-6 py-4">
                                <span
                                  className={cn(
                                    'text-xs font-bold px-2 py-0.5 rounded-full',
                                    d.status === 'Sold'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : d.status === 'Distributed'
                                        ? 'bg-blue-100 text-blue-700'
                                        : d.status === 'Replaced'
                                          ? 'bg-amber-100 text-amber-700'
                                          : d.status === 'Damaged'
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-gray-100 text-gray-700',
                                  )}
                                >
                                  {d.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            }

            const vendorFinance = financeMap[selectedVendorId!];
            const remindGate =
              !isVendorUser && !isServiceBiz && vendorFinance
                ? canSendPaymentReminder({
                    settings: reminderSettings,
                    balance: vendorFinance.balance,
                    phone: vendorFinance.vendorPhone,
                    lastSent: vendorFinance.lastSent,
                  })
                : { ok: false as const, reason: '' };
            const showRemindButton =
              !isVendorUser &&
              !isServiceBiz &&
              reminderSettings.enabled &&
              !!vendorFinance &&
              vendorFinance.balance > 0 &&
              !!vendorFinance.vendorPhone;

            if (desktopGlass) {
              return (
                <DesktopVendorSummaryGlass
                  vendorName={vendorName}
                  vendorPhone={vendorFinance?.vendorPhone || null}
                  vendorAddress={vendorAddress}
                  stats={stats ?? null}
                  outstanding={vendorFinance?.balance ?? 0}
                  batches={vendorBatches}
                  canCreate={!vendorId && canEdit}
                  onBack={() => {
                    setSelectedVendorId(null);
                    setSelectedBatchId(null);
                    setSelectedBatchProductId(null);
                  }}
                  onSelectBatch={batchId => {
                    const batch = vendorBatches.find(b => b.batchId === batchId);
                    const gu =
                      typeof batch?.gstUnits === 'number' ? batch.gstUnits : batch?.gstApplied ? batch.total : 0;
                    setSelectedBatchId(batchId);
                    setSelectedBatchProductId(null);
                    setDeliveryHalf(gu > 0 ? 'gst' : 'bos');
                  }}
                  onCreate={
                    !vendorId && canEdit
                      ? () => {
                          setCreateInitialVendorId(selectedVendorId!);
                          setModalOpen(true);
                        }
                      : null
                  }
                  remind={
                    showRemindButton && vendorFinance
                      ? {
                          show: true,
                          disabled: !remindGate.ok,
                          title: !remindGate.ok
                            ? remindGate.reason || 'Cannot send reminder'
                            : 'Send WhatsApp payment reminder',
                          balance: vendorFinance.balance,
                          onClick: () =>
                            sendVendorPaymentReminder({
                              vendorId: selectedVendorId!,
                              vendorName: vendorFinance.vendorName || vendorName,
                              vendorPhone: vendorFinance.vendorPhone!,
                              balance: vendorFinance.balance,
                              lastSent: vendorFinance.lastSent,
                            }),
                        }
                      : null
                  }
                />
              );
            }

            return (
              <div
                className={cn(
                  desktopGlass
                    ? 'dg-glass-card rounded-2xl overflow-hidden'
                    : 'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden',
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-between flex-wrap gap-3 px-6 py-4 border-b',
                    desktopGlass ? 'bg-[var(--dg-input)] border-[var(--dg-card-border)]' : 'bg-gray-50 border-gray-100',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVendorId(null);
                        setSelectedBatchId(null);
                        setSelectedBatchProductId(null);
                      }}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        desktopGlass ? 'hover:bg-[var(--dg-card-hover)]' : 'hover:bg-gray-200',
                      )}
                      title="Back to vendors"
                    >
                      <ArrowLeft size={20} className={desktopGlass ? 'dg-muted' : 'text-gray-600'} />
                    </button>
                    <h3 className={cn('font-bold text-lg', desktopGlass && 'dg-ink')}>{vendorName}</h3>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {stats && (
                      <span className="text-sm text-gray-600">
                        <span className="font-medium">{stats.distributed}</span> distributed •{' '}
                        <span className="text-emerald-600 font-medium">{stats.sold}</span> sold
                        {(stats.replaced ?? 0) > 0 && (
                          <>
                            {' '}
                            • <span className="text-amber-600 font-medium">{stats.replaced}</span> replacement
                            {(stats.replaced ?? 0) !== 1 ? 's' : ''}
                          </>
                        )}
                        {(stats.damaged ?? 0) > 0 && (
                          <>
                            {' '}
                            • <span className="text-rose-600 font-medium">{stats.damaged}</span> damaged
                          </>
                        )}
                        {' • '}
                        <span className="text-blue-600 font-medium">{stats.availableWithVendor}</span> with vendor
                      </span>
                    )}
                    {showRemindButton && (
                      <button
                        type="button"
                        disabled={!remindGate.ok}
                        title={
                          !remindGate.ok
                            ? remindGate.reason || 'Cannot send reminder'
                            : 'Send WhatsApp payment reminder'
                        }
                        onClick={() =>
                          sendVendorPaymentReminder({
                            vendorId: selectedVendorId!,
                            vendorName: vendorFinance.vendorName || vendorName,
                            vendorPhone: vendorFinance.vendorPhone!,
                            balance: vendorFinance.balance,
                            lastSent: vendorFinance.lastSent,
                          })
                        }
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold',
                          remindGate.ok
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed',
                        )}
                      >
                        <MessageCircle size={14} /> Remind payment
                        {vendorFinance.balance > 0 && (
                          <span className="opacity-90">· ₹{vendorFinance.balance.toLocaleString()}</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className={inPlaceNav ? 'p-4' : 'divide-y divide-gray-100'}>
                  <div
                    className={cn('text-xs font-bold text-gray-400 uppercase', inPlaceNav ? 'px-1 pb-3' : 'px-6 py-3')}
                  >
                    Distributions ({vendorBatches.length})
                  </div>
                  {vendorBatches.length === 0 ? (
                    <div className={cn('text-center text-gray-500', inPlaceNav ? 'py-6' : 'px-6 py-8')}>
                      No distributions for this vendor
                    </div>
                  ) : inPlaceNav ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {vendorBatches.map(batch => (
                        <button
                          key={batch.batchId}
                          type="button"
                          onClick={() => {
                            const gu =
                              typeof batch.gstUnits === 'number' ? batch.gstUnits : batch.gstApplied ? batch.total : 0;
                            setSelectedBatchId(batch.batchId);
                            setSelectedBatchProductId(null);
                            setDeliveryHalf(gu > 0 ? 'gst' : 'bos');
                          }}
                          className={cn(
                            'relative bg-white p-3 rounded-xl border text-left transition-all hover:shadow-md',
                            selectedBatchId === batch.batchId
                              ? 'border-brand ring-2 ring-brand/20'
                              : 'border-gray-200 hover:border-gray-300',
                            isBillFullyPaid(batch.billValue, batch.balanceRemaining) && 'opacity-70',
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">Distribution — {formatDate(batch.distributionDate)}</p>
                            {isBillFullyPaid(batch.billValue, batch.balanceRemaining) && <PaidBadge size="sm" />}
                          </div>
                          <div className="mt-1.5">
                            <DeliveryDocBadge batch={batch} size="sm" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {batch.total} item{batch.total !== 1 ? 's' : ''} • ₹{batch.billValue.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-600 mt-2">
                            <span className="text-emerald-600">{batch.sold} sold</span>
                            {batch.balanceRemaining > 0 && (
                              <span className="text-rose-500"> · ₹{batch.balanceRemaining.toLocaleString()} due</span>
                            )}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    vendorBatches.map(batch => (
                      <button
                        key={batch.batchId}
                        type="button"
                        onClick={() => {
                          const gu =
                            typeof batch.gstUnits === 'number' ? batch.gstUnits : batch.gstApplied ? batch.total : 0;
                          setSelectedBatchId(batch.batchId);
                          setSelectedBatchProductId(null);
                          setDeliveryHalf(gu > 0 ? 'gst' : 'bos');
                        }}
                        className={cn(
                          'w-full px-6 py-4 text-left hover:bg-gray-50 flex items-center justify-between gap-4 transition-colors',
                          isBillFullyPaid(batch.billValue, batch.balanceRemaining) && 'opacity-60',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">Distribution — {formatDate(batch.distributionDate)}</p>
                            {isBillFullyPaid(batch.billValue, batch.balanceRemaining) && <PaidBadge size="sm" />}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {batch.total} item{batch.total !== 1 ? 's' : ''} • ₹{batch.billValue.toLocaleString()}
                            {batch.amountPaid > 0 && !isBillFullyPaid(batch.billValue, batch.balanceRemaining) && (
                              <span className="text-emerald-600"> • ₹{batch.amountPaid.toLocaleString()} paid</span>
                            )}
                            {batch.balanceRemaining > 0 && (
                              <span className="text-rose-500"> • ₹{batch.balanceRemaining.toLocaleString()} due</span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm text-gray-600 shrink-0">
                          <span className="text-emerald-600">{batch.sold} sold</span>
                          {batch.replaced > 0 && <span className="text-amber-600"> • {batch.replaced} replaced</span>}
                          {batch.damaged > 0 && <span className="text-rose-600"> • {batch.damaged} damaged</span>}
                          {batch.availableWithVendor > 0 && (
                            <span className="text-blue-600"> • {batch.availableWithVendor} with vendor</span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })();

        // Non-service: tile click replaces the whole list with that vendor's distributions (Back restores tiles).
        if (inPlaceNav && !loading && selectedVendorId && selectedVendorContent) {
          return selectedVendorContent;
        }

        // Desktop glass list chrome is rendered above; only service modal remains here.
        if (desktopGlass) {
          if (isServiceBiz && !loading && selectedVendorId && selectedVendorContent) {
            return (
              <div className="fixed inset-0 z-[80]">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => {
                    setSelectedVendorId(null);
                    setSelectedBatchId(null);
                  }}
                />
                <div className="absolute top-[max(1rem,env(safe-area-inset-top,0px))] bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-4 right-4 lg:inset-6 lg:left-[calc(16rem+1.5rem)] overflow-y-auto rounded-2xl shadow-2xl bg-[var(--dg-bg)] border border-[var(--dg-card-border)]">
                  {selectedVendorContent}
                </div>
              </div>
            );
          }
          return null;
        }

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVendorStats.map(v => (
                <button
                  key={v.vendorId}
                  type="button"
                  onClick={() => {
                    setSelectedVendorId(v.vendorId);
                    setSelectedBatchId(null);
                    setSelectedBatchProductId(null);
                  }}
                  className={cn(
                    'relative bg-white p-4 rounded-xl border shadow-sm text-left transition-all cursor-pointer hover:shadow-md overflow-hidden',
                    isServiceBiz && selectedVendorId === v.vendorId
                      ? 'border-brand ring-2 ring-brand/30'
                      : 'border-gray-100',
                  )}
                >
                  {financeMap[v.vendorId] &&
                    isBillFullyPaid(financeMap[v.vendorId].totalDistributedValue, financeMap[v.vendorId].balance) && (
                      <div className="absolute top-2 right-2 z-10">
                        <PaidStamp className="text-[11px] px-2 py-1 scale-90" />
                      </div>
                    )}
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pr-16">{v.vendorName}</p>
                  <div className="mt-2 flex gap-4 text-sm flex-wrap">
                    <span>
                      <strong>{v.distributed}</strong> {isDirectSell ? 'sold' : 'distributed'}
                    </span>
                    {!isDirectSell && (
                      <span className="text-emerald-600">
                        <strong>{v.sold}</strong> sold
                      </span>
                    )}
                    {(v.replaced ?? 0) > 0 && (
                      <span className="text-amber-600">
                        <strong>{v.replaced}</strong> replacement{(v.replaced ?? 0) !== 1 ? 's' : ''}
                      </span>
                    )}
                    {(v.damaged ?? 0) > 0 && (
                      <span className="text-rose-600">
                        <strong>{v.damaged}</strong> damaged
                      </span>
                    )}
                    {!isDirectSell && (
                      <span className="text-blue-600">
                        <strong>{v.availableWithVendor}</strong> with vendor
                      </span>
                    )}
                  </div>
                  {financeMap[v.vendorId] &&
                    (() => {
                      const f = financeMap[v.vendorId];
                      return (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex gap-3 text-xs flex-wrap items-center">
                          <span className="text-gray-500">
                            Bill: <strong className="text-gray-700">₹{f.totalDistributedValue.toLocaleString()}</strong>
                          </span>
                          <span className="text-gray-500">
                            Paid: <strong className="text-emerald-600">₹{f.totalPaid.toLocaleString()}</strong>
                          </span>
                          {isBillFullyPaid(f.totalDistributedValue, f.balance) ? (
                            <PaidBadge size="sm" />
                          ) : (
                            <span className="text-gray-500">
                              Due: <strong className="text-rose-600">₹{f.balance.toLocaleString()}</strong>
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  <p className="text-xs text-gray-500 mt-1">Click to view distributions</p>
                </button>
              ))}
            </div>

            <div className="space-y-6">
              {loading && (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                  <LoadingSpinner />
                </div>
              )}
              {!loading && loadError && (
                <div className="bg-white rounded-xl border border-rose-200 p-12 text-center">
                  <p className="text-rose-600 font-medium mb-2">Failed to load distribution data</p>
                  <p className="text-sm text-gray-500 mb-4">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setLoadError(null);
                      load();
                    }}
                    className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
                  >
                    Retry
                  </button>
                </div>
              )}
              {isServiceBiz && !loading && !selectedVendorId && (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <p className="text-gray-500 mb-2">Click on a vendor tile above to see their distributions</p>
                  <p className="text-sm text-gray-400">
                    Each distribution event is listed separately with its own bill and actions
                  </p>
                </div>
              )}
              {isServiceBiz && !loading && selectedVendorId && selectedVendorContent && (
                <div className="fixed inset-0 z-[80]">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => {
                      setSelectedVendorId(null);
                      setSelectedBatchId(null);
                    }}
                  />
                  <div className="absolute top-[max(1rem,env(safe-area-inset-top,0px))] bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-4 right-4 lg:inset-6 lg:left-[calc(16rem+1.5rem)] bg-white overflow-y-auto rounded-2xl shadow-2xl">
                    {selectedVendorContent}
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      <AnimatePresence>
        {modalOpen && (
          <CreateDistributionModal
            businessType={businessType}
            defaultGstRate={defaultGstRate}
            initialVendorId={createInitialVendorId}
            onClose={() => {
              setModalOpen(false);
              setCreateInitialVendorId(undefined);
            }}
            onCreated={() => {
              setModalOpen(false);
              setCreateInitialVendorId(undefined);
              load();
            }}
          />
        )}
      </AnimatePresence>

      {/* Split Bill Modal */}
      <AnimatePresence>
        {splitBillModal &&
          canUseSplitBill &&
          (() => {
            const { bill } = splitBillModal;
            const totalQty = bill.totalQuantity;
            const gstQty = Math.min(Math.max(0, splitGstQty), totalQty);
            const nonGstQty = totalQty - gstQty;
            // Preview from slider (propose → Save); print/share always uses saved gstApplied flags
            const previewGstItems = bill.items.slice(0, gstQty);
            const previewNonGstItems = bill.items.slice(gstQty);
            const savedGstItems = bill.items.filter(i => i.gstApplied === true);
            const savedNonGstItems = bill.items.filter(i => i.gstApplied !== true);
            const hasSavedFlags = bill.items.some(i => typeof i.gstApplied === 'boolean');
            const gstItemsForPrint = hasSavedFlags ? savedGstItems : previewGstItems;
            const nonGstItemsForPrint = hasSavedFlags ? savedNonGstItems : previewNonGstItems;
            const gstSubtotal = previewGstItems.reduce((s, i) => s + i.price, 0);
            const nonGstSubtotal = previewNonGstItems.reduce((s, i) => s + i.price, 0);
            const gstRate = bill.gstRate || 18;
            const gstTax = gstQty > 0 ? Math.round((gstSubtotal * gstRate) / 100) : 0;
            const halfGst = Math.round(gstTax / 2);
            const gstGrandTotal = gstSubtotal + gstTax;
            const nonGstAmount = nonGstSubtotal;
            const combinedBillTotal = gstGrandTotal + nonGstAmount;
            const savedTotal = bill.totalBilled ?? null;
            const hasUnsavedChanges = savedTotal != null && Math.abs(savedTotal - combinedBillTotal) > 0.5;
            const dualDocs =
              bill.deliverySet?.isDualDocs || (bill.savedGstUnits > 0 && bill.savedGstUnits < bill.totalQuantity);
            const gstDocNo = bill.deliverySet?.gstDocNo || `${bill.challanId}-GST`;
            const bosDocNo = bill.deliverySet?.nonGstDocNo || `${bill.challanId}-BOS`;

            const makeSplitBill = (items: typeof bill.items, amount: number, docNo: string, stripIrn: boolean) => {
              const slice = buildDistributionBillSlice(bill, items, amount);
              return {
                ...slice,
                challanId: docNo,
                ...(stripIrn ? { irn: null, irnQr: null, irnAckNo: null, irnAckDt: null } : {}),
              };
            };

            return (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40" onClick={() => setSplitBillModal(null)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
                >
                  <h3 className="text-lg font-bold mb-1">Adjust GST split</h3>
                  <p className="text-sm text-gray-500 mb-2">
                    Prefer setting GST per line when creating a sale. Use this to rebalance an existing delivery: how
                    many units go on the Tax Invoice vs Bill of Supply. One payment outstanding applies to the whole
                    batch.
                  </p>
                  {dualDocs && (
                    <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-4">
                      Linked dual docs: <strong>{gstDocNo}</strong> (Tax Invoice) + <strong>{bosDocNo}</strong> (Bill of
                      Supply)
                    </p>
                  )}

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-gray-500">Total Units</span>
                      <span className="font-bold">{totalQty}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Product value (subtotal)</span>
                        <span className="font-medium">₹{bill.totalValue.toLocaleString()}</span>
                      </div>
                      {gstQty > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            + GST on {gstQty} unit{gstQty !== 1 ? 's' : ''} ({gstRate}%)
                          </span>
                          <span className="font-medium text-emerald-700">₹{gstTax.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-2">
                        <span className="font-bold text-gray-800">Total to collect</span>
                        <span className="font-bold text-brand text-base">₹{combinedBillTotal.toLocaleString()}</span>
                      </div>
                    </div>
                    {hasUnsavedChanges && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        Currently saved: ₹{savedTotal!.toLocaleString()} — click <strong>Save Amount</strong> below to
                        update to ₹{combinedBillTotal.toLocaleString()}
                      </p>
                    )}
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Units on GST bill</label>
                      <input
                        type="range"
                        min={0}
                        max={totalQty}
                        value={gstQty}
                        onChange={e => setSplitGstQty(parseInt(e.target.value, 10))}
                        className="w-full accent-brand"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0 (all non-GST)</span>
                        <span className="font-medium text-gray-700">
                          {gstQty} GST · {nonGstQty} non-GST
                        </span>
                        <span>{totalQty} (all GST)</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div
                      className={cn(
                        'p-4 rounded-xl border-2',
                        gstQty > 0 ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50',
                      )}
                    >
                      <p className="text-xs font-bold text-emerald-700 uppercase mb-2">GST Bill</p>
                      <p className="text-2xl font-bold text-emerald-700">₹{gstGrandTotal.toLocaleString()}</p>
                      <p className="text-sm text-gray-600 mt-1">{gstQty} units</p>
                      {gstQty > 0 && (
                        <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                          <p>Subtotal: ₹{gstSubtotal.toLocaleString()}</p>
                          <p>
                            CGST @{gstRate / 2}%: ₹{halfGst.toLocaleString()}
                          </p>
                          <p>
                            SGST @{gstRate / 2}%: ₹{(gstTax - halfGst).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        'p-4 rounded-xl border-2',
                        nonGstQty > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50',
                      )}
                    >
                      <p className="text-xs font-bold text-amber-700 uppercase mb-2">Non-GST Bill</p>
                      <p className="text-2xl font-bold text-amber-700">₹{nonGstAmount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600 mt-1">{nonGstQty} units</p>
                      <p className="text-xs text-gray-400 mt-2">No tax added</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg mb-3">
                    <strong>Total to collect</strong> = non-GST units at product price + GST units with {gstRate}% tax
                    included.
                  </p>
                  <button
                    type="button"
                    disabled={splitSaving || totalQty === 0}
                    onClick={async () => {
                      if (
                        hasUnsavedChanges &&
                        !(await confirm({
                          title: 'Change Amount',
                          message: `Amount was already saved as ₹${savedTotal!.toLocaleString()}. Change to ₹${combinedBillTotal.toLocaleString()}?`,
                          confirmLabel: 'Change',
                          variant: 'warning',
                        }))
                      )
                        return;
                      setSplitSaving(true);
                      try {
                        await api.distribution.applyBilling({
                          batchId: splitBillModal.bill.batchId ?? selectedBatchId!,
                          gstUnits: gstQty,
                          nonGstUnits: nonGstQty,
                          gstRate,
                        });
                        const batchIdForSplit = splitBillModal.bill.batchId ?? selectedBatchId!;
                        const updated = await api.distribution.getBill({
                          batchId: batchIdForSplit,
                          vendorId: selectedVendorId!,
                        });
                        setSplitBillModal({ bill: updated });
                        load();
                        toast(`Amount saved — collect ₹${combinedBillTotal.toLocaleString()} from vendor`, 'success');
                      } catch (err) {
                        toast((err as Error).message, 'error');
                      } finally {
                        setSplitSaving(false);
                      }
                    }}
                    className="w-full py-3 mb-3 bg-brand text-white rounded-xl font-bold text-sm hover:bg-[#e06f1f] disabled:opacity-60"
                  >
                    {splitSaving ? 'Saving...' : `Save Amount — ₹${combinedBillTotal.toLocaleString()}`}
                  </button>
                  {hasUnsavedChanges && (
                    <p className="text-xs text-amber-700 mb-2">
                      Save Amount first so print uses saved GST flags (not the slider preview).
                    </p>
                  )}
                  <div className="flex gap-2 mb-2">
                    {gstItemsForPrint.length > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          const w = openPrintWindow();
                          try {
                            const paidOpts = selectedVendorId
                              ? challanOptions(selectedVendorId)
                              : { showGst: true, fullyPaid: false };
                            const fresh =
                              selectedBatchId && selectedVendorId
                                ? await api.distribution.getBill({
                                    batchId: selectedBatchId,
                                    vendorId: selectedVendorId,
                                  })
                                : splitBillModal.bill;
                            const printGst = fresh.items.filter(i => i.gstApplied === true);
                            const printSub = printGst.reduce((s, i) => s + i.price, 0);
                            const docNo = fresh.deliverySet?.gstDocNo || `${fresh.challanId}-GST`;
                            const slice = {
                              ...makeSplitBill(printGst, printSub, docNo, false),
                              irn: fresh.irn,
                              irnQr: fresh.irnQr,
                              irnAckNo: fresh.irnAckNo,
                              irnAckDt: fresh.irnAckDt,
                              ewbNumber: fresh.ewbNumber,
                            };
                            const { billForPrint, opts } = await buildGstPrintOptions(slice, true, paidOpts.fullyPaid);
                            writePrintHtml(w, generateDistributionChallanHtml(billForPrint, opts), {
                              filename: `Tax-Invoice-${docNo}`,
                            });
                          } catch (err) {
                            try {
                              w?.close();
                            } catch {
                              /* ignore */
                            }
                            toast((err as Error).message, 'error');
                          }
                        }}
                        className="flex-1 py-2.5 border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-xl font-bold text-sm hover:bg-emerald-100"
                      >
                        Print Tax Invoice
                      </button>
                    )}
                    {nonGstItemsForPrint.length > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          const w = openPrintWindow();
                          try {
                            const paidOpts = selectedVendorId
                              ? challanOptions(selectedVendorId)
                              : { showGst: true, fullyPaid: false };
                            const fresh =
                              selectedBatchId && selectedVendorId
                                ? await api.distribution.getBill({
                                    batchId: selectedBatchId,
                                    vendorId: selectedVendorId,
                                  })
                                : splitBillModal.bill;
                            const printNon = fresh.items.filter(i => i.gstApplied !== true);
                            const printSub = printNon.reduce((s, i) => s + i.price, 0);
                            const docNo = fresh.deliverySet?.nonGstDocNo || `${fresh.challanId}-BOS`;
                            // Never attach IRN / e-invoice narrative to Bill of Supply half
                            const slice = {
                              ...makeSplitBill(printNon, printSub, docNo, true),
                              ewbNumber: fresh.ewbNumber,
                            };
                            const { billForPrint, opts } = await buildGstPrintOptions(slice, false, paidOpts.fullyPaid);
                            writePrintHtml(w, generateDistributionChallanHtml(billForPrint, opts), {
                              filename: `Bill-of-Supply-${docNo}`,
                            });
                          } catch (err) {
                            try {
                              w?.close();
                            } catch {
                              /* ignore */
                            }
                            toast((err as Error).message, 'error');
                          }
                        }}
                        className="flex-1 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl font-bold text-sm hover:bg-amber-100"
                      >
                        Print Bill of Supply
                      </button>
                    )}
                  </div>
                  {dualDocs && selectedVendorId && (
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          try {
                            toast('Preparing PDF…', 'info');
                            const { how, errorHint } = await shareDistributionDocsWhatsApp(bill, 'both');
                            if (how === 'cancelled') return;
                            toast(
                              whatsAppInvoiceShareToast(how, errorHint),
                              how === 'pdf_fallback' ? 'info' : 'success',
                            );
                          } catch (err) {
                            toast((err as Error).message, 'error');
                          }
                        })();
                      }}
                      className="w-full py-2.5 mb-2 border border-gray-200 rounded-xl font-medium text-sm hover:bg-gray-50"
                    >
                      WhatsApp both docs
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSplitBillModal(null)}
                    className="w-full py-2 border border-gray-200 rounded-xl font-medium text-sm"
                  >
                    Cancel
                  </button>
                </motion.div>
              </div>
            );
          })()}
      </AnimatePresence>

      {/* Edit Distribution Batch Modal — same columns as Record Sale / create */}
      <AnimatePresence>
        {editBatchModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setEditBatchModal(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-6xl rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-1">Edit Distribution</h3>
              <p className="text-sm text-gray-500 mb-4">
                {editBatchModal.vendorName} — set price and GST per line. Mixed GST / non-GST keeps Tax Invoice + Bill
                of Supply.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Customer / Vendor</label>
                  <input
                    type="text"
                    value={editBatchModal.vendorName}
                    readOnly
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto mb-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-3 w-8">#</th>
                      <th className="px-2 py-3 min-w-[200px]">Product</th>
                      <th className="px-2 py-3 w-24">Qty</th>
                      <th className="px-2 py-3 w-32">Price (₹)</th>
                      <th className="px-2 py-3 w-20">Disc%</th>
                      <th className="px-2 py-3 w-16 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span>GST</span>
                          <input
                            ref={editHeaderGstRef}
                            type="checkbox"
                            checked={editAllGst}
                            onChange={e => {
                              const on = e.target.checked;
                              setEditRows(prev =>
                                prev.map(r => {
                                  const p = products.find(x => x.id === r.productId);
                                  const rate = r.gstRate || p?.gstRate || defaultGstRate;
                                  const includes = r.priceIncludesGst || !!p?.priceIncludesGst;
                                  const current = parseFloat(String(r.customPrice)) || Number(p?.price) || 0;
                                  const nextPrice = adjustUnitPriceForGstToggle(current, {
                                    prevWithGst: r.withGst,
                                    nextWithGst: on,
                                    priceIncludesGst: includes,
                                    gstRate: rate,
                                  });
                                  return {
                                    ...r,
                                    withGst: on,
                                    customPrice: r.productId || r.customPrice ? String(nextPrice || '') : r.customPrice,
                                  };
                                }),
                              );
                            }}
                            className="rounded text-brand"
                            title={editAllGst ? 'All GST — uncheck for all non-GST' : 'Check for all GST'}
                            aria-label="All GST / All non-GST"
                          />
                        </div>
                      </th>
                      <th className="px-2 py-3 w-36 text-right">Billed (₹)</th>
                      <th className="px-2 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {editRows.map((row, idx) => {
                      const p = products.find(pr => pr.id === row.productId);
                      const m = editRowMoney(row);
                      return (
                        <tr key={row.isNew ? `new-${idx}` : row.productId} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2 text-sm font-medium">
                            {row.isNew ? (
                              <select
                                value={row.productId}
                                onChange={e => {
                                  const sel = products.find(pr => pr.id === e.target.value);
                                  const rate = sel?.gstRate ?? defaultGstRate;
                                  const includes = !!sel?.priceIncludesGst;
                                  const shown = sel
                                    ? displayUnitPriceForGst(sel.price, {
                                        withGst: row.withGst,
                                        priceIncludesGst: includes,
                                        gstRate: rate,
                                      })
                                    : 0;
                                  setEditRows(
                                    editRows.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            productId: e.target.value,
                                            productName: sel?.name || '',
                                            availableStock: sel?.stock ?? 0,
                                            priceIncludesGst: includes,
                                            gstRate: rate,
                                            customPrice: shown ? String(shown) : '',
                                          }
                                        : r,
                                    ),
                                  );
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                              >
                                <option value="">Select product...</option>
                                {products
                                  .filter(
                                    pr =>
                                      (pr.stock ?? 0) > 0 &&
                                      !editRows.some((r, ri) => ri !== idx && r.productId === pr.id),
                                  )
                                  .map(pr => (
                                    <option key={pr.id} value={pr.id}>
                                      {pr.name} — ₹{pr.price.toLocaleString()} ({pr.stock} avl)
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              row.productName
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={row.quantity || ''}
                              onChange={e => {
                                const v = e.target.value.replace(/[^0-9]/g, '');
                                updateEditRow(idx, 'quantity', v === '' ? 0 : parseInt(v, 10));
                              }}
                              className="w-16 min-w-[64px] px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand"
                            />
                            {!row.isNew && row.minQuantity > 0 && (
                              <p className="text-[10px] text-gray-400 mt-0.5">min {row.minQuantity}</p>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.customPrice}
                                onChange={e => {
                                  const v = e.target.value.replace(/[^0-9.]/g, '');
                                  updateEditRow(idx, 'customPrice', v);
                                }}
                                placeholder={p ? String(p.price) : '—'}
                                className="w-full pl-6 pr-2 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.discount || ''}
                              onChange={e => {
                                const v = e.target.value.replace(/[^0-9.]/g, '');
                                updateEditRow(idx, 'discount', v === '' ? 0 : parseFloat(v));
                              }}
                              placeholder="0"
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.withGst}
                              onChange={e => {
                                const next = e.target.checked;
                                setEditRows(prev =>
                                  prev.map((r, i) => {
                                    if (i !== idx) return r;
                                    const prod = products.find(x => x.id === r.productId);
                                    const rate = r.gstRate || prod?.gstRate || defaultGstRate;
                                    const includes = r.priceIncludesGst || !!prod?.priceIncludesGst;
                                    const current = parseFloat(String(r.customPrice)) || Number(prod?.price) || 0;
                                    const nextPrice = adjustUnitPriceForGstToggle(current, {
                                      prevWithGst: r.withGst,
                                      nextWithGst: next,
                                      priceIncludesGst: includes,
                                      gstRate: rate,
                                    });
                                    return {
                                      ...r,
                                      withGst: next,
                                      customPrice: String(nextPrice),
                                    };
                                  }),
                                );
                              }}
                              className="rounded text-brand"
                              aria-label={`GST for row ${idx + 1}`}
                            />
                          </td>
                          <td className="px-2 py-2 text-right font-bold whitespace-nowrap">
                            {m.billed > 0 ? (
                              <span>
                                {row.withGst && (
                                  <span className="text-[10px] text-gray-400 block">
                                    ₹{m.net.toLocaleString()} +GST
                                  </span>
                                )}
                                {!row.withGst && row.priceIncludesGst && (
                                  <span className="text-[10px] text-amber-600 block">excl. GST</span>
                                )}
                                <span className="text-base">₹{m.billed.toLocaleString()}</span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-1 py-2 text-center">
                            {row.isNew ? (
                              <button
                                type="button"
                                onClick={() => setEditRows(editRows.filter((_, i) => i !== idx))}
                                className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Remove"
                              >
                                ×
                              </button>
                            ) : row.minQuantity === 0 ? (
                              <button
                                type="button"
                                onClick={() => setRemoveConfirm({ idx, name: row.productName, qty: row.quantity })}
                                className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Remove product"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() =>
                      setEditRows([
                        ...editRows,
                        {
                          productId: '',
                          productName: '',
                          quantity: 1,
                          minQuantity: 0,
                          discount: 0,
                          withGst: true,
                          customPrice: '',
                          priceIncludesGst: false,
                          gstRate: defaultGstRate,
                          availableStock: 0,
                          isNew: true,
                        },
                      ])
                    }
                    className="flex-1 py-2 text-sm font-medium text-brand hover:bg-orange-50 transition-colors"
                  >
                    + Add Product Row
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Reduce quantity to return units to inventory. Cannot go below sold/replaced/damaged count.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Items</span>
                  <span className="font-bold">{editTotals.items}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Gross Value</span>
                  <span className="font-bold">₹{editTotals.gross.toLocaleString()}</span>
                </div>
                {editTotals.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="font-bold text-emerald-600">-₹{editTotals.discount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal (base)</span>
                  <span className="font-bold">₹{editTotals.net.toLocaleString()}</span>
                </div>
                {editTotals.gst > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">GST</span>
                    <span className="font-bold">₹{editTotals.gst.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="text-gray-700 font-medium">Total Billed Amount</span>
                  <span className="font-bold text-lg text-brand">₹{editTotals.billed.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {editBatchModal.canDelete && (
                  <button
                    type="button"
                    disabled={deleteSubmitting || editSubmitting}
                    onClick={() => confirmDeleteBatch(editBatchModal.batchId)}
                    className="px-4 py-2.5 border border-rose-200 text-rose-600 rounded-xl font-medium hover:bg-rose-50 disabled:opacity-60"
                  >
                    {deleteSubmitting ? 'Deleting...' : 'Delete'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditBatchModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={editSubmitting}
                  onClick={async () => {
                    setEditSubmitting(true);
                    try {
                      const result = await api.distribution.updateBatch(editBatchModal.batchId, {
                        distributionDate: editDate,
                        gstRate: defaultGstRate,
                        items: editRows
                          .filter(r => r.productId && !(r.isNew && r.quantity === 0))
                          .map(r => ({
                            productId: r.productId,
                            quantity: r.quantity,
                            discountPercent: r.discount,
                            withGst: r.withGst,
                            ...(r.customPrice !== '' && r.customPrice != null
                              ? { customPrice: parseFloat(r.customPrice) }
                              : {}),
                          })),
                      });
                      setEditBatchModal(null);
                      if ((result as { deleted?: boolean }).deleted) {
                        setSelectedBatchId(null);
                        setSelectedBatchProductId(null);
                      }
                      load();
                      toast('Distribution updated', 'success');
                    } catch (err) {
                      toast((err as Error).message, 'error');
                    } finally {
                      setEditSubmitting(false);
                    }
                  }}
                  className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {deleteBatchConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteBatchConfirm(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-bold mb-2">Delete Distribution?</h3>
            <p className="text-sm text-gray-500 mb-6">
              All unsold units will return to inventory. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteBatchConfirm(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBatch(deleteBatchConfirm)}
                disabled={deleteSubmitting}
                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-sm disabled:opacity-60"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {removeConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRemoveConfirm(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-bold mb-2">Remove Product?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Remove <strong>{removeConfirm.name}</strong> from this distribution? {removeConfirm.qty} unit
              {removeConfirm.qty !== 1 ? 's' : ''} will return to inventory.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRemoveConfirm(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditRows(editRows.map((r, i) => (i === removeConfirm.idx ? { ...r, quantity: 0 } : r)));
                  setRemoveConfirm(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {batchPaymentModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBatchPaymentModal(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <IndianRupee size={28} />
            </div>
            <h3 className="text-lg font-bold text-center mb-1">Record Payment</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              Bill: ₹{batchPaymentModal.billValue.toLocaleString()} • Due: ₹
              {batchPaymentModal.balanceRemaining.toLocaleString()}
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const amt = parseFloat(batchPaymentForm.amount);
                if (!amt || amt <= 0) {
                  toast('Enter a valid amount', 'error');
                  return;
                }
                setBatchPaymentSubmitting(true);
                api.vendorFinance
                  .recordPayment(batchPaymentModal.vendorId, {
                    amount: amt,
                    paymentDate: batchPaymentForm.paymentDate,
                    paymentMethod: batchPaymentForm.paymentMethod,
                    referenceNumber: batchPaymentForm.referenceNumber || undefined,
                    notes: batchPaymentForm.notes || undefined,
                    batchId: batchPaymentModal.batchId,
                  })
                  .then(() => {
                    setBatchPaymentModal(null);
                    load();
                    toast('Payment recorded', 'success');
                  })
                  .catch(err => toast(err.message, 'error'))
                  .finally(() => setBatchPaymentSubmitting(false));
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
                  value={batchPaymentForm.amount}
                  onChange={e => setBatchPaymentForm({ ...batchPaymentForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={batchPaymentForm.paymentDate}
                    onChange={e => setBatchPaymentForm({ ...batchPaymentForm, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                  <select
                    value={batchPaymentForm.paymentMethod}
                    onChange={e => setBatchPaymentForm({ ...batchPaymentForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Transaction ID</label>
                <input
                  type="text"
                  value={batchPaymentForm.referenceNumber}
                  onChange={e => setBatchPaymentForm({ ...batchPaymentForm, referenceNumber: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={batchPaymentForm.notes}
                  onChange={e => setBatchPaymentForm({ ...batchPaymentForm, notes: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBatchPaymentModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={batchPaymentSubmitting}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-60"
                >
                  {batchPaymentSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* E-Way Bill Modal */}
      {eWayBillModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEWayBillModal(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6"
          >
            <h3 className="text-lg font-bold mb-1">Generate E-Way Bill</h3>
            <p className="text-sm text-gray-500 mb-2">Fill transport details to generate E-Way Bill JSON.</p>
            <p className="text-[10px] text-gray-400 mb-4">
              Upload at ewaybillgst.gov.in → Login → E-Waybill → Generate Bulk → Upload JSON
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vehicle Number *</label>
                <input
                  required
                  value={eWayForm.vehicleNo}
                  onChange={e => setEWayForm({ ...eWayForm, vehicleNo: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                  placeholder="GJ 03 XX 1234"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transport Mode</label>
                  <select
                    value={eWayForm.transportMode}
                    onChange={e => setEWayForm({ ...eWayForm, transportMode: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                  >
                    <option>Road</option>
                    <option>Rail</option>
                    <option>Air</option>
                    <option>Ship</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Distance (km) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={eWayForm.distance}
                    onChange={e => setEWayForm({ ...eWayForm, distance: e.target.value.replace(/[^0-9]/g, '') })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    placeholder="150"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transporter Name</label>
                <input
                  value={eWayForm.transporterName}
                  onChange={e => setEWayForm({ ...eWayForm, transporterName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transporter GSTIN / ID</label>
                <input
                  value={eWayForm.transporterId}
                  onChange={e => setEWayForm({ ...eWayForm, transporterId: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                  placeholder="Optional"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEWayBillModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!eWayForm.vehicleNo || !eWayForm.distance}
                  onClick={() => {
                    fetch(
                      `/api/distribution/ewaybill?batchId=${eWayBillModal}&vehicleNo=${encodeURIComponent(eWayForm.vehicleNo)}&transportMode=${eWayForm.transportMode}&distance=${eWayForm.distance}&transporterName=${encodeURIComponent(eWayForm.transporterName)}&transporterId=${encodeURIComponent(eWayForm.transporterId)}`,
                      {
                        headers: {
                          Authorization: `Bearer ${session.getToken()}`,
                          'X-Tenant-ID': session.getTenantId() || '',
                        },
                      },
                    )
                      .then(r => r.json())
                      .then(data => {
                        if (data.error) {
                          toast(data.error, 'error');
                          return;
                        }
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `E-Way-Bill-${eWayBillModal}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setEWayBillModal(null);
                        toast('E-Way Bill JSON downloaded', 'success');
                      })
                      .catch(err => toast(err.message, 'error'));
                  }}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm disabled:opacity-60"
                >
                  Download E-Way Bill
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      <ConfirmRenderer />
    </motion.div>
  );
}
