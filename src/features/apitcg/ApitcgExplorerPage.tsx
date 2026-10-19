import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageFrame } from "../../components/AppLayout";
import { EmptyState, ErrorState, PageHeading } from "../../components/States";

type SearchField = "name" | "code" | "set";

interface ApiTcgProduct extends Record<string, unknown> {
  _id: string | number;
  name: string;
}

interface ApiTcgPrinting {
  name: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

interface ProductSearchResult {
  products: ApiTcgProduct[];
  total: number;
  cache: string;
  requestsToday: string;
  dailyLimit: string;
}

interface SearchRequest {
  field: SearchField;
  value: string;
  limit: number;
}

interface ApiTcgSet extends Record<string, unknown> {
  name?: string;
}

interface CatalogResult {
  sets: ApiTcgSet[];
  sync: {
    status: "idle" | "syncing" | "waiting" | "error" | "complete";
    mode: "full" | "incremental" | null;
    phase: "sets" | "products" | null;
    page: number;
    totalProducts: number;
    startedAt: string | null;
    lastSyncedAt: string | null;
    lastSetSyncAt: string | null;
    lastError: string | null;
  };
  productCount: number;
  configured: boolean;
}

interface LocalCatalogProducts {
  data: ApiTcgProduct[];
  total: number;
  page: number;
  limit: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getProductImage(product: ApiTcgProduct): string | null {
  if (!Array.isArray(product.images)) return null;
  for (const image of product.images) {
    if (!isRecord(image)) continue;
    const url =
      getString(image.large) ??
      getString(image.medium) ??
      getString(image.small);
    if (url) return url;
  }
  return null;
}

function getPrintings(product: ApiTcgProduct): ApiTcgPrinting[] {
  const markets = isRecord(product.markets) ? product.markets : {};
  const tcgplayer = isRecord(markets.tcgplayer) ? markets.tcgplayer : {};
  const prices = isRecord(tcgplayer.prices) ? tcgplayer.prices : {};
  const candidates = Array.isArray(tcgplayer.printings)
    ? tcgplayer.printings
    : [];

  const printings = candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const printingPrices = isRecord(candidate.prices) ? candidate.prices : {};
    const name = getString(candidate.subTypeName);
    if (!name) return [];
    return [
      {
        name,
        market: getNumber(printingPrices.market),
        low: getNumber(printingPrices.low),
        mid: getNumber(printingPrices.mid),
        high: getNumber(printingPrices.high),
      },
    ];
  });

