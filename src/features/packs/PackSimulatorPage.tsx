import { useEffect, useRef, useState } from "react";
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

function PackBack({ preparing = false }: { preparing?: boolean }) {
  return (
    <div className="pack-card__back" aria-label="Face-down Pokémon card">
      <span className="pack-card__back-ring" aria-hidden="true">
        <span />
      </span>
      <span className="pack-card__back-title">CARD ATLAS</span>
      <span className="pack-card__back-caption">TRADING CARD GAME</span>
      {preparing && (
        <span className="pack-card__preparing">PREPARING ARTWORK…</span>
      )}
    </div>
  );
}

function RevealedCard({
  card,
  index,
  faceUp,
  movingToBack,
  imageReady,
  disabled,
  onClick,
}: {
  card: PackCard;
  index: number;
  faceUp: boolean;
  movingToBack: boolean;
  imageReady: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`pack-card${faceUp ? " is-face-up" : ""}${movingToBack ? " is-sending-to-back" : ""}${card.finish !== "normal" ? ` pack-card--${card.finish}` : ""} pack-card--${card.rarity}`}
      type="button"
      aria-label={
        faceUp
          ? `${card.name}, ${rarityLabel(card.rarity)}. Click to move it to the back of the stack.`
          : imageReady
            ? `Card ${index + 1}, face down. Click to reveal.`
            : `Card ${index + 1}, face down. Preparing artwork.`
      }
      aria-pressed={faceUp}
      disabled={disabled}
      onClick={onClick}
    >
      <div className="pack-card__inner">
        <PackBack preparing={!imageReady} />
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
            <img
              src={cardImageUrl(card.image, "high") ?? card.image}
              alt=""
              decoding="sync"
              fetchPriority="high"
              loading="eager"
            />
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
    </button>
  );
}

function DealtCard({ card, index }: { card: PackCard; index: number }) {
  return (
    <div
      className={`pack-table-card pack-card--${card.finish !== "normal" ? card.finish : "normal"} pack-card--${card.rarity}`}
      role="listitem"
      aria-label={`${card.name}, ${rarityLabel(card.rarity)}`}
      style={{ animationDelay: `${index * 75}ms` }}
    >
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
      </div>
    </div>
  );
}

