import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import type { RewardPoint } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';

export function RewardsView({ user }: { user?: { role?: string; vendorId?: string } | null }) {
  const { toast } = useToast();
  const vendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const [rewards, setRewards] = useState<RewardPoint[]>([]);
  const [balance, setBalance] = useState(0);
  const [filter, setFilter] = useState<'All' | 'Earned' | 'Redeemed'>('All');
  const [loading, setLoading] = useState(true);
  const [rewardsSummary, setRewardsSummary] = useState<{ vendorSummaries: { vendorName: string; productsSold: number; totalRewardPoints: number }[] } | null>(null);
  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [redeemForm, setRedeemForm] = useState({ points: '', description: '' });
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [redemptionSettings, setRedemptionSettings] = useState<{ minBalance: number; minPoints: number } | null>(null);

  useEffect(() => {
    if (vendorId) {
      setLoading(true);
      Promise.all([
        api.rewards.list(filter !== 'All' ? filter : undefined, vendorId),
        api.dashboard.vendor(vendorId),
      ])
        .then(([r, d]) => {
          setRewards(r);
          setBalance(d.vendor.totalRewardPoints ?? 0);
          setRewardsSummary({
            vendorSummaries: [{ vendorName: d.vendor.name, productsSold: d.vendor.totalSales ?? 0, totalRewardPoints: d.vendor.totalRewardPoints ?? 0 }],
          });
        })
        .catch(() => setRewards([]))
        .finally(() => setLoading(false));
    } else {
      Promise.all([
        api.rewards.list(filter !== 'All' ? filter : undefined),
        api.rewards.balance(),
        api.dashboard.rewardsSummary().catch(() => null),
      ])
        .then(([r, b, rs]) => {
          setRewards(r);
          setBalance(b.balance);
          setRewardsSummary(rs ?? null);
        })
        .catch(() => setRewards([]))
        .finally(() => setLoading(false));
    }
  }, [filter, vendorId]);

  useEffect(() => {
    api.redemptionSettings.get().then(setRedemptionSettings).catch(() => setRedemptionSettings({ minBalance: 100, minPoints: 50 }));
  }, []);

  const minBalance = redemptionSettings?.minBalance ?? 100;
  const minPoints = redemptionSettings?.minPoints ?? 50;
  const meetsRedemptionThreshold = balance >= minBalance;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const pts = parseInt(redeemForm.points, 10);
    if (!pts || pts <= 0) { toast('Enter valid points', 'error'); return; }
    if (pts > balance) { toast('Insufficient balance', 'error'); return; }
    if (balance < minBalance) { toast(`Minimum balance of ${minBalance} pts required to redeem`, 'error'); return; }
    if (pts < minPoints) { toast(`Minimum ${minPoints} pts per redemption`, 'error'); return; }
    setRedeemSubmitting(true);
    try {
      await api.rewards.create({ userId: 'D1', points: pts, type: 'Redeemed', description: redeemForm.description || 'Points redeemed', vendorId });
      setRedeemModalOpen(false);
      setRedeemForm({ points: '', description: '' });
      if (vendorId) {
        const d = await api.dashboard.vendor(vendorId);
        setBalance(d.vendor.totalRewardPoints ?? 0);
      } else {
        const b = await api.rewards.balance();
        setBalance(b.balance);
      }
      const r = await api.rewards.list(filter !== 'All' ? filter : undefined, vendorId);
      setRewards(r);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Redemption failed', 'error');
    } finally {
      setRedeemSubmitting(false);
    }
  };
  const canRedeem = true; // Both vendors and non-vendors can redeem

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      {rewardsSummary && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-lg mb-4">Vendor Reward Summary</h3>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {rewardsSummary.vendorSummaries.map((v, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="font-medium">{v.vendorName}</span>
                <div className="text-right text-sm">
                  <span className="text-gray-600">{v.productsSold} sold</span>
                  <span className="ml-2 font-bold text-emerald-600">{v.totalRewardPoints} pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#151619] text-white p-5 sm:p-8 rounded-3xl relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F27D26] blur-[80px] opacity-20" />
            <div className="relative z-10">
              <p className="text-gray-400 text-sm font-medium mb-2">Total Points Balance</p>
              <h2 className="text-4xl font-bold mb-2">{balance.toLocaleString()} <span className="text-lg font-normal text-gray-500">pts</span></h2>
              {canRedeem && redemptionSettings && (
                <p className="text-xs text-gray-500 mb-6">Redeem when balance ≥ {minBalance} pts (min {minPoints} pts per redemption)</p>
              )}
              {(!canRedeem || !redemptionSettings) && <div className="mb-6" />}
              <div className="flex gap-4">
                <button type="button" onClick={() => canRedeem && setRedeemModalOpen(true)} disabled={!canRedeem} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-colors", canRedeem ? "bg-[#F27D26] text-white hover:bg-[#D96A1C]" : "bg-white/10 text-white/50 cursor-not-allowed")}>
                  Redeem Now
                </button>
                <button type="button" onClick={() => setFilter('Redeemed')} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors">
                  History
                </button>
              </div>
            </div>
          </div>

        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <h3 className="text-lg font-bold">Points History</h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => rewards.length && exportToCsv(rewards.map((r) => ({ id: r.id, date: r.date, type: r.type, points: r.points, description: r.description })), 'rewards')} disabled={!rewards.length} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#F27D26] hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Download size={16} /> Export CSV
              </button>
              {(['All', 'Earned', 'Redeemed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-full",
                    filter === f ? "bg-[#F27D26] text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {loading ? (
              <div className="py-12"><LoadingSpinner /></div>
            ) : rewards.length === 0 ? (
              <div className="py-12 text-center">
                <Gift className="mx-auto mb-3 text-gray-300" size={40} />
                <p className="text-gray-500 font-medium">No points history yet</p>
                <p className="text-gray-400 text-sm mt-1">Points are earned when products are sold</p>
              </div>
            ) : (
              rewards.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      r.type === 'Earned' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    )}>
                      {r.type === 'Earned' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                    </div>
                    <div>
                      <p className="font-bold">{r.description}</p>
                      <p className="text-xs text-gray-500">{r.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-bold text-lg", r.type === 'Earned' ? 'text-emerald-600' : 'text-rose-600')}>
                      {r.type === 'Earned' ? '+' : '-'}{r.points}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{r.type}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {redeemModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setRedeemModalOpen(false)} aria-hidden="true" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Redeem Points</h3>
              <p className="text-sm text-gray-500 mb-4">Min balance: {minBalance} pts • Min per redemption: {minPoints} pts</p>
              <form onSubmit={handleRedeem} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Points to redeem</label><input type="number" min={minPoints} max={balance} value={redeemForm.points} onChange={(e) => setRedeemForm({ ...redeemForm, points: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder={`Min ${minPoints} - Max ${balance} pts`} /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Description (optional)</label><input value={redeemForm.description} onChange={(e) => setRedeemForm({ ...redeemForm, description: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="e.g. Gift voucher" /></div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setRedeemModalOpen(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={redeemSubmitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{redeemSubmitting ? 'Redeeming...' : 'Redeem'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