  if (printings.length > 0) return printings;
  const printingName = getString(tcgplayer.printing);
  if (!printingName) return [];
  return [
    {
      name: printingName,
      market: getNumber(prices.market),
      low: getNumber(prices.low),
      mid: getNumber(prices.mid),
      high: getNumber(prices.high),
    },
  ];
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

async function searchProducts(
  request: SearchRequest,
  signal: AbortSignal,
): Promise<ProductSearchResult> {
  const params = new URLSearchParams({
    [request.field]: request.value,
    limit: String(request.limit),
  });
  const response = await fetch(`/api/apitcg/products?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  let payload: unknown;
  try {
    const body = await response.text();
    payload = body.trim() ? JSON.parse(body) : null;
  } catch {
    throw new Error(
      `APITCG returned an invalid response (${response.status}).`,
    );
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `APITCG search failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("APITCG returned an unexpected product response.");
  }

  const products = payload.data.filter(
    (product): product is ApiTcgProduct =>
      isRecord(product) &&
      (typeof product._id === "string" || typeof product._id === "number") &&
      typeof product.name === "string",
  );

  return {
    products,
    total: getNumber(payload.total) ?? products.length,
    cache: response.headers.get("X-APITCG-Cache") ?? "UNKNOWN",
    requestsToday: response.headers.get("X-APITCG-Requests-Today") ?? "unknown",
    dailyLimit: response.headers.get("X-APITCG-Daily-Limit") ?? "unknown",
  };
}

async function fetchCatalog(signal?: AbortSignal): Promise<CatalogResult> {
  const response = await fetch("/api/apitcg/catalog", {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  let payload: unknown;
  try {
    const body = await response.text();
    payload = body.trim() ? JSON.parse(body) : null;
  } catch {
    throw new Error(
      `The pricing service returned an invalid catalogue response (${response.status}).`,
    );
  }
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `The local APITCG catalogue could not be loaded (${response.status}).`,
    );
  }
  if (!isRecord(payload) || !isRecord(payload.sync)) {
    throw new Error(
      "The pricing service is running an older version without catalogue sync support. Restart or rebuild the pricing-api service, then reload this page.",
    );
  }
  return {
    sets: Array.isArray(payload.sets) ? payload.sets.filter(isRecord) : [],
    sync: payload.sync as CatalogResult["sync"],
    productCount: getNumber(payload.productCount) ?? 0,
    configured: payload.configured === true,
  };
}

async function fetchLocalProducts(
  set: string,
  name: string,
  page: number,
  signal?: AbortSignal,
): Promise<LocalCatalogProducts> {
  const params = new URLSearchParams({ page: String(page), limit: "24" });
  if (set) params.set("set", set);
  if (name.trim()) params.set("name", name.trim());
  const response = await fetch(`/api/apitcg/catalog/products?${params}`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("The locally imported APITCG cards could not be loaded.");
  }
  return {
    data: payload.data.filter(
      (product): product is ApiTcgProduct =>
        isRecord(product) &&
        (typeof product._id === "string" || typeof product._id === "number") &&
        typeof product.name === "string",
    ),
    total: getNumber(payload.total) ?? 0,
    page: getNumber(payload.page) ?? page,
    limit: getNumber(payload.limit) ?? 24,
  };
}

async function requestCatalogSync(): Promise<void> {
  const response = await fetch("/api/apitcg/catalog/sync", { method: "POST" });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Could not start the APITCG catalogue sync.",
    );
  }
}

function getSetIdentifier(set: ApiTcgSet): string {
  for (const field of ["_id", "id", "code"]) {
    const value = set[field];
    if (typeof value === "string" || typeof value === "number")
      return String(value);
  }
  return "";
}

