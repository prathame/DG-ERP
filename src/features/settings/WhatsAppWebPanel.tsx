import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '../../api';

type Status = 'disconnected' | 'qr_pending' | 'connecting' | 'connected';

interface SessionState {
  status: Status;
  qrDataUrl: string | null;
  phoneNumber: string | null;
}

export function WhatsAppWebPanel() {
  const [state, setState] = useState<SessionState>({ status: 'disconnected', qrDataUrl: null, phoneNumber: null });
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const s = await fetchApi<SessionState>('/whatsapp-web/status');
      setState(s);
      if (s.status === 'connected' || s.status === 'disconnected') stopPoll();
    } catch {
      /* ignore */
    }
  };

  const startPoll = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(poll, 2500);
  };

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    poll();
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await fetchApi('/whatsapp-web/connect', { method: 'POST' });
      setState(s => ({ ...s, status: 'connecting' }));
      startPoll();
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetchApi('/whatsapp-web/disconnect', { method: 'DELETE' });
      setState({ status: 'disconnected', qrDataUrl: null, phoneNumber: null });
      stopPoll();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">WhatsApp (Direct)</h3>
          <p className="text-sm text-gray-500 mt-0.5">Send invoices as PDF directly — no link, no manual attach</p>
        </div>
        <StatusBadge status={state.status} />
      </div>

      {state.status === 'connected' && (
        <div className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-3">
          <div>
            <p className="text-sm font-medium text-green-800">Connected</p>
            {state.phoneNumber && <p className="text-xs text-green-700 mt-0.5">+{state.phoneNumber}</p>}
          </div>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Disconnect
          </button>
        </div>
      )}

      {state.status === 'qr_pending' && state.qrDataUrl && (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center gap-3">
            <img src={state.qrDataUrl} alt="WhatsApp QR Code" className="w-48 h-48 rounded" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-800">Scan with WhatsApp</p>
              <p className="text-xs text-gray-500 mt-1">Open WhatsApp → Settings → Linked Devices → Link a Device</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">QR refreshes automatically if it expires</p>
        </div>
      )}

      {state.status === 'connecting' && !state.qrDataUrl && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <span className="animate-spin">⟳</span> Generating QR code…
        </div>
      )}

      {state.status === 'disconnected' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connect your WhatsApp to send invoices as PDF directly to customers — no extra steps.
          </p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#25D366] text-white font-semibold text-sm hover:bg-[#1ebe5d] disabled:opacity-50"
          >
            {loading ? 'Starting…' : 'Connect WhatsApp'}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Uses your existing WhatsApp number — same as scanning WhatsApp Web
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; color: string }> = {
    connected: { label: 'Connected', color: 'bg-green-100 text-green-700' },
    qr_pending: { label: 'Scan QR', color: 'bg-yellow-100 text-yellow-700' },
    connecting: { label: 'Connecting…', color: 'bg-blue-100 text-blue-700' },
    disconnected: { label: 'Not connected', color: 'bg-gray-100 text-gray-500' },
  };
  const { label, color } = map[status];
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${color}`}>{label}</span>;
}
