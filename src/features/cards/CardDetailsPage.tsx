import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCard } from "../../lib/tcgdex/api";
import {
  readCardEffectPreference,
  writeCardEffectPreference,
} from "../../lib/storage/local";
import { ErrorState } from "../../components/States";
import { PageFrame } from "../../components/AppLayout";
import { FavouriteButton } from "./CardTile";
import { CardArtwork } from "./CardArtwork";
import { CardPricing } from "./CardPricing";
import { useLanguage } from "../../lib/tcgdex/useLanguage";
import type { CardFinish } from "../../lib/tcgdex/types";

const FINISH_LABELS: Record<CardFinish, string> = {
  normal: "Normal",
  holo: "Holo",
  reverse: "Reverse holo",
};

function getReturnPath(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const returnTo = (state as Record<string, unknown>).returnTo;
  return typeof returnTo === "string" && returnTo.startsWith("/")
    ? returnTo
    : null;
}

function MetaItem({ label, children }: { label: string; children: string }) {
  return (
    <div className="detail-meta__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function CardDetailsPage() {
  const { cardId = "" } = useParams();
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = getReturnPath(location.state);
  const [effectEnabled, setEffectEnabled] = useState(readCardEffectPreference);
  const [selectedFinish, setSelectedFinish] = useState<CardFinish | null>(null);
  const cardQuery = useQuery({
    queryKey: ["tcgdex", "card", language, cardId],
    queryFn: ({ signal }) => getCard(cardId, signal, language),
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: Boolean(cardId),
  });

  const card = cardQuery.data;
  const availableFinishes = card?.availableFinishes ?? [];
  const activeFinish =
    selectedFinish && availableFinishes.includes(selectedFinish)
      ? selectedFinish
      : (availableFinishes[0] ?? null);
  const backPath =
    returnTo ??
    (card?.setId
      ? `/sets/${encodeURIComponent(card.setId)}?lang=${language}`
      : `/cards?lang=${language}`);

  function toggleEffect() {
    setEffectEnabled((previous) => {
      const next = !previous;
      writeCardEffectPreference(next);
      return next;
    });
  }

  if (cardQuery.isError) {
    return (
      <PageFrame>
        <Link className="back-link" to={returnTo ?? `/cards?lang=${language}`}>
          ← Back to browsing
        </Link>
        <ErrorState
          message={
            cardQuery.error instanceof Error
              ? cardQuery.error.message
              : "This card could not be loaded."
          }
          onRetry={() => void cardQuery.refetch()}
        />
      </PageFrame>
    );
  }

  if (!card) {
    return (
      <PageFrame>
        <Link className="back-link" to={returnTo ?? `/cards?lang=${language}`}>
          ← Back to browsing
        </Link>
        <div className="details-skeleton" aria-label="Loading card details" />
      </PageFrame>
    );
  }

  const metadata = [
    card.setName ? (
      <MetaItem key="set" label="Set">
        {card.setName}
      </MetaItem>
    ) : null,
    <MetaItem key="number" label="Card number">
      {card.localId}
    </MetaItem>,
    card.rarity ? (
      <MetaItem key="rarity" label="Rarity">
        {card.rarity}
      </MetaItem>
    ) : null,
    card.category ? (
      <MetaItem key="category" label="Category">
        {card.category}
      </MetaItem>
    ) : null,
    card.hp ? (
      <MetaItem key="hp" label="HP">
        {card.hp}
      </MetaItem>
    ) : null,
    card.types.length ? (
      <MetaItem key="types" label="Type">
        {card.types.join(", ")}
      </MetaItem>
    ) : null,
    card.stage ? (
      <MetaItem key="stage" label="Stage">
        {card.stage}
      </MetaItem>
    ) : null,
    card.illustrator ? (
      <MetaItem key="illustrator" label="Illustrator">
        {card.illustrator}
      </MetaItem>
    ) : null,
  ].filter((item) => item !== null);

  return (
    <PageFrame className="page-frame--detail">
      <div className="detail-topbar">
        <button
          className="back-link back-link--button"
          type="button"
          onClick={() => navigate(backPath)}
        >
          ← Back to browsing
        </button>
        <div className="detail-actions">
          <FavouriteButton cardId={card.id} name={card.name} />
          <button
            className="effect-toggle"
            type="button"
            aria-pressed={effectEnabled}
            onClick={toggleEffect}
          >
            <span
              className={`effect-toggle__switch${effectEnabled ? " is-on" : ""}`}
              aria-hidden="true"
            >
              <span />
            </span>
            Card shine{" "}
            <span className="effect-toggle__state">
              {effectEnabled ? "On" : "Off"}
            </span>
          </button>
        </div>
      </div>
      <div className="card-detail">
        <div className="card-detail__visual">
          <CardArtwork
            image={card.image}
            fallbackImage={card.fallbackImage}
            name={card.name}
            quality="high"
            tilt
            effectEnabled={effectEnabled}
          />
          <p className="visual-caption">Artwork shown for reference</p>
        </div>
        <div className="card-detail__content">
          <p className="eyebrow">{card.category ?? "Pokémon TCG card"}</p>
          <h1>{card.name}</h1>
          <p className="card-detail__subtitle">
            {card.setName ?? "Set information unavailable"}
            {card.localId ? ` · ${card.localId}` : ""}
          </p>
          {availableFinishes.length > 0 && (
            <section className="card-finish-picker" aria-label="Card finish">
              <p className="card-finish-picker__label">Available finish</p>
              <div
                className="card-finish-picker__options"
                role="group"
                aria-label="Choose card finish"
              >
                {availableFinishes.map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    className={`card-finish-picker__option${activeFinish === finish ? " is-selected" : ""}`}
                    aria-pressed={activeFinish === finish}
                    onClick={() => setSelectedFinish(finish)}
                  >
                    {FINISH_LABELS[finish]}
                  </button>
                ))}
              </div>
              <p className="card-finish-picker__note">
                {activeFinish
                  ? `Selected: ${FINISH_LABELS[activeFinish]}. `
                  : ""}
                TCGdex provides one image for this card across its finishes.
              </p>
            </section>
          )}
          {card.setId && (
            <Link
              className="button button--gold"
              to={`/sets/${encodeURIComponent(card.setId)}?lang=${language}`}
            >
              Open set <span aria-hidden="true">↗</span>
            </Link>
          )}

          <CardPricing tcgid={card.id} language={language} />

          {metadata.length > 0 && <dl className="detail-meta">{metadata}</dl>}

          {card.description && (
            <p className="card-description">{card.description}</p>
          )}

          {card.abilities.length > 0 && (
            <section className="detail-section">
              <h2>Abilities</h2>
              {card.abilities.map((ability, index) => (
                <div className="move-row" key={`${ability.name}-${index}`}>
                  <div className="move-row__title">
                    <span>{ability.name}</span>
                    {ability.type && <small>{ability.type}</small>}
                  </div>
                  {ability.effect && <p>{ability.effect}</p>}
                </div>
              ))}
            </section>
          )}

          {card.attacks.length > 0 && (
            <section className="detail-section">
              <h2>Attacks</h2>
              {card.attacks.map((attack, index) => (
                <div className="move-row" key={`${attack.name}-${index}`}>
                  <div className="move-row__title">
                    <span
                      className="energy-cost"
                      aria-label={
                        attack.cost.length
                          ? `Energy cost: ${attack.cost.join(", ")}`
                          : "No energy cost"
                      }
                    >
                      {attack.cost.map((cost, costIndex) => (
                        <span key={`${cost}-${costIndex}`} title={cost}>
                          {cost}
                        </span>
                      ))}
                    </span>
                    <strong>{attack.name}</strong>
                    <b>{attack.damage}</b>
                  </div>
                  {attack.effect && <p>{attack.effect}</p>}
                </div>
              ))}
            </section>
          )}

          {card.weaknesses.length > 0 && (
            <p className="card-detail__weakness">
              <span>Weakness</span>{" "}
              {card.weaknesses
                .map(
                  (weakness) =>
                    `${weakness.type}${weakness.value ? ` ${weakness.value}` : ""}`,
                )
                .join(" · ")}
            </p>
          )}
          {card.retreat !== null && (
            <p className="card-detail__weakness">
              <span>Retreat</span> {card.retreat}{" "}
              {card.retreat === 1 ? "energy" : "energy"}
            </p>
          )}
        </div>
      </div>
    </PageFrame>
  );
}
