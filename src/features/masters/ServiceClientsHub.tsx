import React, { useEffect, useState } from 'react';
import { IndianRupee, Users } from 'lucide-react';
import { MastersView, type MasterType } from './MastersView';
import { InvoiceFinanceView } from '../finance/InvoiceFinanceView';
import type { Tab } from '../../types';

export type ServiceClientsPanel = 'directory' | 'outstanding';

/**
 * Service-only hub: client directory (Masters) + collections (Invoice Finance).
 * Keeps tab ids `masters` / `finance` for deep links and SA toggles.
 */
export function ServiceClientsHub({
  panel,
  onPanelChange,
  setActiveTab,
  user,
  businessType = 'service',
  launch,
  onLaunchConsumed,
  financeAccessLevel = 'full',
  canDirectory = true,
  canOutstanding = true,
}: {
  panel: ServiceClientsPanel;
  onPanelChange: (panel: ServiceClientsPanel) => void;
  setActiveTab: (tab: Tab) => void;
  user?: Record<string, unknown> | null;
  businessType?: string;
  launch?: {
    master?: MasterType;
    vendorId?: string;
    staffId?: string;
    staffName?: string;
  } | null;
  onLaunchConsumed?: () => void;
  financeAccessLevel?: 'hidden' | 'view' | 'print' | 'full';
  canDirectory?: boolean;
  canOutstanding?: boolean;
}) {
  const [active, setActive] = useState<ServiceClientsPanel>(panel);

  useEffect(() => {
    setActive(panel);
  }, [panel]);

  const select = (next: ServiceClientsPanel) => {
    if (next === 'directory' && !canDirectory) return;
    if (next === 'outstanding' && !canOutstanding) return;
    setActive(next);
    onPanelChange(next);
    // Keep App activeTab in sync for deep links / analytics / invoices shortcuts
    setActiveTab(next === 'outstanding' ? 'finance' : 'masters');
  };

  const tabs: { id: ServiceClientsPanel; label: string; hint: string; icon: React.ReactNode; show: boolean }[] = [
    {
      id: 'directory',
      label: 'Directory',
      hint: 'Add clients, prices, banks, staff',
      icon: <Users size={16} />,
      show: canDirectory,
    },
    {
      id: 'outstanding',
      label: 'Collections',
      hint: 'Who owes · receive payments',
      icon: <IndianRupee size={16} />,
      show: canOutstanding && financeAccessLevel !== 'hidden',
    },
  ];

  const visibleTabs = tabs.filter(t => t.show);
  const effective = visibleTabs.some(t => t.id === active) ? active : (visibleTabs[0]?.id ?? 'directory');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients & collections</h1>
          <p className="text-sm text-slate-500">
            Directory creates client profiles; Collections is where you see invoices and payments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                effective === t.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title={t.hint}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {effective === 'directory' ? (
        <MastersView
          setActiveTab={setActiveTab}
          user={user}
          businessType={businessType}
          launch={launch}
          onLaunchConsumed={onLaunchConsumed}
        />
      ) : (
        <InvoiceFinanceView accessLevel={financeAccessLevel === 'hidden' ? 'view' : financeAccessLevel} />
      )}
    </div>
  );
}
