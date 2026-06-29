import React, { useState, useRef } from 'react';
import { Upload, Download, X, Check, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CsvImportProps {
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[] }>;
  onClose: () => void;
  columns: { key: string; label: string; required?: boolean }[];
  templateName: string;
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

export function CsvImport({ onImport, onClose, columns, templateName }: CsvImportProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
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
    setError('');
    try {
      const r = await onImport(rows);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-lg flex items-center gap-2"><Upload size={20} className="text-brand" /> Import from CSV</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {result ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <Check size={24} className="text-emerald-600" />
                <div>
                  <p className="font-bold text-emerald-800">{result.success} products imported successfully</p>
                  {result.errors.length > 0 && <p className="text-sm text-amber-600 mt-1">{result.errors.length} rows had errors</p>}
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-h-40 overflow-y-auto">
                  <p className="text-xs font-bold text-amber-700 mb-2">Errors:</p>
                  {result.errors.map((err, i) => <p key={i} className="text-xs text-amber-600">{err}</p>)}
                </div>
              )}
              <button onClick={onClose} className="w-full py-3 bg-brand text-white rounded-xl font-bold">Done</button>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
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
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-bold text-gray-500">#</th>
                            {headers.map((h) => <th key={h} className="px-3 py-2 text-left font-bold text-gray-500">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 10).map((row, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              {headers.map((h) => <td key={h} className="px-3 py-2">{row[h] || '-'}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {rows.length > 10 && <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50 border-t">...and {rows.length - 10} more rows</p>}
                  </div>

                  <button onClick={handleImport} disabled={importing} className="w-full py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark disabled:opacity-60 flex items-center justify-center gap-2">
                    <Upload size={16} /> {importing ? 'Importing...' : `Import ${rows.length} Products`}
                  </button>
                </>
              )}

              {error && <p className="text-sm text-rose-500 flex items-center gap-2"><AlertCircle size={14} /> {error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
