import React from 'react';
import { cn } from '../../lib/utils';

function fmtCurrency(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN')}${n < 0 ? ' (Cr)' : ''}`;
}

export type Gstr1Section = 'b2b' | 'b2c' | 'hsn';

export type Gstr1SummaryData = {
  b2b?: Record<string, unknown>[];
  b2c?: Record<string, number>;
  b2cRates?: { rate: number; taxable: number; cgst: number; sgst: number; total: number }[];
  hsnSummary?: Record<string, unknown>[];
  totalTaxable?: number;
  totalTax?: number;
  totalValue?: number;
};

export function Gstr1Sections({
  data,
  partySingular,
  section,
  onSection,
}: {
  data: Gstr1SummaryData;
  partySingular: string;
  section: Gstr1Section;
  onSection: (s: Gstr1Section) => void;
}) {
  const b2b = data.b2b || [];
  const b2c = data.b2c || {};
  const b2cRates = data.b2cRates || [];
  const hsn = data.hsnSummary || [];

  const tabs: { id: Gstr1Section; label: string }[] = [
    { id: 'b2b', label: 'B2B' },
    { id: 'b2c', label: 'B2C' },
    { id: 'hsn', label: 'HSN' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-400 uppercase font-bold">Taxable</p>
            <p className="text-lg font-bold text-blue-600">{fmtCurrency(data.totalTaxable || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-bold">Tax</p>
            <p className="text-lg font-bold text-amber-600">{fmtCurrency(data.totalTax || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-bold">Total</p>
            <p className="text-lg font-bold text-emerald-600">{fmtCurrency(data.totalValue || 0)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSection(t.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-bold border',
              section === t.id
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === 'b2b' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">B2B — bills with GSTIN</div>
          {b2b.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No registered-party (B2B) sales this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left">{partySingular}</th>
                    <th className="px-3 py-2 text-left">GSTIN</th>
                    <th className="px-3 py-2 text-right">Taxable</th>
                    <th className="px-3 py-2 text-right">CGST</th>
                    <th className="px-3 py-2 text-right">SGST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {b2b.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2">{r.vendorName as string}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.gstin as string}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.taxable as number)}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.cgst as number)}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.sgst as number)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === 'b2c' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">B2C — walk-in / no GSTIN</div>
          {(b2c.total || 0) <= 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No unregistered (B2C) sales this month.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4 text-center p-4">
                <div>
                  <p className="text-xs text-gray-400">Taxable</p>
                  <p className="font-bold">{fmtCurrency(b2c.taxable || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">CGST</p>
                  <p className="font-bold">{fmtCurrency(b2c.cgst || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">SGST</p>
                  <p className="font-bold">{fmtCurrency(b2c.sgst || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="font-bold">{fmtCurrency(b2c.total || 0)}</p>
                </div>
              </div>
              {b2cRates.length > 0 && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                        <th className="px-3 py-2 text-left">GST %</th>
                        <th className="px-3 py-2 text-right">Taxable</th>
                        <th className="px-3 py-2 text-right">CGST</th>
                        <th className="px-3 py-2 text-right">SGST</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b2cRates.map(r => (
                        <tr key={r.rate} className="border-t border-gray-50">
                          <td className="px-3 py-2">{r.rate}%</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(r.taxable)}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(r.cgst)}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(r.sgst)}</td>
                          <td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {section === 'hsn' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-sm font-bold text-gray-600">HSN summary</div>
          {hsn.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No HSN lines this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left">HSN</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Taxable</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hsn.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-mono">{r.hsn as string}</td>
                      <td className="px-3 py-2">{r.description as string}</td>
                      <td className="px-3 py-2 text-right">{r.qty as number}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.taxable as number)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCurrency(r.total as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
