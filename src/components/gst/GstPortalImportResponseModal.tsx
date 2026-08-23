import React, { useRef, useState } from 'react';
import { FileJson, Upload } from 'lucide-react';
import { parsePortalResponseJson } from '../../../shared/parsePortalResponse';

export function GstPortalImportResponseModal({
  open,
  saving,
  onClose,
  onImport,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onImport: (response: unknown) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<{ irn?: string; ewbNumber?: string; hasQr: boolean } | null>(null);
  const [parsed, setParsed] = useState<unknown>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  function reset() {
    setFileName('');
    setPreview(null);
    setParsed(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const p = parsePortalResponseJson(json);
      setParsed(json);
      setFileName(file.name);
      setPreview({ irn: p.irn, ewbNumber: p.ewbNumber, hasQr: !!p.irnQr });
    } catch (err) {
      setParsed(null);
      setPreview(null);
      setFileName(file.name);
      setError(err instanceof Error ? err.message : 'Invalid response JSON');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) {
          reset();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Upload size={18} className="text-indigo-600" /> Import portal response
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          After filing on the government portal, download the <strong>response JSON</strong> and import it here (same as
          Miracle / Tally). IRN, Signed QR, and E-Way Bill number are read automatically.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={e => void onFileChange(e)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center gap-2 py-8 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
        >
          <FileJson size={28} className="text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-700">{fileName || 'Choose response JSON file'}</span>
          <span className="text-[10px] text-gray-400">From einvoice1.gst.gov.in → download response after upload</span>
        </button>
        {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
        {preview ? (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl text-xs space-y-1">
            {preview.irn ? (
              <p>
                <span className="text-gray-400">IRN:</span>{' '}
                <span className="font-mono">{preview.irn.slice(0, 16)}…</span>
              </p>
            ) : null}
            {preview.ewbNumber ? (
              <p>
                <span className="text-gray-400">E-Way Bill:</span>{' '}
                <span className="font-mono">{preview.ewbNumber}</span>
              </p>
            ) : null}
            <p>
              <span className="text-gray-400">Signed QR:</span> {preview.hasQr ? 'Yes' : 'Not in file'}
            </p>
          </div>
        ) : null}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !parsed || !!error}
            onClick={() => parsed && onImport(parsed)}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-60"
          >
            {saving ? 'Importing…' : 'Import response'}
          </button>
        </div>
      </div>
    </div>
  );
}
