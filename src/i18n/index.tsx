import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from './en.json';

type Translations = typeof en;
type Lang = 'en' | 'hi' | 'gu' | 'mr';

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

const LANG_KEY = 'dhandho_lang';

function getStoredLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === 'hi' || stored === 'gu' || stored === 'mr') return stored;
  return 'en';
}

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

function lookup(dict: Translations, key: string): string {
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
        cache[lang] = mod.default;
        setDict(mod.default);
      })
      .catch(() => {
        if (!cancelled) setDict(en);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback((key: string): string => lookup(dict, key), [dict]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useTranslation() {
  return useContext(LangContext);
}
