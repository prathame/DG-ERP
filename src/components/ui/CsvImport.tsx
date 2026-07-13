import React, { useState, useRef } from 'react';
import { Upload, Download, X, Check, AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CsvImportProps {
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[] }>;
  onClose: () => void;
  columns: { key: string; label: string; required?: boolean }[];
  templateName: string;
  itemLabel?: string;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
  return { headers, rows };
}

export function CsvImport({ onImport, onClose, columns, templateName, itemLabel = 'items' }: CsvImportProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');
  const [errorRow, setErrorRow] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setResult(null); setErrorRow(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result as string);
      if (parsed.rows.length === 0) { setError('No data rows found in CSV'); return; }
      const requiredCols = columns.filter((c) => c.required).map((c) => c.key);
      const missing = requiredCols.filter((k) => !parsed.headers.some((h) => h.toLowerCase() === k.toLowerCase()));
      if (missing.length > 0) { setError(`Missing required columns: ${missing.join(', ')}`); return; }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(''); setErrorRow(null);
    try {
      const r = await onImport(rows);
      setResult(r);
      if (r.success === 0 && r.errors.length > 0) {
        // Extract row number from error message like "Row 3: ..." or '"Name" already exists'
        const rowMatch = r.errors[0].match(/Row\s+(\d+)/i);
        if (rowMatch) setErrorRow(parseInt(rowMatch[1]) - 2);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
      // Extract row number from error
      const rowMatch = msg.match(/Row\s+(\d+)/i);
      if (rowMatch) setErrorRow(parseInt(rowMatch[1]) - 2);
      // Extract product/vendor name from "X already exists" pattern
      const nameMatch = msg.match(/"([^"]+)" already exists/);
      if (nameMatch && !rowMatch) {
        const idx = rows.findIndex(r => Object.values(r).some(v => String(v).toLowerCase() === nameMatch[1].toLowerCase()));
        if (idx >= 0) setErrorRow(idx);
      }
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = columns.map((c) => c.key).join(',') + '\n' + columns.map((c) => c.required ? `Sample ${c.label}` : '').join(',');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const failed = result && result.success === 0 && result.errors.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-lg flex items-center gap-2"><Upload size={20} className="text-brand" /> Import {itemLabel} from CSV</h3>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {result ? (
            <div className="space-y-4">
              {failed ? (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle size={24} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-800">Import failed — no {itemLabel} were added</p>
                    <p className="text-sm text-rose-600 mt-1">Fix the error below and try again. All rows must be valid for the import to succeed.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                  <Check size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-emerald-800">{result.success} {itemLabel} processed successfully</p>
                    {(result as Record<string, unknown>).created != null && (
                      <div className="text-sm text-emerald-700 mt-1 space-y-0.5">
                        {Number((result as Record<string, unknown>).created) > 0 && <p>+ {(result as Record<string, unknown>).created} new {itemLabel} created</p>}
                        {Number((result as Record<string, unknown>).stockAdded) > 0 && <p>+ {(result as Record<string, unknown>).stockAdded} existing {itemLabel} — stock added</p>}
                      </div>
                    )}
                    {Array.isArray((result as Record<string, unknown>).details) && (
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                        {((result as Record<string, unknown>).details as { name: string; action: string; quantity: number }[]).map((d, i) => (
                          <p key={i} className="text-xs flex items-center gap-1.5">
                            <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold", d.action === 'created' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
                              {d.action === 'created' ? 'NEW' : '+STOCK'}
                            </span>
                            <span className="text-gray-700">{d.name}</span>
                            <span className="text-gray-400">({d.quantity} units)</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 max-h-40 overflow-y-auto">
                  <p className="text-xs font-bold text-rose-700 mb-2">Errors:</p>
                  {result.errors.map((err, i) => <p key={i} className="text-sm text-rose-600 flex items-start gap-1.5 mb-1"><AlertCircle size={14} className="shrink-0 mt-0.5" /> {err}</p>)}
                </div>
              )}
              {failed && rows.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left font-bold text-gray-500 w-8">#</th>
                        {headers.map((h) => <th key={h} className="px-3 py-2 text-left font-bold text-gray-500">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={cn("border-b border-gray-50", errorRow === i ? "bg-rose-50 border-rose-200" : "")}>
                            <td className={cn("px-3 py-2", errorRow === i ? "text-rose-600 font-bold" : "text-gray-400")}>{i + 2}{errorRow === i && ' ⚠️'}</td>
                            {headers.map((h) => <td key={h} className={cn("px-3 py-2", errorRow === i ? "text-rose-700 font-medium" : "")}>{row[h] || '-'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <button type="button" onClick={failed ? () => { setResult(null); setError(''); } : onClose} className={cn("w-full py-3 rounded-xl font-bold", failed ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-brand text-white")}>{failed ? 'Try Again' : 'Done'}</button>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
                  <Download size={16} /> Download Template
                </button>
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors">
                  <Upload size={16} /> {rows.length > 0 ? `${rows.length} rows loaded` : 'Choose CSV file'}
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                </label>
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-bold text-gray-500 mb-2">Expected columns:</p>
                <div className="flex flex-wrap gap-1.5">
                  {columns.map((c) => (
                    <span key={c.key} className={cn("text-[10px] px-2 py-1 rounded-full font-medium", c.required ? "bg-brand/10 text-brand" : "bg-gray-200 text-gray-500")}>
                      {c.key} {c.required ? '*' : ''}
                    </span>
                  ))}
                </div>
              </div>

              {rows.length > 0 && (
                <>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2 text-left font-bold text-gray-500">#</th>
                          {headers.map((h) => <th key={h} className="px-3 py-2 text-left font-bold text-gray-500">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {rows.slice(0, 10).map((row, i) => (
                            <tr key={i} className={cn("border-b border-gray-50", errorRow === i ? "bg-rose-50" : "")}>
                              <td className={cn("px-3 py-2", errorRow === i ? "text-rose-600 font-bold" : "text-gray-400")}>{i + 2}{errorRow === i && ' ⚠️'}</td>
                              {headers.map((h) => <td key={h} className={cn("px-3 py-2", errorRow === i ? "text-rose-700 font-medium" : "")}>{row[h] || '-'}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {rows.length > 10 && <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50 border-t">...and {rows.length - 10} more rows</p>}
                  </div>

                  <button type="button" onClick={handleImport} disabled={importing} className="w-full py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark disabled:opacity-60 flex items-center justify-center gap-2">
                    <Upload size={16} /> {importing ? 'Importing...' : `Import ${rows.length} ${itemLabel}`}
                  </button>
                </>
              )}

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-600">{error}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
