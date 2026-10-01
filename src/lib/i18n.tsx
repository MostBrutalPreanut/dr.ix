import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EN } from '../i18n/en';
import { setDateLocale } from './dates';

export type Lang = 'he' | 'en';

/**
 * The texts of the app are written in Hebrew in the code. In English mode every Hebrew text is
 * looked up in the dictionary (src/i18n); a text without a translation is shown in Hebrew.
 * Placeholders look like {name}.
 */
let current: Lang = 'he';

export function getLang(): Lang {
  return current;
}

export function t(text: string, params?: Record<string, string | number>): string {
  let out = current === 'en' ? (EN[text] ?? text) : text;
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/**
 * A text that a manager typed (in Hebrew) with an optional English version typed next to it.
 * English mode: the typed English version, else the built-in translation, else the Hebrew.
 */
export function tl(he: string | undefined, en?: string): string {
  if (!he) return '';
  return current === 'en' ? en?.trim() || t(he) : he;
}

/** The built-in English text of a Hebrew text ('' when there is none) - shown as a hint in the editors. */
export function suggestEn(he: string): string {
  return EN[he] ?? '';
}

/** Drops the optional English fields that were left empty (and trims the others). */
export function pruneEn<T extends object>(doc: T, keys: (keyof T)[]): T {
  const out = { ...doc };
  for (const k of keys) {
    const v = out[k];
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim() as T[keyof T];
      else delete out[k];
    }
  }
  return out;
}

/** Marks a text that must be translated later (module-level constants): returns it unchanged. */
export const tn = (text: string): string => text;

const DEVICE_KEY = 'drix:lang';
const userKey = (id: string) => `drix:lang:${id}`;

function read(key: string): Lang | null {
  try {
    const v = localStorage.getItem(key);
    return v === 'en' || v === 'he' ? v : null;
  } catch {
    return null;
  }
}

function apply(lang: Lang): void {
  current = lang;
  setDateLocale(lang === 'en' ? 'en-GB' : 'he-IL');
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
}

interface LangValue {
  lang: Lang;
  setLang(l: Lang): void;
}
const Ctx = createContext<LangValue>({ lang: 'he', setLang: () => undefined });

/**
 * The language is remembered per person on this device (a signed-in person gets their own choice
 * back; the sign-in screen uses the device's last choice). The tree is rebuilt when it changes.
 */
export function LangProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = read(DEVICE_KEY) ?? 'he';
    apply(l);
    return l;
  });
  // a language picked on the sign-in screen is taken over by the person who signs in next
  const pickedBeforeSignIn = useRef<Lang | null>(null);

  useEffect(() => {
    let l: Lang;
    if (!userId) {
      l = read(DEVICE_KEY) ?? 'he'; // the sign-in screen: this device's last choice
    } else {
      const own = read(userKey(userId));
      l = own ?? pickedBeforeSignIn.current ?? 'he';
      if (!own && pickedBeforeSignIn.current) {
        try {
          localStorage.setItem(userKey(userId), l);
        } catch {
          /* private mode */
        }
      }
      pickedBeforeSignIn.current = null;
    }
    apply(l);
    setLangState(l);
  }, [userId]);

  const setLang = useCallback(
    (l: Lang) => {
      apply(l);
      try {
        localStorage.setItem(DEVICE_KEY, l);
        if (userId) localStorage.setItem(userKey(userId), l);
      } catch {
        /* private mode: lasts until reload */
      }
      if (!userId) pickedBeforeSignIn.current = l;
      setLangState(l);
    },
    [userId],
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  // a different language rebuilds the screens so that every text is looked up again
  return (
    <Ctx.Provider value={value}>
      <div key={lang} style={{ display: 'contents' }}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function useLang(): LangValue {
  return useContext(Ctx);
}
