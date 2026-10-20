import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageFrame } from "../../components/AppLayout";
import { assetImageUrl, cardImageUrl } from "../../lib/tcgdex/api";
import type { CardSummary } from "../../lib/tcgdex/types";
import { useAccount } from "../account/AccountContext";
import {
  getPackSetAvailability,
  recordPackReveal,
  startPackSession,
} from "../account/api";
import {
  createPack,
  createGodPack,
  loadPackCatalogue,
  DEFAULT_PACK_PROFILE,
  GOD_PACK_RARITIES,
  PACK_PROFILES,
  rarityLabel,
} from "./packData";
import type { PackCard } from "./packData";
import { readPackCollection, writePackCollection } from "./collectionStorage";
import "./PackSimulatorPage.css";

function compareCardNumbers(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}

const GOD_PACK_RARITY_SET: ReadonlySet<string> = new Set(GOD_PACK_RARITIES);

function godPackPeriodLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

function CollectionRoadmap({
  setName,
  cards,
  collectedIds,
}: {
  setName: string;
  cards: CardSummary[];
  collectedIds: Set<string>;
}) {
  const collectedCount = cards.filter((card) =>
    collectedIds.has(card.id),
  ).length;
  const progress = cards.length > 0 ? (collectedCount / cards.length) * 100 : 0;

  return (
    <section
      className="pack-collection"
      aria-label={`${setName} collection progress`}
    >
      <div className="pack-collection__heading">
        <div>
          <p className="eyebrow">YOUR SET ROADMAP</p>
          <h2>{setName} collection</h2>
          <p>Cards are unlocked here when you reveal them in a pack.</p>
        </div>
        <strong className="pack-collection__count">
          {collectedCount} <span>/ {cards.length} cards</span>
        </strong>
      </div>
      <div
        className="pack-collection__progress"
        role="progressbar"
        aria-label={`${setName} cards collected`}
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-valuenow={collectedCount}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div
        className="pack-collection__grid"
        role="list"
        aria-label={`${setName} cards`}
      >
        {cards.map((card) => {
          const collected = collectedIds.has(card.id);
          const imageUrl = card.image ? cardImageUrl(card.image, "low") : null;
          return (
            <article
              className={`pack-collection-card${collected ? " is-collected" : " is-locked"}`}
              key={card.id}
              role="listitem"
              aria-label={`${card.name}, card ${card.localId}, ${collected ? "unlocked" : "not yet unlocked"}`}
            >
              <div className="pack-collection-card__artwork">
                {imageUrl || card.image ? (
                  <img
                    src={imageUrl ?? card.image ?? undefined}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span>#{card.localId}</span>
                )}
                {!collected && (
                  <span className="pack-collection-card__lock">Locked</span>
                )}
              </div>
              <strong>{card.name}</strong>
              <small>#{card.localId}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PackBack({ preparing = false }: { preparing?: boolean }) {
  return (
    <div className="pack-card__back" aria-label="Face-down Pokémon card">
      <span className="pack-card__back-ring" aria-hidden="true">
        <span />
      </span>
      <span className="pack-card__back-title">CEE’S CARD VAULT</span>
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
  const { account, isLoading: accountLoading, setAccount } = useAccount();
  const [selectedSetId, setSelectedSetId] = useState(
    DEFAULT_PACK_PROFILE.setId,
  );
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [openedPackType, setOpenedPackType] = useState<"standard" | "god">(
    "standard",
  );
  const [packSessionId, setPackSessionId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [decodedArtwork, setDecodedArtwork] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentFaceUp, setCurrentFaceUp] = useState(false);
  const [movingToBack, setMovingToBack] = useState(false);
  const [opening, setOpening] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [pendingReveal, setPendingReveal] = useState<{
    packId: string;
    position: number;
    card: PackCard;
  } | null>(null);
  const [packsOpened, setPacksOpened] = useState(0);
  const [collection, setCollection] =
    useState<Record<string, string[]>>(readPackCollection);
  const openTimeout = useRef<number | null>(null);
  const sendTimeout = useRef<number | null>(null);
  const progressRequestInFlight = useRef(false);
  const setAvailabilityQuery = useQuery({
    queryKey: ["account", "pack-set-availability"],
    queryFn: getPackSetAvailability,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const availableSetMap = new Map(
    (setAvailabilityQuery.data ?? []).map((set) => [set.setId, set]),
  );
  const selectedSetAvailability = availableSetMap.get(selectedSetId);
  const unlockedSetIds = new Set(
    account?.progression.unlockedSets.map((set) => set.setId) ?? [
      DEFAULT_PACK_PROFILE.setId,
    ],
  );
  const isSelectedSetUnlocked = unlockedSetIds.has(selectedSetId);
  const profile =
    PACK_PROFILES.find((candidate) => candidate.setId === selectedSetId) ??
    DEFAULT_PACK_PROFILE;
  const catalogueQuery = useQuery({
    queryKey: ["pack-simulator", selectedSetId, "en"],
    queryFn: ({ signal }) => loadPackCatalogue(selectedSetId, signal),
    enabled:
      !accountLoading &&
      isSelectedSetUnlocked &&
      (selectedSetId === DEFAULT_PACK_PROFILE.setId ||
        selectedSetAvailability?.available !== false),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const catalogue = catalogueQuery.data;
  const collectionCards = catalogue
    ? [
        ...catalogue.set.cards,
        ...(catalogue.cards.classicCollection ?? []).filter(
          (card) =>
            !catalogue.set.cards.some((setCard) => setCard.id === card.id),
        ),
      ].sort((left, right) => compareCardNumbers(left.localId, right.localId))
    : [];
  const collectedIds = new Set([
    ...(collection[selectedSetId] ?? []),
    ...(account?.progression.collections[selectedSetId] ?? []),
  ]);
  const allCardArtworkPresent =
    collectionCards.length > 0 &&
    collectionCards.every(
      (card) =>
        typeof card.image === "string" &&
        card.image.startsWith("https://assets.tcgdex.net/"),
    );
  const selectedSetAvailable =
    selectedSetAvailability?.available ?? allCardArtworkPresent;
  const canOpenSelectedSet =
    !accountLoading &&
    isSelectedSetUnlocked &&
    selectedSetAvailable &&
    allCardArtworkPresent;
  const godPackPoolSize = catalogue
    ? new Set(
        profile.rates
          .filter((rate) => GOD_PACK_RARITY_SET.has(rate.rarity))
          .flatMap((rate) => catalogue.cards[rate.rarity] ?? [])
          .map((card) => card.id),
      ).size
    : 0;
  const godPackXpCost = selectedSetAvailability?.godPackXpCost ?? 1_000;
  const godPackLimit = selectedSetAvailability?.godPackLimit ?? 1;
  const godPackWindowDays = selectedSetAvailability?.godPackWindowDays ?? 7;
  const godPackStatus = account?.progression.godPack[selectedSetId];
  const godPackRemaining = godPackStatus?.remaining ?? godPackLimit;
  const canOpenGodPack =
    account !== null &&
    canOpenSelectedSet &&
    godPackPoolSize > 0 &&
    godPackRemaining > 0 &&
    account.progression.xp >= godPackXpCost;
  const godPackButtonLabel = opening
    ? openedPackType === "god"
      ? "Preparing God Pack…"
      : "Opening pack…"
    : godPackRemaining <= 0
      ? "God Pack limit reached for this set"
      : !catalogue
        ? "Checking God Pack pool…"
        : godPackPoolSize === 0
          ? "No IR+ cards in this set"
          : (account?.progression.xp ?? 0) < godPackXpCost
            ? `God Pack · ${godPackXpCost.toLocaleString()} XP needed`
            : `Open God Pack · ${godPackXpCost.toLocaleString()} XP`;
  const eligibleProfiles = PACK_PROFILES.filter((candidate) =>
    setAvailabilityQuery.data
      ? availableSetMap.get(candidate.setId)?.available !== false
      : candidate.setId === DEFAULT_PACK_PROFILE.setId,
  ).sort(
    (left, right) =>
      (availableSetMap.get(left.setId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (availableSetMap.get(right.setId)?.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
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
      if (openTimeout.current !== null)
        window.clearTimeout(openTimeout.current);
      if (sendTimeout.current !== null)
        window.clearTimeout(sendTimeout.current);
    },
    [],
  );

  useEffect(() => {
    writePackCollection(collection);
  }, [collection]);

  useEffect(() => {
    if (!account) return;
    setCollection((previous) => {
      let changed = false;
      const merged = { ...previous };
      for (const [setId, cardIds] of Object.entries(
        account.progression.collections,
      )) {
        const existing = new Set(merged[setId] ?? []);
        for (const cardId of cardIds) {
          if (!existing.has(cardId)) {
            existing.add(cardId);
            changed = true;
          }
        }
        merged[setId] = [...existing];
      }
      return changed ? merged : previous;
    });
  }, [account?.progression.collections]);

  useEffect(() => {
    if (accountLoading) return;
    const unavailable =
      setAvailabilityQuery.data !== undefined &&
      selectedSetId !== DEFAULT_PACK_PROFILE.setId &&
      selectedSetAvailability?.available !== true;
    if (!isSelectedSetUnlocked || unavailable) {
      selectSet(DEFAULT_PACK_PROFILE.setId);
    }
  }, [
    accountLoading,
    isSelectedSetUnlocked,
    selectedSetAvailability?.available,
    selectedSetId,
    setAvailabilityQuery.data,
  ]);

  async function openPack(packType: "standard" | "god" = "standard") {
    if (!catalogue || !canOpenSelectedSet || opening || savingProgress) return;
    if (packType === "god" && !canOpenGodPack) return;
    if (openTimeout.current !== null) window.clearTimeout(openTimeout.current);
    if (sendTimeout.current !== null) window.clearTimeout(sendTimeout.current);
    const nextPack =
      packType === "god"
        ? createGodPack(catalogue)
        : createPack(catalogue);
    setOpenedPackType(packType);
    setOpening(true);
    setProgressError("");
    setProgressMessage("");
    setPendingReveal(null);
    let nextSessionId: string | null = null;
    if (account) {
      try {
        const session = await startPackSession(
          selectedSetId,
          nextPack.length,
          packType,
        );
        nextSessionId = session.packId;
        setAccount(session.account);
        if (packType === "god") {
          setProgressMessage(
            `God Pack purchased for ${godPackXpCost.toLocaleString()} XP · ${godPackLimit} per ${godPackPeriodLabel(godPackWindowDays)}`,
          );
        } else if (session.dailyReward.claimed) {
          setProgressMessage(
            `Daily streak · +${session.dailyReward.xp} XP · day ${session.dailyReward.streakDays}`,
          );
        }
      } catch (error) {
        setOpening(false);
        setProgressError(
          error instanceof Error
            ? error.message
            : "Could not start this pack session.",
        );
        return;
      }
    }
    setPack(nextPack);
    setPackSessionId(nextSessionId);
    setDecodedArtwork(new Set());
    const artworkUrls = new Set(
      nextPack
        .map((card) => (card.image ? cardImageUrl(card.image, "high") : null))
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

  async function saveReveal(
    packId: string,
    position: number,
    card: PackCard,
  ): Promise<boolean> {
    if (progressRequestInFlight.current) return false;
    progressRequestInFlight.current = true;
    setSavingProgress(true);
    setProgressError("");
    try {
      const result = await recordPackReveal({
        packId,
        position,
        cardId: card.id,
        rarity: card.rarity,
        finish: card.finish,
      });
      setAccount(result.account);
      setPendingReveal(null);
      setProgressMessage(
        result.rewards.length > 0
          ? result.rewards
              .map((reward) => `+${reward.xp} XP ${reward.label}`)
              .join(" · ")
          : "Card reveal saved · duplicate cards do not add XP",
      );
      return true;
    } catch (error) {
      setPendingReveal({ packId, position, card });
      setProgressError(
        error instanceof Error
          ? `${error.message} Click the card again to retry saving this reveal.`
          : "Could not save this reveal. Click the card again to retry.",
      );
      return false;
    } finally {
      progressRequestInFlight.current = false;
      setSavingProgress(false);
    }
  }

  async function advanceCard() {
    if (!pack || opening || movingToBack || savingProgress || allRevealed)
      return;
    if (!currentFaceUp) {
      if (currentCard && currentCard.rarity !== "energy") {
        setCollection((previous) => {
          const existing = previous[selectedSetId] ?? [];
          if (existing.includes(currentCard.id)) return previous;
          return {
            ...previous,
            [selectedSetId]: [...existing, currentCard.id],
          };
        });
      }
      setCurrentFaceUp(true);
      if (account && packSessionId && currentCard) {
        await saveReveal(packSessionId, revealed, currentCard);
      }
      return;
    }

    if (pendingReveal) {
      const saved = await saveReveal(
        pendingReveal.packId,
        pendingReveal.position,
        pendingReveal.card,
      );
      if (!saved) return;
    }

    setMovingToBack(true);
    sendTimeout.current = window.setTimeout(
      () => {
        setRevealed((count) => Math.min(count + 1, pack.length));
        setCurrentFaceUp(false);
        setMovingToBack(false);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 680,
    );
  }

  function selectSet(setId: string) {
    if (openTimeout.current !== null) window.clearTimeout(openTimeout.current);
    if (sendTimeout.current !== null) window.clearTimeout(sendTimeout.current);
    setSelectedSetId(setId);
    setPack(null);
    setOpenedPackType("standard");
    setPackSessionId(null);
    setRevealed(0);
    setDecodedArtwork(new Set());
    setCurrentFaceUp(false);
    setMovingToBack(false);
    setOpening(false);
    setProgressError("");
    setProgressMessage("");
    setPendingReveal(null);
  }

  return (
    <PageFrame className="page-frame--packs">
      <header className="pack-page-heading">
        <div>
          <p className="eyebrow">CEE’S CARD VAULT · PACK LAB</p>
          <h1>Pack opening simulator</h1>
          <p>
            Open a simulated English {profile.name} pack. Turn over one card at
            a time, with the biggest pull saved for last.
          </p>
        </div>
        <div className="pack-page-heading__aside">
          {account ? (
            <Link
              className="pack-page-heading__xp"
              to="/account"
              aria-label={`${account.progression.xp} available XP. ${account.progression.lifetimeXp} lifetime XP. Open account settings.`}
            >
              <span>AVAILABLE XP</span>
              <strong>
                {account.progression.xp.toLocaleString()} <small>XP</small>
              </strong>
            </Link>
          ) : (
            <Link
              className="pack-page-heading__xp pack-page-heading__xp--guest"
              to="/account"
            >
              <span>PROGRESSION</span>
              <strong>Sign in to earn XP</strong>
            </Link>
          )}
          <div className="pack-page-heading__badge">
            <span>PACK PROFILE</span>
            <strong>{profile.code}</strong>
          </div>
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
                disabled={
                  opening ||
                  movingToBack ||
                  savingProgress ||
                  !currentArtworkReady
                }
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
              disabled={opening}
              onChange={(event) => selectSet(event.target.value)}
            >
              {eligibleProfiles.length === 0 ? (
                <option value={selectedSetId}>
                  {setAvailabilityQuery.isPending
                    ? "Checking set artwork…"
                    : "No eligible sets available"}
                </option>
              ) : (
                eligibleProfiles.map((option) => {
                  const unlocked = unlockedSetIds.has(option.setId);
                  const availability = availableSetMap.get(option.setId);
                  return (
                    <option
                      key={option.setId}
                      value={option.setId}
                      disabled={!unlocked}
                    >
                      {option.name}
                      {!unlocked
                        ? account
                          ? ` · ${availability?.xpCost ?? 0} lifetime XP to unlock`
                          : " · sign in to unlock"
                        : ""}
                    </option>
                  );
                })
              )}
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

          {account ? (
            <div className="pack-progression-summary">
              <span>
                <strong>{account.progression.streakDays}</strong> day streak
              </span>
              <Link to="/account">Manage account and unlocks</Link>
            </div>
          ) : (
            <p className="pack-account-prompt">
              Open the starter set as a guest, or{" "}
              <Link to="/account">create an account</Link> to earn XP and unlock
              more sets.
            </p>
          )}

          {progressError && (
            <div className="pack-error" role="alert">
              <p>{progressError}</p>
            </div>
          )}
          {progressMessage && (
            <p className="pack-progress-message" role="status">
              {progressMessage}
            </p>
          )}

          {setAvailabilityQuery.isError &&
            selectedSetId !== DEFAULT_PACK_PROFILE.setId && (
              <div className="pack-error" role="alert">
                <p>
                  Set artwork availability could not be verified. Return to the
                  starter set or try reloading.
                </p>
              </div>
            )}
          {setAvailabilityQuery.data &&
            selectedSetAvailability?.available === false && (
              <div className="pack-error" role="alert">
                <p>
                  This set is hidden because one or more cards do not have
                  TCGdex artwork.
                </p>
              </div>
            )}
          {setAvailabilityQuery.data &&
            selectedSetAvailability?.available === null && (
              <div className="pack-error" role="alert">
                <p>
                  TCGdex could not verify this set just now. Its artwork has
                  not been marked missing; try checking again.
                </p>
                <button
                  className="pack-button pack-button--secondary"
                  type="button"
                  onClick={() => void setAvailabilityQuery.refetch()}
                >
                  Retry artwork check
                </button>
              </div>
            )}

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
              <>
                <button
                  className="pack-button"
                  type="button"
                  disabled={!canOpenSelectedSet || opening || savingProgress}
                  onClick={() => void openPack("standard")}
                >
                  {opening
                    ? "Opening pack…"
                    : allRevealed
                      ? "Open another pack"
                      : "Tear open pack"}
                </button>
                <div className="pack-god-pack-offer">
                  {account ? (
                    <button
                      className="pack-button pack-button--god"
                      type="button"
                      disabled={!canOpenGodPack || opening || savingProgress}
                      onClick={() => void openPack("god")}
                    >
                      {godPackButtonLabel}
                    </button>
                  ) : (
                    <Link
                      className="pack-button pack-button--god"
                      to="/account"
                    >
                      Sign in for a God Pack
                    </Link>
                  )}
                  <span>
                    Energy first, then IR-or-higher pulls at the set's observed
                    rarity rates. Cards already in your collection can appear
                    again. This set allows {godPackLimit} per{" "}
                    {godPackPeriodLabel(godPackWindowDays)} in a rolling window.
                    {godPackStatus?.availableAt && (
                      <>
                        {" "}
                        Next available {new Date(
                          godPackStatus.availableAt,
                        ).toLocaleString()}.
                      </>
                    )}
                  </span>
                </div>
              </>
            ) : (
              <button
                className="pack-button"
                type="button"
                disabled={
                  opening ||
                  movingToBack ||
                  savingProgress ||
                  !currentArtworkReady
                }
                onClick={() => void advanceCard()}
              >
                {opening
                  ? "Dealing cards…"
                  : movingToBack
                    ? "Moving card to the back…"
                    : savingProgress
                      ? "Saving progress…"
                      : !currentArtworkReady
                        ? "Preparing card artwork…"
                        : currentFaceUp
                          ? pendingReveal
                            ? "Retry save and move card"
                            : `Move card to the back · ${revealed + 1} of ${pack.length}`
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
              <p className="eyebrow">
                {openedPackType === "god" ? "GOD PACK" : `PACK ${packsOpened}`}
              </p>
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
              ? openedPackType === "god"
                ? "Your God Pack kept energy first and filled every other slot with an IR-or-higher card at the set's observed rarity rates. Previously collected cards can appear again."
                : "The card list is from TCGdex. Your pulls were revealed from lower to higher rarity."
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

      {catalogue && (
        <CollectionRoadmap
          setName={catalogue.set.name}
          cards={collectionCards}
          collectedIds={collectedIds}
        />
      )}
    </PageFrame>
  );
}
