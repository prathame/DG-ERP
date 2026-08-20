import React, { useEffect, useState } from 'react';
import { Copy, Edit3, LayoutTemplate, Plus, Printer, Star, Trash2 } from 'lucide-react';
import { api } from '../../../api';
import { useToast, LoadingSpinner } from '../../../components/ui';
import type { BarcodeLabelTemplate } from '../../../../shared/barcodeLabelTemplate';
import {
  LABEL_SAMPLE_TEMPLATES,
  SAMPLE_LABEL_CONTEXT,
  defaultStarterTemplate,
} from '../../../../shared/barcodeLabelTemplate';
import { renderLabelHtml } from '../../../lib/barcodeLabelRender';
import { openPrintWindow, printBillInWindow, PRINT_POPUP_BLOCKED, cn } from '../../../lib/utils';
import { BarcodeLabelDesigner } from './BarcodeLabelDesigner';
import { isDesktopGlassUi } from '../../../lib/desktopGlass';
import { getBusinessConfig } from '../../../lib/businessTypeConfig';

type DraftTemplate = Omit<BarcodeLabelTemplate, 'id' | 'tenantId'>;

export function BarcodeLabelTemplatesSection() {
  const { toast } = useToast();
  const desktopGlass = isDesktopGlassUi(getBusinessConfig().type);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<BarcodeLabelTemplate[]>([]);
  const [editing, setEditing] = useState<BarcodeLabelTemplate | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [samplePickerOpen, setSamplePickerOpen] = useState(false);
  const [installingSamples, setInstallingSamples] = useState(false);

  const load = () => {
    setLoading(true);
    api.barcodeLabelTemplates
      .list()
      .then(rows => setTemplates(Array.isArray(rows) ? rows : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const printTest = async (t: BarcodeLabelTemplate) => {
    const html = await renderLabelHtml(t, SAMPLE_LABEL_CONTEXT, { copies: 1 });
    const win = openPrintWindow('Preparing test label…');
    if (!win) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    printBillInWindow(win, html, `Test-${t.name}`);
  };

  const setDefault = async (id: string) => {
    try {
      await api.barcodeLabelTemplates.setDefault(id);
      toast('Default template updated', 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const duplicate = async (id: string) => {
    try {
      await api.barcodeLabelTemplates.duplicate(id);
      toast('Template duplicated', 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const archive = async (id: string) => {
    try {
      await api.barcodeLabelTemplates.archive(id);
      toast('Template archived', 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const installSampleTemplates = async () => {
    setInstallingSamples(true);
    try {
      for (const sample of LABEL_SAMPLE_TEMPLATES) {
        await api.barcodeLabelTemplates.create({
          ...sample.template,
          status: 'draft',
        });
      }
      toast('Sample templates added', 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setInstallingSamples(false);
    }
  };

  const openDesigner = (next: { editing?: BarcodeLabelTemplate | null; draft?: DraftTemplate }) => {
    setEditing(next.editing ?? null);
    setDraft(next.draft ?? defaultStarterTemplate('New label'));
    setDesignerOpen(true);
    setSamplePickerOpen(false);
  };

  const closeDesigner = () => {
    setDesignerOpen(false);
    setEditing(null);
    setDraft(null);
  };

  if (designerOpen) {
    return (
      <BarcodeLabelDesigner initial={editing} draft={editing ? null : draft} onClose={closeDesigner} onSaved={load} />
    );
  }

  if (samplePickerOpen) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-bold">Choose a starting layout</h3>
            <p className="text-sm text-gray-500 mt-1">Pick a sample template or start from a blank canvas.</p>
          </div>
          <button
            type="button"
            onClick={() => setSamplePickerOpen(false)}
            className="px-3 py-2 rounded-lg border text-sm font-semibold hover:bg-gray-50"
          >
            Back
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => openDesigner({})}
            className={cn(
              'rounded-xl border p-4 text-left hover:border-brand transition-colors',
              desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-200 bg-white',
            )}
          >
            <p className="font-bold">Blank canvas</p>
            <p className="text-xs text-gray-500 mt-1">38×25 mm starter with logo, MRP, name, and barcode.</p>
          </button>
          {LABEL_SAMPLE_TEMPLATES.map(sample => (
            <button
              key={sample.id}
              type="button"
              onClick={() => openDesigner({ draft: sample.template })}
              className={cn(
                'rounded-xl border p-4 text-left hover:border-brand transition-colors',
                desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-200 bg-white',
              )}
            >
              <p className="font-bold">{sample.name}</p>
              <p className="text-xs text-gray-500 mt-1">{sample.description}</p>
              <p className="text-[10px] text-gray-400 mt-2">
                {sample.template.widthMm}×{sample.template.heightMm} mm · {sample.template.elements.length} elements
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold">Barcode &amp; Label Templates</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Design reusable printable product labels with dynamic fields, barcodes, logos, and custom images. Templates
            are tenant-specific and used when printing barcode labels from inventory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.length > 0 && (
            <button
              type="button"
              onClick={() => void installSampleTemplates()}
              disabled={installingSamples}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border hover:bg-gray-50 disabled:opacity-60"
            >
              <LayoutTemplate size={16} /> {installingSamples ? 'Adding…' : 'Add samples'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSamplePickerOpen(true)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm',
              desktopGlass ? 'dg-bg-primary' : 'bg-brand text-white',
            )}
          >
            <Plus size={16} /> New template
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center space-y-4">
          <p className="text-sm text-gray-500">
            No label templates yet. Start from a sample layout or add all built-in samples to your tenant.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setSamplePickerOpen(true)}
              className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold"
            >
              New template
            </button>
            <button
              type="button"
              onClick={() => void installSampleTemplates()}
              disabled={installingSamples}
              className="px-4 py-2 rounded-xl border text-sm font-bold disabled:opacity-60"
            >
              {installingSamples ? 'Adding samples…' : 'Add all sample templates'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div
              key={t.id}
              className={cn(
                'rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3',
                desktopGlass ? 'border-[var(--dg-card-border)]' : 'border-gray-200 bg-white',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold truncate">{t.name}</p>
                  {t.isDefault && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Default
                    </span>
                  )}
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {t.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t.widthMm}×{t.heightMm} mm · {t.elements?.length || 0} elements · v{t.version}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openDesigner({ editing: t })}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-gray-50"
                >
                  <Edit3 size={14} className="inline mr-1" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void printTest(t)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-gray-50"
                >
                  <Printer size={14} className="inline mr-1" /> Print test
                </button>
                <button
                  type="button"
                  onClick={() => void duplicate(t.id)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-gray-50"
                >
                  <Copy size={14} className="inline mr-1" /> Duplicate
                </button>
                {!t.isDefault && (
                  <button
                    type="button"
                    onClick={() => void setDefault(t.id)}
                    className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-gray-50"
                  >
                    <Star size={14} className="inline mr-1" /> Set default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void archive(t.id)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 size={14} className="inline mr-1" /> Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Template editing is optimized for desktop. Use <strong>Company logo</strong> for Bill Settings branding, or{' '}
        <strong>Custom image</strong> to upload a picture stored inside the template.
      </p>
    </div>
  );
}
