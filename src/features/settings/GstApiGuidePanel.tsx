import React, { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../i18n';

const SETUP_STEPS = ['setup1', 'setup2', 'setup3', 'setup4', 'setup5', 'setup6'] as const;
const USE_STEPS = ['use1', 'use2', 'use3', 'use4', 'use5'] as const;
const TIPS = ['tip1', 'tip2', 'tip3'] as const;

export function GstApiGuidePanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold text-sm text-indigo-950">
          <BookOpen size={16} className="shrink-0 text-indigo-600" />
          {t('settings.gstApiGuide.title')}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-indigo-600 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="px-4 pb-4 space-y-4 border-t border-indigo-100 text-indigo-950">
          <p className="text-xs leading-relaxed text-indigo-900/85 pt-3">{t('settings.gstApiGuide.intro')}</p>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-2">
              {t('settings.gstApiGuide.setupTitle')}
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
              {SETUP_STEPS.map(key => (
                <li key={key}>{t(`settings.gstApiGuide.${key}`)}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-2">
              {t('settings.gstApiGuide.useTitle')}
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
              {USE_STEPS.map(key => (
                <li key={key}>{t(`settings.gstApiGuide.${key}`)}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white/70 px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-1.5">
              {t('settings.gstApiGuide.tipsTitle')}
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed text-indigo-900/90">
              {TIPS.map(key => (
                <li key={key}>{t(`settings.gstApiGuide.${key}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
