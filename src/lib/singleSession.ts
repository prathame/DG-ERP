import { api } from '../api';
import { isServiceMobileMode } from '../platforms/service-mobile/mode';
import { session } from './session';

const HEARTBEAT_MS = 45_000;
let timer: ReturnType<typeof setInterval> | null = null;
let onFocus: (() => void) | null = null;
let onVisibility: (() => void) | null = null;

/** Poll server so a kicked device logs out within ~45s even if idle. */
export function startSessionHeartbeat(): void {
  stopSessionHeartbeat();
  if (isServiceMobileMode()) return; // offline local auth — no cloud session
  if (!session.getToken()) return;

  const tick = () => {
    if (!session.getToken() || !navigator.onLine) return;
    void api.auth.sessionHeartbeat().catch(() => {
      /* 401 handler in api.ts clears session + redirects */
    });
  };

  tick();
  timer = setInterval(tick, HEARTBEAT_MS);
  onFocus = () => tick();
  onVisibility = () => {
    if (document.visibilityState === 'visible') tick();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopSessionHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (onFocus) {
    window.removeEventListener('focus', onFocus);
    onFocus = null;
  }
  if (onVisibility) {
    document.removeEventListener('visibilitychange', onVisibility);
    onVisibility = null;
  }
}
