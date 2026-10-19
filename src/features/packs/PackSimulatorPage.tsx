import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "../../components/AppLayout";
import { assetImageUrl, cardImageUrl } from "../../lib/tcgdex/api";
import {
  createPack,
  loadPackCatalogue,
  DEFAULT_PACK_PROFILE,
  PACK_PROFILES,
  rarityLabel,
} from "./packData";
import type { PackCard } from "./packData";
import "./PackSimulatorPage.css";

function PackBack() {
  return (
    <div className="pack-card__back" aria-label="Face-down Pokémon card">
      <span className="pack-card__back-ring" aria-hidden="true">
        <span />
      </span>
      <span className="pack-card__back-title">CARD ATLAS</span>
      <span className="pack-card__back-caption">TRADING CARD GAME</span>
    </div>
  );
}

function RevealedCard({
  card,
  index,
  revealed,
  current,
}: {
  card: PackCard;
  index: number;
  revealed: boolean;
  current: boolean;
}) {
  return (
    <article
      className={`pack-card${revealed ? " is-revealed" : ""}${current ? " is-current" : ""}${card.finish !== "normal" ? ` pack-card--${card.finish}` : ""} pack-card--${card.rarity}`}
      aria-label={
        revealed
          ? `${card.name}, ${rarityLabel(card.rarity)}`
          : `Card ${index + 1}, face down`
      }
      aria-live={current ? "polite" : undefined}
    >
      <div className="pack-card__inner">
        <PackBack />
        <div className="pack-card__front">
          {card.rarity === "energy" ? (
            <div
              className={`pack-energy pack-energy--${card.energyType ?? "grass"}`}
            >
              <span aria-hidden="true">{card.energySymbol ?? "✦"}</span>
              <strong>{card.name}</strong>
              <small>Basic energy</small>
            </div>
          ) : card.image ? (
            <img src={cardImageUrl(card.image, "high") ?? card.image} alt="" />
          ) : (
            <div className="pack-card__no-image">Artwork unavailable</div>
          )}
          <div className="pack-card__foil" aria-hidden="true" />
          <div className="pack-card__details">
            <span>{rarityLabel(card.rarity)}</span>
            <strong>{card.name}</strong>
            <small>#{card.localId}</small>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PackSimulatorPage() {
  const [selectedSetId, setSelectedSetId] = useState(
    DEFAULT_PACK_PROFILE.setId,
  );
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [opening, setOpening] = useState(false);
  const [packsOpened, setPacksOpened] = useState(0);
  const profile =
    PACK_PROFILES.find((candidate) => candidate.setId === selectedSetId) ??
    DEFAULT_PACK_PROFILE;
  const catalogueQuery = useQuery({
    queryKey: ["pack-simulator", selectedSetId, "en"],
    queryFn: ({ signal }) => loadPackCatalogue(selectedSetId, signal),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const catalogue = catalogueQuery.data;
  const setLogo = assetImageUrl(catalogue?.set.logo ?? null);
  const allRevealed = pack !== null && revealed >= pack.length;

  function openPack() {
    if (!catalogue) return;
    setPack(createPack(catalogue));
    setRevealed(0);
    setOpening(true);
    setPacksOpened((count) => count + 1);
    window.setTimeout(() => setOpening(false), 650);
  }

  function revealNext() {
    if (!pack || opening) return;
    setRevealed((count) => Math.min(count + 1, pack.length));
  }

  function selectSet(setId: string) {
    setSelectedSetId(setId);
    setPack(null);
    setRevealed(0);
    setOpening(false);
  }

  return (
    <PageFrame className="page-frame--packs">
      <header className="pack-page-heading">
        <div>
          <p className="eyebrow">CARD ATLAS · PACK LAB</p>
          <h1>Pack opening simulator</h1>
          <p>
            Open a simulated English {profile.name} pack. Lower-rarity cards
            reveal first, with the biggest pull saved for last.
          </p>
        </div>
        <div className="pack-page-heading__badge">
          <span>PACK PROFILE</span>
          <strong>{profile.code}</strong>
        </div>
      </header>

      <section
        className="pack-simulator"
        aria-label={`${profile.name} pack simulator`}
      >
        <div className={`pack-wrapper${opening ? " is-opening" : ""}`}>
          <div className="pack-wrapper__shine" aria-hidden="true" />
          {setLogo ? (
            <img className="pack-wrapper__logo" src={setLogo} alt="" />
          ) : (
            <span className="pack-wrapper__set-name">
              {profile.code.split(" · ")[0]}
            </span>
          )}
          <span className="pack-wrapper__label">{profile.seriesLabel}</span>
          <span className="pack-wrapper__bottom">
            {profile.packDescription}
          </span>
        </div>

        <div className="pack-simulator__controls">
          <p className="eyebrow">YOUR NEXT PACK</p>
          <label className="pack-set-select">
            <span>Choose a set</span>
            <select
              value={selectedSetId}
              onChange={(event) => selectSet(event.target.value)}
            >
              {PACK_PROFILES.map((option) => (
                <option key={option.setId} value={option.setId}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <h2>{catalogue?.set.name ?? profile.name}</h2>
          <p>
            {catalogue
              ? profile.guaranteedPikachu
                ? `${catalogue.set.totalCards ?? catalogue.set.cards.length} cards, plus 30 Classic Collection cards · observed pull rates`
                : `${catalogue.set.totalCards ?? catalogue.set.cards.length} cards in the set · observed pull rates`
              : "Loading the card list and rarity pools from TCGdex…"}
          </p>

          {catalogueQuery.isError && (
            <div className="pack-error" role="alert">
              <p>
                {catalogueQuery.error instanceof Error
                  ? catalogueQuery.error.message
                  : "The pack card list could not be loaded."}
              </p>
              <button
                className="pack-button pack-button--secondary"
                type="button"
                onClick={() => void catalogueQuery.refetch()}
              >
                Try again
              </button>
            </div>
          )}

          {catalogueQuery.isPending && (
            <div className="pack-loading" role="status">
              <span className="pack-loading__spinner" aria-hidden="true" />
              Loading card pools…
            </div>
          )}

          <div className="pack-simulator__actions">
            {!pack || allRevealed ? (
              <button
                className="pack-button"
                type="button"
                disabled={!catalogue}
                onClick={openPack}
              >
                {allRevealed ? "Open another pack" : "Tear open pack"}
              </button>
            ) : (
              <button
                className="pack-button"
                type="button"
                disabled={opening}
                onClick={revealNext}
              >
                {opening
                  ? "Opening…"
                  : `Reveal next card · ${revealed + 1} of ${pack.length}`}
              </button>
            )}
            <span className="pack-simulator__session">
              {packsOpened} {packsOpened === 1 ? "pack" : "packs"} opened
            </span>
          </div>
        </div>
      </section>

      {pack && (
        <section className="pack-reveal" aria-label="Pack contents">
          <div className="pack-reveal__heading">
            <div>
              <p className="eyebrow">PACK {packsOpened}</p>
              <h2>{allRevealed ? "Your pulls" : "The cards are waiting"}</h2>
            </div>
            <span>
              {revealed} / {pack.length} revealed
            </span>
          </div>
          <div className="pack-card-grid">
            {pack.map((card, index) => (
              <RevealedCard
                key={`${packsOpened}-${index}-${card.id}`}
                card={card}
                index={index}
                revealed={index < revealed}
                current={index === revealed - 1}
              />
            ))}
          </div>
          <p className="pack-reveal__hint">
            {allRevealed
              ? "The card list is from TCGdex. Pull order is arranged from lower to higher rarity for the reveal."
              : "Tap reveal to turn over the next card. The rarer pulls are held at the back of the stack."}
          </p>
        </section>
      )}

      <aside className="pack-rate-note">
        <strong>About these odds</strong>
        <p>
          {profile.rateNote} See the{" "}
          <a href={profile.sourceUrl} target="_blank" rel="noreferrer">
            {profile.sourceLabel}
          </a>
          .
        </p>
        <div
          className="pack-rate-grid"
          aria-label={`${profile.name} observed pull rates`}
        >
          {profile.rates.map((rate) => (
            <div key={rate.rarity}>
              <strong>{rarityLabel(rate.rarity)}</strong>
              <span>
                {rate.percent}% · {rate.odds}
              </span>
            </div>
          ))}
          <div>
            <strong>Foil Energy</strong>
            <span>{profile.foilEnergyPercent}%</span>
          </div>
        </div>
      </aside>
    </PageFrame>
  );
}
