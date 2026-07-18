import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, Download, Upload, IndianRupee } from 'lucide-react';
import { exportToCsv, shareViaWhatsApp } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { CsvImport } from '../../components/ui/CsvImport';
import { useDebounce } from '../../hooks/useDebounce';
import { useConfirm } from '../../hooks/useConfirm';

type Staff = {
  id: string;
  name: string;
  phone?: string;
  role?: string;
  address?: string;
  salary: number;
  joiningDate?: string;
  status: string;
  totalPaid: number;
  totalAdvance: number;
  totalRepaid: number;
  advanceBalance: number;
  paymentCount: number;
  lastPayment?: string;
};
type Payment = {
  id: string;
  staffName: string;
  amount: number;
  paymentDate: string;
  paymentType: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
};

export function StaffMasterView({
  onBack,
  onRefresh,
  initialStaffId,
}: {
  onBack: () => void;
  onRefresh: () => void;
  /** Open this staff’s payment detail immediately (e.g. Masters hub row tap). */
  initialStaffId?: string;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [list, setList] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: '', address: '', salary: '', joiningDate: '' });
  const [selected, setSelected] = useState<Staff | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [focusedInitial, setFocusedInitial] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentType: 'salary',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });

  const load = () => {
    api.staff
      .list(debouncedSearch || undefined)
      .then(rows => setList(Array.isArray(rows) ? rows : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [debouncedSearch]);

  const selectStaff = (s: Staff) => {
    setSelected(s);
    setPaymentsLoading(true);
    api.payroll
      .list({ staffName: s.name })
      .then(rows => setPayments(Array.isArray(rows) ? (rows as Payment[]) : []))
      .catch(() => setPayments([]))
      .finally(() => setPaymentsLoading(false));
  };

  // Masters hub → Staff row: jump straight into that person’s payments
  useEffect(() => {
    if (focusedInitial || !initialStaffId || loading) return;
    const s = list.find(x => x.id === initialStaffId);
    if (s) {
      selectStaff(s);
      setFocusedInitial(true);
    }
  }, [initialStaffId, list, loading, focusedInitial]);

  const backFromDetail = () => {
    setSelected(null);
    setPayments([]);
    setPayModalOpen(false);
  };

  const openPayModal = () => {
    if (!selected) return;
    setPayForm({
      amount: selected.salary ? String(selected.salary) : '',
      paymentType: 'salary',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      referenceNumber: '',
      notes: '',
    });
    setPayModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', phone: '', role: '', address: '', salary: '', joiningDate: '' });
    setAddStaffOpen(true);
  };
  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone || '',
      role: s.role || '',
      address: s.address || '',
      salary: s.salary ? String(s.salary) : '',
      joiningDate: s.joiningDate ? s.joiningDate.slice(0, 10) : '',
    });
    setAddStaffOpen(true);
  };

  const handleSaveStaff = async () => {
    if (!form.name.trim()) {
      toast('Name is required', 'error');
      return;
    }
    if (!form.name.trim()) {
      toast('Name is required', 'error');
      return;
    }
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      toast('Phone must be 10 digits', 'error');
      return;
    }
    try {
      if (editing) {
        await api.staff.update(editing.id, {
          name: form.name,
          phone: form.phone,
          role: form.role,
          address: form.address,
          salary: form.salary ? Number(form.salary) : undefined,
        });
        toast('Staff updated', 'success');
      } else {
        await api.staff.create({
          name: form.name,
          phone: form.phone || undefined,
          role: form.role || undefined,
          address: form.address || undefined,
          salary: form.salary ? Number(form.salary) : undefined,
          joiningDate: form.joiningDate || undefined,
        });
        toast(`${form.name} added`, 'success');
      }
      setAddStaffOpen(false);
      load();
      onRefresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handlePay = async () => {
    if (!selected) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast('Enter valid amount', 'error');
      return;
    }
    try {
      const amt = Number(payForm.amount);
      const typeLabel: Record<string, string> = {
        salary: 'Salary',
        advance: 'Advance',
        advance_repay: 'Advance Repayment',
        bonus: 'Bonus',
        deduction: 'Deduction',
      };
      await api.payroll.create({
        staffName: selected.name,
        amount: amt,
        paymentDate: payForm.paymentDate,
        paymentType: payForm.paymentType,
        paymentMethod: payForm.paymentMethod,
        referenceNumber: payForm.referenceNumber || undefined,
        notes: payForm.notes || undefined,
      });
      toast(`${typeLabel[payForm.paymentType]}: ₹${amt.toLocaleString()} — ${selected.name}`, 'success');
      setPayModalOpen(false);
      if (selected.phone && ['salary', 'bonus', 'advance'].includes(payForm.paymentType)) {
        const msg = `Hi ${selected.name},\n\n${typeLabel[payForm.paymentType]} of ₹${amt.toLocaleString()} has been made on ${payForm.paymentDate} via ${payForm.paymentMethod}.${payForm.notes ? `\nNote: ${payForm.notes}` : ''}\n\nThank you!`;
        if (
          await confirm({
            title: 'Send WhatsApp',
            message: `Send payment notification to ${selected.name}?`,
            confirmLabel: 'Send',
            variant: 'info',
          })
        )
          shareViaWhatsApp(selected.phone, msg);
      }
      setPayForm({
        amount: '',
        paymentType: 'salary',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Cash',
        referenceNumber: '',
        notes: '',
      });
      const refreshed = await api.staff.list();
      const next = Array.isArray(refreshed) ? refreshed : [];
      setList(next);
      const updated = next.find(s => s.id === selected.id);
      if (updated) selectStaff(updated);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.staff.delete(deleteTarget.id);
      toast('Staff removed', 'success');
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) setSelected(null);
      load();
      onRefresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const typeLabel: Record<string, string> = {
    salary: 'Salary',
    advance: 'Advance',
    advance_repay: 'Repaid',
    bonus: 'Bonus',
    deduction: 'Deduction',
  };
  const typeClass = (t: string) =>
    t === 'advance'
      ? 'bg-amber-100 text-amber-700'
      : t === 'advance_repay'
        ? 'bg-blue-100 text-blue-700'
        : t === 'bonus'
          ? 'bg-purple-100 text-purple-700'
          : t === 'deduction'
            ? 'bg-rose-100 text-rose-700'
            : 'bg-emerald-100 text-emerald-700';

  // Hub deep-link: wait until the named staff is selected (avoid list flash)
  if (initialStaffId && !focusedInitial && !selected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
        <LoadingSpinner />
      </motion.div>
    );
  }

  // ── Payment detail (replaces list; Back returns to staff list) ──────────
  if (selected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={backFromDetail}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg"
            aria-label="Back to staff list"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">{selected.name}</h2>
            <p className="text-sm text-gray-500">Payment history</p>
          </div>
          <button
            type="button"
            onClick={openPayModal}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-brand text-white rounded-xl text-sm font-bold"
          >
            <Plus size={16} /> Add payment
          </button>
        </div>

        {/* Staff summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {selected.role && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                {selected.role}
              </span>
            )}
            {selected.phone && <span className="text-xs text-gray-500">{selected.phone}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Salary</p>
              <p className="font-bold">₹{(selected.salary || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Paid</p>
              <p className="font-bold text-emerald-600">₹{selected.totalPaid.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Advance</p>
              <p className="font-bold text-amber-600">₹{(selected.advanceBalance || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Payments</p>
              <p className="font-bold">{selected.paymentCount}</p>
            </div>
          </div>
        </div>

        {/* Payment history */}
        <div>
          <h3 className="text-sm font-bold text-gray-600 mb-2">History</h3>
          {paymentsLoading ? (
            <div className="py-12 text-center">
              <LoadingSpinner />
            </div>
          ) : payments.length === 0 ? (
            <div className="py-12 text-center text-gray-400 rounded-2xl border border-dashed border-gray-200">
              <IndianRupee size={32} className="mx-auto mb-2 opacity-30" />
              <p className="font-medium text-sm">No payments yet</p>
              <p className="text-xs mt-1">Tap “Add payment” to record salary or advance</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {payments.map(p => (
                <li key={p.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-white">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${typeClass(p.paymentType)}`}>
                        {typeLabel[p.paymentType] || p.paymentType}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(p.paymentDate)}</span>
                    </div>
                    <p className="font-bold text-sm">₹{p.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {p.paymentMethod}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!(await confirm({ message: 'Delete this payment? This cannot be undone.' }))) return;
                      try {
                        await api.payroll.delete(p.id);
                        toast('Deleted', 'success');
                        load();
                        selectStaff(selected);
                      } catch (e) {
                        toast((e as Error).message, 'error');
                      }
                    }}
                    className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-rose-400 hover:text-rose-600 shrink-0"
                    aria-label="Delete payment"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {payments.length > 0 && (
            <p className="mt-3 text-right text-sm font-bold text-gray-600">
              Total: ₹{payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
            </p>
          )}
        </div>

        {/* Record Payment Modal (detail view) */}
        <AnimatePresence>
          {payModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setPayModalOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
              >
                <h3 className="text-lg font-bold mb-1">Pay {selected.name}</h3>
                <p className="text-sm text-gray-400 mb-4">
                  {selected.role || 'Staff'}
                  {selected.salary ? ` · Salary: ₹${selected.salary.toLocaleString()}` : ''}
                  {selected.advanceBalance > 0 ? ` · Advance due: ₹${selected.advanceBalance.toLocaleString()}` : ''}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Type *</label>
                    <select
                      value={payForm.paymentType}
                      onChange={e => {
                        const t = e.target.value;
                        let amt = payForm.amount;
                        if (t === 'salary' && selected.salary) amt = String(selected.salary);
                        if (t === 'advance_repay' && selected.advanceBalance > 0) amt = String(selected.advanceBalance);
                        setPayForm({ ...payForm, paymentType: t, amount: amt });
                      }}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    >
                      <option value="salary">Salary</option>
                      <option value="advance">Advance (given to staff)</option>
                      <option value="advance_repay">Advance Repay (staff pays back)</option>
                      <option value="bonus">Bonus</option>
                      <option value="deduction">Deduction (cut from salary)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Amount (₹) *</label>
                    <input
                      type="number"
                      min={1}
                      value={payForm.amount}
                      onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                      placeholder="5000"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-400 block mb-1">Date</label>
                      <input
                        type="date"
                        value={payForm.paymentDate}
                        onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-400 block mb-1">Method</label>
                      <select
                        value={payForm.paymentMethod}
                        onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}
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
                    <label className="text-xs font-bold text-gray-400 block mb-1">Reference / UTR</label>
                    <input
                      value={payForm.referenceNumber}
                      onChange={e => setPayForm({ ...payForm, referenceNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Notes</label>
                    <input
                      value={payForm.notes}
                      onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      placeholder="Salary, advance, bonus..."
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setPayModalOpen(false)}
                    className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePay}
                    className="flex-1 py-2 bg-brand text-white rounded-xl font-bold"
                  >
                    Pay ₹{payForm.amount ? Number(payForm.amount).toLocaleString() : '0'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <ConfirmRenderer />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Staff Management</h2>
          <p className="text-sm text-gray-500">Add staff, track payments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {list.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  list.map(s => ({
                    Name: s.name,
                    Phone: s.phone || '',
                    Role: s.role || '',
                    Salary: s.salary,
                    'Total Paid': s.totalPaid,
                    Payments: s.paymentCount,
                  })),
                  'staff',
                )
              }
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              <Download size={18} /> Export CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setCsvImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"
          >
            <Upload size={18} /> Import CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
          >
            <Plus size={18} /> Add Staff
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search staff..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
        />
      </div>

      {loading && (
        <div className="py-16 text-center">
          <LoadingSpinner />
        </div>
      )}

      {/* Staff Tiles — tap opens payment detail (Edit/Delete do not) */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectStaff(s)}
              className="text-left p-4 rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800 truncate">{s.name}</span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      openEdit(s);
                    }}
                    className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-blue-600"
                    aria-label={`Edit ${s.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setDeleteTarget(s);
                    }}
                    className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-rose-600"
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {s.role && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">
                  {s.role}
                </span>
              )}
              {s.phone && <p className="text-xs text-gray-400 mt-1">{s.phone}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {s.salary > 0 && (
                  <span>
                    Salary: <b>₹{s.salary.toLocaleString()}</b>
                  </span>
                )}
                <span>
                  Paid: <b className="text-emerald-600">₹{s.totalPaid.toLocaleString()}</b>
                </span>
                {s.advanceBalance > 0 && (
                  <span>
                    Advance: <b className="text-amber-600">₹{s.advanceBalance.toLocaleString()}</b>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-brand font-medium mt-2">Tap to view payments</p>
            </button>
          ))}
          {list.length === 0 && !search && (
            <div className="col-span-full py-16 text-center text-gray-400">
              <IndianRupee size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No staff added yet</p>
              <p className="text-sm mt-1">Click "Add Staff" to get started</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Staff Modal */}
      <AnimatePresence>
        {addStaffOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddStaffOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6"
            >
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Staff' : 'Add Staff'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="Full name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      placeholder="9876543210"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Role</label>
                    <input
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      placeholder="Driver, Helper..."
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Address</label>
                  <input
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    placeholder="Optional"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Monthly Salary (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.salary}
                      onChange={e => setForm({ ...form, salary: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-1">Joining Date</label>
                    <input
                      type="date"
                      value={form.joiningDate}
                      onChange={e => setForm({ ...form, joiningDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setAddStaffOpen(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStaff}
                  className="flex-1 py-2 bg-brand text-white rounded-xl font-bold"
                >
                  {editing ? 'Update' : 'Add Staff'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center"
            >
              <Trash2 className="mx-auto mb-3 text-rose-500" size={32} />
              <h3 className="font-bold text-lg mb-1">Remove {deleteTarget.name}?</h3>
              <p className="text-sm text-gray-500 mb-4">Payment history will be preserved.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 py-2 bg-rose-600 text-white rounded-xl font-bold"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {csvImportOpen && (
        <CsvImport
          templateName="staff"
          itemLabel="staff members"
          columns={[
            { key: 'name', label: 'Name', required: true },
            { key: 'phone', label: 'Phone' },
            { key: 'role', label: 'Role' },
            { key: 'address', label: 'Address' },
            { key: 'salary', label: 'Monthly Salary' },
            { key: 'joiningDate', label: 'Joining Date' },
          ]}
          onClose={() => setCsvImportOpen(false)}
          onImport={async rows => {
            try {
              const items = rows.map(r => ({
                name: r.name,
                phone: r.phone || undefined,
                role: r.role || undefined,
                address: r.address || undefined,
                salary: r.salary ? Number(r.salary) : undefined,
                joiningDate: r.joiningDate || undefined,
              }));
              const result = await fetchApi<{ success: number; errors: string[] }>('/staff/batch', {
                method: 'POST',
                body: JSON.stringify({ items }),
              });
              load();
              return { success: result.success, errors: result.errors };
            } catch (err) {
              return {
                success: 0,
                errors: [err instanceof Error ? err.message : 'Import failed — no staff were added'],
              };
            }
          }}
        />
      )}
      <ConfirmRenderer />
    </motion.div>
  );
}
