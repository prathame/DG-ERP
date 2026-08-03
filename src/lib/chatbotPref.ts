import { session } from './session';

/**
 * Per-device preference: show/hide the floating AI chatbot FAB.
 * Layered on Super Admin tab_config / Cap mobile_features — does not grant access.
 */
const CHATBOT_PREF_PREFIX = 'dg_chatbot_visible';

/** Fired when the Settings chatbot toggle changes so App can remount/unmount live. */
export const CHATBOT_PREF_CHANGED_EVENT = 'dg-chatbot-pref-changed';

function storageScope(): string {
  return `${session.getTenantId() || 't'}:${session.getUser()?.id || 'u'}`;
}

export function chatbotPrefStorageKey(scope = storageScope()): string {
  return `${CHATBOT_PREF_PREFIX}:${scope}`;
}

/** Default on — hidden only when explicitly set to `'0'`. */
export function getChatbotPref(): boolean {
  try {
    return localStorage.getItem(chatbotPrefStorageKey()) !== '0';
  } catch {
    return true;
  }
}

export function setChatbotPref(visible: boolean): void {
  try {
    localStorage.setItem(chatbotPrefStorageKey(), visible ? '1' : '0');
  } catch {
    // best-effort
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHATBOT_PREF_CHANGED_EVENT, { detail: { visible } }));
  }
}
