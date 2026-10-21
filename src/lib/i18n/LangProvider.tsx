"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LANG_COOKIE, type Lang } from "./lang";

// The language a subtree speaks. Outside a provider everything is English, so
// components shared with the rest of Git City only change inside the Brasil map.
// t(en, pt) picks the line: each string sits next to its translation.

type LangValue = { lang: Lang; setLang: (l: Lang) => void; t: (en: string, pt: string) => string };

const LangContext = createContext<LangValue>({ lang: "en", setLang: () => {}, t: (en) => en });

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  const value = useMemo<LangValue>(() => ({ lang, setLang, t: (en, pt) => (lang === "pt" ? pt : en) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  return useContext(LangContext);
}

/** The line in the subtree's language: t("Drive", "Dirigir"). */
export function useT(): LangValue["t"] {
  return useContext(LangContext).t;
}
