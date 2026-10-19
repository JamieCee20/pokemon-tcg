import { createContext } from "react";
import type { TcgLanguage } from "./languages";

export interface LanguageContextValue {
  language: TcgLanguage;
  setLanguage: (language: TcgLanguage) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
