import React, { useEffect, useState } from 'react';
import { Copy, Edit3, Eye, Plus, Printer, Star, Trash2 } from 'lucide-react';
import { api } from '../../../api';
import { useToast, LoadingSpinner } from '../../../components/ui';
import type { BarcodeLabelTemplate } from '../../../../shared/barcodeLabelTemplate';
import { SAMPLE_LABEL_CONTEXT } from '../../../../shared/barcodeLabelTemplate';
import { renderLabelHtml } from '../../../lib/barcodeLabelRender';
import { openPrintWindow, printBillInWindow, PRINT_POPUP_BLOCKED, cn } from '../../../lib/utils';
import { BarcodeLabelDesigner } from './BarcodeLabelDesigner';
import { isDesktopGlassUi } from '../../../lib/desktopGlass';
import { getBusinessConfig } from '../../../lib/businessTypeConfig';

export function BarcodeLabelTemplatesSection() {
  const { toast } = useToast();
  const desktopGlass = isDesktopGlassUi(getBusinessConfig().type);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<BarcodeLabelTemplate[]>([]);
  const [editing, setEditing] = useState<BarcodeLabelTemplate | null | 'new'>(null);

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

  if (editing) {
    return (
      <BarcodeLabelDesigner
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold">Barcode &amp; Label Templates</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Design reusable printable product labels with dynamic fields, barcodes, and your company branding. Templates
            are tenant-specific and used when printing barcode labels from inventory.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm',
            desktopGlass ? 'dg-bg-primary' : 'bg-brand text-white',
          )}
        >
          <Plus size={16} /> New template
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          No label templates yet. Create your first template to replace the fixed A4 label layouts.
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
                  onClick={() => setEditing(t)}
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
        Template editing is optimized for desktop. On mobile you can activate templates and print tests where supported.
      </p>
    </div>
  );
}