function ProductPreview({ product }: { product: ApiTcgProduct }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = getProductImage(product);
  const set = isRecord(product.set) ? product.set : null;
  const tcgplayer = isRecord(product.markets)
    ? isRecord(product.markets.tcgplayer)
      ? product.markets.tcgplayer
      : null
    : null;
  const printings = getPrintings(product);
  const code = getString(product.code);
  const rarity = isRecord(product.attributes)
    ? getString(product.attributes.Rarity)
    : null;

  return (
    <article className="apitcg-product">
      <div className="apitcg-product__art">
        {image && !imageFailed ? (
          <img
            src={image}
            alt={`${product.name} card artwork`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="apitcg-product__placeholder">
            <span>Image unavailable</span>
          </div>
        )}
        {getString(tcgplayer?.printing) && (
          <span className="apitcg-product__current-printing">
            {getString(tcgplayer?.printing)}
          </span>
        )}
      </div>

      <div className="apitcg-product__body">
        <div className="apitcg-product__title-row">
          <h2>{product.name}</h2>
          {code && <span className="apitcg-product__code">{code}</span>}
        </div>
        <p className="apitcg-product__set">
          {getString(set?.name) ?? "Set unavailable"}
          {rarity && <span>{rarity}</span>}
        </p>

        <div className="apitcg-product__printings">
          <h3>Printing prices</h3>
          {printings.length > 0 ? (
            <ul>
              {printings.map((printing) => (
                <li key={printing.name}>
                  <span>{printing.name}</span>
                  <div className="apitcg-product__price-values">
                    <strong>{formatUsd(printing.market)}</strong>
                    <small>
                      Low {formatUsd(printing.low)} · Mid{" "}
                      {formatUsd(printing.mid)} · High{" "}
                      {formatUsd(printing.high)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="apitcg-product__no-price">
              No TCGplayer printing prices in this record.
            </p>
          )}
        </div>

        <details className="apitcg-product__raw">
          <summary>Inspect raw product data</summary>
          <pre>{JSON.stringify(product, null, 2)}</pre>
        </details>
      </div>
    </article>
  );
}

export function ApitcgExplorerPage() {
  const queryClient = useQueryClient();
  const [field, setField] = useState<SearchField>("name");
  const [value, setValue] = useState("charizard");
  const [limit, setLimit] = useState(1);
  const [submitted, setSubmitted] = useState<SearchRequest>({
    field: "name",
    value: "charizard",
    limit: 1,
  });
  const [selectedSet, setSelectedSet] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const catalogQuery = useQuery({
    queryKey: ["apitcg", "catalog"],
    queryFn: ({ signal }) => fetchCatalog(signal),
    refetchInterval: (query) =>
      query.state.data?.sync.status === "syncing" ? 3_000 : false,
  });
  const syncMutation = useMutation({
    mutationFn: requestCatalogSync,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["apitcg", "catalog"] });
    },
  });
  const localProductsQuery = useQuery({
    queryKey: [
      "apitcg",
      "local-products",
      selectedSet,
      catalogName,
      catalogPage,
    ],
    queryFn: ({ signal }) =>
      fetchLocalProducts(selectedSet, catalogName, catalogPage, signal),
    enabled: (catalogQuery.data?.productCount ?? 0) > 0,
    placeholderData: (previous) => previous,
  });
  const productsQuery = useQuery({
    queryKey: [
      "apitcg",
      "products",
      submitted.field,
      submitted.value,
      submitted.limit,
    ],
    queryFn: ({ signal }) => searchProducts(submitted, signal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitted({ field, value: trimmed, limit });
  }

  return (
    <PageFrame className="page-frame--apitcg">
      <PageHeading eyebrow="Provider data preview" title="APITCG explorer" />
      <p className="page-intro">
        Explore APITCG card artwork, product details, and prices for individual
        printings. This view is separate from the main TCGdex catalogue.
      </p>

      <section
        className="apitcg-catalog-panel"
        aria-label="Imported APITCG catalogue"
      >
        <div className="apitcg-catalog-panel__heading">
          <div>
            <p className="section-eyebrow">Persistent local data</p>
            <h2>Full card and set catalogue</h2>
            <p>
              Import the Pokémon card pages once. Cards keep their APITCG set
              details, and later syncs request only records updated since the
              previous import.
            </p>
            <p className="apitcg-catalog-panel__note">
              The default cap is 2 uncached API calls per day, so a full import
              can span multiple days. Each card request imports up to 100 cards.
            </p>
          </div>
          <button
            className="button button--gold"
            type="button"
            disabled={
              !catalogQuery.data?.configured ||
              syncMutation.isPending ||
              catalogQuery.data?.sync.status === "syncing"
            }
            onClick={() => syncMutation.mutate()}
          >
            {catalogQuery.data?.sync.status === "syncing"
              ? "Syncing…"
              : catalogQuery.data?.sync.status === "complete"
                ? "Sync updates"
                : catalogQuery.data?.sync.status === "waiting"
                  ? "Resume sync"
                  : catalogQuery.data?.sync.status === "error"
                    ? "Retry sync"
                    : "Import catalogue"}
          </button>
        </div>

        {catalogQuery.isError && (
          <p className="apitcg-catalog-panel__message apitcg-catalog-panel__message--error">
            {catalogQuery.error instanceof Error
              ? catalogQuery.error.message
              : "Catalogue status is unavailable."}
          </p>
        )}
        {syncMutation.isError && (
          <p className="apitcg-catalog-panel__message apitcg-catalog-panel__message--error">
            {syncMutation.error instanceof Error
              ? syncMutation.error.message
              : "Could not start catalogue sync."}
          </p>
        )}

        {catalogQuery.data && (
          <>
            <div className="apitcg-catalog-stats" aria-live="polite">
              <span>
                <strong>
                  {catalogQuery.data.sets.length.toLocaleString()}
                </strong>{" "}
                sets
              </span>
              <span>
                <strong>
                  {catalogQuery.data.productCount.toLocaleString()}
                </strong>{" "}
                cards stored
              </span>
              <span
                className={`apitcg-catalog-state apitcg-catalog-state--${catalogQuery.data.sync.status}`}
              >
                {catalogQuery.data.sync.status === "syncing"
                  ? `Syncing ${catalogQuery.data.sync.phase ?? "catalogue"} · page ${catalogQuery.data.sync.page}`
                  : catalogQuery.data.sync.status === "waiting"
                    ? "Paused until the daily request allowance resets"
                    : catalogQuery.data.sync.status === "error"
                      ? "Sync needs attention"
                      : catalogQuery.data.sync.status === "complete"
                        ? "Catalogue ready"
                        : "Not imported yet"}
              </span>
            </div>
            {["syncing", "waiting"].includes(catalogQuery.data.sync.status) &&
              catalogQuery.data.sync.mode === "full" &&
              catalogQuery.data.sync.totalProducts > 0 && (
                <p className="apitcg-catalog-panel__note">
                  {Math.min(
                    catalogQuery.data.productCount,
                    catalogQuery.data.sync.totalProducts,
                  ).toLocaleString()}{" "}
                  of approximately{" "}
                  {catalogQuery.data.sync.totalProducts.toLocaleString()} cards
                  imported. The import resumes automatically when the daily
                  APITCG allowance resets.
                </p>
              )}
            {catalogQuery.data.sync.lastError && (
              <p className="apitcg-catalog-panel__message apitcg-catalog-panel__message--error">
                {catalogQuery.data.sync.lastError}
              </p>
            )}
            {catalogQuery.data.sync.lastSyncedAt && (
              <p className="apitcg-catalog-panel__note">
                Last synced{" "}
                {new Date(catalogQuery.data.sync.lastSyncedAt).toLocaleString()}
                .
              </p>
            )}
            {!catalogQuery.data.configured && (
              <p className="apitcg-catalog-panel__note">
                Set APITCG_API_KEY in the server environment to import the
                catalogue.
              </p>
            )}
          </>
        )}

        {catalogQuery.data && catalogQuery.data.productCount > 0 && (
          <div className="apitcg-local-catalog">
            <div className="apitcg-local-catalog__filters">
              <label className="select-field">
                <span>Filter by set</span>
                <select
                  value={selectedSet}
                  onChange={(event) => {
                    setSelectedSet(event.target.value);
                    setCatalogPage(1);
                  }}
                >
                  <option value="">All sets</option>
                  {catalogQuery.data.sets.map((set, index) => {
                    const identifier = getSetIdentifier(set);
                    if (!identifier) return null;
                    return (
                      <option key={`${identifier}-${index}`} value={identifier}>
                        {getString(set.name) ?? identifier}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="search-field">
                <span className="visually-hidden">
                  Filter imported cards by name
                </span>
                <span className="search-field__icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  value={catalogName}
                  onChange={(event) => {
                    setCatalogName(event.target.value);
                    setCatalogPage(1);
                  }}
                  placeholder="Filter imported cards"
                />
              </label>
            </div>

            {localProductsQuery.isError && (
              <p className="apitcg-catalog-panel__message apitcg-catalog-panel__message--error">
                {localProductsQuery.error instanceof Error
                  ? localProductsQuery.error.message
                  : "Local cards could not be loaded."}
              </p>
            )}
            {localProductsQuery.data && (
              <>
                <div className="apitcg-results-heading">
                  <div>
                    <h3>Imported card previews</h3>
                    <p>
                      Showing {localProductsQuery.data.data.length} of{" "}
                      {localProductsQuery.data.total.toLocaleString()} matching
                      local cards.
                    </p>
                  </div>
                  <div className="apitcg-local-catalog__pages">
                    <button
                      className="button button--quiet"
                      type="button"
                      disabled={catalogPage <= 1}
                      onClick={() =>
                        setCatalogPage((page) => Math.max(1, page - 1))
                      }
                    >
                      Previous
                    </button>
                    <span>
                      Page {catalogPage} of{" "}
                      {Math.max(
                        1,
                        Math.ceil(
                          localProductsQuery.data.total /
                            localProductsQuery.data.limit,
                        ),
                      )}
                    </span>
                    <button
                      className="button button--quiet"
                      type="button"
                      disabled={
                        catalogPage * localProductsQuery.data.limit >=
                        localProductsQuery.data.total
                      }
                      onClick={() => setCatalogPage((page) => page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
                {localProductsQuery.data.data.length > 0 ? (
                  <div className="apitcg-product-grid">
                    {localProductsQuery.data.data.map((product) => (
                      <ProductPreview
                        key={String(product._id)}
                        product={product}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No imported cards match">
                    Try another set or card name.
                  </EmptyState>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section
        className="apitcg-search-panel"
        aria-label="Search APITCG products"
      >
        <form className="apitcg-search-form" onSubmit={submitSearch}>
          <label className="select-field">
            <span>Search by</span>
            <select
              value={field}
              onChange={(event) => setField(event.target.value as SearchField)}
            >
              <option value="name">Card name</option>
              <option value="code">Card number / code</option>
              <option value="set">Set ID</option>
            </select>
          </label>
          <label className="search-field apitcg-search-form__term">
            <span className="visually-hidden">Search APITCG</span>
            <span className="search-field__icon" aria-hidden="true">
              ⌕
            </span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={field === "name" ? "Try Charizard" : "Enter a value"}
            />
          </label>
          <label className="select-field apitcg-search-form__limit">
            <span>Results</span>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              <option value={1}>1 card</option>
              <option value={6}>6 cards</option>
              <option value={12}>12 cards</option>
            </select>
          </label>
          <button
            className="button button--gold"
            type="submit"
            disabled={productsQuery.isFetching}
          >
            {productsQuery.isFetching ? "Loading…" : "Search API"}
          </button>
        </form>
        <p className="apitcg-search-panel__note">
          Fresh results are cached for 24 hours. A new search can use one of the
          server’s limited daily API requests.
        </p>
      </section>

      {productsQuery.isError && (
        <ErrorState
          message={
            productsQuery.error instanceof Error
              ? productsQuery.error.message
              : "APITCG products could not be loaded."
          }
          onRetry={() => void productsQuery.refetch()}
        />
      )}

      {productsQuery.isPending && (
        <div className="apitcg-loading" role="status">
          Loading the APITCG sample…
        </div>
      )}

      {productsQuery.data && (
        <>
          <div className="apitcg-results-heading">
            <div>
              <h2>Product previews</h2>
              <p>
                Showing {productsQuery.data.products.length} of{" "}
                {productsQuery.data.total} matching
                {productsQuery.data.total === 1 ? " product" : " products"}.
              </p>
            </div>
            <div className="apitcg-cache-status" aria-live="polite">
              <span
                className={`apitcg-cache-status__dot apitcg-cache-status__dot--${productsQuery.data.cache.toLowerCase()}`}
              />
              <span>{productsQuery.data.cache} cache</span>
              <span>
                {productsQuery.data.requestsToday}/
                {productsQuery.data.dailyLimit} requests today
              </span>
            </div>
          </div>

          {productsQuery.data.products.length > 0 ? (
            <div className="apitcg-product-grid">
              {productsQuery.data.products.map((product) => (
                <ProductPreview key={String(product._id)} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState title="No products found">
              Try a different card name, card code, or set ID.
            </EmptyState>
          )}
        </>
      )}
    </PageFrame>
  );
}