export function PackSimulatorPage() {
  const [selectedSetId, setSelectedSetId] = useState(
    DEFAULT_PACK_PROFILE.setId,
  );
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [decodedArtwork, setDecodedArtwork] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentFaceUp, setCurrentFaceUp] = useState(false);
  const [movingToBack, setMovingToBack] = useState(false);
  const [opening, setOpening] = useState(false);
  const [packsOpened, setPacksOpened] = useState(0);
  const openTimeout = useRef<number | null>(null);
  const sendTimeout = useRef<number | null>(null);
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
  const currentCard = pack && !allRevealed ? pack[revealed] : null;
  const currentImageUrl = currentCard?.image
    ? cardImageUrl(currentCard.image, "high")
    : null;
  const currentArtworkReady =
    currentImageUrl === null || decodedArtwork.has(currentImageUrl);

  useEffect(
    () => () => {
      if (openTimeout.current !== null) window.clearTimeout(openTimeout.current);
      if (sendTimeout.current !== null) window.clearTimeout(sendTimeout.current);
    },
    [],
  );

  function openPack() {
    if (!catalogue) return;
    if (openTimeout.current !== null) window.clearTimeout(openTimeout.current);
    if (sendTimeout.current !== null) window.clearTimeout(sendTimeout.current);
    const nextPack = createPack(catalogue);
    setPack(nextPack);
    setDecodedArtwork(new Set());
    const artworkUrls = new Set(
      nextPack
        .map((card) =>
          card.image ? cardImageUrl(card.image, "high") : null,
        )
        .filter((imageUrl): imageUrl is string => imageUrl !== null),
    );
    for (const imageUrl of artworkUrls) {
      const preload = new Image();
      preload.decoding = "sync";
      preload.src = imageUrl;
      void preload
        .decode()
        .catch(() => undefined)
        .then(() => {
          setDecodedArtwork((ready) => new Set(ready).add(imageUrl));
        });
    }
    setRevealed(0);
    setCurrentFaceUp(false);
    setMovingToBack(false);
    setOpening(true);
    setPacksOpened((count) => count + 1);
    openTimeout.current = window.setTimeout(
      () => setOpening(false),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
    );
  }

  function advanceCard() {
    if (!pack || opening || movingToBack || allRevealed) return;
    if (!currentFaceUp) {
      setCurrentFaceUp(true);
      return;
    }

    setMovingToBack(true);
    sendTimeout.current = window.setTimeout(() => {
      setRevealed((count) => Math.min(count + 1, pack.length));
      setCurrentFaceUp(false);
      setMovingToBack(false);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 680);
  }

  function selectSet(setId: string) {
    if (openTimeout.current !== null) window.clearTimeout(openTimeout.current);
    if (sendTimeout.current !== null) window.clearTimeout(sendTimeout.current);
    setSelectedSetId(setId);
    setPack(null);
    setRevealed(0);
    setDecodedArtwork(new Set());
    setCurrentFaceUp(false);
    setMovingToBack(false);
    setOpening(false);
  }

  return (
    <PageFrame className="page-frame--packs">
      <header className="pack-page-heading">
        <div>
          <p className="eyebrow">CARD ATLAS · PACK LAB</p>
          <h1>Pack opening simulator</h1>
          <p>
            Open a simulated English {profile.name} pack. Turn over one card at
            a time, with the biggest pull saved for last.
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
        {pack ? (
          <div
            className={`pack-stack${opening ? " is-opening" : ""}${movingToBack ? " is-moving-card" : ""}`}
            role="group"
            aria-label="Pack card stack"
          >
            <span className="pack-stack__layer pack-stack__layer--top-outer" />
            <span className="pack-stack__layer pack-stack__layer--top-inner" />
            <span className="pack-stack__layer pack-stack__layer--bottom-inner" />
            <span className="pack-stack__layer pack-stack__layer--bottom-outer" />
            {allRevealed ? (
              <div className="pack-stack__complete" role="status">
                <span>PACK COMPLETE</span>
                <strong>All {pack.length} cards revealed</strong>
                <small>Open another pack to play again</small>
              </div>
            ) : (
              <RevealedCard
                card={pack[revealed]!}
                index={revealed}
                faceUp={currentFaceUp}
                movingToBack={movingToBack}
                imageReady={currentArtworkReady}
                disabled={opening || movingToBack || !currentArtworkReady}
                onClick={advanceCard}
              />
            )}
          </div>
        ) : (
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
        )}

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
                disabled={opening || movingToBack || !currentArtworkReady}
                onClick={advanceCard}
              >
                {opening
                  ? "Dealing cards…"
                  : movingToBack
                    ? "Moving card to the back…"
                    : !currentArtworkReady
                      ? "Preparing card artwork…"
                      : currentFaceUp
                        ? `Move card to the back · ${revealed + 1} of ${pack.length}`
                        : `Turn over card · ${revealed + 1} of ${pack.length}`}
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
              <h2>{allRevealed ? "Your pulls" : "Card stack"}</h2>
            </div>
            <span>
              {revealed} / {pack.length} cards placed at the back
            </span>
          </div>
          {allRevealed && (
            <div className="pack-table" role="list" aria-label="Your cards">
              {pack.map((card, index) => (
                <DealtCard
                  key={`${packsOpened}-${index}-${card.id}`}
                  card={card}
                  index={index}
                />
              ))}
            </div>
          )}
          <p className="pack-reveal__hint">
            {allRevealed
              ? "The card list is from TCGdex. Your pulls were revealed from lower to higher rarity."
              : currentFaceUp
                ? "Click the face-up card to sweep it over the stack and place it at the back. The next card will be waiting face-down."
                : "Click the top card or use the button to flip it over. The rarer pulls are saved for last."}
          </p>
          {allRevealed && (
            <ol className="pack-pull-list" aria-label="Revealed pack cards">
              {pack.map((card, index) => (
                <li key={`${packsOpened}-${index}-${card.id}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{card.name}</strong>
                  <small>{rarityLabel(card.rarity)}</small>
                </li>
              ))}
            </ol>
          )}
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
