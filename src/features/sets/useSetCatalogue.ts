import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSet, getSetBriefs } from "../../lib/tcgdex/api";
import type {
  SetBrief,
  SetCatalogueCache,
  SetSummary,
} from "../../lib/tcgdex/types";
import { SET_CACHE_MAX_AGE } from "../../lib/tcgdex/types";
import type { TcgLanguage } from "../../lib/tcgdex/languages";
import {
  compactSetSummaries,
  readSetCatalogue,
  writeSetCatalogue,
} from "../../lib/storage/local";

const ENRICHMENT_CONCURRENCY = 4;
function summaryFromBrief(brief: SetBrief): SetSummary {
  return {
    ...brief,
    metadataResolved: false,
    releaseDate: null,
    releaseYear: null,
    serieId: null,
    serieName: null,
    cards: [],
  };
}

export interface SetCatalogueState {
  sets: SetSummary[];
  isLoading: boolean;
  isFetchingBriefs: boolean;
  isIndexing: boolean;
  completedCount: number;
  totalCount: number;
  failedIds: string[];
  error: Error | null;
  retry: () => void;
}

export function useSetCatalogue(language: TcgLanguage): SetCatalogueState {
  const [cache, setCache] = useState<SetCatalogueCache | null>(() =>
    readSetCatalogue(language),
  );
  const [sets, setSets] = useState<SetSummary[]>(
    cache?.sets.map((set) => ({ ...set, cards: [] })) ?? [],
  );
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const completedRef = useRef(new Set<string>());
  const latestSetsRef = useRef(sets);
  const cacheRef = useRef<SetCatalogueCache | null>(null);

  const briefsQuery = useQuery({
    queryKey: ["tcgdex", "sets", "briefs", language],
    queryFn: ({ signal }) => getSetBriefs(signal, language),
    staleTime: SET_CACHE_MAX_AGE,
    retry: false,
  });
  const refreshBriefs = briefsQuery.refetch;

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    latestSetsRef.current = sets;
  }, [sets]);

  useEffect(() => {
    const briefs = briefsQuery.data;
    if (!briefs) return;
    const cached = cacheRef.current;
    const cacheIsFresh =
      cached !== null && Date.now() - cached.savedAt < SET_CACHE_MAX_AGE;
    const existingById = new Map(
      (cached?.sets ?? []).map((set) => [set.id, set]),
    );
    const loadedById = new Map(
      latestSetsRef.current
        .filter((set) => set.cards.length > 0)
        .map((set) => [set.id, set]),
    );
    const listed = briefs.map((brief) => {
      const saved = existingById.get(brief.id);
      const loaded = loadedById.get(brief.id);
      return {
        ...(saved ?? summaryFromBrief(brief)),
        name: brief.name,
        logo: brief.logo ?? saved?.logo ?? null,
        symbol: brief.symbol ?? saved?.symbol ?? null,
        totalCards: brief.totalCards ?? saved?.totalCards ?? null,
        officialCards: brief.officialCards ?? saved?.officialCards ?? null,
        cards: loaded?.cards ?? [],
      };
    });
    const ids = cacheIsFresh
      ? cached.completedIds.filter((id) =>
          briefs.some((brief) => brief.id === id),
        )
      : [];
    completedRef.current = new Set(ids);
    setSets(listed);
    latestSetsRef.current = listed;
    setCompletedIds(ids);

    const controller = new AbortController();
    const todo = briefs.filter((brief) => !completedRef.current.has(brief.id));
    let cursor = 0;
    const failed = new Set<string>();

    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = cursor;
        cursor += 1;
        const brief = todo[index];
        if (!brief) return;

        try {
          const fullSet = await getSet(
            brief.id,
            controller.signal,
            language,
            false,
          );
          fullSet.name = brief.name;
          const nextCompleted = new Set(completedRef.current).add(brief.id);
          completedRef.current = nextCompleted;
          const previous = latestSetsRef.current;
          const next = previous.map((set) =>
            set.id === brief.id ? fullSet : set,
          );
          latestSetsRef.current = next;
          setSets(next);
          const completed = [...nextCompleted];
          setCompletedIds(completed);
          setFailedIds([...failed]);
          const cache = {
            version: 2 as const,
            savedAt: Date.now(),
            sets: compactSetSummaries(next),
            completedIds: completed,
          };
          writeSetCatalogue(cache, language);
          cacheRef.current = cache;
          setCache(cache);
        } catch {
          if (controller.signal.aborted) return;
          failed.add(brief.id);
          setFailedIds([...failed]);
        }
      }
    };

    void Promise.all(
      Array.from(
        { length: Math.min(ENRICHMENT_CONCURRENCY, todo.length) },
        () => worker(),
      ),
    ).then(() => {
      if (!controller.signal.aborted) {
        setFailedIds([...failed]);
      }
    });

    return () => controller.abort();
  }, [briefsQuery.data, attempt, language]);

  const retry = useCallback(() => {
    setFailedIds([]);
    setAttempt((value) => value + 1);
    void refreshBriefs();
  }, [refreshBriefs]);
  const totalCount = briefsQuery.data?.length ?? sets.length;
  const isLoading = sets.length === 0 && briefsQuery.isPending;
  const isIndexing = Boolean(
    briefsQuery.data && completedIds.length + failedIds.length < totalCount,
  );

  return {
    sets,
    isLoading,
    isFetchingBriefs: briefsQuery.isFetching,
    isIndexing,
    completedCount: completedIds.length,
    totalCount,
    failedIds,
    error: briefsQuery.error instanceof Error ? briefsQuery.error : null,
    retry,
  };
}
