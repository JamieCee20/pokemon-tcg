import TCGdex from "@tcgdex/sdk";
import MemoryCache from "@cachex/memory";
import type {
  CardDetails,
  CardFinish,
  CardSearchPage,
  CardSummary,
  SetBrief,
  SetSummary,
} from "./types";
import { CARD_PAGE_SIZE } from "./types";
import { DEFAULT_LANGUAGE, type TcgLanguage } from "./languages";

const API_BASE = "https://api.tcgdex.net/v2";
const tcgdexClients = new Map<TcgLanguage, TCGdex>();
const unavailableSdkLanguages = new Set<TcgLanguage>();
type JsonObject = Record<string, unknown>;

export class TcgDexError extends Error {
  readonly status: number | null;
  readonly retryAfter: string | null;

  constructor(
    message: string,
    status: number | null = null,
    retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "TcgDexError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// The SDK's default fetch turns 429/5xx replies into generic missing data or errors.
// Preserve those status codes so this adapter can retry transient failures correctly.
const sdkFetch = TCGdex.fetch;
TCGdex.fetch = async (input, init) => {
  const response = await sdkFetch(input, init);
  if (!response.ok && response.status !== 404) {
    const transient = response.status === 429 || response.status >= 500;
    throw new TcgDexError(
      transient
        ? `TCGdex is temporarily unavailable (${response.status}).`
        : `TCGdex returned an error (${response.status}).`,
      response.status,
      response.headers.get("Retry-After"),
    );
  }
  return response;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function cardFinishes(value: unknown): CardFinish[] {
  if (!isObject(value)) return [];
  return (["normal", "holo", "reverse"] as const).filter(
    (finish) => value[finish] === true,
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function getSdkClient(language: TcgLanguage): TCGdex | null {
  const existing = tcgdexClients.get(language);
  if (existing) return existing;
  if (unavailableSdkLanguages.has(language)) return null;
  try {
    const client = new TCGdex(language);
    client.setCache(new MemoryCache());
    tcgdexClients.set(language, client);
    return client;
  } catch {
    // Some browsers block localStorage access during SDK construction; use the REST fallback there.
    unavailableSdkLanguages.add(language);
    return null;
  }
}

function retryDelay(
  response: Response | null,
  attempt: number,
  retryAfterOverride: string | null = null,
): number {
  const retryAfter = retryAfterOverride ?? response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date))
      return Math.min(Math.max(date - Date.now(), 0), 10_000);
  }
  return 400 * 2 ** attempt;
}

function waitBeforeRetry(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was aborted.", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("The request was aborted.", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function sdkRequest<T>(
  request: () => Promise<T | null>,
  resource: string,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    if (signal?.aborted)
      throw new DOMException("The request was aborted.", "AbortError");
    try {
      const response = await request();
      if (signal?.aborted)
        throw new DOMException("The request was aborted.", "AbortError");
      if (response === null)
        throw new TcgDexError(`This ${resource} could not be found.`, 404);
      return response;
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (
        error instanceof TcgDexError &&
        error.status !== null &&
        error.status < 500 &&
        error.status !== 429
      )
        throw error;
      lastError = error;
      if (attempt < 2) {
        const retryAfter =
          error instanceof TcgDexError ? error.retryAfter : null;
        await waitBeforeRetry(retryDelay(null, attempt, retryAfter), signal);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new TcgDexError(`Could not load this ${resource}.`);
}

async function requestJson(
  path: string,
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    if (signal?.aborted)
      throw new DOMException("The request was aborted.", "AbortError");
    let response: Response | null = null;

    try {
      response = await fetch(`${API_BASE}/${language}${path}`, {
        headers: { Accept: "application/json" },
        ...(signal ? { signal } : {}),
      });
      if (response.ok) return (await response.json()) as unknown;
      if (response.status === 404)
        throw new TcgDexError(
          "This Pokémon TCG resource could not be found.",
          404,
        );
      if (response.status < 500 && response.status !== 429) {
        throw new TcgDexError(
          `TCGdex returned an error (${response.status}).`,
          response.status,
        );
      }
      lastError = new TcgDexError(
        `TCGdex is temporarily unavailable (${response.status}).`,
        response.status,
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (
        error instanceof TcgDexError &&
        error.status !== null &&
        error.status < 500 &&
        error.status !== 429
      )
        throw error;
      lastError = error;
    }

    if (attempt < 2) {
      await waitBeforeRetry(retryDelay(response, attempt), signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new TcgDexError(
        "Could not reach TCGdex. Check your internet connection.",
      );
}

function requireObject(value: unknown, resource: string): JsonObject {
  if (!isObject(value))
    throw new TcgDexError(`TCGdex returned an invalid ${resource} response.`);
  return value;
}

function mapSetBrief(value: unknown): SetBrief {
  const raw = requireObject(value, "set");
  const cardCount = isObject(raw.cardCount) ? raw.cardCount : {};
  const id = stringOrNull(raw.id);
  const name = stringOrNull(raw.name);
  if (!id || !name)
    throw new TcgDexError("TCGdex returned a set without an ID or name.");
  return {
    id,
    name,
    logo: stringOrNull(raw.logo),
    symbol: stringOrNull(raw.symbol),
    totalCards: numberOrNull(cardCount.total),
    officialCards: numberOrNull(cardCount.official),
  };
}

function mapCardBrief(
  value: unknown,
  setId: string | null = null,
  setName: string | null = null,
): CardSummary | null {
  if (!isObject(value)) return null;
  const id = stringOrNull(value.id);
  const name = stringOrNull(value.name);
  const localId = stringOrNull(value.localId);
  if (!id || !name || !localId) return null;
  return {
    id,
    name,
    localId,
    image: stringOrNull(value.image),
    availableFinishes: cardFinishes(value.variants),
    setId,
    setName,
    types: stringArray(value.types),
  };
}

function mapCardList(value: unknown): CardSummary[] {
  if (!Array.isArray(value))
    throw new TcgDexError("TCGdex returned an invalid card list.");
  return value
    .map((card) => mapCardBrief(card))
    .filter((card): card is CardSummary => card !== null);
}

function validReleaseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

export function mapSetSummary(value: unknown): SetSummary {
  const raw = requireObject(value, "set");
  const brief = mapSetBrief(raw);
  const releaseDate = validReleaseDate(raw.releaseDate);
  const serie = isObject(raw.serie) ? raw.serie : {};
  const cards = objectArray(raw.cards)
    .map((card) => mapCardBrief(card, brief.id, brief.name))
    .filter((card): card is CardSummary => card !== null);

  return {
    ...brief,
    metadataResolved: true,
    releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    serieId: stringOrNull(serie.id),
    serieName: stringOrNull(serie.name),
    cards,
  };
}

function sameSetShape(left: SetBrief, right: SetBrief): boolean {
  return (
    left.id === right.id &&
    left.totalCards !== null &&
    left.totalCards === right.totalCards &&
    (left.officialCards === null ||
      right.officialCards === null ||
      left.officialCards === right.officialCards)
  );
}

function mapSetWithEnglishNames(
  value: unknown,
  englishValue: unknown,
): SetSummary {
  const localized = mapSetSummary(value);
  if (!isObject(englishValue)) return localized;
  const englishBrief = mapSetBrief(englishValue);
  if (!sameSetShape(localized, englishBrief)) return localized;

  const englishCards = new Map(
    objectArray(englishValue.cards)
      .map((card) => mapCardBrief(card, localized.id, englishBrief.name))
      .filter((card): card is CardSummary => card !== null)
      .map((card) => [card.id, card]),
  );
  const cards = localized.cards.map((card) => {
    const englishCard = englishCards.get(card.id);
    if (!englishCard || englishCard.localId !== card.localId) return card;
    return {
      ...card,
      name: englishCard.name,
      fallbackImage: englishCard.image,
    };
  });

  return { ...localized, name: englishBrief.name, cards };
}

async function tryEnglishRequest(
  path: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  try {
    return await requestJson(path, signal, "en");
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function mapCardDetails(value: unknown): CardDetails {
  const raw = requireObject(value, "card");
  const brief = mapCardBrief(raw);
  if (!brief)
    throw new TcgDexError(
      "TCGdex returned a card without an ID, name, or number.",
    );
  const set = isObject(raw.set) ? raw.set : {};
  const attacks = objectArray(raw.attacks).map((attack) => ({
    name: stringOrNull(attack.name) ?? "Attack",
    cost: stringArray(attack.cost),
    damage: stringOrNull(attack.damage),
    effect: stringOrNull(attack.effect),
  }));
  const abilities = objectArray(raw.abilities).map((ability) => ({
    name: stringOrNull(ability.name) ?? "Ability",
    type: stringOrNull(ability.type),
    effect: stringOrNull(ability.effect),
  }));
  const weaknesses = objectArray(raw.weaknesses).map((weakness) => ({
    type: stringOrNull(weakness.type) ?? "Unknown",
    value: stringOrNull(weakness.value),
  }));

  return {
    ...brief,
    image: stringOrNull(raw.image),
    setId: stringOrNull(set.id),
    setName: stringOrNull(set.name),
    rarity: stringOrNull(raw.rarity),
    types: stringArray(raw.types),
    hp: typeof raw.hp === "number" ? String(raw.hp) : stringOrNull(raw.hp),
    illustrator: stringOrNull(raw.illustrator),
    description: stringOrNull(raw.description),
    category: stringOrNull(raw.category),
    suffix: stringOrNull(raw.suffix),
    stage: stringOrNull(raw.stage),
    attacks,
    abilities,
    weaknesses,
    retreat: numberOrNull(raw.retreat),
  };
}

export async function getSetBriefs(
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): Promise<SetBrief[]> {
  const [response, englishResponse] = await Promise.all([
    requestJson("/sets", signal, language),
    language === "en"
      ? Promise.resolve(null)
      : tryEnglishRequest("/sets", signal),
  ]);
  if (!Array.isArray(response))
    throw new TcgDexError("TCGdex returned an invalid set list.");
  const englishById = new Map<string, SetBrief>();
  if (Array.isArray(englishResponse)) {
    for (const value of englishResponse) {
      try {
        const brief = mapSetBrief(value);
        englishById.set(brief.id, brief);
      } catch {
        // Ignore malformed English entries and keep the localized catalogue.
      }
    }
  }
  return response.map((value) => {
    const brief = mapSetBrief(value);
    const english = englishById.get(brief.id);
    return english && sameSetShape(brief, english)
      ? { ...brief, name: english.name }
      : brief;
  });
}

export async function getSet(
  setId: string,
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
  resolveEnglishNames = true,
): Promise<SetSummary> {
  const client = getSdkClient(language);
  const response = client
    ? await sdkRequest(() => client.set.get(setId), "set", signal)
    : await requestJson(`/sets/${encodeURIComponent(setId)}`, signal, language);
  if (language === "en" || !resolveEnglishNames) return mapSetSummary(response);
  const englishResponse = await tryEnglishRequest(
    `/sets/${encodeURIComponent(setId)}`,
    signal,
  );
  return mapSetWithEnglishNames(response, englishResponse);
}

export async function getPocketSetIds(
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): Promise<string[]> {
  try {
    const response = requireObject(
      await requestJson("/series/tcgp", signal, language),
      "Pokémon TCG Pocket series",
    );
    return objectArray(response.sets)
      .map((set) => stringOrNull(set.id))
      .filter((id): id is string => id !== null);
  } catch (error) {
    if (error instanceof TcgDexError && error.status === 404) return [];
    throw error;
  }
}

export async function getCardsForSets(
  sets: Array<Pick<SetSummary, "id" | "name">>,
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): Promise<CardSummary[]> {
  const cardsBySet: CardSummary[][] = Array.from(
    { length: sets.length },
    () => [],
  );
  let cursor = 0;
  let failure: unknown;

  const worker = async () => {
    while (!signal?.aborted && failure === undefined) {
      const index = cursor;
      cursor += 1;
      const set = sets[index];
      if (!set) return;
      try {
        const fullSet = await getSet(set.id, signal, language, false);
        cardsBySet[index] = fullSet.cards;
      } catch (error) {
        failure = error;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(4, sets.length) }, () => worker()),
  );
  if (signal?.aborted)
    throw new DOMException("The request was aborted.", "AbortError");
  if (failure !== undefined) throw failure;
  const seen = new Set<string>();
  return cardsBySet.flat().filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

export async function searchCards(
  name: string,
  page: number,
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): Promise<CardSearchPage> {
  const params = new URLSearchParams();
  params.set("name", name);
  params.set("pagination:page", String(page));
  params.set("pagination:itemsPerPage", String(CARD_PAGE_SIZE));
  const response = await requestJson(
    `/cards?${params.toString()}`,
    signal,
    language,
  );
  const cards = mapCardList(response);
  if (language !== "en" && cards.length > 0) {
    const englishResponse = await tryEnglishRequest(
      `/cards?${params.toString()}`,
      signal,
    );
    if (Array.isArray(englishResponse)) {
      const englishCards = new Map(
        mapCardList(englishResponse).map((card) => [card.id, card]),
      );
      for (const card of cards) {
        const englishCard = englishCards.get(card.id);
        if (englishCard?.localId === card.localId) {
          card.name = englishCard.name;
          card.fallbackImage = englishCard.image;
        }
      }
    }
  }
  return { cards, page, hasMore: cards.length === CARD_PAGE_SIZE };
}

export async function getCard(
  cardId: string,
  signal?: AbortSignal,
  language: TcgLanguage = DEFAULT_LANGUAGE,
): Promise<CardDetails> {
  const client = getSdkClient(language);
  const response = client
    ? await sdkRequest(() => client.card.get(cardId), "card", signal)
    : await requestJson(
        `/cards/${encodeURIComponent(cardId)}`,
        signal,
        language,
      );
  const details = mapCardDetails(response);
  if (language === "en") return details;
  const englishResponse = await tryEnglishRequest(
    `/cards/${encodeURIComponent(cardId)}`,
    signal,
  );
  if (!isObject(englishResponse)) return details;
  const englishCard = mapCardDetails(englishResponse);
  if (
    englishCard.id !== details.id ||
    englishCard.localId !== details.localId ||
    englishCard.setId !== details.setId
  )
    return details;
  return {
    ...details,
    name: englishCard.name,
    setName: englishCard.setName,
    fallbackImage: englishCard.image,
  };
}

export function cardImageUrl(
  image: string | null,
  quality: "low" | "high",
): string | null {
  if (!image) return null;
  const qualityFile = image.match(/\/(?:low|high)\.(webp|png|jpe?g)$/i);
  if (qualityFile) {
    const base = image.replace(/\/(?:low|high)\.(?:webp|png|jpe?g)$/i, "");
    return `${base}/${quality}.${qualityFile[1]}`;
  }
  if (/\.(webp|png|jpe?g)$/i.test(image)) return image;
  return `${image}/${quality}.webp`;
}

export function cardImageUrls(
  image: string | null,
  quality: "low" | "high",
): string[] {
  if (!image) return [];
  const qualityFile = image.match(/\/(?:low|high)\.(webp|png|jpe?g)$/i);
  if (qualityFile) {
    const base = image.replace(/\/(?:low|high)\.(?:webp|png|jpe?g)$/i, "");
    return ["webp", "png", "jpg"].map(
      (extension) => `${base}/${quality}.${extension}`,
    );
  }
  if (/\.(webp|png|jpe?g)$/i.test(image)) return [image];
  return ["webp", "png", "jpg"].map(
    (extension) => `${image}/${quality}.${extension}`,
  );
}

export function assetImageUrl(asset: string | null): string | null {
  if (!asset) return null;
  if (/\.webp$/i.test(asset)) return asset;
  if (/\.(png|jpe?g)$/i.test(asset)) return asset.replace(/\.(png|jpe?g)$/i, ".webp");
  return `${asset}.webp`;
}
