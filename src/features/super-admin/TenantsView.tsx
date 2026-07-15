/**
 * Unified Tenants tab — Cloud + On-Prem in one view with toggle at top.
 */
import React, { useState } from 'react';
import { Cloud, Monitor } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TenantListView } from './TenantListView';
import { OnPremView } from './OnPremView';
import { session } from '../../lib/session';

type Mode = 'cloud' | 'onprem';

interface TenantsViewProps {
  onSelectTenant: (id: string) => void;
}

export function TenantsView({ onSelectTenant }: TenantsViewProps) {
  const [mode, setMode] = useState<Mode>('cloud');

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setMode('cloud')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            mode === 'cloud'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Cloud size={15} /> Cloud Tenants
        </button>
        <button
          onClick={() => setMode('onprem')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            mode === 'onprem'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Monitor size={15} /> On-Prem
        </button>
      </div>

      {mode === 'cloud' && <TenantListView onSelectTenant={onSelectTenant} />}
      {mode === 'onprem' && <OnPremView saToken={session.getToken() || ''} />}
    </div>
  );
}
