import { createContext } from "react";
import type { PriceCurrency } from "../storage/local";

export interface CurrencyContextValue {
  currency: PriceCurrency;
  setCurrency: (currency: PriceCurrency) => void;
}

export const CurrencyContext = createContext<CurrencyContextValue | null>(null);
