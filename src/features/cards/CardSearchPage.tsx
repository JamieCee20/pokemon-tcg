import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../lib/tcgdex/useLanguage";
import type { TcgLanguage } from "../../lib/tcgdex/languages";
import { getCardsForSets, getSet, searchCards } from "../../lib/tcgdex/api";
import type { CardSummary, SetSummary } from "../../lib/tcgdex/types";
import {
  EmptyState,
  ErrorState,
  LoadingCards,
  PageHeading,
} from "../../components/States";
import { PageFrame } from "../../components/AppLayout";
import { CardGrid } from "./CardTile";
import { sortCardsByNumber } from "../sets/setHelpers";
import { useSetCatalogue } from "../sets/useSetCatalogue";

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

export function CardSearchPage() {
  const { language } = useLanguage();
  return <CardSearchPageForLanguage key={language} language={language} />;
}

function CardSearchPageForLanguage({ language }: { language: TcgLanguage }) {
  const catalogue = useSetCatalogue(language);
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const setId = params.get("set") ?? "";
  const year = params.get("year") ?? "";
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, 300);
  const filterKey = `${query}\u0000${setId}\u0000${year}`;
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const localPage = pageState.filterKey === filterKey ? pageState.page : 1;
  const setQuery = useQuery({
    queryKey: ["tcgdex", "set", language, setId],
    queryFn: ({ signal }) => getSet(setId, signal, language),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    enabled: Boolean(setId),
  });
  const localMode = Boolean(setId || year);
  const indexComplete =
    catalogue.completedCount === catalogue.totalCount &&
    !catalogue.isIndexing &&
    catalogue.failedIds.length === 0;
  const canSearchLocal = Boolean(setId) || (Boolean(year) && indexComplete);
  const yearSets = useMemo(
    () =>
      year && !setId
        ? catalogue.sets.filter((set) =>
            year === "unknown"
              ? set.metadataResolved && set.releaseYear === null
              : String(set.releaseYear) === year,
          )
        : [],
    [catalogue.sets, setId, year],
  );
  const yearCardsQuery = useQuery({
    queryKey: [
      "tcgdex",
      "cards",
      "year",
      language,
      year,
      yearSets.map((set) => set.id),
    ],
    queryFn: ({ signal }) => getCardsForSets(yearSets, signal, language),
    enabled: Boolean(
      year && !setId && indexComplete && trimmedQuery.length >= 2,
    ),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const remoteQuery = useInfiniteQuery({
    queryKey: ["tcgdex", "cards", "search", language, debouncedQuery],
    queryFn: ({ pageParam, signal }) =>
      searchCards(debouncedQuery, pageParam, signal, language),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: !localMode && debouncedQuery.length >= 2,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const localCards = useMemo(() => {
    let candidateSets: SetSummary[] = [];
    if (!setId && year && trimmedQuery.length < 2) return [];
    if (setId) {
      const selected = setQuery.data;
      if (
        selected &&
        (!year ||
          (year === "unknown"
            ? selected.releaseYear === null
            : String(selected.releaseYear) === year))
      ) {
        candidateSets = [selected];
      }
    } else if (year && indexComplete) {
      const normalizedQuery = trimmedQuery.toLocaleLowerCase();
      return sortCardsByNumber(
        (yearCardsQuery.data ?? []).filter((card) =>
          card.name.toLocaleLowerCase().includes(normalizedQuery),
        ),
      );
    }

    const normalizedQuery = trimmedQuery.toLocaleLowerCase();
    const unique = new Map<string, CardSummary>();
    for (const set of candidateSets) {
      for (const card of set.cards) {
        if (
          !normalizedQuery ||
          card.name.toLocaleLowerCase().includes(normalizedQuery)
        ) {
          unique.set(card.id, { ...card, setId: set.id, setName: set.name });
        }
      }
    }
    return sortCardsByNumber([...unique.values()]);
  }, [
    indexComplete,
    setId,
    setQuery.data,
    trimmedQuery,
    year,
    yearCardsQuery.data,
  ]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const remoteCards = useMemo(() => {
    const seen = new Set<string>();
    return (remoteQuery.data?.pages.flatMap((page) => page.cards) ?? []).filter(
      (card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      },
    );
  }, [remoteQuery.data]);
  const localVisibleCards = localCards.slice(0, localPage * 30);
  const scopedSetError =
    setQuery.error instanceof Error ? setQuery.error : null;
  const yearSearchError =
    yearCardsQuery.error instanceof Error ? yearCardsQuery.error : null;
  const localSearchError = scopedSetError ?? yearSearchError;
  const hasLocalQuery = Boolean(setId) || trimmedQuery.length >= 2;
  const preparingYearSearch = Boolean(
    year &&
    !setId &&
    trimmedQuery.length >= 2 &&
    (!indexComplete || yearCardsQuery.isPending),
  );
  const isCurrentRemoteQuery = debouncedQuery === trimmedQuery;

  return (
    <PageFrame>
      <PageHeading eyebrow="Find your next favourite" title="Search cards" />
      <p className="page-intro">
        Search the {language === "en" ? "English" : "selected language"} Pokémon
        TCG catalogue by name, then narrow it to a set or release year.
      </p>

      <div className="search-panel">
        <label className="search-field search-field--large">
          <span className="search-field__icon" aria-hidden="true">
            ⌕
          </span>
          <span className="visually-hidden">Card name</span>
          <input
            type="search"
            value={query}
            placeholder="Try Pikachu, Charizard, Eevee…"
            onChange={(event) => updateFilter("q", event.target.value)}
          />
          {query && (
            <button
              className="clear-search"
              type="button"
              aria-label="Clear search"
              onClick={() => updateFilter("q", "")}
            >
              ×
            </button>
          )}
        </label>
        <label className="select-field">
          <span>Set</span>
          <select
            value={setId}
            onChange={(event) => updateFilter("set", event.target.value)}
          >
            <option value="">All sets</option>
            {catalogue.sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Release year</span>
          <select
            value={year}
            onChange={(event) => updateFilter("year", event.target.value)}
          >
            <option value="">All years</option>
            {[
              ...new Set(
                catalogue.sets
                  .map((set) => set.releaseYear)
                  .filter((item): item is number => item !== null),
              ),
            ]
              .sort((a, b) => b - a)
              .map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            {catalogue.sets.some(
              (set) => set.metadataResolved && set.releaseYear === null,
            ) && <option value="unknown">Unknown year</option>}
          </select>
        </label>
      </div>
      <p className="search-hint">
        {localMode
          ? "Name, set and release year filters are combined."
          : "Enter at least two characters to search the full card catalogue."}
      </p>

      {preparingYearSearch && (
        <div className="preparing-panel" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <div>
            <strong>Preparing the release year index</strong>
            <p>
              {catalogue.failedIds.length
                ? `${catalogue.failedIds.length} set details need another try before year results can be complete.`
                : `Loading set dates and card lists · ${catalogue.completedCount} of ${catalogue.totalCount}`}
            </p>
          </div>
          {catalogue.failedIds.length > 0 && (
            <button
              className="text-button"
              type="button"
              onClick={catalogue.retry}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {scopedSetError && (
        <ErrorState
          message={scopedSetError.message}
          onRetry={() => void setQuery.refetch()}
        />
      )}
      {yearSearchError && (
        <ErrorState
          message={yearSearchError.message}
          onRetry={() => void yearCardsQuery.refetch()}
        />
      )}

      {localMode && canSearchLocal && setQuery.isPending && setId && (
        <LoadingCards count={8} />
      )}
      {localMode &&
        canSearchLocal &&
        hasLocalQuery &&
        !setQuery.isPending &&
        localCards.length > 0 && (
          <>
            <div className="results-heading">
              <h2>
                {localCards.length} {localCards.length === 1 ? "card" : "cards"}{" "}
                found
              </h2>
              {year && (
                <span>
                  Release year: {year === "unknown" ? "Unknown" : year}
                </span>
              )}
            </div>
            <CardGrid cards={localVisibleCards} />
            {localVisibleCards.length < localCards.length && (
              <button
                className="button button--quiet load-more"
                type="button"
                onClick={() => setPageState({ filterKey, page: localPage + 1 })}
              >
                Load more cards
              </button>
            )}
          </>
        )}
      {localMode &&
        canSearchLocal &&
        !setQuery.isPending &&
        hasLocalQuery &&
        localCards.length === 0 &&
        !localSearchError &&
        !yearCardsQuery.isPending && (
          <EmptyState title="No matching cards">
            Try another name, set, or release year.
          </EmptyState>
        )}
      {localMode && canSearchLocal && !hasLocalQuery && !setQuery.isPending && (
        <EmptyState title="Start with a name">
          Enter at least two characters to search by release year.
        </EmptyState>
      )}
      {localMode && !canSearchLocal && catalogue.error && (
        <ErrorState
          message={catalogue.error.message}
          onRetry={catalogue.retry}
        />
      )}

      {!localMode && trimmedQuery.length < 2 && (
        <EmptyState title="Start with a name">
          Enter at least two characters. Results are loaded as you browse.
        </EmptyState>
      )}
      {!localMode &&
        trimmedQuery.length >= 2 &&
        debouncedQuery !== trimmedQuery && <LoadingCards count={8} />}
      {!localMode && debouncedQuery.length >= 2 && remoteQuery.isPending && (
        <LoadingCards count={8} />
      )}
      {!localMode && isCurrentRemoteQuery && remoteQuery.isError && (
        <ErrorState
          message={
            remoteQuery.error instanceof Error
              ? remoteQuery.error.message
              : "Card search could not be completed."
          }
          onRetry={() => void remoteQuery.refetch()}
        />
      )}
      {!localMode && isCurrentRemoteQuery && remoteCards.length > 0 && (
        <>
          <div className="results-heading">
            <h2>
              {remoteCards.length}
              {remoteQuery.hasNextPage ? "+" : ""} results
            </h2>
            <span>Search: “{debouncedQuery}”</span>
          </div>
          <CardGrid cards={remoteCards} />
          {remoteQuery.hasNextPage && (
            <button
              className="button button--quiet load-more"
              type="button"
              disabled={remoteQuery.isFetchingNextPage}
              onClick={() => void remoteQuery.fetchNextPage()}
            >
              {remoteQuery.isFetchingNextPage ? "Loading…" : "Load more cards"}
            </button>
          )}
        </>
      )}
      {!localMode &&
        isCurrentRemoteQuery &&
        debouncedQuery.length >= 2 &&
        remoteQuery.isSuccess &&
        remoteCards.length === 0 && (
          <EmptyState title="No cards found">
            Try a different spelling or shorter name.
          </EmptyState>
        )}
    </PageFrame>
  );
}
