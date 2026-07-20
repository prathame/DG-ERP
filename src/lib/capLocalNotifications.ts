/**
 * Capacitor Local Notifications → Android shade / iOS Notification Center.
 * No FCM/APNs — works offline for events the Cap app already knows about.
 * Remote push requires google-services.json + server FCM (follow-up).
 */

import { isNativeCapacitor } from './dhandhoFiles';

export const OS_NOTIF_CHANNEL_ID = 'dhandho_alerts';
export const OS_NOTIF_NAV_EVENT = 'dg-os-notification-navigate';

const POSTED_KEY = 'dg_os_notif_posted';
const MAX_POSTED = 80;

export type OsNotificationInput = {
  id: string;
  title: string;
  body: string;
  hrefTab?: string;
  /** high → always; medium → only when app not visible */
  priority?: 'high' | 'medium';
};

export function notificationIdToInt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  const n = Math.abs(h) % 2147483646;
  return n === 0 ? 1 : n;
}

export function shouldMirrorToOs(opts: {
  priority: 'high' | 'medium';
  visibilityState: DocumentVisibilityState;
}): boolean {
  if (opts.priority === 'high') return true;
  return opts.visibilityState !== 'visible';
}

function loadPosted(): Set<string> {
  try {
    const raw = localStorage.getItem(POSTED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function savePosted(ids: Set<string>) {
  const arr = [...ids];
  while (arr.length > MAX_POSTED) arr.shift();
  localStorage.setItem(POSTED_KEY, JSON.stringify(arr));
}

let initPromise: Promise<boolean> | null = null;
let tapListenerReady = false;

async function ensureChannel(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.getPlatform() !== 'android') return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  try {
    await LocalNotifications.createChannel({
      id: OS_NOTIF_CHANNEL_ID,
      name: 'Dhandho alerts',
      description: 'Important alerts from Dhandho Service',
      importance: 4, // IMPORTANCE_HIGH — heads-up + shade
      visibility: 1, // PUBLIC on lock screen
      vibration: true,
    });
  } catch {
    /* channel may already exist */
  }
}

async function ensureTapListener(): Promise<void> {
  if (tapListenerReady || !isNativeCapacitor()) return;
  tapListenerReady = true;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const extra = (event.notification.extra || {}) as { hrefTab?: string; notificationId?: string };
    const hrefTab = typeof extra.hrefTab === 'string' && extra.hrefTab ? extra.hrefTab : undefined;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent(OS_NOTIF_NAV_EVENT, {
        detail: { hrefTab, notificationId: extra.notificationId },
      }),
    );
  });
}

/**
 * Request OS permission (Android 13+ POST_NOTIFICATIONS / iOS alert).
 * Safe to call repeatedly. Returns whether we can post.
 */
export async function ensureOsNotificationPermission(): Promise<boolean> {
  if (!isNativeCapacitor()) return false;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await ensureChannel();
        await ensureTapListener();
        let perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          perm = await LocalNotifications.requestPermissions();
        }
        return perm.display === 'granted';
      } catch {
        return false;
      }
    })();
  }
  return initPromise;
}

/** Post one OS notification (deduped by id). No-op on web / if permission denied. */
export async function showOsNotification(input: OsNotificationInput): Promise<boolean> {
  if (!isNativeCapacitor()) return false;
  const priority = input.priority || 'high';
  const visibility = typeof document !== 'undefined' ? document.visibilityState : ('hidden' as DocumentVisibilityState);
  if (!shouldMirrorToOs({ priority, visibilityState: visibility })) return false;

  const posted = loadPosted();
  if (posted.has(input.id)) return false;

  const granted = await ensureOsNotificationPermission();
  if (!granted) return false;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await ensureChannel();
    const numId = notificationIdToInt(input.id);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numId,
          title: input.title.slice(0, 80),
          body: input.body.slice(0, 240),
          channelId: OS_NOTIF_CHANNEL_ID,
          extra: {
            hrefTab: input.hrefTab || '',
            notificationId: input.id,
          },
          schedule: { at: new Date(Date.now() + 250) },
        },
      ],
    });
    posted.add(input.id);
    savePosted(posted);
    return true;
  } catch {
    return false;
  }
}

/** Mirror new Bell items to the OS shade (high always; medium only when backgrounded). */
export async function mirrorBellItemsToOs(
  items: Array<{
    id: string;
    title: string;
    body: string;
    priority?: 'high' | 'medium';
    hrefTab?: string;
    read?: boolean;
    kind?: string;
  }>,
  opts?: { onlyIds?: Set<string> },
): Promise<number> {
  if (!isNativeCapacitor()) return 0;
  let n = 0;
  for (const item of items) {
    if (item.read) continue;
    if (opts?.onlyIds && !opts.onlyIds.has(item.id)) continue;
    const ok = await showOsNotification({
      id: item.id,
      title: item.title,
      body: item.body,
      hrefTab: item.hrefTab,
      priority: item.priority || 'high',
    });
    if (ok) n += 1;
  }
  return n;
}
