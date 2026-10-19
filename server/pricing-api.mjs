import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 3001);
const RAPIDAPI_KEY = process.env.POKEMON_API_KEY?.trim() ?? "";
const APITCG_API_KEY = process.env.APITCG_API_KEY?.trim() ?? "";
const APITCG_CACHE_FILE = resolve(
  process.env.APITCG_CACHE_FILE ?? "./data/apitcg-cache.json",
);
const configuredApiTcgDailyLimit = Number(
  process.env.APITCG_DAILY_REQUEST_LIMIT ?? 2,
);
const APITCG_DAILY_REQUEST_LIMIT = Number.isFinite(configuredApiTcgDailyLimit)
  ? Math.max(0, Math.floor(configuredApiTcgDailyLimit))
  : 2;
const configuredDailyLimit = Number(
  process.env.POKEMON_PRICE_DAILY_LIMIT ?? 90,
);
const DAILY_REQUEST_LIMIT = Number.isFinite(configuredDailyLimit)
  ? Math.max(0, Math.floor(configuredDailyLimit))
  : 90;
const PROVIDER_URL = "https://cardmarket-api-tcg.p.rapidapi.com";
const EXCHANGE_RATE_URL = "https://api.frankfurter.dev/v2/rates";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EXCHANGE_RATE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EXCHANGE_RATE_STALE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const APITCG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const APITCG_MAX_CACHE_ENTRIES = 1_000;
const APITCG_URL = "https://api.apitcg.com";
const APITCG_PAGE_SIZE = 100;
const APITCG_SET_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const responseCache = new Map();
let dailyUsage = { date: new Date().toISOString().slice(0, 10), count: 0 };
let exchangeRateCache = null;
let apitcgStore = {
  version: 2,
  entries: {},
  dailyUsage: null,
  catalog: createEmptyApitcgCatalog(),
};
let apitcgStoreLoaded = false;
let apitcgLoadPromise = null;
let apitcgPersistQueue = Promise.resolve();
let apitcgSyncRunning = false;
let apitcgSyncTimer = null;

function createEmptyApitcgCatalog() {
  return {
    sets: [],
    products: {},
    sync: {
      status: "idle",
      mode: null,
      phase: null,
      page: 1,
      totalProducts: 0,
      startedAt: null,
      lastSyncedAt: null,
      lastSetSyncAt: null,
      fromTimestamp: null,
      lastError: null,
    },
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

async function loadApitcgStore() {
  if (apitcgStoreLoaded) return;
  if (!apitcgLoadPromise) {
    apitcgLoadPromise = (async () => {
      try {
        const contents = await readFile(APITCG_CACHE_FILE, "utf8");
        const saved = JSON.parse(contents);
        if (
          isObject(saved) &&
          [1, 2].includes(saved.version) &&
          isObject(saved.entries)
        ) {
          const savedCatalog = isObject(saved.catalog) ? saved.catalog : null;
          const emptyCatalog = createEmptyApitcgCatalog();
          apitcgStore = {
            version: 2,
            entries: saved.entries,
            dailyUsage: isObject(saved.dailyUsage) ? saved.dailyUsage : null,
            catalog:
              savedCatalog &&
              Array.isArray(savedCatalog.sets) &&
              isObject(savedCatalog.products) &&
              isObject(savedCatalog.sync)
                ? {
                    sets: savedCatalog.sets,
                    products: savedCatalog.products,
                    sync: { ...emptyCatalog.sync, ...savedCatalog.sync },
                  }
                : emptyCatalog,
          };
        }
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error(
            "Could not read the APITCG cache file:",
            error?.message,
          );
        }
      } finally {
        apitcgStoreLoaded = true;
      }
    })();
  }
  await apitcgLoadPromise;
}

function apitcgResponseHeaders(cache) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    "X-APITCG-Cache": cache,
    "X-APITCG-Requests-Today": String(
      apitcgStore.dailyUsage?.date === today ? apitcgStore.dailyUsage.count : 0,
    ),
    "X-APITCG-Daily-Limit": String(APITCG_DAILY_REQUEST_LIMIT),
  };
}

