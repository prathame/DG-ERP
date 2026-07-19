import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from './en.json';
import { LANG_STORAGE_KEY, getStoredLang, lookup, localeFromModule, type Lang } from './lookup';

export { LANG_STORAGE_KEY, getStoredLang, lookup } from './lookup';
export type { Lang } from './lookup';

type Translations = typeof en;

/** English ships in the main bundle; other locales load on demand. */
const localeLoaders: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Translations }>> = {
  hi: () => import('./hi.json'),
  gu: () => import('./gu.json'),
  mr: () => import('./mr.json'),
};

const cache: Partial<Record<Lang, Translations>> = { en };

export const LANGUAGES: { code: Lang; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
];

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: key => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getStoredLang);
  const [dict, setDict] = useState<Translations>(en);

  useEffect(() => {
    let cancelled = false;
    if (lang === 'en') {
      setDict(en);
      return;
    }
    const cached = cache[lang];
    if (cached) {
      setDict(cached);
      return;
    }
    localeLoaders[lang]()
      .then(mod => {
        if (cancelled) return;
        const next = localeFromModule<Translations>(mod);
        cache[lang] = next;
        setDict(next);
      })
      .catch(() => {
        if (!cancelled) setDict(en);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      /* ignore quota / private mode */
    }
    setLangState(l);
  }, []);

  const t = useCallback((key: string): string => lookup(dict, key), [dict]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useTranslation() {
  return useContext(LangContext);
}
