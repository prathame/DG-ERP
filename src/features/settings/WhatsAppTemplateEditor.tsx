/**
 * WhatsApp invoice message template editor.
 * Stored in bill_settings.whatsappInvoiceTemplate.
 * Placeholders replaced at send time.
 */
import { useState } from 'react';
import type { BillSettings } from '../../types';

const PLACEHOLDERS = [
  { key: '{customerName}', label: 'Customer Name' },
  { key: '{invoiceNumber}', label: 'Invoice No' },
  { key: '{amount}', label: 'Amount' },
  { key: '{balance}', label: 'Balance Due' },
  { key: '{date}', label: 'Date' },
  { key: '{businessName}', label: 'Business Name' },
];

const DEFAULT_TEMPLATE =
  'Hi {customerName}, your invoice {invoiceNumber} for ₹{amount} is ready. Thank you! — {businessName}';

interface Props {
  value: string | null | undefined;
  onChange: (v: string) => void;
}

export function WhatsAppTemplateEditor({ value, onChange }: Props) {
  const [focused, setFocused] = useState(false);
  const current = value ?? DEFAULT_TEMPLATE;

  const insertPlaceholder = (key: string) => {
    const textarea = document.getElementById('wa-template-input') as HTMLTextAreaElement | null;
    if (!textarea) {
      onChange(current + key);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = current.slice(0, start) + key + current.slice(end);
    onChange(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + key.length, start + key.length);
    }, 0);
  };

  const preview = current
    .replace('{customerName}', 'Ramesh Shah')
    .replace('{invoiceNumber}', 'INV-2026-001')
    .replace('{amount}', '₹10,500')
    .replace('{balance}', '₹0')
    .replace('{date}', new Date().toLocaleDateString('en-IN'))
    .replace('{businessName}', 'Your Business');

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp message (invoice share)</label>
        <textarea
          id="wa-template-input"
          rows={3}
          value={current}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={1024}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          placeholder={DEFAULT_TEMPLATE}
        />
        <p className="text-xs text-gray-400 mt-1 text-right">{current.length}/1024</p>
      </div>

      {/* Placeholder chips */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Insert placeholder:</p>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => insertPlaceholder(p.key)}
              className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      <div className="bg-[#DCF8C6] rounded-xl px-3 py-2.5 text-sm text-gray-800 max-w-sm">
        <p className="text-[10px] text-gray-500 mb-1 font-medium">PREVIEW</p>
        {preview}
      </div>

      <button
        type="button"
        onClick={() => onChange(DEFAULT_TEMPLATE)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Reset to default
      </button>
    </div>
  );
}

/** Apply template placeholders for an actual invoice send. */
export function applyInvoiceTemplate(
  template: string | null | undefined,
  data: {
    customerName?: string;
    invoiceNumber?: string;
    amount?: number | string;
    balance?: number | string;
    date?: string;
    businessName?: string;
  },
): string {
  const t = template || DEFAULT_TEMPLATE;
  return t
    .replace('{customerName}', data.customerName || '')
    .replace('{invoiceNumber}', data.invoiceNumber || '')
    .replace('{amount}', data.amount != null ? `₹${Number(data.amount).toLocaleString('en-IN')}` : '')
    .replace('{balance}', data.balance != null ? `₹${Number(data.balance).toLocaleString('en-IN')}` : '')
    .replace('{date}', data.date || new Date().toLocaleDateString('en-IN'))
    .replace('{businessName}', data.businessName || '');
}
