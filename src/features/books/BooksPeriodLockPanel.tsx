import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { fetchApi } from '../../api';
import { session } from '../../lib/session';
import { useToast } from '../../components/ui';

const ADMIN_ROLES = ['Admin', 'Super Admin'];

/**
 * Close books through a date — Admin only.
 * Blocks voucher create/edit/delete (and ops dual-write) on or before lock date.
 */
export function BooksPeriodLockPanel({
  lockDate: initialLock,
  onChanged,
}: {
  lockDate?: string | null;
  onChanged?: (lockDate: string | null) => void;
}) {
  const { toast } = useToast();
  const user = session.getUser() as { role?: string } | null;
  const isAdmin = !!(user && ADMIN_ROLES.includes(user.role ?? ''));
  const [lockDate, setLockDate] = useState(initialLock || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLockDate(initialLock || '');
  }, [initialLock]);

  if (!isAdmin) {
    if (!initialLock) return null;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Lock size={14} /> Books closed through {initialLock}
        </span>
        <span className="ml-1 text-amber-800/80">— vouchers on or before this date cannot be changed.</span>
      </div>
    );
  }

  async function save(next: string | null) {
    setSaving(true);
    try {
      const res = await fetchApi<{ lockDate: string | null }>('/books/period-lock', {
        method: 'PUT',
        body: JSON.stringify({ lockDate: next }),
      });
      const value = res.lockDate || '';
      setLockDate(value);
      onChanged?.(res.lockDate);
      toast(res.lockDate ? `Books closed through ${res.lockDate}` : 'Books period unlocked', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update period lock', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-2">
      <div className="flex items-start gap-2">
        <Lock size={16} className="mt-0.5 text-slate-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">Close books / period lock</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Vouchers dated on or before this day cannot be created, edited, or deleted (including Collections
            dual-write). Leave empty to unlock.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Locked through
          <input
            type="date"
            value={lockDate}
            onChange={e => setLockDate(e.target.value)}
            className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(lockDate.trim() || null)}
          className="h-9 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save lock'}
        </button>
        {lockDate && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(null)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Unlock
          </button>
        )}
      </div>
    </div>
  );
}
