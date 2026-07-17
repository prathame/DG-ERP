import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Volume2, VolumeX, CheckCheck, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchApi } from '../../api';
import { session } from '../../lib/session';

export type NotificationItem = {
  id: string;
  kind: string;
  priority: 'high' | 'medium';
  title: string;
  body: string;
  count?: number;
  hrefTab?: string;
  source?: string;
  type?: string;
  createdAt?: string;
  read?: boolean;
};

type FeedResponse = {
  items: NotificationItem[];
  generatedAt: string;
  unreadAdmin?: number;
  digestCount?: number;
};

const MUTE_KEY = 'dg_notif_mute';
const DISMISS_KEY = 'dg_notif_dismissed';
const FINGERPRINT_KEY = 'dg_notif_fp';

function storageScope(): string {
  const t = session.getTenantId() || 't';
  const u = (session.getUser() as { id?: string } | null)?.id || 'u';
  return `${t}:${u}`;
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(`${DISMISS_KEY}:${storageScope()}`);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(`${DISMISS_KEY}:${storageScope()}`, JSON.stringify([...ids]));
}

function isMuted(): boolean {
  try {
    return localStorage.getItem(`${MUTE_KEY}:${storageScope()}`) === '1';
  } catch {
    return false;
  }
}

function setMuted(muted: boolean) {
  localStorage.setItem(`${MUTE_KEY}:${storageScope()}`, muted ? '1' : '0');
}

/** Soft chime — no asset file. */
function playSoftChime() {
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.04, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    osc.start(t0);
    osc.stop(t0 + 0.35);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    /* ignore autoplay / audio errors */
  }
}

function highFingerprint(items: NotificationItem[]): string {
  return items
    .filter(i => i.priority === 'high' && !i.read)
    .map(i => i.id)
    .sort()
    .join('|');
}

type Props = {
  onNavigate: (tab: string) => void;
  canAccessTab?: (tab: string) => boolean;
};

export function NotificationCenter({ onNavigate, canAccessTab }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [muted, setMutedState] = useState(() => isMuted());
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const knownFp = useRef<string>('');

  const visible = items.filter(i => {
    if (i.kind === 'admin_message') return true; // server read_at
    return !dismissed.has(i.id);
  });

  const unread = visible.filter(i => {
    if (i.kind === 'admin_message') return !i.read;
    return !dismissed.has(i.id);
  });

  const load = useCallback(async () => {
    if (!session.getToken()) return;
    setLoading(true);
    try {
      const data = await fetchApi<FeedResponse>('/notifications');
      const list = data.items || [];
      setItems(list);

      const fp = highFingerprint(
        list.filter(i => {
          if (i.kind === 'admin_message') return !i.read;
          return !loadDismissed().has(i.id);
        }),
      );
      const prevKey = `${FINGERPRINT_KEY}:${storageScope()}`;
      const prev = localStorage.getItem(prevKey) || '';
      if (fp && fp !== prev && fp !== knownFp.current) {
        const newHigh = fp.split('|').some(id => id && !prev.split('|').includes(id));
        if (newHigh && !isMuted() && document.visibilityState === 'visible') {
          playSoftChime();
        }
      }
      knownFp.current = fp;
      localStorage.setItem(prevKey, fp);
    } catch {
      /* quiet fail — Bell stays usable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') load();
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const markAdminRead = async (id: string) => {
    try {
      await fetchApi(`/notifications/${id}/read`, { method: 'POST' });
      setItems(prev => prev.map(i => (i.id === id ? { ...i, read: true } : i)));
    } catch {
      /* ignore */
    }
  };

  const dismissDigest = (id: string) => {
    setDismissed(prev => {
      const next = new Set<string>(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };

  const markAllRead = async () => {
    try {
      await fetchApi('/notifications/read-all', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setItems(prev => prev.map(i => (i.kind === 'admin_message' ? { ...i, read: true } : i)));
    const digests = items.filter(i => i.kind !== 'admin_message').map(i => i.id);
    setDismissed(prev => {
      const next = new Set<string>(prev);
      digests.forEach(id => next.add(id));
      saveDismissed(next);
      return next;
    });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const onClickItem = async (item: NotificationItem) => {
    if (item.kind === 'admin_message') {
      if (!item.read) await markAdminRead(item.id);
    } else {
      dismissDigest(item.id);
    }
    if (item.hrefTab && (!canAccessTab || canAccessTab(item.hrefTab))) {
      onNavigate(item.hrefTab);
      setOpen(false);
    }
  };

  const badge = unread.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen(o => !o);
          if (!open) load();
        }}
        className="relative p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-700"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={20} />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,22rem)] bg-white rounded-2xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-gray-900">Notifications</p>
              <p className="text-[11px] text-gray-400">{loading ? 'Refreshing…' : 'Important alerts only'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                title={muted ? 'Unmute sound' : 'Mute sound'}
                aria-label={muted ? 'Unmute notification sound' : 'Mute notification sound'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                type="button"
                onClick={markAllRead}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                title="Mark all read"
                aria-label="Mark all notifications read"
              >
                <CheckCheck size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 sm:hidden"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">You’re all caught up</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {visible.map(item => {
                  const isAdmin = item.kind === 'admin_message';
                  const isUnread = isAdmin ? !item.read : !dismissed.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onClickItem(item)}
                        className={cn(
                          'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
                          isUnread && 'bg-amber-50/40',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {isAdmin && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
                                From Dhandho
                              </span>
                            )}
                            <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-3">{item.body}</p>
                          </div>
                          {isUnread && <span className="mt-1 w-2 h-2 rounded-full bg-brand shrink-0" />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
