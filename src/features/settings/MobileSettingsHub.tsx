/**
 * Cap phone Settings hub (incl. service) — modules open real Settings sections.
 * No fake “Save All”; each section keeps its own save buttons.
 */
import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../i18n';
import { isServicePhoneUx } from '../../platforms/service-cloud/mode';
import { getBusinessConfig } from '../../lib/businessTypeConfig';
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

const BLURB_KEYS: Partial<Record<DesktopSettingsTabId, string>> = {
  personal: 'settings.blurbPersonal',
  company: 'settings.blurbCompany',
  gst: 'settings.blurbGst',
  bill: 'settings.blurbBill',
  data: 'settings.blurbData',
  preferences: 'settings.blurbPreferences',
  guide: 'settings.blurbGuide',
  users: 'settings.blurbUsers',
};

export function moduleBlurb(id: DesktopSettingsTabId, t: (key: string) => string, fallback = ''): string {
  const key = BLURB_KEYS[id];
  return key ? t(key) : fallback;
}

export function MobileSettingsHub({ userName, userEmail, userRole, modules, onOpen }: Props) {
  const { t } = useTranslation();
  // Service phone (offline + online Cap) stays on the Emergent flat shell — never glass.
  const flat = isServicePhoneUx(getBusinessConfig().type);
  const visible = modules.filter(m => !m.hidden);
  const initial = (userName || '?').charAt(0).toUpperCase();

  return (
    <div className={cn('space-y-4 -mx-3 px-3 pb-4', !flat && 'dg-mobile-glass')}>
      <div>
        <h2 className={cn('text-2xl font-bold tracking-tight', flat ? 'text-gray-900' : 'dg-m-ink')}>
          {t('settings.globalTitle')}
        </h2>
        <p className={cn('text-[12px] mt-1', flat ? 'text-gray-500' : 'dg-m-muted')}>
          {t('settings.globalSubtitleMobile')}
        </p>
      </div>

      {userName ? (
        <div
          className={cn(
            'rounded-2xl p-4 flex items-center gap-3',
            flat ? 'bg-white border border-gray-100 shadow-sm' : 'dg-m-glass-card',
          )}
        >
          <div
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0',
              flat ? 'bg-brand text-white' : 'dg-m-bg-primary',
            )}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={cn('text-base font-bold truncate', flat ? 'text-gray-900' : 'dg-m-ink')}>{userName}</h3>
            <p className={cn('text-[12px] truncate', flat ? 'text-gray-500' : 'dg-m-muted')}>
              {userEmail || userRole || '—'}
            </p>
            {userRole ? (
              <span
                className={cn(
                  'inline-flex mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                  flat
                    ? 'bg-orange-50 text-brand'
                    : 'bg-[color-mix(in_srgb,var(--dg-primary-bright)_16%,transparent)] dg-m-bright',
                )}
              >
                {userRole}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <h4
          className={cn(
            'text-[11px] font-bold uppercase tracking-widest mb-2 px-0.5',
            flat ? 'text-gray-400' : 'dg-m-faint',
          )}
        >
          {t('settings.configurationModules')}
        </h4>
        <div
          className={cn(
            'rounded-2xl overflow-hidden',
            flat
              ? 'bg-white border border-gray-100 shadow-sm divide-y divide-gray-100'
              : 'dg-m-glass-card divide-y divide-[var(--dg-card-border)]',
          )}
        >
          {visible.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-3.5 text-left',
                  flat ? 'active:bg-gray-50' : 'active:bg-[var(--dg-input)]',
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    flat
                      ? 'bg-orange-50 text-brand'
                      : 'bg-[color-mix(in_srgb,var(--dg-primary-bright)_14%,transparent)] dg-m-bright',
                  )}
                >
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[13px] font-bold', flat ? 'text-gray-900' : 'dg-m-ink')}>{m.label}</p>
                  <p className={cn('text-[11px] truncate', flat ? 'text-gray-500' : 'dg-m-muted')}>
                    {m.blurb || moduleBlurb(m.id, t)}
                  </p>
                </div>
                <ChevronRight size={18} className={flat ? 'text-gray-300 shrink-0' : 'dg-m-faint shrink-0'} />
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
  const { t } = useTranslation();
  // Service phone (offline + online Cap) stays on the Emergent flat shell — never glass.
  const flat = isServicePhoneUx(getBusinessConfig().type);
  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-[45] border-b',
        'px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2',
        flat
          ? 'bg-white border-gray-100'
          : 'dg-mobile-glass border-[var(--dg-card-border)] bg-[var(--dg-header)] backdrop-blur-md',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('text-lg font-bold truncate', flat ? 'text-gray-900' : 'dg-m-ink')}>{title}</h3>
          {subtitle ? (
            <p className={cn('text-[11px] mt-0.5', flat ? 'text-gray-500' : 'dg-m-muted')}>{subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'h-9 px-3 rounded-full text-[12px] font-bold shrink-0',
            flat ? 'bg-gray-100 text-gray-900' : 'bg-[var(--dg-input)] dg-m-ink',
          )}
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
