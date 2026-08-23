import React, { useEffect, useState } from 'react';
import { Download, FileCheck, QrCode, Truck, Upload, XCircle } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../ui';
import { EInvoiceQrImage } from '../ui/EInvoiceQrImage';
import { resolveIrnQrPayload, cn } from '../../lib/utils';
import { normalizeEinvoiceMode, type EinvoiceMode } from '../../../shared/gstEinvoiceMode';
import {
  EwbGenerateModal,
  defaultEwbForm,
  ewbFormToTransportPayload,
  validateEwbForm,
  type EwbFormState,
} from './EwbGenerateModal';
import { GstPortalImportResponseModal } from './GstPortalImportResponseModal';
import { GstPortalFileModal, type PortalFilingKind } from './GstPortalFileModal';
import { GstCancelGstModal } from './GstCancelGstModal';
import { GstPortalClearFilingModal } from './GstPortalClearFilingModal';

type BaseProps = {
  initialIrn?: string | null;
  initialQr?: string | null;
  initialEwb?: string | null;
  quiet?: boolean;
  fromPin?: string;
  toPin?: string;
  ewbWithEinvoice?: boolean;
};

type InvoiceProps = BaseProps & {
  kind: 'invoice';
  id: string;
  onUpdated?: (patch: {
    irn?: string;
    irnAckNo?: string;
    irnAckDt?: string;
    irnQr?: string;
    ewbNumber?: string;
  }) => void;
};

type BatchProps = BaseProps & {
  kind: 'batch';
  id: string;
  onUpdated?: (patch: { irn?: string; irnQr?: string; ewbNumber?: string }) => void;
};

