import { createContext } from "react";

export interface FavouritesContextValue {
  ids: string[];
  contains: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
}

export const FavouritesContext = createContext<FavouritesContextValue | null>(
  null,
);
