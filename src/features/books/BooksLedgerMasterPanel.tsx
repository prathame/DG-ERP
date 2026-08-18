import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { fetchApi } from '../../api';
import {
  AppModal,
  FormField,
  FormGrid,
  LoadingSpinner,
  ModalActionButton,
  ModalActions,
  useToast,
} from '../../components/ui';

type Tab = 'ledgers' | 'groups';

interface GroupRow {
  id: string;
  name: string;
  nature?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  groupCode?: string | null;
  ledgerCount: number;
}

interface LedgerRow {
  id: string;
  name: string;
  groupId?: string | null;
  groupName?: string | null;
  nature?: string | null;
  ledgerType?: string | null;
  gstin?: string | null;
  openingBalance: number;
  openingSide?: string | null;
  isSystem?: boolean;
  contactPerson?: string | null;
  city?: string | null;
  state?: string | null;
  mobile?: string | null;
}

const NATURES = [
  { value: 'A', label: 'Asset' },
  { value: 'L', label: 'Liability' },
  { value: 'I', label: 'Income' },
  { value: 'E', label: 'Expense' },
  { value: 'B', label: 'Balance sheet' },
];

const LEDGER_TYPES = [
  { value: '', label: '—' },
  { value: 'CS', label: 'Cash (CS)' },
  { value: 'BK', label: 'Bank (BK)' },
  { value: 'PR', label: 'Party (PR)' },
  { value: 'IN', label: 'Income (IN)' },
  { value: 'EX', label: 'Expense (EX)' },
  { value: 'LI', label: 'Liability (LI)' },
  { value: 'GL', label: 'General (GL)' },
];

