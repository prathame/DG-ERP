import { resolveApiUrl } from '../platforms/shared';
import { session } from './session';

/** Download a CSV (or other file) from an authenticated API route. */
export async function downloadApiCsv(apiPath: string, filename: string): Promise<void> {
  const path = apiPath.startsWith('/api') ? apiPath : `/api${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
  const r = await fetch(resolveApiUrl(path), {
    headers: {
      Authorization: `Bearer ${session.getToken()}`,
      'x-tenant-id': session.getTenantId() || '',
      'x-dg-client': 'web',
    },
  });
  if (!r.ok) throw new Error('Download failed');
  const blob = await r.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
