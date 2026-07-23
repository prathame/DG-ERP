/**
 * Desktop-only glass Settings chrome: sticky left tabs.
 * Cap / phone keep the long-scroll SettingsView tree (display:contents wrappers).
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type DesktopSettingsTabId = 'personal' | 'company' | 'gst' | 'bill' | 'data' | 'preferences' | 'users';

export type DesktopSettingsTab = {
  id: DesktopSettingsTabId;
  label: string;
  icon: LucideIcon;
  hidden?: boolean;
};

type NavProps = {
  tabs: DesktopSettingsTab[];
  activeTab: DesktopSettingsTabId;
  onTabChange: (id: DesktopSettingsTabId) => void;
};

export function DesktopSettingsTabNav({ tabs, activeTab, onTabChange }: NavProps) {
  const visible = tabs.filter(t => !t.hidden);

  return (
    <aside className="w-56 shrink-0 sticky top-4 flex flex-col gap-1.5">
      {visible.map(t => {
        const Icon = t.icon;
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all',
              active
                ? 'dg-bg-primary shadow-sm'
                : 'dg-glass-card dg-muted hover:bg-[var(--dg-input)] hover:text-[var(--dg-ink)]',
            )}
          >
            <Icon size={18} className="shrink-0" strokeWidth={2} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </aside>
  );
}

type PanelProps = NavProps & {
  children: React.ReactNode;
};

/** Full shell: Global Settings header + left tabs + right glass sheet. */
export function DesktopSettingsPanel({ tabs, activeTab, onTabChange, children }: PanelProps) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold dg-ink tracking-tight">Global Settings</h2>
        <p className="text-sm dg-muted mt-1.5 max-w-xl leading-relaxed">
          Configure your workspace identity, tax compliance, and automated data workflows.
        </p>
      </div>
      <div className="flex gap-8 items-start">
        <DesktopSettingsTabNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
        <div className="flex-1 min-w-0 min-h-[560px]">
          <div className="dg-glass-card rounded-2xl p-6 sm:p-8 space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