function money(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function openingLabel(l: LedgerRow) {
  const amt = money(Math.abs(l.openingBalance || 0));
  if (!l.openingBalance) return '—';
  const side = String(l.openingSide || '').toUpperCase();
  if (side === 'C' || side === 'CR') return `${amt} Cr`;
  if (side === 'D' || side === 'DR') return `${amt} Dr`;
  return l.openingBalance < 0 ? `${amt} Cr` : `${amt} Dr`;
}

const emptyLedgerForm = () => ({
  name: '',
  groupId: '',
  nature: 'A',
  ledgerType: 'PR',
  gstin: '',
  openingBalance: '',
  openingSide: 'D',
  contactPerson: '',
  city: '',
  state: '',
  mobile: '',
});

const emptyGroupForm = () => ({
  name: '',
  nature: 'A',
  parentId: '',
  groupCode: '',
});

/**
 * Chart of accounts master — groups, ledgers, opening balances (RealBooks Masters parity).
 */
export function BooksLedgerMasterPanel({
  search,
  onSearchChange,
  onOpenStatement,
  onChanged,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onOpenStatement: (ledger: { id: string; name: string }) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('ledgers');
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ledgerModal, setLedgerModal] = useState<'create' | 'edit' | null>(null);
  const [editingLedger, setEditingLedger] = useState<LedgerRow | null>(null);
  const [ledgerForm, setLedgerForm] = useState(emptyLedgerForm);
  const [groupModal, setGroupModal] = useState<'create' | 'edit' | null>(null);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const [lRows, gRows] = await Promise.all([
        fetchApi<LedgerRow[]>(`/books/ledgers${q}`),
        fetchApi<GroupRow[]>('/books/groups'),
      ]);
      setLedgers(Array.isArray(lRows) ? lRows : []);
      setGroups(Array.isArray(gRows) ? gRows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chart of accounts');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreateLedger() {
    setEditingLedger(null);
    setLedgerForm(emptyLedgerForm());
    setLedgerModal('create');
  }

  function openEditLedger(l: LedgerRow, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingLedger(l);
    setLedgerForm({
      name: l.name,
      groupId: l.groupId || '',
      nature: l.nature || 'A',
      ledgerType: l.ledgerType || '',
      gstin: l.gstin || '',
      openingBalance: l.openingBalance ? String(l.openingBalance) : '',
      openingSide: (l.openingSide || 'D').toUpperCase().startsWith('C') ? 'C' : 'D',
      contactPerson: l.contactPerson || '',
      city: l.city || '',
      state: l.state || '',
      mobile: l.mobile || '',
    });
    setLedgerModal('edit');
  }

  async function saveLedger() {
    if (!ledgerForm.name.trim()) {
      toast('Ledger name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: ledgerForm.name.trim(),
        groupId: ledgerForm.groupId || null,
        nature: ledgerForm.nature || null,
        ledgerType: ledgerForm.ledgerType || null,
        gstin: ledgerForm.gstin.trim() || null,
        openingBalance: Number(ledgerForm.openingBalance) || 0,
        openingSide: ledgerForm.openingSide,
        contactPerson: ledgerForm.contactPerson.trim() || null,
        city: ledgerForm.city.trim() || null,
        state: ledgerForm.state.trim() || null,
        mobile: ledgerForm.mobile.trim() || null,
      };
      if (ledgerModal === 'edit' && editingLedger) {
        await fetchApi(`/books/ledgers/${editingLedger.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('Ledger updated', 'success');
      } else {
        await fetchApi('/books/ledgers', { method: 'POST', body: JSON.stringify(body) });
        toast('Ledger created', 'success');
      }
      setLedgerModal(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save ledger', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeLedger(l: LedgerRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (l.isSystem) {
      toast('System ledgers cannot be deleted', 'error');
      return;
    }
    if (!window.confirm(`Delete ledger "${l.name}"?`)) return;
    try {
      await fetchApi(`/books/ledgers/${l.id}`, { method: 'DELETE' });
      toast('Ledger deleted', 'success');
      await load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete ledger', 'error');
    }
  }

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupForm(emptyGroupForm());
    setGroupModal('create');
  }

  function openEditGroup(g: GroupRow) {
    setEditingGroup(g);
    setGroupForm({
      name: g.name,
      nature: g.nature || 'A',
      parentId: g.parentId || '',
      groupCode: g.groupCode || '',
    });
    setGroupModal('edit');
  }

  async function saveGroup() {
    if (!groupForm.name.trim()) {
      toast('Group name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: groupForm.name.trim(),
        nature: groupForm.nature || null,
        parentId: groupForm.parentId || null,
        groupCode: groupForm.groupCode.trim() || null,
      };
      if (groupModal === 'edit' && editingGroup) {
        await fetchApi(`/books/groups/${editingGroup.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('Group updated', 'success');
      } else {
        await fetchApi('/books/groups', { method: 'POST', body: JSON.stringify(body) });
        toast('Group created', 'success');
      }
      setGroupModal(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save group', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(g: GroupRow) {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try {
      await fetchApi(`/books/groups/${g.id}`, { method: 'DELETE' });
      toast('Group deleted', 'success');
      await load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete group', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(
            [
              { id: 'ledgers' as const, label: 'Ledgers' },
              { id: 'groups' as const, label: 'Groups' },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-2.5 py-1.5 ${
                tab === t.id ? 'bg-slate-800 font-medium text-white' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'ledgers' ? (
          <button
            type="button"
            onClick={openCreateLedger}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus size={16} /> New ledger
          </button>
        ) : (
          <button
            type="button"
            onClick={openCreateGroup}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus size={16} /> New group
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {tab === 'ledgers' ? (
        <>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search ledgers…"
            className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <p className="text-sm text-slate-500">
            Click a row for statement. Use edit to set opening balance, group, and contact details.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2 text-right">Opening</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No ledgers yet — create one or import from Miracle.
                    </td>
                  </tr>
                ) : (
                  ledgers.map(l => (
                    <tr
                      key={l.id}
                      className="border-t border-slate-100 cursor-pointer hover:bg-orange-50/50"
                      onClick={() => onOpenStatement({ id: l.id, name: l.name })}
                    >
                      <td className="px-3 py-2 font-medium text-orange-800">{l.name}</td>
                      <td className="px-3 py-2 text-slate-600">{l.ledgerType || l.nature || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{l.groupName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {[l.contactPerson, l.city, l.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{openingLabel(l)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          title="Edit"
                          onClick={e => openEditLedger(l, e)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          <Pencil size={14} />
                        </button>
                        {!l.isSystem && (
                          <button
                            type="button"
                            title="Delete"
                            onClick={e => void removeLedger(l, e)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Nature</th>
                <th className="px-3 py-2">Parent</th>
                <th className="px-3 py-2 text-right">Ledgers</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No groups yet — create one to organise the chart of accounts.
                  </td>
                </tr>
              ) : (
                groups.map(g => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{g.name}</td>
                    <td className="px-3 py-2 text-slate-600">{g.nature || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{g.parentName || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.ledgerCount}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEditGroup(g)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeGroup(g)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {ledgerModal != null && (
        <AppModal
          onClose={() => setLedgerModal(null)}
          title={ledgerModal === 'edit' ? 'Edit ledger' : 'New ledger'}
          size="lg"
        >
          <FormGrid>
            <FormField label="Name" required className="sm:col-span-2">
              <input
                value={ledgerForm.name}
                onChange={e => setLedgerForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Group">
              <select
                value={ledgerForm.groupId}
                onChange={e => setLedgerForm(f => ({ ...f, groupId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Nature">
              <select
                value={ledgerForm.nature}
                onChange={e => setLedgerForm(f => ({ ...f, nature: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {NATURES.map(n => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Ledger type">
              <select
                value={ledgerForm.ledgerType}
                onChange={e => setLedgerForm(f => ({ ...f, ledgerType: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {LEDGER_TYPES.map(t => (
                  <option key={t.value || 'none'} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="GSTIN">
              <input
                value={ledgerForm.gstin}
                onChange={e => setLedgerForm(f => ({ ...f, gstin: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Opening balance">
              <input
                type="number"
                min={0}
                step="0.01"
                value={ledgerForm.openingBalance}
                onChange={e => setLedgerForm(f => ({ ...f, openingBalance: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Opening side">
              <select
                value={ledgerForm.openingSide}
                onChange={e => setLedgerForm(f => ({ ...f, openingSide: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="D">Debit (Dr)</option>
                <option value="C">Credit (Cr)</option>
              </select>
            </FormField>
            <FormField label="Contact person">
              <input
                value={ledgerForm.contactPerson}
                onChange={e => setLedgerForm(f => ({ ...f, contactPerson: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Mobile">
              <input
                value={ledgerForm.mobile}
                onChange={e => setLedgerForm(f => ({ ...f, mobile: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="City">
              <input
                value={ledgerForm.city}
                onChange={e => setLedgerForm(f => ({ ...f, city: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="State">
              <input
                value={ledgerForm.state}
                onChange={e => setLedgerForm(f => ({ ...f, state: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
          </FormGrid>
          <ModalActions>
            <ModalActionButton variant="secondary" onClick={() => setLedgerModal(null)}>
              Cancel
            </ModalActionButton>
            <ModalActionButton variant="primary" disabled={saving} onClick={() => void saveLedger()}>
              {saving ? 'Saving…' : 'Save'}
            </ModalActionButton>
          </ModalActions>
        </AppModal>
      )}

      {groupModal != null && (
        <AppModal onClose={() => setGroupModal(null)} title={groupModal === 'edit' ? 'Edit group' : 'New group'}>
          <FormGrid>
            <FormField label="Name" required className="sm:col-span-2">
              <input
                value={groupForm.name}
                onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label="Nature">
              <select
                value={groupForm.nature}
                onChange={e => setGroupForm(f => ({ ...f, nature: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {NATURES.map(n => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Parent group">
              <select
                value={groupForm.parentId}
                onChange={e => setGroupForm(f => ({ ...f, parentId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {groups
                  .filter(g => !editingGroup || g.id !== editingGroup.id)
                  .map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label="Group code" className="sm:col-span-2">
              <input
                value={groupForm.groupCode}
                onChange={e => setGroupForm(f => ({ ...f, groupCode: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </FormField>
          </FormGrid>
          <ModalActions>
            <ModalActionButton variant="secondary" onClick={() => setGroupModal(null)}>
              Cancel
            </ModalActionButton>
            <ModalActionButton variant="primary" disabled={saving} onClick={() => void saveGroup()}>
              {saving ? 'Saving…' : 'Save'}
            </ModalActionButton>
          </ModalActions>
        </AppModal>
      )}
    </div>
  );
}
