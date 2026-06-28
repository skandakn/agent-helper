import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getPrefs, setPrefs } from "../prefs";
import { LANGUAGES, translations, getNested, interpolate } from "./translations";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    setLangState(getPrefs().language || "en");
  }, []);

  const setLang = useCallback((code) => {
    setLangState(code);
    setPrefs({ language: code });
    const meta = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
      document.documentElement.dir = meta.dir;
    }
  }, []);

  useEffect(() => {
    const meta = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = meta.dir;
    }
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      const dict = translations[lang] || translations.en;
      const val = getNested(dict, key) ?? getNested(translations.en, key) ?? key;
      return typeof val === "string" ? interpolate(val, vars) : val;
    },
    [lang]
  );

  const currentLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, languages: LANGUAGES, currentLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}
