import { useQuery } from "@tanstack/react-query";
import { cardDetailsToSummary } from "../../lib/storage/local";
import { getCard } from "../../lib/tcgdex/api";
import type { CardDetails } from "../../lib/tcgdex/types";
import {
  EmptyState,
  ErrorState,
  LoadingCards,
  PageHeading,
} from "../../components/States";
import { PageFrame } from "../../components/AppLayout";
import { CardTile } from "../cards/CardTile";
import { useFavourites } from "./useFavourites";
import { useLanguage } from "../../lib/tcgdex/useLanguage";
import type { TcgLanguage } from "../../lib/tcgdex/languages";

interface FavouriteResult {
  id: string;
  card: CardDetails | null;
}

async function loadFavourites(
  ids: string[],
  signal: AbortSignal,
  language: TcgLanguage,
): Promise<FavouriteResult[]> {
  const results: FavouriteResult[] = ids.map((id) => ({ id, card: null }));
  let cursor = 0;

  const worker = async () => {
    while (!signal.aborted) {
      const index = cursor;
      cursor += 1;
      const id = ids[index];
      if (!id) return;
      try {
        const card = await getCard(id, signal, language);
        if (!signal.aborted) results[index] = { id, card };
      } catch {
        if (signal.aborted) return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(4, ids.length) }, () => worker()),
  );
  if (signal.aborted)
    throw new DOMException("The request was aborted.", "AbortError");
  return results;
}

export function FavouritesPage() {
  const favourites = useFavourites();
  const { language } = useLanguage();
  const query = useQuery({
    queryKey: ["tcgdex", "favourites", language, favourites.ids],
    queryFn: ({ signal }) => loadFavourites(favourites.ids, signal, language),
    enabled: favourites.ids.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const available = query.data?.filter((entry) => entry.card !== null) ?? [];
  const unavailable = query.data?.filter((entry) => entry.card === null) ?? [];

  return (
    <PageFrame>
      <PageHeading eyebrow="Saved on this device" title="Your favourites">
        <span className="heading-count">{favourites.ids.length} saved</span>
      </PageHeading>
      <p className="page-intro">A small pocket list, stored in this browser.</p>

      {favourites.ids.length === 0 && (
        <EmptyState title="No favourites yet">
          Save a card with the heart button and it will appear here.
        </EmptyState>
      )}
      {query.isPending && favourites.ids.length > 0 && (
        <LoadingCards count={Math.min(favourites.ids.length, 8)} />
      )}
      {query.isError && (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : "Your favourites could not be loaded."
          }
          onRetry={() => void query.refetch()}
        />
      )}
      {available.length > 0 && (
        <div className="card-grid">
          {available.flatMap((entry) =>
            entry.card
              ? [
                  <CardTile
                    key={entry.id}
                    card={cardDetailsToSummary(entry.card)}
                    returnTo={`/favourites?lang=${language}`}
                  />,
                ]
              : [],
          )}
        </div>
      )}
      {unavailable.length > 0 && (
        <section
          className="unavailable-favourites"
          aria-labelledby="unavailable-heading"
        >
          <div>
            <h2 id="unavailable-heading">Unavailable cards</h2>
            <p>These saved IDs are still here if you want to remove them.</p>
          </div>
          <ul>
            {unavailable.map((entry) => (
              <li key={entry.id}>
                <span>{entry.id}</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => favourites.remove(entry.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageFrame>
  );
}