const TRANSPORT_LABEL: Record<string, string> = { '1': 'Road', '2': 'Rail', '3': 'Air', '4': 'Ship' };

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function GstEinvoiceToolbar(props: InvoiceProps | BatchProps) {
  const { toast } = useToast();
  const [einvoiceMode, setEinvoiceMode] = useState<EinvoiceMode>('api');
  const [modeLoading, setModeLoading] = useState(true);
  const [ewbWithEinvoice, setEwbWithEinvoice] = useState(!!props.ewbWithEinvoice);
  const [sellerPin, setSellerPin] = useState(props.fromPin || '');
  const [irn, setIrn] = useState(props.initialIrn || '');
  const [qr, setQr] = useState(() => resolveIrnQrPayload({ irnQr: props.initialQr, qrCode: props.initialQr }));
  const [ewbNo, setEwbNo] = useState(props.initialEwb || '');
  const [generating, setGenerating] = useState<'irn' | 'ewb' | 'combo' | null>(null);
  const [showEwbModal, setShowEwbModal] = useState(false);
  const [ewbByIrn, setEwbByIrn] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showImportResponse, setShowImportResponse] = useState(false);
  const [cancelModal, setCancelModal] = useState<'irn' | 'ewb' | null>(null);
  const [showClearFiling, setShowClearFiling] = useState(false);
  const [showPortalFile, setShowPortalFile] = useState(false);
  const [portalFilingKind, setPortalFilingKind] = useState<PortalFilingKind>('combined');
  const [ewbForm, setEwbForm] = useState<EwbFormState>(defaultEwbForm());
  const [ewbCombinedEinvoice, setEwbCombinedEinvoice] = useState(false);

  useEffect(() => {
    api.gst
      .getSettings()
      .then(s => {
        setEinvoiceMode(normalizeEinvoiceMode(s.einvoiceMode));
        if (props.ewbWithEinvoice === undefined) setEwbWithEinvoice(!!s.ewbWithEinvoice);
        setPortalFilingKind(s.ewbWithEinvoice !== false ? 'combined' : 'invoice');
        if (!props.fromPin && s.sellerPin) setSellerPin(s.sellerPin);
      })
      .catch(() => {})
      .finally(() => setModeLoading(false));
  }, [props.ewbWithEinvoice, props.fromPin]);

  useEffect(() => {
    if (props.fromPin) setSellerPin(props.fromPin);
  }, [props.fromPin]);

  useEffect(() => {
    setIrn(props.initialIrn || '');
    setQr(resolveIrnQrPayload({ irnQr: props.initialQr, qrCode: props.initialQr }));
    setEwbNo(props.initialEwb || '');
  }, [props.id, props.initialIrn, props.initialQr, props.initialEwb]);

  const btn = (active: boolean) =>
    props.quiet
      ? 'flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 bg-transparent hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-50'
      : cn(
          'flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors disabled:opacity-50',
          active ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-teal-600 bg-teal-50 hover:bg-teal-100',
        );

  const transportLabel = () => TRANSPORT_LABEL[ewbForm.transportMode] || 'Road';

  async function downloadEinvoiceJson(transport?: ReturnType<typeof ewbFormToTransportPayload>) {
    setGenerating('irn');
    try {
      const data =
        props.kind === 'invoice'
          ? await api.gst.downloadInvoiceEinvoiceJson(props.id, transport)
          : await api.gst.downloadBatchEinvoiceJson(props.id);
      const validation = (data as { _validation?: { valid?: boolean; errors?: string[]; warnings?: string[] } })
        ._validation;
      if (validation?.warnings?.length) toast(`Note: ${validation.warnings[0]}`, 'success');
      if (validation && !validation.valid) {
        toast(validation.errors?.[0] || 'Fix validation errors before filing', 'error');
        return;
      }
      const combined = !!transport;
      downloadJsonFile(`E-Invoice${combined ? '-with-EWB' : ''}-${props.id}.json`, data);
      setShowPortalFile(false);
      setShowEwbModal(false);
      toast(
        combined
          ? 'Combined JSON downloaded — upload once on einvoice1.gst.gov.in, then Import response'
          : 'E-Invoice JSON downloaded — upload on einvoice1.gst.gov.in, then Import response',
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function downloadCombinedEinvoiceJson() {
    const err = validateEwbForm(ewbForm);
    if (err) {
      toast(err, 'error');
      return;
    }
    await downloadEinvoiceJson(ewbFormToTransportPayload(ewbForm));
  }

  function openPortalFileModal() {
    setPortalFilingKind(ewbWithEinvoice ? 'combined' : 'invoice');
    setShowPortalFile(true);
  }

  function openCombinedTransport() {
    setShowPortalFile(false);
    setEwbCombinedEinvoice(true);
    setEwbByIrn(false);
    setEwbForm(defaultEwbForm());
    setShowEwbModal(true);
  }

  function openEwayOnlyModal() {
    setShowPortalFile(false);
    setEwbCombinedEinvoice(false);
    setEwbByIrn(!!irn);
    setEwbForm(defaultEwbForm());
    setShowEwbModal(true);
  }

  async function downloadEwaybillJson() {
    const err = validateEwbForm(ewbForm);
    if (err) {
      toast(err, 'error');
      return;
    }
    setGenerating('ewb');
    try {
      const payload = {
        ...ewbFormToTransportPayload(ewbForm),
        ...(props.kind === 'invoice' ? { invoiceId: props.id } : { batchId: props.id }),
      };
      const data =
        props.kind === 'invoice'
          ? await api.gst.downloadInvoiceEwaybillJson(
              payload as Parameters<typeof api.gst.downloadInvoiceEwaybillJson>[0],
            )
          : await api.gst.downloadBatchEwaybillJson(payload as Parameters<typeof api.gst.downloadBatchEwaybillJson>[0]);
      const validation = (data as { _validation?: { valid?: boolean; errors?: string[]; warnings?: string[] } })
        ._validation;
      if (validation?.warnings?.length) toast(`Note: ${validation.warnings[0]}`, 'success');
      if (validation && !validation.valid) {
        toast(validation.errors?.[0] || 'Fix validation errors before download', 'error');
        return;
      }
      downloadJsonFile(`E-Way-Bill-${props.id}.json`, data);
      setShowEwbModal(false);
      toast('E-Way Bill JSON downloaded — upload on ewaybillgst.gov.in', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function submitImportResponse(response: unknown) {
    setGenerating('irn');
    try {
      if (props.kind === 'invoice') {
        const r = await api.gst.importInvoicePortalResponse({ invoiceId: props.id, response });
        if (r.irn) setIrn(r.irn);
        if (r.irnQr) setQr(resolveIrnQrPayload({ irnQr: r.irnQr }));
        if (r.ewbNumber) setEwbNo(r.ewbNumber);
        props.onUpdated?.({
          irn: r.irn,
          irnAckNo: r.ackNo,
          irnAckDt: r.ackDt,
          irnQr: r.irnQr,
          ewbNumber: r.ewbNumber,
        });
      } else {
        const r = await api.gst.importBatchPortalResponse({ batchId: props.id, response });
        if (r.irn) setIrn(r.irn);
        if (r.ewbNumber) setEwbNo(r.ewbNumber);
        props.onUpdated?.({ irn: r.irn, ewbNumber: r.ewbNumber });
      }
      setShowImportResponse(false);
      toast('Portal response imported — IRN, QR, and E-Way updated', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function clearPortalFiling(scope: 'irn' | 'ewb' | 'all') {
    setGenerating('irn');
    try {
      if (props.kind === 'invoice') {
        await api.gst.clearInvoiceGstFiling({ invoiceId: props.id, scope });
      } else {
        await api.gst.clearBatchGstFiling({ batchId: props.id, scope });
      }
      if (scope === 'all' || scope === 'irn') {
        setIrn('');
        setQr('');
      }
      if (scope === 'all' || scope === 'ewb') setEwbNo('');
      props.onUpdated?.({
        ...(scope === 'all' || scope === 'irn' ? { irn: '', irnQr: '' } : {}),
        ...(scope === 'all' || scope === 'ewb' ? { ewbNumber: '' } : {}),
      });
      setShowClearFiling(false);
      toast('Filing data cleared from Dhandho', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Clear failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function confirmCancel(reason: number, remark: string) {
    if (!cancelModal) return;
    setGenerating(cancelModal === 'irn' ? 'irn' : 'ewb');
    try {
      if (cancelModal === 'irn' && irn) {
        await api.gst.cancelIrn(irn, reason, remark);
        setIrn('');
        setQr('');
        setEwbNo('');
        props.onUpdated?.({ irn: '', irnQr: '', ewbNumber: '' });
        toast('IRN cancelled on NIC — use a new invoice number for re-filing', 'success');
      } else if (cancelModal === 'ewb' && ewbNo) {
        const payload =
          props.kind === 'invoice'
            ? { ewbNumber: ewbNo, reason, remark, invoiceId: props.id }
            : { ewbNumber: ewbNo, reason, remark, batchId: props.id };
        await api.gst.cancelEwb(payload);
        setEwbNo('');
        props.onUpdated?.({ ewbNumber: '' });
        toast('E-Way Bill cancelled — you can generate again on same invoice', 'success');
      }
      setCancelModal(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Cancel failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function generateIrn() {
    setGenerating('irn');
    try {
      if (props.kind === 'invoice') {
        const r = await api.gst.generateInvoiceIrn(props.id);
        const nextQr = resolveIrnQrPayload(r);
        setIrn(r.irn);
        setQr(nextQr);
        if (r.ewbNo) setEwbNo(r.ewbNo);
        props.onUpdated?.({
          irn: r.irn,
          irnAckNo: r.ackNo,
          irnAckDt: r.ackDt,
          irnQr: nextQr || r.signedQrCode || r.qrCode,
          ...(r.ewbNo ? { ewbNumber: r.ewbNo } : {}),
        });
      } else {
        const r = await api.gst.generateIrn(props.id);
        setIrn(r.irn);
        setQr(resolveIrnQrPayload(r));
        if (r.ewbNo) setEwbNo(r.ewbNo);
        props.onUpdated?.({ irn: r.irn, irnQr: resolveIrnQrPayload(r), ...(r.ewbNo ? { ewbNumber: r.ewbNo } : {}) });
      }
      toast(`E-Invoice generated`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'IRN generation failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function submitEwb() {
    const err = validateEwbForm(ewbForm);
    if (err) {
      toast(err, 'error');
      return;
    }
    setGenerating('ewb');
    try {
      const t = ewbFormToTransportPayload(ewbForm);
      const payload = {
        vehicleNo: t.vehicleNo,
        distance: t.distance,
        transportMode: t.transportMode,
        transporterName: t.transporterName,
        transporterId: t.transporterId,
      };
      let ewbResult: { ewbNo: string };
      if (props.kind === 'invoice') {
        ewbResult = ewbByIrn
          ? await api.gst.generateInvoiceEwbByIrn({ invoiceId: props.id, ...payload })
          : await api.gst.generateInvoiceEwb({ invoiceId: props.id, ...payload });
      } else {
        ewbResult = await api.gst.generateEwb({ batchId: props.id, ...payload });
      }
      setEwbNo(ewbResult.ewbNo);
      props.onUpdated?.({ ewbNumber: ewbResult.ewbNo });
      setShowEwbModal(false);
      toast(`E-Way Bill ${ewbResult.ewbNo}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'EWB generation failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function generateCombo() {
    const err = validateEwbForm(ewbForm);
    if (err) {
      setEwbByIrn(false);
      setShowEwbModal(true);
      return;
    }
    setGenerating('combo');
    try {
      const t = ewbFormToTransportPayload(ewbForm);
      if (props.kind === 'invoice') {
        const r = await api.gst.generateInvoiceIrnAndEwb({
          invoiceId: props.id,
          vehicleNo: t.vehicleNo,
          distance: t.distance,
          transportMode: transportLabel(),
          transporterName: t.transporterName,
          transporterId: t.transporterId,
        });
        const nextQr = resolveIrnQrPayload(r);
        setIrn(r.irn);
        setQr(nextQr);
        setEwbNo(r.ewbNo);
        props.onUpdated?.({
          irn: r.irn,
          irnAckNo: r.ackNo,
          irnAckDt: r.ackDt,
          irnQr: nextQr || r.signedQrCode || r.qrCode,
          ewbNumber: r.ewbNo,
        });
      } else {
        await generateIrn();
        await submitEwb();
      }
      toast('E-Invoice and E-Way Bill generated', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Combined generation failed', 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function openEwbModal(byIrn: boolean) {
    if (!sellerPin && !props.fromPin) {
      try {
        const s = await api.gst.getSettings();
        if (s.sellerPin) setSellerPin(s.sellerPin);
      } catch {
        /* ignore */
      }
    }
    setEwbByIrn(byIrn);
    setEwbForm(defaultEwbForm());
    setShowEwbModal(true);
  }

  const statusChip = irn ? (
    <div
      className={
        props.quiet
          ? 'flex items-center gap-2 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-[11px]'
          : 'flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs'
      }
    >
      <QrCode size={13} className={props.quiet ? 'text-gray-500 shrink-0' : 'text-indigo-600 shrink-0'} />
      <span
        className={cn('font-mono truncate max-w-[120px]', props.quiet ? 'text-gray-600' : 'text-indigo-700')}
        title={irn}
      >
        IRN: {irn.slice(0, 12)}…
      </span>
      {qr ? (
        <button
          type="button"
          onClick={() => setShowQrModal(true)}
          className="text-indigo-600 hover:underline text-[10px]"
        >
          QR
        </button>
      ) : null}
    </div>
  ) : null;

  if (modeLoading) return null;

  if (einvoiceMode === 'portal') {
    return (
      <>
        <button type="button" onClick={openPortalFileModal} disabled={!!generating} className={btn(true)}>
          <Download size={13} /> {generating === 'irn' ? 'Downloading…' : 'File on portal'}
        </button>
        <button
          type="button"
          onClick={() => setShowImportResponse(true)}
          disabled={!!generating}
          className={btn(false)}
        >
          <Upload size={13} /> {irn ? 'Update response' : 'Import response'}
        </button>
        {ewbNo ? (
          <span
            className={props.quiet ? 'text-[11px] text-gray-500 font-mono' : 'text-xs text-teal-700 font-mono px-1'}
          >
            EWB …{ewbNo.slice(-4)}
          </span>
        ) : null}
        {(irn || ewbNo) && (
          <button
            type="button"
            onClick={() => setShowClearFiling(true)}
            disabled={!!generating}
            className={btn(false)}
            title="After cancelling on govt portal, clear IRN/EWB stored in Dhandho"
          >
            <XCircle size={13} /> Clear filing
          </button>
        )}
        {statusChip}
        <GstPortalFileModal
          open={showPortalFile}
          generating={generating === 'irn'}
          filingKind={portalFilingKind}
          onFilingKindChange={setPortalFilingKind}
          onClose={() => setShowPortalFile(false)}
          onDownloadInvoiceOnly={() => void downloadEinvoiceJson()}
          onContinueCombined={openCombinedTransport}
          showEwayOnly={props.kind === 'invoice' || !!irn}
          onEwayOnly={openEwayOnlyModal}
        />
        <EwbGenerateModal
          open={showEwbModal}
          generating={generating === 'ewb' || generating === 'irn'}
          form={ewbForm}
          onChange={setEwbForm}
          onClose={() => setShowEwbModal(false)}
          onSubmit={() => void (ewbCombinedEinvoice ? downloadCombinedEinvoiceJson() : downloadEwaybillJson())}
          fromPin={sellerPin || props.fromPin}
          toPin={props.toPin}
          showIrnHint={ewbByIrn}
          title={ewbCombinedEinvoice ? 'Invoice + E-Way (one JSON)' : 'Download E-Way Bill JSON'}
          submitLabel={
            generating === 'irn' || generating === 'ewb'
              ? 'Downloading…'
              : ewbCombinedEinvoice
                ? 'Download combined JSON'
                : 'Download JSON'
          }
          portalHint={
            ewbCombinedEinvoice
              ? 'Upload once on einvoice1.gst.gov.in — IRN and E-Way are generated together'
              : 'Upload at ewaybillgst.gov.in → E-Waybill → Generate Bulk → Upload JSON'
          }
        />
        <GstPortalImportResponseModal
          open={showImportResponse}
          saving={generating === 'irn'}
          onClose={() => setShowImportResponse(false)}
          onImport={r => void submitImportResponse(r)}
        />
        <GstPortalClearFilingModal
          open={showClearFiling}
          saving={generating === 'irn'}
          hasIrn={!!irn}
          hasEwb={!!ewbNo}
          onClose={() => setShowClearFiling(false)}
          onConfirm={s => void clearPortalFiling(s)}
        />
        <GstCancelGstModal
          open={!!cancelModal}
          kind={cancelModal || 'irn'}
          saving={!!generating}
          hasEwb={!!ewbNo}
          onClose={() => setCancelModal(null)}
          onConfirm={(r, m) => void confirmCancel(r, m)}
        />
        {showQrModal && qr ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={e => {
              if (e.target === e.currentTarget) setShowQrModal(false);
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
              <h3 className="font-bold text-lg mb-4 flex items-center justify-center gap-2">
                <QrCode size={20} className="text-indigo-600" /> E-Invoice QR
              </h3>
              <EInvoiceQrImage qrCode={qr} size={240} className="mx-auto rounded-lg border border-gray-100" />
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="mt-5 w-full py-2.5 border border-gray-200 rounded-xl font-medium"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void generateIrn()}
        disabled={!!generating}
        className={btn(true)}
        title="Generate E-Invoice IRN via API"
      >
        <FileCheck size={13} /> {generating === 'irn' ? 'Generating…' : irn ? 'Re-IRN' : 'E-Invoice'}
      </button>
      {ewbWithEinvoice && !ewbNo ? (
        <button
          type="button"
          onClick={() => void openEwbModal(false)}
          disabled={!!generating}
          className={btn(false)}
          title="Generate E-Invoice and E-Way Bill together"
        >
          <Truck size={13} /> {generating === 'combo' ? 'Generating…' : 'E-Inv + EWB'}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => openEwbModal(!!irn && !ewbNo)}
        disabled={!!generating}
        className={btn(false)}
        title={irn && !ewbNo ? 'Generate E-Way Bill by IRN' : 'Generate E-Way Bill'}
      >
        <Truck size={13} /> {ewbNo ? `EWB ${ewbNo.slice(-4)}` : irn ? 'EWB by IRN' : 'E-Way Bill'}
      </button>
      {ewbNo ? (
        <button
          type="button"
          onClick={() => setCancelModal('ewb')}
          disabled={!!generating}
          className={btn(false)}
          title="Cancel within 24h via NIC API"
        >
          <XCircle size={13} /> Cancel EWB
        </button>
      ) : null}
      {irn ? (
        <button
          type="button"
          onClick={() => setCancelModal('irn')}
          disabled={!!generating}
          className={btn(false)}
          title="Cancel IRN within 24h — cancel EWB first if present"
        >
          <XCircle size={13} /> Cancel IRN
        </button>
      ) : null}
      {statusChip}
      <EwbGenerateModal
        open={showEwbModal}
        generating={generating === 'ewb' || generating === 'combo'}
        form={ewbForm}
        onChange={setEwbForm}
        onClose={() => setShowEwbModal(false)}
        onSubmit={() => {
          if (ewbWithEinvoice && !irn && !ewbByIrn) void generateCombo();
          else void submitEwb();
        }}
        fromPin={sellerPin || props.fromPin}
        toPin={props.toPin}
        showIrnHint={ewbByIrn}
        title={
          ewbByIrn ? 'E-Way Bill by IRN' : ewbWithEinvoice && !irn ? 'E-Invoice + E-Way Bill' : 'Generate E-Way Bill'
        }
      />
      {showQrModal && qr ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setShowQrModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <h3 className="font-bold text-lg mb-4 flex items-center justify-center gap-2">
              <QrCode size={20} className="text-indigo-600" /> E-Invoice QR
            </h3>
            <EInvoiceQrImage qrCode={qr} size={240} className="mx-auto rounded-lg border border-gray-100" />
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full py-2.5 border border-gray-200 rounded-xl font-medium"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
      <GstCancelGstModal
        open={!!cancelModal}
        kind={cancelModal || 'irn'}
        saving={!!generating}
        hasEwb={!!ewbNo}
        onClose={() => setCancelModal(null)}
        onConfirm={(r, m) => void confirmCancel(r, m)}
      />
    </>
  );
}
