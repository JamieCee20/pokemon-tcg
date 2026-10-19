import { useCallback, useMemo, useState, type ReactNode } from "react";
import { readFavourites, writeFavourites } from "../../lib/storage/local";
import type { TcgLanguage } from "../../lib/tcgdex/languages";
import { FavouritesContext } from "./FavouritesContext";

export function FavouritesProvider({
  children,
  language,
}: {
  children: ReactNode;
  language: TcgLanguage;
}) {
  const [saved, setSaved] = useState(() => ({
    language,
    ids: readFavourites(language).ids,
  }));
  const ids =
    saved.language === language ? saved.ids : readFavourites(language).ids;

  const saveIds = useCallback(
    (next: string[]) => {
      const unique = [...new Set(next)];
      writeFavourites(unique, language);
      setSaved({ language, ids: unique });
    },
    [language],
  );

  const toggle = useCallback(
    (id: string) => {
      saveIds(
        ids.includes(id)
          ? ids.filter((savedId) => savedId !== id)
          : [...ids, id],
      );
    },
    [ids, saveIds],
  );

  const remove = useCallback(
    (id: string) => saveIds(ids.filter((savedId) => savedId !== id)),
    [ids, saveIds],
  );

  const value = useMemo(
    () => ({ ids, contains: (id: string) => ids.includes(id), toggle, remove }),
    [ids, toggle, remove],
  );
  return (
    <FavouritesContext.Provider value={value}>
      {children}
    </FavouritesContext.Provider>
  );
}