function allowedApitcgQuery(requestUrl, allowed) {
  const params = new URLSearchParams();
  for (const name of allowed) {
    const value = requestUrl.searchParams.get(name)?.trim();
    if (value) params.set(name, value);
  }
  for (const name of requestUrl.searchParams.keys()) {
    if (!allowed.includes(name)) {
      throw apiTcgError(
        `Unsupported APITCG query parameter: ${name}`,
        400,
        "invalid_query",
      );
    }
  }
  return params;
}

function persistApitcgStore() {
  apitcgPersistQueue = apitcgPersistQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(dirname(APITCG_CACHE_FILE), { recursive: true });
      const temporaryFile = `${APITCG_CACHE_FILE}.${process.pid}.tmp`;
      await writeFile(temporaryFile, JSON.stringify(apitcgStore), "utf8");
      await rename(temporaryFile, APITCG_CACHE_FILE);
    });
  return apitcgPersistQueue;
}

function apiTcgError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getApitcgData(path, searchParams) {
  if (!APITCG_API_KEY) {
    throw apiTcgError(
      "APITCG is not configured. Add APITCG_API_KEY to the pricing-api environment.",
      503,
      "apitcg_not_configured",
    );
  }

  await loadApitcgStore();
  const url = new URL(path, APITCG_URL);
  for (const [key, value] of [...searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    url.searchParams.set(key, value);
  }
  const cacheKey = `${url.pathname}?${url.searchParams.toString()}`;
  const now = Date.now();
  const cached = apitcgStore.entries[cacheKey];
  if (isObject(cached) && typeof cached.savedAt === "number") {
    if (now - cached.savedAt < APITCG_CACHE_TTL_MS) {
      return { body: cached.body, cache: "HIT" };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  if (
    !isObject(apitcgStore.dailyUsage) ||
    apitcgStore.dailyUsage.date !== today
  ) {
    apitcgStore.dailyUsage = { date: today, count: 0 };
  }
  if (
    APITCG_DAILY_REQUEST_LIMIT > 0 &&
    apitcgStore.dailyUsage.count >= APITCG_DAILY_REQUEST_LIMIT
  ) {
    if (isObject(cached) && "body" in cached) {
      return { body: cached.body, cache: "STALE" };
    }
    throw apiTcgError(
      "The configured daily APITCG request limit has been reached. Try again tomorrow or adjust APITCG_DAILY_REQUEST_LIMIT.",
      429,
      "apitcg_daily_limit",
    );
  }

  apitcgStore.dailyUsage.count += 1;
  await persistApitcgStore();
  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": APITCG_API_KEY,
      },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await upstream.text();
    let body;
    try {
      body = text.trim() ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!upstream.ok) {
      if (upstream.status === 401) {
        throw apiTcgError(
          "APITCG rejected the key. Check APITCG_API_KEY in the server environment.",
          502,
          "apitcg_unauthorized",
        );
      }
      if (upstream.status === 429) {
        throw apiTcgError(
          "APITCG monthly request limit was reached.",
          429,
          "apitcg_rate_limited",
        );
      }
      throw apiTcgError(
        `APITCG returned an error (${upstream.status}).`,
        502,
        "apitcg_upstream_error",
      );
    }
    if (body === null) {
      throw apiTcgError(
        "APITCG returned an empty or invalid JSON response.",
        502,
        "apitcg_invalid_response",
      );
    }

    apitcgStore.entries[cacheKey] = { savedAt: now, body };
    const entries = Object.entries(apitcgStore.entries)
      .filter(
        ([, entry]) => isObject(entry) && typeof entry.savedAt === "number",
      )
      .sort((left, right) => right[1].savedAt - left[1].savedAt)
      .slice(0, APITCG_MAX_CACHE_ENTRIES);
    apitcgStore.entries = Object.fromEntries(entries);
    await persistApitcgStore();
    return { body, cache: "MISS" };
  } catch (error) {
    if (isObject(cached) && "body" in cached) {
      return { body: cached.body, cache: "STALE" };
    }
    throw error;
  }
}

function getApiTcgRows(body) {
  if (Array.isArray(body)) return body;
  if (isObject(body) && Array.isArray(body.data)) return body.data;
  return [];
}

function isApiTcgListResponse(body) {
  return Array.isArray(body) || (isObject(body) && Array.isArray(body.data));
}

function getApiTcgTotal(body, rowCount) {
  return isObject(body) &&
    typeof body.total === "number" &&
    Number.isFinite(body.total)
    ? body.total
    : rowCount;
}

async function fetchFreshApiTcgData(path, params) {
  const result = await getApitcgData(path, params);
  if (result.cache === "STALE") {
    throw apiTcgError(
      "The daily APITCG request limit has been reached; catalogue sync will resume when requests are available.",
      429,
      "apitcg_daily_limit",
    );
  }
  return result.body;
}

function setCatalogSyncStatus(status, updates = {}) {
  apitcgStore.catalog.sync = {
    ...apitcgStore.catalog.sync,
    ...updates,
    status,
  };
}

function nextUtcTime(hour = 0) {
  const next = new Date();
  next.setUTCHours(hour, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

function scheduleApitcgCatalogSync(at = nextUtcTime(2)) {
  if (apitcgSyncTimer) clearTimeout(apitcgSyncTimer);
  apitcgSyncTimer = setTimeout(
    () => {
      apitcgSyncTimer = null;
      if (apitcgStore.catalog.sync.status === "complete") {
        void startApitcgCatalogSync();
      } else {
        void runApitcgCatalogSync();
      }
    },
    Math.max(1_000, at - Date.now()),
  );
  apitcgSyncTimer.unref?.();
}

function scheduleApitcgResumeAtMidnight() {
  scheduleApitcgCatalogSync(nextUtcTime(0));
}

function getProductSetIds(product) {
  if (!isObject(product.set)) return [];
  return [product.set._id, product.set.id, product.set.code]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map(String);
}

async function runApitcgCatalogSync() {
  if (apitcgSyncRunning) return;
  apitcgSyncRunning = true;
  try {
    await loadApitcgStore();
    const sync = apitcgStore.catalog.sync;
    if (!sync.mode || sync.status === "idle" || sync.status === "complete")
      return;
    if (!APITCG_API_KEY) {
      throw apiTcgError(
        "APITCG is not configured. Add APITCG_API_KEY to the pricing-api environment.",
        503,
        "apitcg_not_configured",
      );
    }
    setCatalogSyncStatus("syncing", { lastError: null });
    await persistApitcgStore();

    while (apitcgStore.catalog.sync.phase === "sets") {
      const body = await fetchFreshApiTcgData(
        "/api/pokemon/sets",
        new URLSearchParams(),
      );
      if (!isApiTcgListResponse(body)) {
        throw apiTcgError(
          "APITCG returned an unexpected sets response.",
          502,
          "apitcg_invalid_response",
        );
      }
      const sets = getApiTcgRows(body);
      apitcgStore.catalog.sets = sets.filter(isObject);
      apitcgStore.catalog.sync.lastSetSyncAt = new Date().toISOString();
      apitcgStore.catalog.sync.phase = "products";
      await persistApitcgStore();
    }

    while (apitcgStore.catalog.sync.phase === "products") {
      const currentSync = apitcgStore.catalog.sync;
      const params = new URLSearchParams({
        type: "card",
        tcg: "pokemon",
        page: String(currentSync.page),
        limit: String(APITCG_PAGE_SIZE),
      });
      if (currentSync.mode === "incremental" && currentSync.fromTimestamp) {
        params.set("updatedSince", currentSync.fromTimestamp);
      }
      const body = await fetchFreshApiTcgData("/api/products", params);
      if (!isApiTcgListResponse(body)) {
        throw apiTcgError(
          "APITCG returned an unexpected products response.",
          502,
          "apitcg_invalid_response",
        );
      }
      const rows = getApiTcgRows(body).filter(isObject);
      for (const product of rows) {
        const id = product._id;
        if (typeof id === "string" || typeof id === "number") {
          apitcgStore.catalog.products[String(id)] = product;
        }
      }
      const total = getApiTcgTotal(body, rows.length);
      const reachedEnd =
        rows.length === 0 || currentSync.page * APITCG_PAGE_SIZE >= total;
      apitcgStore.catalog.sync.totalProducts =
        currentSync.mode === "incremental"
          ? apitcgStore.catalog.sync.totalProducts + rows.length
          : total;
      if (reachedEnd) {
        const completedAt = currentSync.startedAt ?? new Date().toISOString();
        setCatalogSyncStatus("complete", {
          mode: null,
          phase: null,
          page: 1,
          lastSyncedAt: completedAt,
          fromTimestamp: null,
          lastError: null,
        });
      } else {
        apitcgStore.catalog.sync.page += 1;
      }
      await persistApitcgStore();
    }

    if (apitcgStore.catalog.sync.status === "complete") {
      scheduleApitcgCatalogSync();
    }
  } catch (error) {
    if (error?.code === "apitcg_daily_limit") {
      setCatalogSyncStatus("waiting", { lastError: error.message });
      await persistApitcgStore();
      scheduleApitcgResumeAtMidnight();
    } else {
      setCatalogSyncStatus("error", {
        lastError: error?.message ?? "APITCG catalogue sync failed.",
      });
      await persistApitcgStore();
    }
  } finally {
    apitcgSyncRunning = false;
  }
}

async function startApitcgCatalogSync() {
  await loadApitcgStore();
  const current = apitcgStore.catalog.sync;
  if (current.status === "syncing" || apitcgSyncRunning) return false;

  if (current.mode && ["waiting", "error"].includes(current.status)) {
    setCatalogSyncStatus("syncing", { lastError: null });
    await persistApitcgStore();
    void runApitcgCatalogSync();
    return true;
  }

  const isIncremental = current.status === "complete" && current.lastSyncedAt;
  const startedAt = new Date().toISOString();
  const overlapFrom = isIncremental
    ? new Date(new Date(current.lastSyncedAt).getTime() - 60_000).toISOString()
    : null;
  const refreshSets =
    !isIncremental ||
    !current.lastSetSyncAt ||
    Date.now() - new Date(current.lastSetSyncAt).getTime() >=
      APITCG_SET_REFRESH_MS;
  setCatalogSyncStatus("syncing", {
    mode: isIncremental ? "incremental" : "full",
    phase: refreshSets ? "sets" : "products",
    page: 1,
    totalProducts: 0,
    startedAt,
    fromTimestamp: overlapFrom,
    lastError: null,
  });
  await persistApitcgStore();
  void runApitcgCatalogSync();
  return true;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function currency(value) {
  return typeof value === "string" && /^[A-Z]{3}$/i.test(value)
    ? value.toUpperCase()
    : null;
}

function mapCard(record, catalogLanguage) {
  if (!isObject(record)) return null;

  const prices = isObject(record.prices) ? record.prices : {};

  const cardmarket = isObject(prices.cardmarket) ? prices.cardmarket : {};
  const tcgPlayer = isObject(prices.tcg_player)
    ? prices.tcg_player
    : isObject(prices.tcgplayer)
      ? prices.tcgplayer
      : {};

  return {
    name: typeof record.name === "string" ? record.name : null,
    tcgid: typeof record.tcgid === "string" ? record.tcgid : null,
    cardNumber:
      typeof record.card_number === "string" ||
      typeof record.card_number === "number"
        ? String(record.card_number)
        : null,
    episodeName:
      isObject(record.episode) && typeof record.episode.name === "string"
        ? record.episode.name
        : null,
    catalogLanguage,
    prices: {
      cardmarket: {
        currency: currency(cardmarket.currency),
        lowestNearMint:
          (catalogLanguage === "jp"
            ? finiteNumber(cardmarket.lowest_near_mint_JP)
            : null) ??
          finiteNumber(cardmarket.lowest_near_mint) ??
          finiteNumber(cardmarket.lowest_near_mint_JP),
        average7d: finiteNumber(cardmarket["7d_average"]),
        average30d: finiteNumber(cardmarket["30d_average"]),
      },
      tcgPlayer: {
        currency: currency(tcgPlayer.currency),
        marketPrice: finiteNumber(tcgPlayer.market_price),
        midPrice: finiteNumber(tcgPlayer.mid_price),
      },
    },
  };
}

function cacheGet(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  // Refresh insertion order so frequently viewed cards stay in the bounded cache.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  responseCache.delete(key);
  responseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

async function fetchPriceRecords(tcgids, catalogLanguage) {
  if (!RAPIDAPI_KEY) {
    const error = new Error("Pricing is not configured on this server.");
    error.status = 503;
    error.code = "not_configured";
    throw error;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (dailyUsage.date !== today) dailyUsage = { date: today, count: 0 };
  if (DAILY_REQUEST_LIMIT > 0 && dailyUsage.count >= DAILY_REQUEST_LIMIT) {
    const error = new Error(
      "The configured daily price lookup limit has been reached.",
    );
    error.status = 429;
    error.code = "daily_limit";
    throw error;
  }
  dailyUsage.count += 1;

  const providerUrl = new URL("/v1/tcgapi/pokemon/cards/search", PROVIDER_URL);
  providerUrl.searchParams.set(
    tcgids.length === 1 ? "tcgid" : "tcgids",
    tcgids.join(","),
  );
  if (catalogLanguage === "jp") providerUrl.searchParams.set("lang", "jp");

  const providerResponse = await fetch(providerUrl, {
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": RAPIDAPI_KEY,
      "X-RapidAPI-Host": new URL(PROVIDER_URL).hostname,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (providerResponse.status === 429) {
    const error = new Error("The pricing provider rate limit was reached.");
    error.status = 429;
    error.code = "rate_limited";
    throw error;
  }
  if (providerResponse.status === 401 || providerResponse.status === 403) {
    const error = new Error(
      "The pricing provider rejected the request. Check the RapidAPI subscription and plan.",
    );
    error.status = 502;
    error.code = "provider_access";
    throw error;
  }
  if (!providerResponse.ok) {
    const error = new Error("The pricing provider is temporarily unavailable.");
    error.status = 502;
    error.code = "provider_unavailable";
    throw error;
  }

  let payload;
  try {
    const body = await providerResponse.text();
    if (!body.trim()) throw new Error("empty response");
    payload = JSON.parse(body);
  } catch {
    const error = new Error(
      "The pricing provider returned an empty or invalid response.",
    );
    error.status = 502;
    error.code = "invalid_provider_response";
    throw error;
  }
  if (!isObject(payload) || !Array.isArray(payload.data)) {
    const error = new Error(
      "The pricing provider returned an invalid card response.",
    );
    error.status = 502;
    error.code = "invalid_provider_response";
    throw error;
  }
  const records = payload.data;
  const results = new Map();
  for (const tcgid of tcgids) {
    const exactRecord = records.find(
      (record) =>
        isObject(record) &&
        typeof record.tcgid === "string" &&
        record.tcgid.toLowerCase() === tcgid.toLowerCase(),
    );
    results.set(
      tcgid.toLowerCase(),
      exactRecord ? mapCard(exactRecord, catalogLanguage) : null,
    );
  }
  return results;
}

async function getPricesBatch(tcgids, catalogLanguage) {
  const results = new Map();
  const missing = [];
  for (const tcgid of tcgids) {
    const key = `${catalogLanguage}:${tcgid.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) results.set(tcgid.toLowerCase(), cached.card);
    else missing.push(tcgid);
  }

  if (missing.length > 0) {
    const fetched = await fetchPriceRecords(missing, catalogLanguage);
    for (const tcgid of missing) {
      const card = fetched.get(tcgid.toLowerCase()) ?? null;
      cacheSet(`${catalogLanguage}:${tcgid.toLowerCase()}`, { card });
      results.set(tcgid.toLowerCase(), card);
    }
  }
  return tcgids
    .map((tcgid) => results.get(tcgid.toLowerCase()))
    .filter((card) => card !== null);
}

async function getExchangeRates() {
  if (exchangeRateCache && exchangeRateCache.expiresAt > Date.now()) {
    return exchangeRateCache.value;
  }

  const url = new URL(EXCHANGE_RATE_URL);
  url.searchParams.set("base", "EUR");
  url.searchParams.set("quotes", "GBP,USD");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error("Exchange rate provider unavailable.");
    const payload = await response.json();
    if (!Array.isArray(payload))
      throw new Error("Invalid exchange rate response.");

    const rates = { EUR: 1 };
    let date = null;
    for (const row of payload) {
      if (
        !isObject(row) ||
        typeof row.quote !== "string" ||
        !["GBP", "USD"].includes(row.quote.toUpperCase()) ||
        typeof row.rate !== "number" ||
        !Number.isFinite(row.rate) ||
        row.rate <= 0
      ) {
        continue;
      }
      const quote = row.quote.toUpperCase();
      rates[quote] = row.rate;
      if (typeof row.date === "string" && (!date || row.date > date))
        date = row.date;
    }
    if (!rates.GBP || !rates.USD || !date) {
      throw new Error("Exchange rate provider returned incomplete rates.");
    }

    const value = { base: "EUR", rates, date, stale: false };
    exchangeRateCache = {
      value,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + EXCHANGE_RATE_CACHE_TTL_MS,
    };
    return value;
  } catch {
    if (
      exchangeRateCache &&
      Date.now() - exchangeRateCache.fetchedAt < EXCHANGE_RATE_STALE_LIMIT_MS
    ) {
      return { ...exchangeRateCache.value, stale: true };
    }
    const error = new Error(
      "Currency conversion rates are temporarily unavailable.",
    );
    error.status = 502;
    error.code = "exchange_rates_unavailable";
    throw error;
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && requestUrl.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok\n");
    return;
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/apitcg/catalog"
  ) {
    await loadApitcgStore();
    sendJson(
      response,
      200,
      {
        sets: apitcgStore.catalog.sets,
        sync: apitcgStore.catalog.sync,
        productCount: Object.keys(apitcgStore.catalog.products).length,
        configured: Boolean(APITCG_API_KEY),
      },
      apitcgResponseHeaders("LOCAL"),
    );
    return;
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/apitcg/catalog/products"
  ) {
    await loadApitcgStore();
    const setFilter = requestUrl.searchParams.get("set")?.trim() ?? "";
    const nameFilter =
      requestUrl.searchParams.get("name")?.trim().toLocaleLowerCase() ?? "";
    const pageValue = requestUrl.searchParams.get("page") ?? "1";
    const limitValue = requestUrl.searchParams.get("limit") ?? "24";
    if (
      [...requestUrl.searchParams.keys()].some(
        (name) => !["set", "name", "page", "limit"].includes(name),
      ) ||
      !/^\d+$/.test(pageValue) ||
      !/^\d+$/.test(limitValue) ||
      Number(pageValue) < 1 ||
      Number(limitValue) < 1 ||
      Number(limitValue) > 100
    ) {
      sendJson(response, 400, {
        error: "Invalid local catalogue query.",
        code: "invalid_query",
      });
      return;
    }

    const filtered = Object.values(apitcgStore.catalog.products).filter(
      (product) => {
        if (!isObject(product)) return false;
        if (setFilter && !getProductSetIds(product).includes(setFilter))
          return false;
        if (
          nameFilter &&
          !String(product.name ?? "")
            .toLocaleLowerCase()
            .includes(nameFilter)
        )
          return false;
        return true;
      },
    );
    filtered.sort((left, right) => {
      const leftSet = isObject(left.set) ? String(left.set.name ?? "") : "";
      const rightSet = isObject(right.set) ? String(right.set.name ?? "") : "";
      const setOrder = leftSet.localeCompare(rightSet);
      if (setOrder) return setOrder;
      return String(left.card_number ?? "").localeCompare(
        String(right.card_number ?? ""),
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      );
    });
    const page = Number(pageValue);
    const limit = Number(limitValue);
    sendJson(response, 200, {
      data: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      page,
      limit,
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === "/api/apitcg/catalog/sync"
  ) {
    try {
      if (!APITCG_API_KEY) {
        throw apiTcgError(
          "APITCG is not configured. Add APITCG_API_KEY to the pricing-api environment.",
          503,
          "apitcg_not_configured",
        );
      }
      const started = await startApitcgCatalogSync();
      sendJson(response, started ? 202 : 200, {
        accepted: started,
        sync: apitcgStore.catalog.sync,
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      sendJson(response, status, {
        error: error?.message ?? "Could not start APITCG catalogue sync.",
        code: error?.code ?? "apitcg_sync_error",
      });
    }
    return;
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/pricing/rates"
  ) {
    try {
      sendJson(response, 200, await getExchangeRates());
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      sendJson(response, status, {
        error:
          error?.message ??
          "Currency conversion rates are temporarily unavailable.",
        code: error?.code ?? "exchange_rates_unavailable",
      });
    }
    return;
  }

  const apitcgRoute = {
    "/api/apitcg/sets": {
      upstreamPath: "/api/pokemon/sets",
      query: ["populate", "sortBy", "sortOrder"],
      defaults: {},
    },
    "/api/apitcg/products": {
      upstreamPath: "/api/products",
      query: [
        "name",
        "set",
        "serie",
        "code",
        "updatedSince",
        "populate",
        "page",
        "limit",
        "sortBy",
        "sortOrder",
      ],
      defaults: { type: "card", tcg: "pokemon", limit: "100" },
    },
  }[requestUrl.pathname];

  if (request.method === "GET" && apitcgRoute) {
    try {
      const params = allowedApitcgQuery(requestUrl, apitcgRoute.query);
      if (
        requestUrl.pathname === "/api/apitcg/products" &&
        !["name", "set", "serie", "code", "updatedSince"].some((name) =>
          params.has(name),
        )
      ) {
        throw apiTcgError(
          "Add a product filter such as name, set, code, or updatedSince.",
          400,
          "invalid_query",
        );
      }
      for (const [name, value] of Object.entries(apitcgRoute.defaults)) {
        if (!params.has(name)) params.set(name, value);
      }
      for (const name of ["page", "limit"]) {
        const value = params.get(name);
        if (value !== null && (!/^\d+$/.test(value) || Number(value) < 1)) {
          throw apiTcgError(
            `${name} must be a positive integer.`,
            400,
            "invalid_query",
          );
        }
      }
      if (Number(params.get("limit")) > 100) {
        throw apiTcgError(
          "APITCG page size cannot exceed 100.",
          400,
          "invalid_query",
        );
      }
      for (const [name, value] of params) {
        if (value.length > 200) {
          throw apiTcgError(`${name} is too long.`, 400, "invalid_query");
        }
      }

      const result = await getApitcgData(apitcgRoute.upstreamPath, params);
      sendJson(response, 200, result.body, apitcgResponseHeaders(result.cache));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      sendJson(
        response,
        status,
        {
          error:
            error?.message ?? "The APITCG service is temporarily unavailable.",
          code: error?.code ?? "apitcg_error",
        },
        apitcgResponseHeaders("MISS"),
      );
    }
    return;
  }

  if (
    request.method !== "GET" ||
    requestUrl.pathname !== "/api/pricing/cards"
  ) {
    sendJson(response, 404, { error: "Not found.", code: "not_found" });
    return;
  }

  const tcgid = requestUrl.searchParams.get("tcgid")?.trim() ?? "";
  const tcgidsParam = requestUrl.searchParams.get("tcgids");
  const tcgids = tcgidsParam?.split(",").map((id) => id.trim());
  const isBatch = tcgidsParam !== null;
  const requestedIds = isBatch ? (tcgids ?? []) : [tcgid];
  if (
    (isBatch && requestUrl.searchParams.has("tcgid")) ||
    (isBatch && (requestedIds.length === 0 || requestedIds.length > 20)) ||
    requestedIds.some((id) => !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id)) ||
    (!isBatch && !tcgid)
  ) {
    sendJson(response, 400, {
      error:
        "Provide a valid card identifier or up to 20 comma-separated card identifiers.",
      code: "invalid_tcgid",
    });
    return;
  }
  const requestedLanguage = requestUrl.searchParams.get("language");
  const catalogLanguage = requestedLanguage === "ja" ? "jp" : "en";

  try {
    const cards = await getPricesBatch(requestedIds, catalogLanguage);
    sendJson(response, 200, isBatch ? { cards } : { card: cards[0] ?? null });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    sendJson(response, status, {
      error:
        typeof error?.message === "string"
          ? error.message
          : "The pricing service is temporarily unavailable.",
      code: typeof error?.code === "string" ? error.code : "pricing_error",
    });
  }
});

server.listen(PORT, "0.0.0.0", async () => {
  await loadApitcgStore();
  const sync = apitcgStore.catalog.sync;
  if (sync.status === "syncing" && sync.mode) {
    void runApitcgCatalogSync();
  } else if (sync.status === "waiting" && sync.mode) {
    scheduleApitcgResumeAtMidnight();
  } else if (sync.status === "complete") {
    scheduleApitcgCatalogSync();
  }
});
