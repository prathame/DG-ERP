import React, { useEffect, useState } from 'react';
import { FileCheck, QrCode, Truck } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../ui';
import { EInvoiceQrImage } from '../ui/EInvoiceQrImage';
import { resolveIrnQrPayload, cn } from '../../lib/utils';
import { EwbGenerateModal, defaultEwbForm, type EwbFormState } from './EwbGenerateModal';

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

export function GstEinvoiceToolbar(props: InvoiceProps | BatchProps) {
  const { toast } = useToast();
  const [ewbWithEinvoice, setEwbWithEinvoice] = useState(!!props.ewbWithEinvoice);
  const [sellerPin, setSellerPin] = useState(props.fromPin || '');
  const [irn, setIrn] = useState(props.initialIrn || '');
  const [qr, setQr] = useState(() => resolveIrnQrPayload({ irnQr: props.initialQr, qrCode: props.initialQr }));
  const [ewbNo, setEwbNo] = useState(props.initialEwb || '');
  const [generating, setGenerating] = useState<'irn' | 'ewb' | 'combo' | null>(null);
  const [showEwbModal, setShowEwbModal] = useState(false);
  const [ewbByIrn, setEwbByIrn] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [ewbForm, setEwbForm] = useState<EwbFormState>(defaultEwbForm);

  useEffect(() => {
    if (props.ewbWithEinvoice !== undefined) return;
    api.gst
      .getSettings()
      .then(s => {
        setEwbWithEinvoice(!!s.ewbWithEinvoice);
        if (!props.fromPin && s.sellerPin) setSellerPin(s.sellerPin);
      })
      .catch(() => {});
  }, [props.ewbWithEinvoice, props.fromPin]);

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
    if (!ewbForm.vehicleNo.trim()) {
      toast('Vehicle number required', 'error');
      return;
    }
    if (!ewbForm.distance.trim()) {
      toast('Distance (km) required', 'error');
      return;
    }
    setGenerating(ewbByIrn ? 'ewb' : 'ewb');
    try {
      const payload = {
        vehicleNo: ewbForm.vehicleNo.trim().toUpperCase(),
        distance: Number(ewbForm.distance),
        transportMode: ewbForm.transportMode,
        transporterName: ewbForm.transporterName,
        transporterId: ewbForm.transporterId,
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
    if (!ewbForm.vehicleNo.trim() || !ewbForm.distance.trim()) {
      setEwbByIrn(false);
      setShowEwbModal(true);
      return;
    }
    setGenerating('combo');
    try {
      if (props.kind === 'invoice') {
        const r = await api.gst.generateInvoiceIrnAndEwb({
          invoiceId: props.id,
          vehicleNo: ewbForm.vehicleNo.trim().toUpperCase(),
          distance: Number(ewbForm.distance),
          transportMode: ewbForm.transportMode,
          transporterName: ewbForm.transporterName,
          transporterId: ewbForm.transporterId,
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

  function openEwbModal(byIrn: boolean) {
    setEwbByIrn(byIrn);
    setEwbForm(defaultEwbForm());
    setShowEwbModal(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void generateIrn()}
        disabled={!!generating}
        className={btn(true)}
        title="Generate E-Invoice IRN"
      >
        <FileCheck size={13} /> {generating === 'irn' ? 'Generating…' : irn ? 'Re-IRN' : 'E-Invoice'}
      </button>
      {ewbWithEinvoice && !ewbNo ? (
        <button
          type="button"
          onClick={() => {
            setEwbForm(defaultEwbForm());
            setShowEwbModal(true);
            setEwbByIrn(false);
          }}
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
      {irn ? (
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
      ) : null}

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
    </>
  );
}
