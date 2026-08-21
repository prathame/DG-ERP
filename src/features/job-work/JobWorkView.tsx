import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { Plus, Wrench, Trash2, Edit2, CheckCircle, Truck, FileText, MessageCircle, RefreshCw } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../api';
import {
  useToast,
  LoadingSpinner,
  AppModal,
  ModalActions,
  ModalActionButton,
  FormSection,
  FormGrid,
  FormField,
  formControlClass,
  MobilePillTabs,
  MobileEmptyState,
  MobileFab,
} from '../../components/ui';
import { shareViaWhatsApp } from '../../lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type JobStatus = 'received' | 'in_process' | 'completed' | 'delivered' | 'invoiced';

interface Job {
  id: string;
  jobNumber: string;
  clientName: string;
  clientPhone?: string | null;
  description: string;
  material?: string | null;
  materialQty?: number | null;
  materialUnit?: string | null;
  status: JobStatus;
  receivedDate: string;
  promisedDate?: string | null;
  completedDate?: string | null;
  deliveredDate?: string | null;
  estimatedAmount?: number | null;
  finalAmount?: number | null;
  gstRate: number;
  invoiceId?: string | null;
  notes?: string | null;
}

interface Summary {
  received: number;
  inProcess: number;
  completed: number;
  delivered: number;
  invoiced: number;
  overdueCount: number;
  totalRevenue: number;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<JobStatus, string> = {
  received: 'Received',
  in_process: 'In Process',
  completed: 'Completed',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
};

const STATUS_CLASS: Record<JobStatus, string> = {
  received: 'bg-blue-100 text-blue-700',
  in_process: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  delivered: 'bg-purple-100 text-purple-700',
  invoiced: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
        STATUS_CLASS[status] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function isOverdue(job: Job): boolean {
  if (!job.promisedDate) return false;
  if (['invoiced', 'delivered', 'completed'].includes(job.status)) return false;
  return new Date(job.promisedDate) < new Date();
}

const INR = (n: number | null | undefined) =>
  n != null ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '—';

// ── Form defaults ──────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  clientName: '',
  clientPhone: '',
  description: '',
  material: '',
  receivedDate: new Date().toISOString().slice(0, 10),
  promisedDate: '',
  estimatedAmount: '',
  gstRate: '18',
  notes: '',
};

// ── Main view ──────────────────────────────────────────────────────────────────

export function JobWorkView() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchClient, setSearchClient] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<{ job: Job } | null>(null);
  const [invoiceFinalAmount, setInvoiceFinalAmount] = useState('');
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobList, sum] = await Promise.all([
        api.jobWork.list({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          clientName: searchClient || undefined,
        }),
        api.jobWork.summary(),
      ]);
      setJobs(jobList);
      setSummary(sum);
    } catch {
      toast({ title: 'Failed to load jobs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchClient, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditJob(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(job: Job) {
    setEditJob(job);
    setForm({
      clientName: job.clientName,
      clientPhone: job.clientPhone ?? '',
      description: job.description,
      material: job.material ?? '',
      receivedDate: job.receivedDate ? String(job.receivedDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      promisedDate: job.promisedDate ? String(job.promisedDate).slice(0, 10) : '',
      estimatedAmount: job.estimatedAmount != null ? String(job.estimatedAmount) : '',
      gstRate: String(job.gstRate ?? 18),
      notes: job.notes ?? '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.clientName.trim()) {
      toast({ title: 'Client name is required', variant: 'destructive' });
      return;
    }
    if (!form.description.trim()) {
      toast({ title: 'Description is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim() || undefined,
        description: form.description.trim(),
        material: form.material.trim() || undefined,
        receivedDate: form.receivedDate || undefined,
        promisedDate: form.promisedDate || undefined,
        estimatedAmount: form.estimatedAmount ? Number(form.estimatedAmount) : undefined,
        gstRate: Number(form.gstRate) || 18,
        notes: form.notes.trim() || undefined,
      };
      if (editJob) {
        await api.jobWork.update(editJob.id, payload);
        toast({ title: 'Job updated' });
      } else {
        await api.jobWork.create(payload);
        toast({ title: 'Job order created' });
      }
      setShowModal(false);
      void load();
    } catch {
      toast({ title: editJob ? 'Failed to update job' : 'Failed to create job', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(job: Job, status: string) {
    try {
      await api.jobWork.updateStatus(job.id, status);
      toast({ title: `Status updated to ${STATUS_LABEL[status as JobStatus] ?? status}` });
      void load();
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  }

  async function handleDelete(job: Job) {
    if (!window.confirm(`Delete job ${job.jobNumber}? This cannot be undone.`)) return;
    try {
      await api.jobWork.delete(job.id);
      toast({ title: 'Job deleted' });
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete job';
      toast({ title: msg, variant: 'destructive' });
    }
  }

  function handleWhatsApp(job: Job) {
    if (!job.clientPhone) {
      toast({ title: 'No phone number on record', variant: 'destructive' });
      return;
    }
    const message = `Your job ${job.jobNumber} (${job.description}) is ready for pickup. Please contact us.`;
    shareViaWhatsApp(job.clientPhone, message);
  }

  function openInvoice(job: Job) {
    setInvoiceModal({ job });
    setInvoiceFinalAmount(
      job.finalAmount != null
        ? String(job.finalAmount)
        : job.estimatedAmount != null
          ? String(job.estimatedAmount)
          : '',
    );
  }

  async function handleGenerateInvoice() {
    if (!invoiceModal) return;
    const amount = Number(invoiceFinalAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid final amount', variant: 'destructive' });
      return;
    }
    setGeneratingInvoice(true);
    try {
      const inv = await api.jobWork.generateInvoice(invoiceModal.job.id, amount);
      toast({ title: `Invoice ${inv.invoiceNumber} created — ${INR(inv.grandTotal)} (incl. GST)` });
      setInvoiceModal(null);
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate invoice';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setGeneratingInvoice(false);
    }
  }

  // ── Status filter pills ──────────────────────────────────────────────────────
  const pills: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'received', label: 'Received' },
    { id: 'in_process', label: 'In Process' },
    { id: 'completed', label: 'Completed' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'invoiced', label: 'Invoiced' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 bg-white border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wrench className="text-brand" size={20} />
          <h1 className="font-bold text-gray-900 text-lg">Job Work</h1>
        </div>
        {summary && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
            {summary.overdueCount > 0 && (
              <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                Overdue: {summary.overdueCount}
              </span>
            )}
            <span>Pending: {summary.received}</span>
            <span>·</span>
            <span>In Process: {summary.inProcess}</span>
            <span>·</span>
            <span>Completed: {summary.completed}</span>
            {summary.totalRevenue > 0 && (
              <>
                <span>·</span>
                <span className="font-semibold text-gray-700">Revenue: {INR(summary.totalRevenue)}</span>
              </>
            )}
          </div>
        )}
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-brand text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-brand/90 transition-colors"
        >
          <Plus size={16} />
          New Job
        </button>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2 bg-white border-b border-gray-100 space-y-2">
        <MobilePillTabs items={pills} value={statusFilter} onChange={setStatusFilter} />
        <input
          type="search"
          placeholder="Search client..."
          value={searchClient}
          onChange={e => setSearchClient(e.target.value)}
          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:outline-none bg-white"
        />
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-12">
            <LoadingSpinner />
          </div>
        ) : jobs.length === 0 ? (
          <MobileEmptyState
            icon={<Wrench size={36} className="text-gray-300" />}
            title="No job orders"
            subtitle="Create a new job order to track VMC / machining work"
          />
        ) : (
          jobs.map(job => (
            <Fragment key={job.id}>
              <JobCard
                job={job}
                onEdit={() => openEdit(job)}
                onDelete={() => handleDelete(job)}
                onStatusChange={s => handleStatusChange(job, s)}
                onWhatsApp={() => handleWhatsApp(job)}
                onInvoice={() => openInvoice(job)}
              />
            </Fragment>
          ))
        )}
      </div>

      {/* Mobile FAB */}
      <MobileFab onClick={openCreate} label="New Job" />

      {/* Create / Edit modal */}
      {showModal && (
        <AppModal onClose={() => setShowModal(false)} title={editJob ? `Edit ${editJob.jobNumber}` : 'New Job Order'}>
          <div className="space-y-4 p-1">
            <FormSection title="Client">
              <FormGrid>
                <FormField label="Client Name" required>
                  <input
                    className={formControlClass}
                    value={form.clientName}
                    onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                    placeholder="Patil Industries"
                  />
                </FormField>
                <FormField label="Client Phone">
                  <input
                    className={formControlClass}
                    value={form.clientPhone}
                    onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
                    placeholder="9876543210"
                    type="tel"
                  />
                </FormField>
              </FormGrid>
            </FormSection>

            <FormSection title="Work">
              <FormField label="Description" required hint="What work needs to be done">
                <textarea
                  className={cn(formControlClass, 'min-h-[80px] resize-y')}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="VMC milling — cavity block, 3-axis"
                />
              </FormField>
              <FormField label="Material" hint="Type, size, qty — e.g. EN8 steel, 100×100×50mm, 2 pcs">
                <input
                  className={formControlClass}
                  value={form.material}
                  onChange={e => setForm(f => ({ ...f, material: e.target.value }))}
                  placeholder="EN8 steel, 100×100×50mm, 2 pcs"
                />
              </FormField>
            </FormSection>

            <FormSection title="Dates & Amount">
              <FormGrid>
                <FormField label="Received Date">
                  <input
                    type="date"
                    className={formControlClass}
                    value={form.receivedDate}
                    onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                  />
                </FormField>
                <FormField label="Promised Date">
                  <input
                    type="date"
                    className={formControlClass}
                    value={form.promisedDate}
                    onChange={e => setForm(f => ({ ...f, promisedDate: e.target.value }))}
                  />
                </FormField>
                <FormField label="Estimated Amount (₹)">
                  <input
                    type="number"
                    min="0"
                    className={formControlClass}
                    value={form.estimatedAmount}
                    onChange={e => setForm(f => ({ ...f, estimatedAmount: e.target.value }))}
                    placeholder="5000"
                  />
                </FormField>
                <FormField label="GST Rate">
                  <select
                    className={formControlClass}
                    value={form.gstRate}
                    onChange={e => setForm(f => ({ ...f, gstRate: e.target.value }))}
                  >
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                  </select>
                </FormField>
              </FormGrid>
            </FormSection>

            <FormSection title="Notes">
              <textarea
                className={cn(formControlClass, 'min-h-[64px] resize-y')}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any special instructions..."
              />
            </FormSection>
          </div>
          <ModalActions>
            <ModalActionButton variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </ModalActionButton>
            <ModalActionButton variant="primary" loading={saving} onClick={handleSave}>
              {editJob ? 'Save Changes' : 'Create Job'}
            </ModalActionButton>
          </ModalActions>
        </AppModal>
      )}

      {/* Generate Invoice modal */}
      {invoiceModal && (
        <AppModal onClose={() => setInvoiceModal(null)} title={`Generate Invoice — ${invoiceModal.job.jobNumber}`}>
          <div className="space-y-4 p-1">
            <p className="text-sm text-gray-600">
              <strong>{invoiceModal.job.clientName}</strong> — {invoiceModal.job.description}
            </p>
            <FormField label="Final Amount (₹, excl. GST)" required>
              <input
                type="number"
                min="1"
                className={formControlClass}
                value={invoiceFinalAmount}
                onChange={e => setInvoiceFinalAmount(e.target.value)}
                placeholder="5000"
              />
            </FormField>
            {invoiceFinalAmount && Number(invoiceFinalAmount) > 0 && (
              <p className="text-xs text-gray-500">
                GST {invoiceModal.job.gstRate}%:{' '}
                <strong>{INR((Number(invoiceFinalAmount) * invoiceModal.job.gstRate) / 100)}</strong> → Total:{' '}
                <strong>{INR(Number(invoiceFinalAmount) * (1 + invoiceModal.job.gstRate / 100))}</strong>
              </p>
            )}
          </div>
          <ModalActions>
            <ModalActionButton variant="secondary" onClick={() => setInvoiceModal(null)}>
              Cancel
            </ModalActionButton>
            <ModalActionButton variant="primary" loading={generatingInvoice} onClick={handleGenerateInvoice}>
              Generate Invoice
            </ModalActionButton>
          </ModalActions>
        </AppModal>
      )}
    </div>
  );
}

// ── Job Card ───────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onEdit,
  onDelete,
  onStatusChange,
  onWhatsApp,
  onInvoice,
}: {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onWhatsApp: () => void;
  onInvoice: () => void;
}) {
  const overdue = isOverdue(job);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      {/* Top row: job number + status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900 text-sm">{job.jobNumber}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {job.clientName}
            {job.clientPhone ? ` · ${job.clientPhone}` : ''}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 leading-snug">{job.description}</p>

      {/* Material */}
      {job.material && <p className="text-xs text-gray-500">Material: {job.material}</p>}

      {/* Dates */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>Received: {formatDate(job.receivedDate)}</span>
        {job.promisedDate && (
          <span className={cn(overdue && 'text-red-600 font-semibold')}>
            Due: {formatDate(job.promisedDate)}
            {overdue ? ' ⚠ Overdue' : ''}
          </span>
        )}
        {job.completedDate && <span>Completed: {formatDate(job.completedDate)}</span>}
        {job.deliveredDate && <span>Delivered: {formatDate(job.deliveredDate)}</span>}
      </div>

      {/* Amounts */}
      <div className="flex gap-4 text-xs text-gray-600">
        {job.estimatedAmount != null && <span>Est: {INR(job.estimatedAmount)}</span>}
        {job.finalAmount != null && <span className="font-semibold">Final: {INR(job.finalAmount)}</span>}
        <span className="text-gray-400">GST {job.gstRate}%</span>
      </div>

      {/* Notes */}
      {job.notes && <p className="text-xs text-gray-400 italic">{job.notes}</p>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <ActionButtons
          job={job}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onWhatsApp={onWhatsApp}
          onInvoice={onInvoice}
        />
      </div>
    </div>
  );
}

function ActionButtons({
  job,
  onEdit,
  onDelete,
  onStatusChange,
  onWhatsApp,
  onInvoice,
}: {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onWhatsApp: () => void;
  onInvoice: () => void;
}) {
  const btnBase = 'flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors';

  if (job.status === 'received') {
    return (
      <>
        <button
          onClick={() => onStatusChange('in_process')}
          className={cn(btnBase, 'bg-amber-100 text-amber-700 hover:bg-amber-200')}
        >
          <RefreshCw size={12} /> Start Work
        </button>
        <button onClick={onEdit} className={cn(btnBase, 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <Edit2 size={12} /> Edit
        </button>
        <button onClick={onDelete} className={cn(btnBase, 'bg-red-50 text-red-600 hover:bg-red-100')}>
          <Trash2 size={12} /> Delete
        </button>
      </>
    );
  }

  if (job.status === 'in_process') {
    return (
      <>
        <button
          onClick={() => onStatusChange('completed')}
          className={cn(btnBase, 'bg-green-100 text-green-700 hover:bg-green-200')}
        >
          <CheckCircle size={12} /> Mark Complete
        </button>
        <button onClick={onEdit} className={cn(btnBase, 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <Edit2 size={12} /> Edit
        </button>
      </>
    );
  }

  if (job.status === 'completed') {
    return (
      <>
        <button
          onClick={() => onStatusChange('delivered')}
          className={cn(btnBase, 'bg-purple-100 text-purple-700 hover:bg-purple-200')}
        >
          <Truck size={12} /> Mark Delivered
        </button>
        <button onClick={onInvoice} className={cn(btnBase, 'bg-brand/10 text-brand hover:bg-brand/20')}>
          <FileText size={12} /> Generate Invoice
        </button>
        {job.clientPhone && (
          <button onClick={onWhatsApp} className={cn(btnBase, 'bg-green-50 text-green-700 hover:bg-green-100')}>
            <MessageCircle size={12} /> WhatsApp
          </button>
        )}
      </>
    );
  }

  if (job.status === 'delivered') {
    return (
      <>
        <button onClick={onInvoice} className={cn(btnBase, 'bg-brand/10 text-brand hover:bg-brand/20')}>
          <FileText size={12} /> Generate Invoice
        </button>
        {job.clientPhone && (
          <button onClick={onWhatsApp} className={cn(btnBase, 'bg-green-50 text-green-700 hover:bg-green-100')}>
            <MessageCircle size={12} /> WhatsApp
          </button>
        )}
      </>
    );
  }

  if (job.status === 'invoiced') {
    return (
      <span className="text-xs text-gray-400">
        Invoice generated{job.invoiceId ? ` · ${job.invoiceId.slice(0, 12)}…` : ''}
      </span>
    );
  }

  return null;
}
