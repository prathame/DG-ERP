import React, { createContext, useContext, useState, useCallback } from 'react';
import en from './en.json';
import hi from './hi.json';
import gu from './gu.json';

type Translations = typeof en;
type Lang = 'en' | 'hi' | 'gu';

const translations: Record<Lang, Translations> = { en, hi, gu };

export const LANGUAGES: { code: Lang; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
];

const LANG_KEY = 'dhandho_lang';

function getStoredLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === 'hi' || stored === 'gu') return stored;
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
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback((key: string): string => {
    const parts = key.split('.');
    let result: unknown = translations[lang];
    for (const part of parts) {
      if (result && typeof result === 'object') {
        result = (result as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    return typeof result === 'string' ? result : key;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LangContext);
}
