import type {
  CachedSetSummary,
  CardDetails,
  SetCatalogueCache,
  SetSummary,
} from "../tcgdex/types";
import { SET_CACHE_KEY } from "../tcgdex/types";
import {
  DEFAULT_LANGUAGE,
  isTcgLanguage,
  type TcgLanguage,
} from "../tcgdex/languages";

const FAVOURITES_KEY = "card-atlas.favourites.v1";
const EFFECT_KEY = "card-atlas.card-effect.v1";
const LANGUAGE_KEY = "card-atlas.catalogue-language.v1";
const CURRENCY_KEY = "card-atlas.price-currency.v1";

function setCatalogueKey(language: TcgLanguage): string {
  return language === DEFAULT_LANGUAGE
    ? SET_CACHE_KEY
    : `${SET_CACHE_KEY}.${language}`;
}

function favouritesKey(language: TcgLanguage): string {
  return language === DEFAULT_LANGUAGE
    ? FAVOURITES_KEY
    : `${FAVOURITES_KEY}.${language}`;
}

export interface FavouritesRecord {
  version: 1;
  language: TcgLanguage;
  ids: string[];
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function isCachedSetSummary(value: unknown): value is CachedSetSummary {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  const nullableText = (field: unknown) =>
    field === null || typeof field === "string";
  const nullableNumber = (field: unknown) =>
    field === null || (typeof field === "number" && Number.isFinite(field));
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.metadataResolved === "boolean" &&
    nullableText(item.logo) &&
    nullableText(item.symbol) &&
    nullableNumber(item.totalCards) &&
    nullableNumber(item.officialCards) &&
    nullableText(item.releaseDate) &&
    nullableNumber(item.releaseYear) &&
    nullableText(item.serieId) &&
    nullableText(item.serieName)
  );
}

export function readSetCatalogue(
  language: TcgLanguage = DEFAULT_LANGUAGE,
): SetCatalogueCache | null {
  const raw = readStorage(setCatalogueKey(language));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const cache = parsed as Record<string, unknown>;
    if (
      cache.version !== 2 ||
      typeof cache.savedAt !== "number" ||
      !Array.isArray(cache.sets) ||
      !Array.isArray(cache.completedIds)
    )
      return null;
    if (
      !cache.sets.every(isCachedSetSummary) ||
      !cache.completedIds.every((id) => typeof id === "string")
    )
      return null;
    return {
      version: 2,
      savedAt: cache.savedAt,
      sets: cache.sets,
      completedIds: cache.completedIds,
    };
  } catch {
    return null;
  }
}

export function writeSetCatalogue(
  cache: SetCatalogueCache,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): boolean {
  return writeStorage(setCatalogueKey(language), JSON.stringify(cache));
}

export function compactSetSummaries(sets: SetSummary[]): CachedSetSummary[] {
  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    metadataResolved: set.metadataResolved,
    logo: set.logo,
    symbol: set.symbol,
    totalCards: set.totalCards,
    officialCards: set.officialCards,
    releaseDate: set.releaseDate,
    releaseYear: set.releaseYear,
    serieId: set.serieId,
    serieName: set.serieName,
  }));
}

export function readFavourites(
  language: TcgLanguage = DEFAULT_LANGUAGE,
): FavouritesRecord {
  const raw = readStorage(favouritesKey(language));
  if (!raw) return { version: 1, language, ids: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null)
      return { version: 1, language, ids: [] };
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1 ||
      record.language !== language ||
      !Array.isArray(record.ids)
    )
      return { version: 1, language, ids: [] };
    return {
      version: 1,
      language,
      ids: [
        ...new Set(
          record.ids.filter((id): id is string => typeof id === "string"),
        ),
      ],
    };
  } catch {
    return { version: 1, language, ids: [] };
  }
}

export function writeFavourites(
  ids: string[],
  language: TcgLanguage = DEFAULT_LANGUAGE,
): boolean {
  const record: FavouritesRecord = {
    version: 1,
    language,
    ids: [...new Set(ids)],
  };
  return writeStorage(favouritesKey(language), JSON.stringify(record));
}

export function readLanguagePreference(): TcgLanguage {
  const saved = readStorage(LANGUAGE_KEY);
  return isTcgLanguage(saved) ? saved : DEFAULT_LANGUAGE;
}

export function writeLanguagePreference(language: TcgLanguage): boolean {
  return writeStorage(LANGUAGE_KEY, language);
}

export type PriceCurrency = "GBP" | "EUR" | "USD";

export function readPriceCurrencyPreference(): PriceCurrency {
  const saved = readStorage(CURRENCY_KEY);
  return saved === "EUR" || saved === "USD" ? saved : "GBP";
}

export function writePriceCurrencyPreference(currency: PriceCurrency): boolean {
  return writeStorage(CURRENCY_KEY, currency);
}

export function readCardEffectPreference(): boolean {
  return readStorage(EFFECT_KEY) !== "off";
}

export function writeCardEffectPreference(enabled: boolean): boolean {
  return writeStorage(EFFECT_KEY, enabled ? "on" : "off");
}

export function cardDetailsToSummary(
  card: CardDetails,
): SetSummary["cards"][number] {
  return {
    id: card.id,
    name: card.name,
    localId: card.localId,
    image: card.image,
    setId: card.setId,
    setName: card.setName,
  };
}
