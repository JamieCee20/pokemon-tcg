import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { TcgLanguage } from "./languages";
import {
  readLanguagePreference,
  writeLanguagePreference,
} from "../storage/local";
import { LanguageContext } from "./languageContext";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<TcgLanguage>(
    readLanguagePreference,
  );

  const setLanguage = useCallback((nextLanguage: TcgLanguage) => {
    writeLanguagePreference(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
