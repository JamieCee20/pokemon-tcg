import { useContext } from "react";
import {
  FavouritesContext,
  type FavouritesContextValue,
} from "./FavouritesContext";

export function useFavourites(): FavouritesContextValue {
  const value = useContext(FavouritesContext);
  if (!value)
    throw new Error("useFavourites must be used within FavouritesProvider.");
  return value;
}
