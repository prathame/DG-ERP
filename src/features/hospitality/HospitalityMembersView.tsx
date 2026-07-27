import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, RefreshCw, RotateCcw } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { hospApi, type HospMember, type HospMembershipPlan } from './hospApi';
import {
  useHospShell,
  hospPageClass,
  hospEyebrowClass,
  hospTitleClass,
  hospSubClass,
  hospCardClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospInputClass,
  hospChipActive,
  hospChipIdle,
} from './hospUi';
import { cn } from '../../lib/utils';

type Section = 'members' | 'plans';

export function HospitalityMembersView() {
  const shell = useHospShell();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>('members');
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<HospMembershipPlan[]>([]);
  const [members, setMembers] = useState<HospMember[]>([]);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onYes: () => void } | null>(null);

  const [planForm, setPlanForm] = useState<{
    id?: string;
    name: string;
    period: 'monthly' | 'yearly';
    fee: string;
    discountPercent: string;
    useMemberPrices: boolean;
    active: boolean;
  } | null>(null);

  const [memberForm, setMemberForm] = useState<{
    id?: string;
    name: string;
    phone: string;
    planId: string;
    status: 'active' | 'expired' | 'cancelled';
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([hospApi.membershipPlans(), hospApi.members()]);
      setPlans(p.plans);
      setMembers(m.members);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const [memberQ, setMemberQ] = useState('');
  const filteredMembers = members.filter(m => {
    const q = memberQ.trim().toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.includes(q) || (m.plan_name || '').toLowerCase().includes(q);
  });

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Members</h1>
          <p className={hospSubClass(shell)}>Plans and registry — member prices apply on new order lines</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {section === 'plans' ? (
            <button
              type="button"
              className={hospPrimaryBtn(shell)}
              onClick={() =>
                setPlanForm({
                  name: '',
                  period: 'monthly',
                  fee: '0',
                  discountPercent: '0',
                  useMemberPrices: false,
                  active: true,
                })
              }
            >
              <Plus size={14} className="mr-1" /> Add plan
            </button>
          ) : (
            <button
              type="button"
              className={hospPrimaryBtn(shell)}
              disabled={!plans.length}
              onClick={() =>
                setMemberForm({
                  name: '',
                  phone: '',
                  planId: plans.find(p => p.active)?.id || plans[0]?.id || '',
                  status: 'active',
                })
              }
            >
              <Plus size={14} className="mr-1" /> Add member
            </button>
          )}
          <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()}>
            <RefreshCw size={14} className="mr-1.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(
          [
            { id: 'members' as const, label: 'Registry' },
            { id: 'plans' as const, label: 'Plans' },
          ] as const
        ).map(t => (
          <button
            key={t.id}
            type="button"
            className={section === t.id ? hospChipActive(shell) : hospChipIdle(shell)}
            onClick={() => setSection(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={cn(hospCardClass(shell), 'p-8 text-center text-sm', hospSubClass(shell))}>Loading…</div>
      ) : section === 'plans' ? (
        <section className="space-y-3">
          {plans.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map(p => (
                <article key={p.id} className={cn(hospCardClass(shell), 'p-4')}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <h3 className="font-bold">{p.name}</h3>
                      <p className={cn('text-xs', hospSubClass(shell))}>
                        {p.period} · fee ₹{Number(p.fee).toLocaleString('en-IN')}
                        {!p.active ? ' · inactive' : ''}
                      </p>
                      <p className="text-sm mt-1">
                        {p.use_member_prices ? 'Member prices' : `${Number(p.discount_percent)}% off`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={hospSecondaryBtn(shell)}
                      onClick={() =>
                        setPlanForm({
                          id: p.id,
                          name: p.name,
                          period: p.period,
                          fee: String(p.fee),
                          discountPercent: String(p.discount_percent),
                          useMemberPrices: p.use_member_prices,
                          active: p.active,
                        })
                      }
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={cn(hospCardClass(shell), 'p-8 text-center space-y-3')}>
              <p className="font-semibold">No plans yet</p>
              <p className={cn('text-sm max-w-sm mx-auto', hospSubClass(shell))}>
                Create a membership plan (fee + discount or member prices), then add guests to the registry.
              </p>
              <button
                type="button"
                className={hospPrimaryBtn(shell)}
                onClick={() =>
                  setPlanForm({
                    name: '',
                    period: 'monthly',
                    fee: '499',
                    discountPercent: '10',
                    useMemberPrices: false,
                    active: true,
                  })
                }
              >
                <Plus size={14} className="mr-1" /> Add plan
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {!plans.length ? (
            <div className={cn(hospCardClass(shell), 'p-8 text-center space-y-3')}>
              <p className="font-semibold">Create a plan first</p>
              <p className={cn('text-sm', hospSubClass(shell))}>Members need a plan before you can register them.</p>
              <button type="button" className={hospPrimaryBtn(shell)} onClick={() => setSection('plans')}>
                Go to Plans
              </button>
            </div>
          ) : (
            <>
              <input
                className={cn(hospInputClass(shell), 'w-full max-w-md')}
                placeholder="Search name or mobile"
                value={memberQ}
                onChange={e => setMemberQ(e.target.value)}
              />
              {filteredMembers.length > 0 ? (
                <div className="space-y-2">
                  {filteredMembers.map(m => (
                    <article
                      key={m.id}
                      className={cn(hospCardClass(shell), 'p-3 flex flex-wrap justify-between gap-2 items-center')}
                    >
                      <div>
                        <p className="font-semibold">
                          {m.name} · {m.phone}
                        </p>
                        <p className={cn('text-xs', hospSubClass(shell))}>
                          {m.plan_name} · {m.status}
                          {m.currently_active ? ' · active now' : ''} · until {String(m.valid_until).slice(0, 10)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={hospSecondaryBtn(shell)}
                          title="Renew"
                          onClick={() =>
                            void hospApi
                              .renewMember(m.id)
                              .then(() => {
                                toast('Membership renewed', 'success');
                                void load();
                              })
                              .catch(e => toast(e instanceof Error ? e.message : 'Renew failed', 'error'))
                          }
                        >
                          <RotateCcw size={14} className="mr-1" /> Renew
                        </button>
                        <button
                          type="button"
                          className={hospSecondaryBtn(shell)}
                          onClick={() =>
                            setMemberForm({
                              id: m.id,
                              name: m.name,
                              phone: m.phone,
                              planId: m.plan_id,
                              status: m.status,
                            })
                          }
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={cn(hospCardClass(shell), 'p-8 text-center space-y-3')}>
                  <p className="font-semibold">{memberQ.trim() ? 'No matches' : 'No members yet'}</p>
                  <p className={cn('text-sm', hospSubClass(shell))}>
                    {memberQ.trim()
                      ? 'Try another name or mobile.'
                      : 'Register guests by phone so waiters can attach member pricing on orders.'}
                  </p>
                  {!memberQ.trim() && (
                    <button
                      type="button"
                      className={hospPrimaryBtn(shell)}
                      onClick={() =>
                        setMemberForm({
                          name: '',
                          phone: '',
                          planId: plans.find(p => p.active)?.id || plans[0]?.id || '',
                          status: 'active',
                        })
                      }
                    >
                      <Plus size={14} className="mr-1" /> Add member
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {planForm && (
        <Modal title={planForm.id ? 'Edit plan' : 'New plan'} onClose={() => setPlanForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name</label>
          <input
            className={hospInputClass(shell)}
            value={planForm.name}
            onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Period</label>
          <select
            className={hospInputClass(shell)}
            value={planForm.period}
            onChange={e => setPlanForm({ ...planForm, period: e.target.value as 'monthly' | 'yearly' })}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Fee (₹)</label>
          <input
            className={hospInputClass(shell)}
            inputMode="decimal"
            value={planForm.fee}
            onChange={e => setPlanForm({ ...planForm, fee: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Discount %</label>
          <input
            className={hospInputClass(shell)}
            inputMode="decimal"
            value={planForm.discountPercent}
            onChange={e => setPlanForm({ ...planForm, discountPercent: e.target.value })}
          />
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input
              type="checkbox"
              checked={planForm.useMemberPrices}
              onChange={e => setPlanForm({ ...planForm, useMemberPrices: e.target.checked })}
            />
            Use member prices on dishes (when set)
          </label>
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input
              type="checkbox"
              checked={planForm.active}
              onChange={e => setPlanForm({ ...planForm, active: e.target.checked })}
            />
            Active
          </label>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              className={cn(hospPrimaryBtn(shell), 'flex-1')}
              onClick={() => {
                const fee = Number(planForm.fee);
                const discountPercent = Number(planForm.discountPercent);
                if (!planForm.name.trim() || !Number.isFinite(fee) || fee < 0) {
                  toast('Name and fee required', 'error');
                  return;
                }
                if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
                  toast('Discount % must be 0–100', 'error');
                  return;
                }
                const body = {
                  name: planForm.name.trim(),
                  period: planForm.period,
                  fee,
                  discountPercent,
                  useMemberPrices: planForm.useMemberPrices,
                  active: planForm.active,
                };
                void (planForm.id ? hospApi.updatePlan(planForm.id, body) : hospApi.createPlan(body))
                  .then(() => {
                    toast(planForm.id ? 'Plan updated' : 'Plan created', 'success');
                    setPlanForm(null);
                    void load();
                  })
                  .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
              }}
            >
              Save
            </button>
            {planForm.id && (
              <button
                type="button"
                className={hospSecondaryBtn(shell)}
                onClick={() =>
                  setConfirm({
                    title: 'Delete plan?',
                    message: 'Only allowed if no members use this plan.',
                    onYes: () => {
                      void hospApi
                        .deletePlan(planForm.id!)
                        .then(() => {
                          toast('Plan deleted', 'success');
                          setPlanForm(null);
                          void load();
                        })
                        .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                    },
                  })
                }
              >
                Delete
              </button>
            )}
          </div>
        </Modal>
      )}

      {memberForm && (
        <Modal title={memberForm.id ? 'Edit member' : 'Add member'} onClose={() => setMemberForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name</label>
          <input
            className={hospInputClass(shell)}
            value={memberForm.name}
            onChange={e => setMemberForm({ ...memberForm, name: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Phone</label>
          <input
            className={hospInputClass(shell)}
            value={memberForm.phone}
            onChange={e => setMemberForm({ ...memberForm, phone: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Plan</label>
          <select
            className={hospInputClass(shell)}
            value={memberForm.planId}
            onChange={e => setMemberForm({ ...memberForm, planId: e.target.value })}
          >
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {memberForm.id && (
            <>
              <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Status</label>
              <select
                className={hospInputClass(shell)}
                value={memberForm.status}
                onChange={e =>
                  setMemberForm({
                    ...memberForm,
                    status: e.target.value as 'active' | 'expired' | 'cancelled',
                  })
                }
              >
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </>
          )}
          <button
            type="button"
            className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
            onClick={() => {
              if (!memberForm.name.trim() || !memberForm.phone.trim() || !memberForm.planId) {
                toast('Name, phone, and plan required', 'error');
                return;
              }
              if (memberForm.id) {
                void hospApi
                  .updateMember(memberForm.id, {
                    name: memberForm.name.trim(),
                    phone: memberForm.phone.trim(),
                    planId: memberForm.planId,
                    status: memberForm.status,
                  })
                  .then(() => {
                    toast('Member updated', 'success');
                    setMemberForm(null);
                    void load();
                  })
                  .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
              } else {
                void hospApi
                  .createMember({
                    name: memberForm.name.trim(),
                    phone: memberForm.phone.trim(),
                    planId: memberForm.planId,
                  })
                  .then(() => {
                    toast('Member added', 'success');
                    setMemberForm(null);
                    void load();
                  })
                  .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
              }
            }}
          >
            Save
          </button>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            confirm.onYes();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-2xl bg-white p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-lg">{title}</h2>
          <button type="button" className="text-sm opacity-60" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
