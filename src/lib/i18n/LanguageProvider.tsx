"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import uk from "@/locales/uk.json";

type Language = "en" | "ru" | "uk";
type Dictionary = typeof en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof Dictionary) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const dictionaries: Record<Language, Dictionary> = { en, ru, uk };

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("language") as Language;
    if (saved === "en" || saved === "ru" || saved === "uk") {
      setLanguageState(saved);
    } else {
      const nav = navigator.language;
      const browserLang: Language = nav.startsWith("uk") ? "uk" : nav.startsWith("ru") ? "ru" : "en";
      setLanguageState(browserLang);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: keyof Dictionary) => {
    return dictionaries[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
