import type { TcgLanguage } from "../tcgdex/languages";
import type { PriceCurrency } from "../storage/local";

export interface ExchangeRates {
  base: "EUR";
  rates: Record<PriceCurrency, number>;
  date: string;
  stale: boolean;
}

export interface CardMarketPrices {
  currency: string | null;
  lowestNearMint: number | null;
  average7d: number | null;
  average30d: number | null;
}

export interface TcgPlayerPrices {
  currency: string | null;
  marketPrice: number | null;
  midPrice: number | null;
}

export interface CardPriceRecord {
  name: string | null;
  tcgid: string | null;
  cardNumber: string | null;
  episodeName: string | null;
  catalogLanguage: "en" | "jp";
  prices: {
    cardmarket: CardMarketPrices;
    tcgPlayer: TcgPlayerPrices;
  };
}

export class PricingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PricingError";
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPricingJson(response: Response): Promise<unknown> {
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PricingError(
      "The pricing service response could not be read. Try again in a moment.",
      response.status,
    );
  }
  if (!body.trim()) {
    throw new PricingError(
      `The pricing service returned an empty response (${response.status}).`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new PricingError(
      `The pricing service returned an invalid response (${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    const message =
      isObject(payload) && typeof payload.error === "string"
        ? payload.error
        : `Market prices could not be loaded (${response.status}).`;
    throw new PricingError(message, response.status);
  }
  return payload;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

async function fetchPricingResponse(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PricingError(
      "The pricing service could not be reached. Check that its server is running, then try again.",
      0,
    );
  }
}

export async function getCardPrice(
  tcgid: string,
  language: TcgLanguage,
  signal: AbortSignal,
): Promise<CardPriceRecord | null> {
  const query = new URLSearchParams({ tcgid, language });
  const response = await fetchPricingResponse(
    `/api/pricing/cards?${query}`,
    signal,
  );
  const payload = await readPricingJson(response);
  if (!isObject(payload) || !("card" in payload)) {
    throw new PricingError(
      "The pricing service returned invalid card data.",
      response.status,
    );
  }
  if (payload.card === null) return null;
  if (!isObject(payload.card) || !isObject(payload.card.prices)) {
    throw new PricingError(
      "The pricing service returned invalid card data.",
      response.status,
    );
  }
  return payload.card as unknown as CardPriceRecord;
}

export async function getCardPricesBatch(
  tcgids: string[],
  language: TcgLanguage,
  signal: AbortSignal,
): Promise<CardPriceRecord[]> {
  if (tcgids.length === 0) return [];
  if (tcgids.length > 20) {
    throw new PricingError("A price lookup can contain at most 20 cards.", 400);
  }
  const query = new URLSearchParams({ tcgids: tcgids.join(","), language });
  const response = await fetchPricingResponse(
    `/api/pricing/cards?${query}`,
    signal,
  );
  const payload = await readPricingJson(response);
  if (
    !isObject(payload) ||
    !Array.isArray(payload.cards) ||
    !payload.cards.every(
      (card) =>
        isObject(card) &&
        typeof card.tcgid === "string" &&
        isObject(card.prices),
    )
  ) {
    throw new PricingError(
      "The pricing service returned invalid card data.",
      response.status,
    );
  }
  return payload.cards as unknown as CardPriceRecord[];
}

export async function getExchangeRates(
  signal: AbortSignal,
): Promise<ExchangeRates> {
  const response = await fetchPricingResponse("/api/pricing/rates", signal);
  const payload = await readPricingJson(response);
  if (
    !isObject(payload) ||
    payload.base !== "EUR" ||
    !isObject(payload.rates) ||
    typeof payload.rates.EUR !== "number" ||
    typeof payload.rates.GBP !== "number" ||
    typeof payload.rates.USD !== "number" ||
    typeof payload.date !== "string" ||
    typeof payload.stale !== "boolean"
  ) {
    throw new PricingError(
      "The currency conversion service returned invalid rates.",
      response.status,
    );
  }
  return payload as unknown as ExchangeRates;
}
