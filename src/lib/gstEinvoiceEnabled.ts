import { useEffect, useState } from 'react';
import { api } from '../api';
import { session } from './session';
import { normalizeEinvoiceMode, type EinvoiceMode } from '../../shared/gstEinvoiceMode';

/** Keep login session in sync after GST settings save (toolbar gating reads this on some screens). */
export function patchSessionEinvoiceFlags(settings: {
  einvoiceEnabled?: boolean;
  einvoiceMode?: string;
  ewbWithEinvoice?: boolean;
}): void {
  const user = session.getUser();
  if (!user || typeof user !== 'object') return;
  session.setUser({
    ...(user as Record<string, unknown>),
    einvoiceEnabled: !!settings.einvoiceEnabled,
    einvoiceMode: settings.einvoiceMode || 'portal',
    ewbWithEinvoice: !!settings.ewbWithEinvoice,
  });
}

/** Live GST master toggle — do not rely on login session alone (stale until re-login). */
export function useGstEinvoiceEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.gst
      .getSettings()
      .then(s => {
        if (!cancelled) setEnabled(!!s.einvoiceEnabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, loading };
}

/** portal = JSON download + import; api = NIC API generation. */
export function useGstEinvoiceMode(): { mode: EinvoiceMode; loading: boolean; enabled: boolean } {
  const [mode, setMode] = useState<EinvoiceMode>('portal');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.gst
      .getSettings()
      .then(s => {
        if (!cancelled) {
          setEnabled(!!s.einvoiceEnabled);
          setMode(normalizeEinvoiceMode(s.einvoiceMode));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
          setMode('portal');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { mode, loading, enabled };
}
