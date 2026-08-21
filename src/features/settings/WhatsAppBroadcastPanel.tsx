/**
 * WhatsApp Broadcast — send message + optional image to all/selected customers or vendors.
 * Requires WhatsApp Web session (Baileys) to be connected.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { fetchApi } from '../../api';

type RecipientType = 'all_customers' | 'selected_customers' | 'all_vendors' | 'selected_vendors';

interface BroadcastStatus {
  id: string;
  message: string;
  recipientType: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
}

interface WaStatus {
  status: 'connected' | 'qr_pending' | 'connecting' | 'disconnected';
  phoneNumber: string | null;
}

const PLACEHOLDERS = ['{customerName}', '{name}', '{phone}', '{businessName}'];

export function WhatsAppBroadcastPanel() {
  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recipientType, setRecipientType] = useState<RecipientType>('all_customers');
  const [sending, setSending] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastStatus | null>(null);
  const [recentBroadcasts, setRecentBroadcasts] = useState<BroadcastStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchApi<WaStatus>('/whatsapp-web/status')
      .then(setWaStatus)
      .catch(() => {});
    fetchApi<BroadcastStatus[]>('/whatsapp/broadcast')
      .then(setRecentBroadcasts)
      .catch(() => {});
  }, []);

  const startPoll = (broadcastId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const b = await fetchApi<BroadcastStatus>(`/whatsapp/broadcast/${broadcastId}`);
        setActiveBroadcast(b);
        if (b.status !== 'running') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setRecentBroadcasts(prev => [b, ...prev.filter(x => x.id !== b.id)]);
        }
      } catch {
        /* ignore */
      }
    }, 2000);
  };

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const insertPlaceholder = (p: string) => {
    const ta = document.getElementById('broadcast-msg') as HTMLTextAreaElement | null;
    if (!ta) {
      setMessage(m => m + p);
      return;
    }
    const s = ta.selectionStart,
      e = ta.selectionEnd;
    setMessage(m => m.slice(0, s) + p + m.slice(e));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + p.length, s + p.length);
    }, 0);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }
    setError(null);
    setSending(true);
    try {
      let imageBase64: string | undefined;
      let imageMimetype: string | undefined;
      if (imageFile) {
        imageBase64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(imageFile);
        });
        imageMimetype = imageFile.type;
      }
      const result = await fetchApi<{ ok: boolean; broadcastId: string; totalRecipients: number }>(
        '/whatsapp/broadcast',
        {
          method: 'POST',
          body: JSON.stringify({ message, imageBase64, imageMimetype, recipientType }),
        },
      );
      setActiveBroadcast({
        id: result.broadcastId,
        message,
        recipientType,
        totalRecipients: result.totalRecipients,
        sentCount: 0,
        failedCount: 0,
        status: 'running',
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
      startPoll(result.broadcastId);
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start broadcast');
    } finally {
      setSending(false);
    }
  };

  const isConnected = waStatus?.status === 'connected';

  return (
    <div className="space-y-5">
      {/* Connection warning */}
      {!isConnected && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          ⚠️ WhatsApp not connected. Connect above to send broadcasts.
        </div>
      )}

      {/* Compose */}
      <div className={`space-y-4 ${!isConnected ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Recipient type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Send to</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['all_customers', 'All Customers'],
                ['all_vendors', 'All Vendors'],
              ] as [RecipientType, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setRecipientType(v)}
                className={`py-2 rounded-lg text-sm font-medium border ${recipientType === v ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            id="broadcast-msg"
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={4096}
            placeholder="Type your message here…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
          <div className="flex items-center justify-between mt-1">
            <div className="flex flex-wrap gap-1">
              {PLACEHOLDERS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertPlaceholder(p)}
                  className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"
                >
                  {p}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{message.length}/4096</span>
          </div>
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Image (optional) <span className="text-gray-400 font-normal">— max 5MB</span>
          </label>
          {imagePreview ? (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="preview"
                className="h-32 w-auto rounded-lg border border-gray-200 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                  if (imageInputRef.current) imageInputRef.current.value = '';
                }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-orange-300 hover:text-orange-600"
            >
              📷 Add image
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="hidden"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-full py-2.5 rounded-lg bg-[#25D366] text-white font-semibold text-sm hover:bg-[#1ebe5d] disabled:opacity-50"
        >
          {sending ? 'Starting…' : `Send Broadcast`}
        </button>
      </div>

      {/* Active broadcast progress */}
      {activeBroadcast && activeBroadcast.status === 'running' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-blue-900">Sending…</p>
            <p className="text-sm text-blue-700">
              {activeBroadcast.sentCount + activeBroadcast.failedCount} / {activeBroadcast.totalRecipients}
            </p>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${activeBroadcast.totalRecipients > 0 ? ((activeBroadcast.sentCount + activeBroadcast.failedCount) / activeBroadcast.totalRecipients) * 100 : 0}%`,
              }}
            />
          </div>
          {activeBroadcast.failedCount > 0 && (
            <p className="text-xs text-red-600">{activeBroadcast.failedCount} failed</p>
          )}
          <p className="text-xs text-blue-600">Sending 1 per 2.5s to avoid WhatsApp limits</p>
        </div>
      )}

      {/* Completed broadcast */}
      {activeBroadcast && activeBroadcast.status !== 'running' && (
        <div
          className={`rounded-xl border p-4 ${activeBroadcast.status === 'completed' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
        >
          <p className="text-sm font-medium">
            {activeBroadcast.status === 'completed' ? '✅ Broadcast complete' : '❌ Broadcast failed'}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {activeBroadcast.sentCount} sent · {activeBroadcast.failedCount} failed · {activeBroadcast.totalRecipients}{' '}
            total
          </p>
        </div>
      )}

      {/* Recent broadcasts */}
      {recentBroadcasts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Recent broadcasts</p>
          <div className="space-y-2">
            {recentBroadcasts.slice(0, 5).map(b => (
              <div
                key={b.id}
                className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2"
              >
                <span className="truncate max-w-[200px]">{b.message}</span>
                <span>
                  {b.sentCount}/{b.totalRecipients} · {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
