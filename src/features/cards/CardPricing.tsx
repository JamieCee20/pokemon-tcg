import { useQuery } from "@tanstack/react-query";
import type { TcgLanguage } from "../../lib/tcgdex/languages";
import {
  getCardPrice,
  getExchangeRates,
  PricingError,
} from "../../lib/pricing/api";
import { usePriceCurrency } from "../../lib/pricing/usePriceCurrency";
import type { ExchangeRates } from "../../lib/pricing/api";
import type { PriceCurrency } from "../../lib/storage/local";

function isPriceCurrency(
  value: string | null | undefined,
): value is PriceCurrency {
  return value === "GBP" || value === "EUR" || value === "USD";
}

function formatPrice(value: number, currency: string | null): string {
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function displayPrice(
  value: number,
  sourceCurrency: string | null,
  displayCurrency: PriceCurrency,
  rates: ExchangeRates | undefined,
) {
  if (!rates || !isPriceCurrency(sourceCurrency)) {
    return { text: formatPrice(value, sourceCurrency), converted: false };
  }
  const sourceRate = rates.rates[sourceCurrency];
  const targetRate = rates.rates[displayCurrency];
  if (!sourceRate || !targetRate) {
    return { text: formatPrice(value, sourceCurrency), converted: false };
  }
  const converted = sourceCurrency !== displayCurrency;
  const formatted = formatPrice(
    (value * targetRate) / sourceRate,
    displayCurrency,
  );
  return { text: converted ? `≈ ${formatted}` : formatted, converted };
}

function PriceMetric({
  label,
  value,
  currency,
  displayCurrency,
  rates,
}: {
  label: string;
  value: number | null;
  currency: string | null;
  displayCurrency: PriceCurrency;
  rates: ExchangeRates | undefined;
}) {
  if (value === null) return null;
  const displayed = displayPrice(value, currency, displayCurrency, rates);
  return (
    <div className="card-price__metric">
      <dt>{label}</dt>
      <dd>{displayed.text}</dd>
    </div>
  );
}

function ProviderPrice({
  name,
  currency,
  metrics,
  displayCurrency,
  rates,
}: {
  name: string;
  currency: string | null;
  metrics: Array<{ label: string; value: number | null }>;
  displayCurrency: PriceCurrency;
  rates: ExchangeRates | undefined;
}) {
  const visibleMetrics = metrics.filter((metric) => metric.value !== null);
  if (!visibleMetrics.length) return null;
  return (
    <div className="card-price__provider">
      <h3>{name}</h3>
      <dl>
        {visibleMetrics.map((metric) => (
          <PriceMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            currency={currency}
            displayCurrency={displayCurrency}
            rates={rates}
          />
        ))}
      </dl>
    </div>
  );
}

export function CardPricing({
  tcgid,
  language,
}: {
  tcgid: string;
  language: TcgLanguage;
}) {
  const { currency, setCurrency } = usePriceCurrency();
  const priceQuery = useQuery({
    queryKey: ["pokemon-prices", tcgid, language],
    queryFn: ({ signal }) => getCardPrice(tcgid, language, signal),
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: false,
  });
  const card = priceQuery.data;
  const cardmarket = card?.prices.cardmarket;
  const tcgPlayer = card?.prices.tcgPlayer;
  const hasPrices =
    Boolean(
      cardmarket &&
      (cardmarket.lowestNearMint !== null ||
        cardmarket.average7d !== null ||
        cardmarket.average30d !== null),
    ) ||
    Boolean(
      tcgPlayer &&
      (tcgPlayer.marketPrice !== null || tcgPlayer.midPrice !== null),
    );
  const needsConversion = Boolean(
    hasPrices &&
    [cardmarket?.currency, tcgPlayer?.currency].some(
      (sourceCurrency) =>
        isPriceCurrency(sourceCurrency) && sourceCurrency !== currency,
    ),
  );
  const ratesQuery = useQuery({
    queryKey: ["currency-rates"],
    queryFn: ({ signal }) => getExchangeRates(signal),
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled: needsConversion,
  });

  return (
    <section
      className="detail-section card-pricing"
      aria-labelledby="card-pricing-title"
    >
      <div className="card-pricing__header">
        <h2 id="card-pricing-title">Market prices</h2>
        <label className="card-pricing__currency">
          <span>Display currency</span>
          <select
            value={currency}
            onChange={(event) => {
              if (isPriceCurrency(event.target.value))
                setCurrency(event.target.value);
            }}
          >
            <option value="GBP">GBP · £</option>
            <option value="EUR">EUR · €</option>
            <option value="USD">USD · $</option>
          </select>
        </label>
      </div>
      {priceQuery.isPending && (
        <p className="card-pricing__status">Loading market prices…</p>
      )}
      {priceQuery.isError && (
        <div className="card-pricing__status" role="status">
          <span>
            {priceQuery.error instanceof PricingError &&
            priceQuery.error.status === 503
              ? "Pricing is not configured on the server. Add POKEMON_API_KEY to its environment to enable it."
              : priceQuery.error.message}
          </span>{" "}
          <button type="button" onClick={() => void priceQuery.refetch()}>
            Try again
          </button>
        </div>
      )}
      {priceQuery.isSuccess && !card && (
        <p className="card-pricing__status">
          No matching market listing was found for this card print.
        </p>
      )}
      {priceQuery.isSuccess && card && !hasPrices && (
        <p className="card-pricing__status">
          The provider has a matching card record but no current price data.
        </p>
      )}
      {card && hasPrices && (
        <>
          <p className="card-pricing__match">
            {card.episodeName ? `${card.episodeName} · ` : ""}
            {card.cardNumber ? `Card ${card.cardNumber} · ` : ""}
            {card.catalogLanguage === "jp"
              ? "Japanese catalog"
              : "English catalog"}
          </p>
          <div className="card-price__providers">
            {cardmarket && (
              <ProviderPrice
                name="Cardmarket"
                currency={cardmarket.currency}
                displayCurrency={currency}
                rates={ratesQuery.data}
                metrics={[
                  {
                    label: "Lowest near mint",
                    value: cardmarket.lowestNearMint,
                  },
                  { label: "7 day average", value: cardmarket.average7d },
                  { label: "30 day average", value: cardmarket.average30d },
                ]}
              />
            )}
            {tcgPlayer && (
              <ProviderPrice
                name="TCGplayer"
                currency={tcgPlayer.currency}
                displayCurrency={currency}
                rates={ratesQuery.data}
                metrics={[
                  { label: "Market price", value: tcgPlayer.marketPrice },
                  { label: "Mid price", value: tcgPlayer.midPrice },
                ]}
              />
            )}
          </div>
          {needsConversion && ratesQuery.isError && (
            <p className="card-pricing__status" role="status">
              Currency conversion is unavailable; prices are shown in their
              provider currencies.
            </p>
          )}
          {needsConversion && ratesQuery.data && (
            <p className="card-pricing__conversion-note">
              Converted approximately using daily exchange rates for{" "}
              {ratesQuery.data.date}
              {ratesQuery.data.stale ? " (cached rates)" : ""}.
            </p>
          )}
        </>
      )}
      <p className="card-pricing__note">
        Indicative market data from{" "}
        <a href="https://www.pokemon-api.com/" target="_blank" rel="noreferrer">
          Pokemon API
        </a>
        . Prices can vary by condition and finish.
        {language === "ja" &&
          " Japanese catalog access requires a supported provider plan."}
        {(language === "zh-cn" || language === "zh-tw") &&
          " Chinese prints are looked up against the English catalog and appear only when the card ID matches."}
      </p>
    </section>
  );
}
