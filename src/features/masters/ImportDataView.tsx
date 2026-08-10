import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { MiracleImportPanel } from '../books/MiracleImportPanel';

/** Masters hub screen for Miracle CMP import (same API as Books → Miracle Import). */
export function ImportDataView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('masters.importData')}</h1>
          <p className="text-sm text-slate-500">{t('masters.importDataSubtitle')}</p>
        </div>
      </div>

      <MiracleImportPanel />
    </div>
  );
}
