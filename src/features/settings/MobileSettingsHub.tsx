/**
 * Cap phone Settings hub (incl. service) — modules open real Settings sections.
 * No fake “Save All”; each section keeps its own save buttons.
 */
import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DesktopSettingsTabId } from './DesktopSettingsPanel';

export type MobileSettingsModule = {
  id: DesktopSettingsTabId;
  label: string;
  blurb: string;
  icon: LucideIcon;
  hidden?: boolean;
};

type Props = {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  modules: MobileSettingsModule[];
  onOpen: (id: DesktopSettingsTabId) => void;
};

const BLURB: Partial<Record<DesktopSettingsTabId, string>> = {
  personal: 'Profile, Email, Account',
  company: 'Tax ID, Entity, Region',
  gst: 'Tax rates & GST options',
  bill: 'Colors, Logos, Visibility',
  data: 'Backups, Exports, Cloud',
  preferences: 'Language, reminders, appearance',
  users: 'Roles and access',
};

export function moduleBlurb(id: DesktopSettingsTabId, fallback = ''): string {
  return BLURB[id] || fallback;
}

export function MobileSettingsHub({ userName, userEmail, userRole, modules, onOpen }: Props) {
  const visible = modules.filter(m => !m.hidden);
  const initial = (userName || '?').charAt(0).toUpperCase();

  return (
    <div className="dg-mobile-glass space-y-4 -mx-3 px-3 pb-4">
      <div>
        <h2 className="text-2xl font-bold dg-m-ink tracking-tight">Global Settings</h2>
        <p className="text-[12px] dg-m-muted mt-1">Configure workspace identity and workflows.</p>
      </div>

      {userName ? (
        <div className="dg-m-glass-card rounded-2xl p-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-full dg-m-bg-primary flex items-center justify-center text-xl font-bold shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold dg-m-ink truncate">{userName}</h3>
            <p className="text-[12px] dg-m-muted truncate">{userEmail || userRole || '—'}</p>
            {userRole ? (
              <span className="inline-flex mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--dg-primary-bright)_16%,transparent)] dg-m-bright">
                {userRole}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-widest dg-m-faint mb-2 px-0.5">
          Configuration Modules
        </h4>
        <div className="dg-m-glass-card rounded-2xl overflow-hidden divide-y divide-[var(--dg-card-border)]">
          {visible.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                className="w-full flex items-center gap-3 px-3.5 py-3.5 text-left active:bg-[var(--dg-input)]"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--dg-primary-bright)_14%,transparent)] dg-m-bright">
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold dg-m-ink">{m.label}</p>
                  <p className="text-[11px] dg-m-muted truncate">{m.blurb || moduleBlurb(m.id)}</p>
                </div>
                <ChevronRight size={18} className="dg-m-faint shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
      {/* ponytail: no Save All FAB — sections already save themselves */}
    </div>
  );
}

type SheetChromeProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
};

/** Sticky sheet header — section panels scroll in a sibling layer in SettingsView. */
export function MobileSettingsSheetChrome({ title, subtitle, onClose }: SheetChromeProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-[45] dg-mobile-glass border-b border-[var(--dg-card-border)]',
        'px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2',
        'bg-[color-mix(in_srgb,var(--dg-bg)_92%,white)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold dg-m-ink truncate">{title}</h3>
          {subtitle ? <p className="text-[11px] dg-m-muted mt-0.5">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-3 rounded-full text-[12px] font-bold bg-[var(--dg-input)] dg-m-ink shrink-0"
        >
          Close
        </button>
      </div>
    </div>
  );
}
