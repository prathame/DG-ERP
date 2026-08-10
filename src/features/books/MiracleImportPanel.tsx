import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { session } from '../../lib/session';
import { resolveApiUrl } from '../../platforms/shared';
import { ensureCorrelationId } from '../../lib/logger';
import { appClientHeader } from '../../lib/deviceId';
import { serviceCloudClientHeader } from '../../platforms/service-cloud/mode';
import { useTranslation } from '../../i18n';

export interface MiracleImportIssue {
  stage: string;
  message: string;
  externalRef?: string;
  row?: number;
}

export interface MiracleImportUploadResult {
  jobId: string;
  summary: Record<string, unknown>;
  errors: MiracleImportIssue[];
  warnings: MiracleImportIssue[];
}

export function summaryCount(s: Record<string, unknown> | undefined, key: string): number {
  const v = s?.[key];
  return typeof v === 'number' ? v : Number(v) || 0;
}

export function formatMiracleIssue(issue: MiracleImportIssue): string {
  const bits = [issue.message];
  if (issue.externalRef) bits.push(`(${issue.externalRef})`);
  if (issue.row != null) bits.push(`row ${issue.row}`);
  if (issue.stage) bits.push(`[${issue.stage}]`);
  return bits.join(' ');
}

export async function uploadMiracleFile(file: File): Promise<MiracleImportUploadResult> {
  const token = session.getToken();
  const tenantId = session.getTenantId();
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {
    'X-Correlation-ID': ensureCorrelationId(),
    'X-DG-Client': serviceCloudClientHeader() || appClientHeader(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  const res = await fetch(resolveApiUrl('/api/books/import/miracle'), {
    method: 'POST',
    headers,
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || 'Import failed');
  const parsed = body as {
    jobId: string;
    summary: Record<string, unknown>;
    errors?: MiracleImportIssue[];
    warnings?: MiracleImportIssue[];
  };
  return {
    jobId: parsed.jobId,
    summary: parsed.summary || {},
    errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}

export function MiracleImportIssues({
  errors,
  warnings,
}: {
  errors: MiracleImportIssue[];
  warnings: MiracleImportIssue[];
}) {
  const { t } = useTranslation();
  return (
    <>
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 text-left">
          <p className="font-semibold">
            {errors.length} {t('masters.importRowErrors')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((issue, i) => (
              <li key={`err-${i}`}>{formatMiracleIssue(issue)}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 text-left">
          <p className="font-semibold">
            {warnings.length} {t('masters.importWarnings')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((issue, i) => (
              <li key={`warn-${i}`}>{formatMiracleIssue(issue)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function buildSuccessMessage(s: Record<string, unknown>): string {
  return (
    `Imported ${String(s.companyName || 'company')} into Dhandho: ` +
    `${summaryCount(s, 'vendors')} vendors, ${summaryCount(s, 'opsProducts')} products, ` +
    `${summaryCount(s, 'invoices')} invoices, ${summaryCount(s, 'vendorPayments') + summaryCount(s, 'invoicePayments')} payments` +
    ` (Books: ${summaryCount(s, 'ledgers')} ledgers, ${summaryCount(s, 'vouchers')} vouchers)`
  );
}

/** Shared Miracle CMP upload UI — used by Books and Masters → Import data. */
export function MiracleImportPanel({
  onComplete,
}: {
  onComplete?: (result: MiracleImportUploadResult) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<MiracleImportIssue[]>([]);
  const [warnings, setWarnings] = useState<MiracleImportIssue[]>([]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setMessage(null);
    setError(null);
    setErrors([]);
    setWarnings([]);
    try {
      const result = await uploadMiracleFile(file);
      setMessage(buildSuccessMessage(result.summary || {}));
      setErrors(result.errors);
      setWarnings(result.warnings);
      await onComplete?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('masters.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 text-left">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-left">
          {error}
        </div>
      )}
      <MiracleImportIssues errors={errors} warnings={warnings} />

      <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/40 p-8 text-center">
        <FileUp className="mx-auto mb-3 text-orange-500" size={36} />
        <h2 className="text-lg font-semibold text-slate-900">{t('masters.importMiracleTitle')}</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">{t('masters.importMiracleBody')}</p>
        <label
          className={`mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${
            importing
              ? 'cursor-not-allowed bg-orange-400 opacity-70'
              : 'cursor-pointer bg-orange-500 hover:bg-orange-600'
          }`}
        >
          {importing ? t('masters.importing') : t('masters.importChooseFile')}
          <input
            type="file"
            accept=".rar,.zip,application/zip,application/x-rar-compressed"
            className="hidden"
            disabled={importing}
            onChange={e => onFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>
    </div>
  );
}
