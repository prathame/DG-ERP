/** Pure helpers for locale lookup / storage — keep free of React for unit tests. */

export const LANG_STORAGE_KEY = 'dhandho_lang';

export type Lang = 'en' | 'hi' | 'gu' | 'mr';

export function getStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'hi' || stored === 'gu' || stored === 'mr') return stored;
  } catch {
    /* private mode / SSR */
  }
  return 'en';
}

export function lookup(dict: unknown, key: string): string {
  const parts = key.split('.');
  let result: unknown = dict;
  for (const part of parts) {
    if (result && typeof result === 'object') {
      result = (result as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof result === 'string' ? result : key;
}

export function localeFromModule<T>(mod: { default?: T } | T): T {
  if (mod && typeof mod === 'object' && 'default' in mod && (mod as { default?: T }).default) {
    return (mod as { default: T }).default;
  }
  return mod as T;
}
