import React, { useEffect, useState } from 'react';
import { Calendar, Lock, Plus, CheckCircle2 } from 'lucide-react';
import { fetchApi } from '../../api';
import { session } from '../../lib/session';
import { useToast } from '../../components/ui';

const ADMIN_ROLES = ['Admin', 'Super Admin'];

interface FinancialYear {
  id: string;
  code: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

export function BooksFinancialYearsPanel() {
  const { toast } = useToast();
  const user = session.getUser() as { role?: string } | null;
  const isAdmin = !!(user && ADMIN_ROLES.includes(user.role ?? ''));
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const data = await fetchApi<FinancialYear[]>('/books/financial-years');
      setYears(data);
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClose(fy: FinancialYear) {
    if (
      !confirm(
        `Close ${fy.label}?\n\nThis will:\n• Carry forward balance sheet balances\n• Reset income/expense to zero\n• Lock the period through ${fy.endDate}\n• Create next FY\n\nThis cannot be undone.`,
      )
    )
      return;
    setClosing(fy.id);
    try {
      const res = await fetchApi<{ closed: boolean; netProfit: number; ledgersUpdated: number }>(
        `/books/financial-years/${fy.id}/close`,
        { method: 'POST' },
      );
      toast(`${fy.label} closed. Net profit: ₹${res.netProfit.toLocaleString('en-IN')}`, 'success');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to close year', 'error');
    } finally {
      setClosing(null);
    }
  }

  async function handleCreate() {
    if (!startDate || !endDate) return;
    setCreating(true);
    try {
      await fetchApi('/books/financial-years', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate }),
      });
      toast('Financial year created', 'success');
      setShowCreate(false);
      setStartDate('');
      setEndDate('');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create', 'error');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return null;
  if (!years.length && !isAdmin) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Calendar size={16} className="mt-0.5 text-slate-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">Financial years</h3>
          <p className="text-xs text-slate-500 mt-0.5">Close a year to carry forward balances and lock the period.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>

      {showCreate && isAdmin && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
          <label className="text-xs text-slate-500">
            Start
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            End
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={creating || !startDate || !endDate}
            onClick={handleCreate}
            className="h-9 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {years.map(fy => (
          <div
            key={fy.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${fy.isActive ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'}`}
          >
            <div className="flex items-center gap-2">
              {fy.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  <Lock size={10} /> Closed
                </span>
              )}
              <span className="font-medium text-slate-900">{fy.label || fy.code}</span>
              {fy.startDate && fy.endDate && (
                <span className="text-xs text-slate-400">
                  {fy.startDate} → {fy.endDate}
                </span>
              )}
            </div>
            {fy.isActive && isAdmin && fy.startDate && fy.endDate && (
              <button
                type="button"
                disabled={closing === fy.id}
                onClick={() => handleClose(fy)}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <CheckCircle2 size={12} />
                {closing === fy.id ? 'Closing…' : 'Close year'}
              </button>
            )}
          </div>
        ))}
        {!years.length && (
          <p className="text-xs text-slate-400 py-1">
            No financial years yet. They are created automatically when vouchers are posted.
          </p>
        )}
      </div>
    </div>
  );
}
