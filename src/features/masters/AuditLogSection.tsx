import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { LoadingSpinner, DateRangeFilter, PaginationControls } from '../../components/ui';

export function AuditLogSection() {
  const [logs, setLogs] = useState<{ id: number; userName: string; action: string; entityType: string; entityId: string; details: string; createdAt: string }[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState({ range: 'all', from: '', to: '' });

  const load = (page = 1) => {
    setLoading(true);
    api.auditLog.list({ page, dateRange: dateFilter.range !== 'all' && dateFilter.range !== 'custom' ? dateFilter.range : undefined, dateFrom: dateFilter.range === 'custom' ? dateFilter.from : undefined, dateTo: dateFilter.range === 'custom' ? dateFilter.to : undefined })
      .then((r) => { setLogs(r.data); setLogPage(r.page); setLogTotalPages(r.totalPages); setLogTotal(r.total); })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(1); }, [dateFilter]);

  return (
    <div>
      <div className="p-4 border-b border-gray-50">
        <DateRangeFilter value={dateFilter} onChange={(v) => { setDateFilter(v); setLogPage(1); }} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-6 py-3">Time</th><th className="px-6 py-3">User</th><th className="px-6 py-3">Action</th><th className="px-6 py-3">Details</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center"><LoadingSpinner /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No activity recorded yet</td></tr>
            ) : logs.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap">{l.createdAt}</td>
                <td className="px-6 py-3 text-sm font-medium">{l.userName || 'System'}</td>
                <td className="px-6 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{l.action}</span></td>
                <td className="px-6 py-3 text-sm text-gray-600 truncate max-w-xs">{l.details || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls page={logPage} totalPages={logTotalPages} total={logTotal} onPageChange={load} />
    </div>
  );
}
