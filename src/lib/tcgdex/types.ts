export interface SetBrief {
  id: string;
  name: string;
  logo: string | null;
  symbol: string | null;
  totalCards: number | null;
  officialCards: number | null;
}

export interface SetSummary extends SetBrief {
  metadataResolved: boolean;
  releaseDate: string | null;
  releaseYear: number | null;
  serieId: string | null;
  serieName: string | null;
  cards: CardSummary[];
}

export interface CardSummary {
  id: string;
  name: string;
  localId: string;
  image: string | null;
  fallbackImage?: string | null;
  availableFinishes?: CardFinish[];
  setId: string | null;
  setName: string | null;
}

export type CardFinish = "normal" | "holo" | "reverse";

export interface CardDetails extends CardSummary {
  rarity: string | null;
  types: string[];
  hp: string | null;
  illustrator: string | null;
  description: string | null;
  category: string | null;
  suffix: string | null;
  stage: string | null;
  attacks: Array<{
    name: string;
    cost: string[];
    damage: string | null;
    effect: string | null;
  }>;
  abilities: Array<{
    name: string;
    type: string | null;
    effect: string | null;
  }>;
  weaknesses: Array<{ type: string; value: string | null }>;
  retreat: number | null;
}

export interface SearchFilters {
  name: string;
  setId: string;
  year: string;
}

export interface CardSearchPage {
  cards: CardSummary[];
  page: number;
  hasMore: boolean;
}

export type CachedSetSummary = Omit<SetSummary, "cards">;

export interface SetCatalogueCache {
  version: 2;
  savedAt: number;
  sets: CachedSetSummary[];
  completedIds: string[];
}

export const CARD_PAGE_SIZE = 30;
export const SET_CACHE_KEY = "card-atlas.set-catalogue.v2";
export const SET_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
