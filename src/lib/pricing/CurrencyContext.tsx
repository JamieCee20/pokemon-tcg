import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  readPriceCurrencyPreference,
  writePriceCurrencyPreference,
  type PriceCurrency,
} from "../storage/local";
import { CurrencyContext } from "./currencyContext";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<PriceCurrency>(
    readPriceCurrencyPreference,
  );
  const setCurrency = useCallback((nextCurrency: PriceCurrency) => {
    writePriceCurrencyPreference(nextCurrency);
    setCurrencyState(nextCurrency);
  }, []);
  const value = useMemo(
    () => ({ currency, setCurrency }),
    [currency, setCurrency],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}
