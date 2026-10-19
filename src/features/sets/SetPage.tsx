import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { assetImageUrl } from "../../lib/tcgdex/api";
import { getSet } from "../../lib/tcgdex/api";
import { ErrorState, EmptyState, LoadingCards } from "../../components/States";
import { PageFrame } from "../../components/AppLayout";
import { CardGrid } from "../cards/CardTile";
import { sortCardsByNumber } from "./setHelpers";
import { useLanguage } from "../../lib/tcgdex/useLanguage";
import {
  getCardPricesBatch,
  type CardPriceRecord,
} from "../../lib/pricing/api";

const SORT_MODES = [
  "number-asc",
  "number-desc",
  "tcgplayer-asc",
  "tcgplayer-desc",
  "cardmarket-asc",
  "cardmarket-desc",
] as const;
type SortMode = (typeof SORT_MODES)[number];

function isSortMode(value: string | null): value is SortMode {
  return SORT_MODES.some((mode) => mode === value);
}

function currentPrice(record: CardPriceRecord | undefined, mode: SortMode) {
  if (mode.startsWith("tcgplayer"))
    return record?.prices.tcgPlayer.marketPrice ?? null;
  if (mode.startsWith("cardmarket"))
    return record?.prices.cardmarket.lowestNearMint ?? null;
  return null;
}

