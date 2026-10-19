import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { assetImageUrl, getPocketSetIds } from "../../lib/tcgdex/api";
import { useLanguage } from "../../lib/tcgdex/useLanguage";
import { TCG_LANGUAGES, type TcgLanguage } from "../../lib/tcgdex/languages";
import type { SetSummary } from "../../lib/tcgdex/types";
import { EmptyState, ErrorState, PageHeading } from "../../components/States";
import { PageFrame } from "../../components/AppLayout";
import { groupSetsByReleaseYear, sortSets } from "./setHelpers";
import { useSetCatalogue } from "./useSetCatalogue";

function SetTile({ set, search }: { set: SetSummary; search: string }) {
  const logo = assetImageUrl(set.logo);
  const [logoFailed, setLogoFailed] = useState(false);
  const released = !set.metadataResolved
    ? "Checking release date…"
    : set.releaseDate
      ? new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${set.releaseDate}T00:00:00Z`))
      : "Release date unavailable";

  return (
    <Link
      className="set-tile"
      to={`/sets/${encodeURIComponent(set.id)}?${search}`}
    >
      <div className="set-tile__art">
        {logo && !logoFailed ? (
          <img
            src={logo}
            alt=""
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="set-tile__fallback" aria-hidden="true">
            ✳
          </span>
        )}
        {set.symbol && (
          <img
            className="set-tile__symbol"
            src={assetImageUrl(set.symbol) ?? undefined}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
      </div>
      <div className="set-tile__content">
        <h3>{set.name}</h3>
        <p>{released}</p>
        <span className="set-tile__count">
          {set.totalCards ?? "—"} cards <span aria-hidden="true">↗</span>
        </span>
      </div>
    </Link>
  );
}

export function SetsPage() {
  const { language } = useLanguage();
  return <SetsPageForLanguage key={language} language={language} />;
}

function SetsPageForLanguage({ language }: { language: TcgLanguage }) {
  const { setLanguage } = useLanguage();
  const catalogue = useSetCatalogue(language);
  const [params, setParams] = useSearchParams();
  const query = params.get("name") ?? "";
  const yearFilter = params.get("year") ?? "";
  const order = params.get("order") === "oldest" ? "oldest" : "newest";
  const product = params.get("product") === "pocket" ? "pocket" : "physical";
  const pocketSetsQuery = useQuery({
    queryKey: ["tcgdex", "series", "tcgp", language],
    queryFn: ({ signal }) => getPocketSetIds(signal, language),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const pocketSetIds = useMemo(
    () =>
      new Set([
        ...(pocketSetsQuery.data ?? []),
        ...catalogue.sets
          .filter((set) => set.serieId === "tcgp")
          .map((set) => set.id),
      ]),
    [catalogue.sets, pocketSetsQuery.data],
  );
  const productSets = useMemo(
    () =>
      catalogue.sets.filter((set) =>
        product === "pocket"
          ? pocketSetIds.has(set.id)
          : !pocketSetIds.has(set.id),
      ),
    [catalogue.sets, pocketSetIds, product],
  );
  const years = useMemo(
    () =>
      [
        ...new Set(
          productSets
            .map((set) => set.releaseYear)
            .filter((year): year is number => year !== null),
        ),
      ].sort((a, b) => b - a),
    [productSets],
  );
  const filtered = useMemo(() => {
    const normalizedName = query.trim().toLocaleLowerCase();
    const matching = productSets.filter((set) => {
      const nameMatches =
        !normalizedName ||
        set.name.toLocaleLowerCase().includes(normalizedName);
      const yearMatches =
        !yearFilter ||
        (yearFilter === "unknown"
          ? set.metadataResolved && set.releaseYear === null
          : String(set.releaseYear) === yearFilter);
      return nameMatches && yearMatches;
    });
    return sortSets(matching, order);
  }, [order, productSets, query, yearFilter]);
  const groups = useMemo(
    () => groupSetsByReleaseYear(filtered, order),
    [filtered, order],
  );

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function selectLanguage(nextLanguage: TcgLanguage) {
    const next = new URLSearchParams(params);
    next.set("lang", nextLanguage);
    next.delete("year");
    setParams(next, { replace: true });
    setLanguage(nextLanguage);
  }

  function handleLanguageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const currentIndex = TCG_LANGUAGES.findIndex(
      (item) => item.code === language,
    );
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next =
      TCG_LANGUAGES[
        (currentIndex + offset + TCG_LANGUAGES.length) % TCG_LANGUAGES.length
      ];
    if (next) {
      selectLanguage(next.code);
      requestAnimationFrame(() =>
        document.getElementById(`language-tab-${next.code}`)?.focus(),
      );
    }
  }

  const setLinkParams = new URLSearchParams(params);
  setLinkParams.set("lang", language);
  const setLinkSearch = setLinkParams.toString();

  return (
    <PageFrame>
      <PageHeading eyebrow="The catalogue" title="Explore by set">
        <span className="heading-count">
          {productSets.length ? `${productSets.length} sets` : ""}
        </span>
      </PageHeading>
      <p className="page-intro">
        Browse sets by card language and release year. Pick a set to explore its
        cards.
      </p>

      <div
        className="language-tabs"
        role="tablist"
        aria-label="Set language"
        onKeyDown={handleLanguageKeyDown}
      >
        {TCG_LANGUAGES.map((item) => (
          <button
            key={item.code}
            id={`language-tab-${item.code}`}
            className="language-tabs__tab"
            type="button"
            role="tab"
            aria-selected={language === item.code}
            aria-controls="set-catalogue-panel"
            tabIndex={language === item.code ? 0 : -1}
            onClick={() => selectLanguage(item.code)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="language-note">
        Names and card images follow the selected language where available.
        TCGdex coverage can differ by language.
      </p>

      <div
        id="set-catalogue-panel"
        className="set-catalogue-panel"
        role="tabpanel"
        aria-labelledby={`language-tab-${language}`}
        tabIndex={0}
      >
        <div className="product-tabs" role="group" aria-label="Card product">
          <button
            className={product === "physical" ? "is-selected" : ""}
            type="button"
            aria-pressed={product === "physical"}
            onClick={() => updateParam("product", "")}
          >
            Physical TCG
          </button>
          <button
            className={product === "pocket" ? "is-selected" : ""}
            type="button"
            aria-pressed={product === "pocket"}
            onClick={() => updateParam("product", "pocket")}
          >
            Pokémon TCG Pocket
          </button>
        </div>

        <div className="filter-bar filter-bar--sets">
          <label className="search-field">
            <span className="search-field__icon" aria-hidden="true">
              ⌕
            </span>
            <span className="visually-hidden">Search set names</span>
            <input
              type="search"
              value={query}
              placeholder="Find a set…"
              onChange={(event) => updateParam("name", event.target.value)}
            />
          </label>
          <label className="select-field">
            <span>Year</span>
            <select
              value={yearFilter}
              onChange={(event) => updateParam("year", event.target.value)}
            >
              <option value="">All years</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
              {productSets.some(
                (set) => set.metadataResolved && set.releaseYear === null,
              ) && <option value="unknown">Unknown year</option>}
            </select>
          </label>
          <label className="select-field">
            <span>Sort</span>
            <select
              value={order}
              onChange={(event) => updateParam("order", event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        {(catalogue.isIndexing || catalogue.failedIds.length > 0) && (
          <div
            className={`catalogue-status${catalogue.failedIds.length ? " catalogue-status--warning" : ""}`}
            role="status"
          >
            <span className="catalogue-status__dot" />
            <span>
              {catalogue.failedIds.length
                ? `${catalogue.completedCount} of ${catalogue.totalCount} sets dated. Some set details could not load.`
                : `Organising set dates · ${catalogue.completedCount} of ${catalogue.totalCount}`}
            </span>
            {catalogue.failedIds.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={catalogue.retry}
              >
                Retry missing sets
              </button>
            )}
          </div>
        )}
        {catalogue.error && productSets.length > 0 && (
          <div
            className="catalogue-status catalogue-status--warning"
            role="status"
          >
            <span className="catalogue-status__dot" />
            <span>
              Showing the saved set list. TCGdex could not refresh the latest
              catalogue.
            </span>
            <button
              type="button"
              className="text-button"
              onClick={catalogue.retry}
            >
              Retry
            </button>
          </div>
        )}

        {catalogue.isLoading && (
          <div className="set-skeleton-grid" aria-label="Loading sets">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="set-skeleton" />
            ))}
          </div>
        )}
        {catalogue.error && productSets.length === 0 && (
          <ErrorState
            message={catalogue.error.message}
            onRetry={catalogue.retry}
          />
        )}
        {!catalogue.isLoading && !catalogue.error && groups.length === 0 && (
          <EmptyState title="No sets found">
            Try another name or year.
          </EmptyState>
        )}
        {groups.map(({ year, status, sets }) => (
          <section className="year-section" key={`${status}-${year ?? "none"}`}>
            <div className="year-section__heading">
              <h2>
                {year ??
                  (status === "pending"
                    ? "Release date pending"
                    : "Unknown year")}
              </h2>
              <span>
                {sets.length} {sets.length === 1 ? "set" : "sets"}
              </span>
            </div>
            <div className="set-grid">
              {sets.map((set) => (
                <SetTile key={set.id} set={set} search={setLinkSearch} />
              ))}
            </div>
          </section>
        ))}
        {product === "pocket" && pocketSetsQuery.isError && (
          <p className="catalogue-footnote">
            TCG Pocket set classification could not refresh. Showing any sets
            already identified as Pocket.
          </p>
        )}
        <p className="catalogue-footnote">
          Release years follow the selected language’s TCGdex catalogue. Dates
          not supplied by TCGdex stay in “Unknown year”; incomplete records are
          listed separately.
        </p>
      </div>
    </PageFrame>
  );
}
