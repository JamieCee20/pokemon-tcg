import { useContext } from "react";
import { CurrencyContext } from "./currencyContext";

export function usePriceCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) {
    throw new Error("usePriceCurrency must be used within CurrencyProvider");
  }
  return value;
}
