import { useState, useEffect, useCallback } from "react";
import en from "../locales/en.json";
import zh from "../locales/zh.json";

export type Locale = "en" | "zh";

const translations: Record<Locale, any> = {
  en,
  zh,
};

export function useI18n() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const savedLocale = localStorage.getItem("gitcity_locale") as Locale;
    if (savedLocale && (savedLocale === "en" || savedLocale === "zh")) {
      setLocale(savedLocale);
    } else {
      const browserLang = navigator.language.split("-")[0];
      if (browserLang === "zh") {
        setLocale("zh");
      }
    }
  }, []);

  const t = useCallback(
    (key: string, variables?: Record<string, string | number>) => {
      const keys = key.split(".");
      let value = translations[locale];
      for (const k of keys) {
        value = value?.[k];
      }

      if (typeof value !== "string") {
        // Fallback to English
        value = en;
        for (const k of keys) {
          value = (value as any)?.[k];
        }
      }

      if (typeof value !== "string") return key;

      if (variables) {
        Object.entries(variables).forEach(([k, v]) => {
          value = (value as string).replace(`{{${k}}}`, String(v));
        });
      }

      return value as string;
    },
    [locale]
  );

  const toggleLocale = () => {
    const newLocale = locale === "en" ? "zh" : "en";
    setLocale(newLocale);
    localStorage.setItem("gitcity_locale", newLocale);
  };

  return { t, locale, setLocale, toggleLocale };
}
