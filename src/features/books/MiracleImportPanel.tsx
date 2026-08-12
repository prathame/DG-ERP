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

export interface MiracleImportCoverageBucket {
  source: number;
  imported: number;
  skipped: number;
  skipReason?: string;
}

export interface MiracleImportCoverage {
  parties: MiracleImportCoverageBucket;
  products: MiracleImportCoverageBucket;
  salesInvoices: MiracleImportCoverageBucket;
  cashIncomeInvoices: MiracleImportCoverageBucket;
  partyCash: MiracleImportCoverageBucket;
  creditNotes: MiracleImportCoverageBucket;
  debitNotes: MiracleImportCoverageBucket;
  nonPartyCashSkipped: number;
  journalsBooksOnly: number;
  purchases: MiracleImportCoverageBucket;
  /** @deprecated prefer purchases.skipped — kept for older import payloads */
  purchasesBooksOnly?: number;
  purchaseReturns: MiracleImportCoverageBucket;
  /** @deprecated prefer purchaseReturns.skipped — kept for older import payloads */
  purchaseReturnsSkipped?: number;
  contraBooksOnly: number;
  unsupportedVouchersBooksOnly: number;
  unallocatedAdvances: number;
  billMatchedPayments: number;
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

export function parseCoverage(s: Record<string, unknown> | undefined): MiracleImportCoverage | null {
  const raw = s?.coverage;
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<MiracleImportCoverage>;
  const bucket = (b: MiracleImportCoverageBucket | undefined): MiracleImportCoverageBucket => ({
    source: Number(b?.source) || 0,
    imported: Number(b?.imported) || 0,
    skipped: Number(b?.skipped) || 0,
    skipReason: b?.skipReason,
  });
  return {
    parties: bucket(c.parties),
    products: bucket(c.products),
    salesInvoices: bucket(c.salesInvoices),
    cashIncomeInvoices: bucket(c.cashIncomeInvoices),
    partyCash: bucket(c.partyCash),
    creditNotes: bucket(c.creditNotes),
    debitNotes: bucket(c.debitNotes),
    nonPartyCashSkipped: Number(c.nonPartyCashSkipped) || 0,
    journalsBooksOnly: Number(c.journalsBooksOnly) || 0,
    purchases: c.purchases
      ? bucket(c.purchases)
      : { source: 0, imported: 0, skipped: Number(c.purchasesBooksOnly) || 0 },
    purchaseReturns: c.purchaseReturns
      ? bucket(c.purchaseReturns)
      : { source: 0, imported: 0, skipped: Number(c.purchaseReturnsSkipped) || 0 },
    purchaseReturnsSkipped: Number((c.purchaseReturns ? c.purchaseReturns.skipped : c.purchaseReturnsSkipped) || 0),
    contraBooksOnly: Number(c.contraBooksOnly) || 0,
    unsupportedVouchersBooksOnly: Number(c.unsupportedVouchersBooksOnly) || 0,
    unallocatedAdvances: Number(c.unallocatedAdvances) || 0,
    billMatchedPayments: Number(c.billMatchedPayments) || 0,
  };
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

function CoverageCell({ value, tone }: { value: number; tone?: 'ok' | 'skip' | 'muted' }) {
  const cls =
    tone === 'ok'
      ? 'text-emerald-700 font-semibold'
      : tone === 'skip'
        ? 'text-slate-500'
        : tone === 'muted'
          ? 'text-slate-400'
          : 'text-slate-800';
  return <td className={`px-2 py-1.5 text-right tabular-nums ${cls}`}>{value}</td>;
}

export function MiracleImportCoverageTable({ coverage }: { coverage: MiracleImportCoverage }) {
  const { t } = useTranslation();
  const rows: Array<{
    key: string;
    label: string;
    source: number;
    imported: number;
    skipped: number;
    note?: string;
  }> = [
    {
      key: 'parties',
      label: t('masters.importCoverageParties'),
      ...coverage.parties,
      note: coverage.parties.skipReason,
    },
    {
      key: 'products',
      label: t('masters.importCoverageProducts'),
      ...coverage.products,
      note: coverage.products.skipReason,
    },
    {
      key: 'sales',
      label: t('masters.importCoverageSales'),
      ...coverage.salesInvoices,
      note: coverage.salesInvoices.skipReason,
    },
    {
      key: 'cashIncome',
      label: t('masters.importCoverageCashIncome'),
      ...coverage.cashIncomeInvoices,
      note: coverage.cashIncomeInvoices.skipReason,
    },
    {
      key: 'partyCash',
      label: t('masters.importCoveragePartyCash'),
      ...coverage.partyCash,
      note: coverage.partyCash.skipReason,
    },
    {
      key: 'creditNotes',
      label: t('masters.importCoverageCreditNotes'),
      ...coverage.creditNotes,
      note: coverage.creditNotes.skipReason,
    },
    {
      key: 'debitNotes',
      label: t('masters.importCoverageDebitNotes'),
      ...coverage.debitNotes,
      note: coverage.debitNotes.skipReason,
    },
    {
      key: 'purchases',
      label: t('masters.importCoveragePurchases'),
      ...coverage.purchases,
      note: coverage.purchases.skipReason,
    },
    {
      key: 'purchaseReturns',
      label: t('masters.importCoveragePurchaseReturnsStock'),
      ...coverage.purchaseReturns,
      note: coverage.purchaseReturns.skipReason,
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-left">
      <p className="font-semibold text-slate-900">{t('masters.importCoverageTitle')}</p>
      <p className="mt-0.5 text-xs text-slate-500">{t('masters.importCoverageSubtitle')}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 text-left font-medium">{t('masters.importCoverageCol')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('masters.importCoverageSource')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('masters.importCoverageImported')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('masters.importCoverageSkipped')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 text-slate-800">
                  {row.label}
                  {row.note && row.skipped > 0 ? (
                    <span className="mt-0.5 block text-xs text-slate-400">{row.note}</span>
                  ) : null}
                </td>
                <CoverageCell value={row.source} />
                <CoverageCell
                  value={row.imported}
                  tone={row.imported === row.source && row.source > 0 ? 'ok' : undefined}
                />
                <CoverageCell value={row.skipped} tone={row.skipped > 0 ? 'skip' : 'muted'} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(coverage.nonPartyCashSkipped > 0 ||
        coverage.journalsBooksOnly > 0 ||
        coverage.purchases.skipped > 0 ||
        coverage.purchaseReturns.skipped > 0 ||
        coverage.contraBooksOnly > 0 ||
        coverage.unsupportedVouchersBooksOnly > 0 ||
        coverage.unallocatedAdvances > 0 ||
        coverage.billMatchedPayments > 0) && (
        <ul className="mt-2 space-y-1 text-xs text-amber-800">
          {coverage.purchaseReturns.skipped > 0 && (
            <li>
              {coverage.purchaseReturns.skipped} {t('masters.importCoveragePurchaseReturns')}
            </li>
          )}
          {coverage.purchases.skipped > 0 && (
            <li>
              {coverage.purchases.skipped} {t('masters.importCoveragePurchasesBooks')}
            </li>
          )}
          {coverage.journalsBooksOnly > 0 && (
            <li>
              {coverage.journalsBooksOnly} {t('masters.importCoverageJournals')}
            </li>
          )}
          {coverage.contraBooksOnly > 0 && (
            <li>
              {coverage.contraBooksOnly} {t('masters.importCoverageContraBooks')}
            </li>
          )}
          {coverage.unsupportedVouchersBooksOnly > 0 && (
            <li>
              {coverage.unsupportedVouchersBooksOnly} {t('masters.importCoverageUnsupported')}
            </li>
          )}
          {coverage.nonPartyCashSkipped > 0 && (
            <li>
              {coverage.nonPartyCashSkipped} {t('masters.importCoverageNonPartyCash')}
            </li>
          )}
          {coverage.unallocatedAdvances > 0 && (
            <li>
              {coverage.unallocatedAdvances} {t('masters.importCoverageAdvances')}
            </li>
          )}
          {coverage.billMatchedPayments > 0 && (
            <li className="text-slate-600">
              {coverage.billMatchedPayments} {t('masters.importCoverageBillMatched')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function formatPaymentsByMethod(s: Record<string, unknown>): string {
  const raw = s.paymentsByMethod;
  if (!raw || typeof raw !== 'object') return '';
  const parts = Object.entries(raw as Record<string, unknown>)
    .filter(([, n]) => Number(n) > 0)
    .map(([method, n]) => `${method}: ${Number(n)}`)
    .sort();
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

function buildSuccessMessage(s: Record<string, unknown>, warnings: MiracleImportIssue[]): string {
  const cov = parseCoverage(s);
  const booksOnly =
    (cov?.purchaseReturns.skipped || 0) +
    (cov?.purchases.skipped || 0) +
    (cov?.journalsBooksOnly || 0) +
    (cov?.contraBooksOnly || 0) +
    (cov?.unsupportedVouchersBooksOnly || 0) +
    (cov?.nonPartyCashSkipped || 0);
  const base =
    `Imported ${String(s.companyName || 'company')} into Dhandho: ` +
    `${summaryCount(s, 'vendors')} parties, ${summaryCount(s, 'opsProducts')} products, ` +
    `${summaryCount(s, 'invoices')} invoices, ${summaryCount(s, 'vendorPayments') + summaryCount(s, 'invoicePayments')} payments` +
    formatPaymentsByMethod(s) +
    ` (Books: ${summaryCount(s, 'ledgers')} ledgers, ${summaryCount(s, 'vouchers')} vouchers).`;
  if (booksOnly > 0 || warnings.length > 0) {
    return `${base} Some Miracle rows were not dual-written to ops — see coverage and warnings (Books-only / unsupported).`;
  }
  return `${base} Paid / remaining is on each invoice under Collections.`;
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
  const [coverage, setCoverage] = useState<MiracleImportCoverage | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setMessage(null);
    setError(null);
    setErrors([]);
    setWarnings([]);
    setCoverage(null);
    try {
      const result = await uploadMiracleFile(file);
      setMessage(buildSuccessMessage(result.summary || {}, result.warnings));
      setErrors(result.errors);
      setWarnings(result.warnings);
      setCoverage(parseCoverage(result.summary));
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
      {coverage && <MiracleImportCoverageTable coverage={coverage} />}
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