export function SetPage() {
  const { setId = "" } = useParams();
  const { language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const sortParam = params.get("sort");
  const sortMode: SortMode = isSortMode(sortParam) ? sortParam : "number-asc";
  const setQuery = useQuery({
    queryKey: ["tcgdex", "set", language, setId],
    queryFn: ({ signal }) => getSet(setId, signal, language),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    enabled: Boolean(setId),
  });
  const catalogueParams = new URLSearchParams(params);
  catalogueParams.set("lang", language);
  const catalogueHref = `/sets?${catalogueParams.toString()}`;

  const set = setQuery.data;
  const cardIds = useMemo(() => set?.cards.map((card) => card.id) ?? [], [set]);
  const isPriceSort =
    sortMode.startsWith("tcgplayer") || sortMode.startsWith("cardmarket");
  const priceQuery = useQuery({
    queryKey: ["pokemon-prices", "set", language, setId, cardIds],
    queryFn: async ({ signal }) => {
      const prices = new Map<string, CardPriceRecord>();
      for (let index = 0; index < cardIds.length; index += 20) {
        const batch = await getCardPricesBatch(
          cardIds.slice(index, index + 20),
          language,
          signal,
        );
        for (const price of batch) {
          if (price.tcgid) prices.set(price.tcgid.toLowerCase(), price);
        }
      }
      return prices;
    },
    enabled: Boolean(set && isPriceSort),
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: false,
  });
  const cards = useMemo(() => {
    if (!set) return [];
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? set.cards.filter((card) =>
          card.name.toLocaleLowerCase().includes(normalized),
        )
      : set.cards;
    if (sortMode === "number-desc") return sortCardsByNumber(filtered, "desc");
    if (!sortMode.startsWith("tcgplayer") && !sortMode.startsWith("cardmarket"))
      return sortCardsByNumber(filtered);

    const numberSorted = sortCardsByNumber(filtered);
    const numberRank = new Map(
      numberSorted.map((card, index) => [card.id, index]),
    );
    const prices = priceQuery.data;
    const direction = sortMode.endsWith("asc") ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const leftPrice = currentPrice(
        prices?.get(left.id.toLowerCase()),
        sortMode,
      );
      const rightPrice = currentPrice(
        prices?.get(right.id.toLowerCase()),
        sortMode,
      );
      if (leftPrice === null) {
        return rightPrice === null
          ? (numberRank.get(left.id) ?? 0) - (numberRank.get(right.id) ?? 0)
          : 1;
      }
      if (rightPrice === null) return -1;
      const comparison = leftPrice - rightPrice;
      return comparison === 0
        ? (numberRank.get(left.id) ?? 0) - (numberRank.get(right.id) ?? 0)
        : comparison * direction;
    });
  }, [priceQuery.data, query, set, sortMode]);
  const hasSortPrices = Boolean(
    isPriceSort &&
    set?.cards.some(
      (card) =>
        currentPrice(priceQuery.data?.get(card.id.toLowerCase()), sortMode) !==
        null,
    ),
  );
  const logo = assetImageUrl(set?.logo ?? null);
  const released = set?.releaseDate
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${set.releaseDate}T00:00:00Z`))
    : "Release date unavailable";

  function setQueryText(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  }

  function setSortMode(value: string) {
    if (!isSortMode(value)) return;
    const next = new URLSearchParams(params);
    if (value === "number-asc") next.delete("sort");
    else next.set("sort", value);
    setParams(next, { replace: true });
  }

  if (setQuery.isError) {
    const message =
      setQuery.error instanceof Error
        ? setQuery.error.message
        : "This set could not be loaded.";
    return (
      <PageFrame>
        <Link className="back-link" to={catalogueHref}>
          ← All sets
        </Link>
        <ErrorState message={message} onRetry={() => void setQuery.refetch()} />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to={catalogueHref}>All sets</Link>
        <span aria-hidden="true">/</span>
        <span>{set?.name ?? "Loading set"}</span>
      </nav>
      {!set && (
        <div className="set-hero-skeleton" aria-label="Loading set details" />
      )}
      {set && (
        <section className="set-hero">
          <div className="set-hero__logo">
            {logo ? (
              <img src={logo} alt="" />
            ) : (
              <span aria-hidden="true">✳</span>
            )}
          </div>
          <div className="set-hero__copy">
            <p className="eyebrow">{set.serieName ?? "Pokémon TCG set"}</p>
            <h1>{set.name}</h1>
            <p className="set-hero__description">
              Released {released} <span aria-hidden="true">·</span>{" "}
              {set.totalCards ?? set.cards.length} cards
            </p>
          </div>
          <div className="set-hero__badge">
            <span>SET</span>
            <strong>{set.id}</strong>
          </div>
        </section>
      )}

      <div className="section-toolbar">
        <div>
          <h2>Cards in this set</h2>
          <p>
            {set
              ? `${cards.length} ${cards.length === 1 ? "card" : "cards"}`
              : "Loading cards…"}
          </p>
        </div>
        <div className="set-card-filters">
          <label className="search-field search-field--compact">
            <span className="search-field__icon" aria-hidden="true">
              ⌕
            </span>
            <span className="visually-hidden">Search cards in this set</span>
            <input
              type="search"
              value={query}
              placeholder="Search this set…"
              onChange={(event) => setQueryText(event.target.value)}
            />
          </label>
          <label className="set-sort-field">
            <span className="visually-hidden">Sort cards in this set</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
            >
              <option value="number-asc">Card number · Low to high</option>
              <option value="number-desc">Card number · High to low</option>
              <option value="tcgplayer-asc">
                TCGplayer price · Low to high
              </option>
              <option value="tcgplayer-desc">
                TCGplayer price · High to low
              </option>
              <option value="cardmarket-asc">
                Cardmarket price · Low to high
              </option>
              <option value="cardmarket-desc">
                Cardmarket price · High to low
              </option>
            </select>
          </label>
        </div>
      </div>

      {set && isPriceSort && priceQuery.isFetching && (
        <p className="set-price-sort-status" role="status">
          Loading current prices to sort this set…
        </p>
      )}
      {set && isPriceSort && priceQuery.isError && (
        <p className="set-price-sort-status" role="status">
          Prices could not be loaded. Cards fall back to card-number order where
          a price is missing.{" "}
          <button type="button" onClick={() => void priceQuery.refetch()}>
            Try again
          </button>
        </p>
      )}
      {set && isPriceSort && priceQuery.isSuccess && !hasSortPrices && (
        <p className="set-price-sort-status" role="status">
          No matching prices are available for this set. Cards are shown by
          number.
        </p>
      )}
      {set && isPriceSort && priceQuery.isSuccess && hasSortPrices && (
        <p className="set-price-sort-status" role="status">
          Cards without a current price appear after cards with a price.
        </p>
      )}

      {setQuery.isPending && <LoadingCards count={12} />}
      {set && cards.length > 0 && <CardGrid cards={cards} />}
      {set && cards.length === 0 && (
        <EmptyState
          title={query ? "No matching cards" : "This set has no card entries"}
        >
          {query
            ? "Try a different card name."
            : "TCGdex did not provide a card list for this set."}
        </EmptyState>
      )}
    </PageFrame>
  );
}
