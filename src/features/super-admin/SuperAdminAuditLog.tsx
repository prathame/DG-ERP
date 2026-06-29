import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';

interface AuditEntry {
  id: number;
  tenantId: string | null;
  tenantName: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

export function SuperAdminAuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const fetchLogs = () => {
    setLoading(true);
    const token = session.getToken();
    const q = new URLSearchParams();
    q.set('page', String(page));
    q.set('limit', '30');
    if (search) q.set('search', search);
    if (filterAction) q.set('action', filterAction);
    if (filterEntity) q.set('entityType', filterEntity);

    fetch(`/api/super-admin/audit-log?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.data || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, [page, search, filterAction, filterEntity]);

  const actionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-emerald-50 text-emerald-700';
      case 'UPDATE': return 'bg-blue-50 text-blue-700';
      case 'DELETE': return 'bg-rose-50 text-rose-700';
      case 'LOGIN': return 'bg-gray-100 text-gray-600';
      case 'IMPERSONATE': return 'bg-amber-50 text-amber-700';
      case 'PASSWORD_CHANGE': return 'bg-purple-50 text-purple-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">Track all actions across the platform — {total} total entries</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="Search by details, user, entity..."
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
        >
          <option value="">All Actions</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
          <option value="LOGIN">Login</option>
          <option value="IMPERSONATE">Impersonate</option>
          <option value="PASSWORD_CHANGE">Password Change</option>
          <option value="DISTRIBUTE">Distribute</option>
          <option value="SALE">Sale</option>
          <option value="PAYMENT">Payment</option>
        </select>
        <select
          value={filterEntity}
          onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
        >
          <option value="">All Entities</option>
          <option value="tenant">Tenant</option>
          <option value="user">User</option>
          <option value="product">Product</option>
          <option value="sale">Sale</option>
          <option value="distribution">Distribution</option>
          <option value="vendor">Vendor</option>
          <option value="payment">Payment</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Time</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tenant</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Action</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><LoadingSpinner /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">No audit logs found</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-700">{log.tenantName}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{log.userName || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${actionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs capitalize">{log.entityType}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[300px] truncate">{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {page} of {totalPages} ({total} entries)
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
