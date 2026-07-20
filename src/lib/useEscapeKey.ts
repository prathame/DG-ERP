import { useEffect } from 'react';
import { pushAndroidBackHandler } from './androidBackStack';

/**
 * Escape (desktop) + Android hardware back (Cap) share the same close path.
 * Return `true` when something was closed so root double-back-to-exit can run otherwise.
 */
export function useEscapeKey(onEscape: () => boolean | void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);

    const unregister = pushAndroidBackHandler(() => onEscape() === true);

    return () => {
      document.removeEventListener('keydown', handler);
      unregister();
    };
  }, [onEscape, enabled]);
}
