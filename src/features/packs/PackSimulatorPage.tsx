import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageFrame } from "../../components/AppLayout";
import { cardImageUrl, getCard } from "../../lib/tcgdex/api";
import type { CardSummary } from "../../lib/tcgdex/types";
import { useAccount } from "../account/AccountContext";
import {
  equipCosmetic,
  getPackThemes,
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
import packThemeConfig from "../../../docs/cees-card-vault-themes/themes.json";
import "./PackSimulatorPage.css";

const PACK_THEMES = packThemeConfig.themes;
const DEFAULT_THEME_ID = packThemeConfig.defaultThemeId;
const THEME_SVG_SOURCE = import.meta.glob(
  "../../../docs/cees-card-vault-themes/assets/**/*.svg",
  { query: "?raw", import: "default" },
) as Record<string, () => Promise<string>>;
const pulledCardTypes = new Map<string, Promise<string[]>>();

function themeAssetUrl(path: string) {
  return `/pack-themes/${path}`;
}

function InlineThemeArtwork({
  path,
  className,
}: {
  path: string;
  className: string;
}) {
  const key = `../../../docs/cees-card-vault-themes/${path}`;
  const loadArtwork = THEME_SVG_SOURCE[key];
  const artworkQuery = useQuery({
    queryKey: ["pack-theme-artwork", path],
    queryFn: loadArtwork ?? (() => Promise.resolve("")),
    enabled: loadArtwork !== undefined,
    staleTime: Infinity,
    retry: false,
  });
  return artworkQuery.data ? (
    <span
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: artworkQuery.data }}
    />
  ) : <span className={`${className} is-loading`} aria-hidden="true" />;
}

function pulledEnergyTypes(card: PackCard): Promise<string[]> {
  if (card.rarity === "energy") return Promise.resolve([]);
  if (card.types?.length) return Promise.resolve(card.types);
  const cached = pulledCardTypes.get(card.id);
  if (cached) return cached;
  const request = getCard(card.id, AbortSignal.timeout(1_500))
    .then((details) => details.types)
    .catch(() => [] as string[]);
  pulledCardTypes.set(card.id, request);
  return request;
}

function compareCardNumbers(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}

const GOD_PACK_RARITY_SET: ReadonlySet<string> = new Set(GOD_PACK_RARITIES);
const COLLECTION_DISPLAY_OPTIONS = [
  { id: "display-grid", name: "Card grid" },
  { id: "display-binder", name: "Binder pages" },
  { id: "display-rarity", name: "Rarity groups" },
];

function cosmeticStyle(
  id: string | undefined,
  prefix: string,
  fallback: string,
) {
  return id?.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : fallback;
}

function groupCollectionCards(
  cards: CardSummary[],
  rarityByCardId: Map<string, string>,
) {
  const groups = new Map<string, CardSummary[]>();
  for (const card of cards) {
    const rarity = rarityByCardId.get(card.id) ?? "common";
    groups.set(rarity, [...(groups.get(rarity) ?? []), card]);
  }
  const rarityOrder = [
    "common",
    "uncommon",
    "rare",
    "doubleRare",
    "aceSpecRare",
    "shinyRare",
    "ultraRare",
    "shinyUltraRare",
    "illustrationRare",
    "specialIllustrationRare",
    "hyperRare",
    "megaAttackRare",
    "megaHyperRare",
    "blackWhiteRare",
    "futureRare",
    "classicCollection",
    "pikachu",
  ];
  return [...groups.entries()]
    .sort(
      ([left], [right]) =>
        rarityOrder.indexOf(left) - rarityOrder.indexOf(right),
    )
    .map(([rarity, groupCards]) => ({ rarity, cards: groupCards }));
}

function godPackPeriodLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

function CollectionRoadmap({
  setName,
  cards,
  collectedIds,
  rarityByCardId,
  displayId,
  displayChoices,
  disabled,
  onDisplayChange,
}: {
  setName: string;
  cards: CardSummary[];
  collectedIds: Set<string>;
  rarityByCardId: Map<string, string>;
  displayId: string;
  displayChoices: Array<{ id: string; name: string }>;
  disabled: boolean;
  onDisplayChange: (id: string) => void;
}) {
  const collectedCount = cards.filter((card) =>
    collectedIds.has(card.id),
  ).length;
  const progress = cards.length > 0 ? (collectedCount / cards.length) * 100 : 0;
  const displayStyle = displayId.replace("display-", "");
  const displayCards =
    displayStyle === "rarity"
      ? groupCollectionCards(cards, rarityByCardId).flatMap(
          (group) => group.cards,
        )
      : cards;

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
        {displayChoices.length > 1 && (
          <label className="pack-collection__display">
            <span>Collection view</span>
            <select
              aria-label="Collection display style"
              value={displayId}
              disabled={disabled}
              onChange={(event) => onDisplayChange(event.target.value)}
            >
              {displayChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
        data-display={displayStyle}
        role="list"
        aria-label={`${setName} cards`}
      >
        {displayCards.map((card) => {
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
              {displayStyle === "rarity" && (
                <small className="pack-collection-card__rarity">
                  {rarityLabel(
                    (rarityByCardId.get(card.id) ??
                      "common") as PackCard["rarity"],
                  )}
                </small>
              )}
              <small>#{card.localId}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PackBack({
  preparing = false,
  artwork,
  themeName,
}: {
  preparing?: boolean;
  artwork: string;
  themeName: string;
}) {
  return (
    <div
      className="pack-card__back pack-card__back--art"
      role="img"
      aria-label={`Face-down Cee’s Card Vault card with the ${themeName} theme`}
    >
      <InlineThemeArtwork
        path={artwork}
        className="pack-card__back-artwork"
      />
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
  cardBackArtwork,
  cardBackThemeName,
  disabled,
  onClick,
}: {
  card: PackCard;
  index: number;
  faceUp: boolean;
  movingToBack: boolean;
  imageReady: boolean;
  cardBackArtwork: string;
  cardBackThemeName: string;
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
        <PackBack
          preparing={!imageReady}
          artwork={cardBackArtwork}
          themeName={cardBackThemeName}
        />
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

function DealtCard({
  card,
  index,
  isNew,
}: {
  card: PackCard;
  index: number;
  isNew: boolean;
}) {
  return (
    <div
      className={`pack-table-card pack-card--${card.finish !== "normal" ? card.finish : "normal"} pack-card--${card.rarity}${isNew ? " is-new" : ""}`}
      role="listitem"
      aria-label={`${card.name}, ${rarityLabel(card.rarity)}${isNew ? ", new card collected in this pack" : ""}`}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      <div className="pack-card__front">
        {card.rarity === "energy" ? (
          <div
            className={`pack-energy pack-energy--compact pack-energy--${card.energyType ?? "grass"}`}
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
      {isNew && (
        <span className="pack-table-card__new-badge" aria-hidden="true">
          <span aria-hidden="true">★</span> NEW
        </span>
      )}
    </div>
  );
}

export function PackSimulatorPage() {
  const { account, isLoading: accountLoading, setAccount } = useAccount();
  const queryClient = useQueryClient();
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
  const [revealingAll, setRevealingAll] = useState(false);
  const [revealedAllAtOnce, setRevealedAllAtOnce] = useState(false);
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
  const [newlyCollectedPositions, setNewlyCollectedPositions] = useState<
    Set<number>
  >(() => new Set());
  const [newlyUnlockedThemeIds, setNewlyUnlockedThemeIds] = useState<string[]>(
    [],
  );
  const collectionAtPackStart = useRef<Set<string>>(new Set());
  const seenPackCardIds = useRef<Set<string>>(new Set());
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
  const packThemesQuery = useQuery({
    queryKey: ["account", "pack-themes", account?.user.id],
    queryFn: getPackThemes,
    enabled: account !== null,
    staleTime: 60_000,
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
  const rarityByCardId = new Map<string, string>();
  if (catalogue) {
    for (const [rarity, cards] of Object.entries(catalogue.cards)) {
      for (const card of cards) rarityByCardId.set(card.id, rarity);
    }
  }
  const equippedCosmetics = account?.progression.cosmetics.equipped;
  const selectedThemeId =
    packThemesQuery.data?.selectedThemeId ?? DEFAULT_THEME_ID;
  const selectedTheme =
    PACK_THEMES.find((theme) => theme.id === selectedThemeId) ?? PACK_THEMES[0]!;
  const selectedThemeBackUrl = themeAssetUrl(selectedTheme.assets.cardBack);
  const tableThemeStyle = cosmeticStyle(
    equippedCosmetics?.tableTheme,
    "table",
    "emerald",
  );
  const collectionDisplayId =
    equippedCosmetics?.collectionDisplay ?? "display-grid";
  const collectionDisplayChoices = COLLECTION_DISPLAY_OPTIONS.filter(
    (option) =>
      option.id === "display-grid" ||
      account?.progression.cosmetics.unlocked.includes(option.id),
  );
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
  const godPackFreeCredits = godPackStatus?.freeCredits ?? 0;
  const canOpenGodPack =
    account !== null &&
    canOpenSelectedSet &&
    godPackPoolSize > 0 &&
    godPackRemaining > 0 &&
    (godPackFreeCredits > 0 || account.progression.xp >= godPackXpCost);
  const godPackButtonLabel = opening
    ? openedPackType === "god"
      ? "Preparing God Pack…"
      : "Opening pack…"
    : godPackRemaining <= 0
      ? "God Pack limit reached for this set"
      : godPackFreeCredits > 0
        ? "Open free God Pack"
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
      packType === "god" ? createGodPack(catalogue) : createPack(catalogue);
    collectionAtPackStart.current = new Set(collectedIds);
    seenPackCardIds.current = new Set();
    setNewlyCollectedPositions(new Set());
    setRevealedAllAtOnce(false);
    setOpenedPackType(packType);
    setOpening(true);
    setProgressError("");
    setProgressMessage("");
    setPendingReveal(null);
    setNewlyUnlockedThemeIds([]);
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
        void queryClient.invalidateQueries({
          queryKey: ["account", "pack-themes", account.user.id],
        });
        if (packType === "god") {
          setProgressMessage(
            session.godPackFree
              ? `Free God Pack credit used · ${godPackLimit} per ${godPackPeriodLabel(godPackWindowDays)}`
              : `God Pack purchased for ${godPackXpCost.toLocaleString()} XP · ${godPackLimit} per ${godPackPeriodLabel(godPackWindowDays)}`,
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
      const tidalThemeUnlocked = packThemesQuery.data?.themes.some(
        (theme) => theme.id === "tidal-depths" && theme.unlocked,
      );
      const energyTypes = tidalThemeUnlocked
        ? []
        : await pulledEnergyTypes(card);
      const result = await recordPackReveal({
        packId,
        position,
        cardId: card.id,
        rarity: card.rarity,
        finish: card.finish,
        energyTypes,
      });
      setAccount(result.account);
      if (result.newThemesUnlocked.length > 0) {
        setNewlyUnlockedThemeIds((previous) =>
          [...new Set([...previous, ...result.newThemesUnlocked])],
        );
        void queryClient.invalidateQueries({
          queryKey: ["account", "pack-themes", account?.user.id],
        });
      }
      setPendingReveal(null);
      const revealMessages = result.rewards.map(
        (reward) => `+${reward.xp} XP ${reward.label}`,
      );
      if (result.godPackAwarded) {
        revealMessages.push(
          "Extremely rare: a free God Pack unlocked for this set!",
        );
      }
      setProgressMessage(
        revealMessages.length > 0
          ? revealMessages.join(" · ")
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
    if (
      !pack ||
      opening ||
      movingToBack ||
      savingProgress ||
      revealingAll ||
      allRevealed
    )
      return;
    if (!currentFaceUp) {
      if (currentCard) markCardCollected(currentCard, revealed);
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

  function markCardCollected(card: PackCard, position: number) {
    if (card.rarity === "energy") return;
    const alreadyCollected = collectionAtPackStart.current.has(card.id);
    const alreadySeenInPack = seenPackCardIds.current.has(card.id);
    seenPackCardIds.current.add(card.id);
    if (!alreadyCollected && !alreadySeenInPack) {
      setNewlyCollectedPositions((previous) => new Set(previous).add(position));
    }
    setCollection((previous) => {
      const existing = previous[selectedSetId] ?? [];
      if (existing.includes(card.id)) return previous;
      return {
        ...previous,
        [selectedSetId]: [...existing, card.id],
      };
    });
  }

  async function revealAll() {
    if (
      !pack ||
      opening ||
      movingToBack ||
      savingProgress ||
      revealingAll ||
      allRevealed
    )
      return;

    setRevealingAll(true);
    setProgressError("");
    let nextPosition = revealed;

    if (pendingReveal) {
      const saved = await saveReveal(
        pendingReveal.packId,
        pendingReveal.position,
        pendingReveal.card,
      );
      if (!saved) {
        setCurrentFaceUp(true);
        setRevealingAll(false);
        return;
      }
      nextPosition = Math.max(nextPosition, pendingReveal.position + 1);
    } else if (currentFaceUp) {
      // The face-up card was already saved when it was turned over.
      nextPosition += 1;
    }

    for (let position = nextPosition; position < pack.length; position += 1) {
      const card = pack[position];
      if (!card) continue;
      markCardCollected(card, position);
      if (account && packSessionId) {
        const saved = await saveReveal(packSessionId, position, card);
        if (!saved) {
          setRevealed(position);
          setCurrentFaceUp(true);
          setRevealingAll(false);
          return;
        }
      }
    }

    setRevealedAllAtOnce(true);
    setRevealed(pack.length);
    setCurrentFaceUp(false);
    setMovingToBack(false);
    setPendingReveal(null);
    setRevealingAll(false);
  }

  function selectSet(setId: string) {
    if (openTimeout.current !== null) window.clearTimeout(openTimeout.current);
    if (sendTimeout.current !== null) window.clearTimeout(sendTimeout.current);
    setSelectedSetId(setId);
    setPack(null);
    setRevealedAllAtOnce(false);
    setOpenedPackType("standard");
    setPackSessionId(null);
    setRevealed(0);
    setNewlyCollectedPositions(new Set());
    collectionAtPackStart.current = new Set();
    seenPackCardIds.current = new Set();
    setDecodedArtwork(new Set());
    setCurrentFaceUp(false);
    setMovingToBack(false);
    setOpening(false);
    setProgressError("");
    setProgressMessage("");
    setPendingReveal(null);
  }

  async function changeCollectionDisplay(cosmeticId: string) {
    if (
      !account ||
      savingProgress ||
      collectionDisplayChoices.every((item) => item.id !== cosmeticId)
    )
      return;
    setSavingProgress(true);
    setProgressError("");
    setProgressMessage("");
    try {
      setAccount(await equipCosmetic("collectionDisplay", cosmeticId));
      setProgressMessage("Collection display saved to your account.");
    } catch (error) {
      setProgressError(
        error instanceof Error
          ? error.message
          : "Could not save your collection display.",
      );
    } finally {
      setSavingProgress(false);
    }
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
            className={`pack-stack pack-stack--theme${opening ? " is-opening" : ""}${movingToBack ? " is-moving-card" : ""}`}
            style={
              {
                "--pack-theme-cardback": `url("${selectedThemeBackUrl}")`,
              } as CSSProperties
            }
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
                cardBackArtwork={selectedTheme.assets.cardBack}
                cardBackThemeName={selectedTheme.name}
                disabled={
                  opening ||
                  movingToBack ||
                  savingProgress ||
                  revealingAll ||
                  !currentArtworkReady
                }
                onClick={advanceCard}
              />
            )}
          </div>
        ) : (
          <div
            className={`pack-wrapper pack-wrapper--art${opening ? " is-opening" : ""}`}
            role="img"
            aria-label={`${selectedTheme.name} booster wrapper for ${profile.name}`}
          >
            <InlineThemeArtwork
              path={selectedTheme.assets.pack}
              className="pack-wrapper__artwork"
            />
          </div>
        )}

        <div className="pack-simulator__controls">
          <p className="eyebrow">YOUR NEXT PACK</p>
          <label className="pack-set-select">
            <span>Choose a set</span>
            <select
              value={selectedSetId}
              disabled={opening || savingProgress || revealingAll}
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
                  TCGdex could not verify this set just now. Its artwork has not
                  been marked missing; try checking again.
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
                    {godPackFreeCredits > 0 && (
                      <> You have a free God Pack credit for this set.</>
                    )}{" "}
                    Complete a standard pack while signed in for a 1 in 1,000
                    chance to unlock a free God Pack for this set. One unspent
                    credit can be held per set, and free openings count toward
                    the limit.
                    {godPackStatus?.availableAt && (
                      <>
                        {" "}
                        Next available{" "}
                        {new Date(godPackStatus.availableAt).toLocaleString()}.
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
                  revealingAll ||
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
            {pack && !allRevealed && (
              <button
                className="pack-button pack-button--secondary"
                type="button"
                disabled={
                  opening || movingToBack || savingProgress || revealingAll
                }
                aria-busy={revealingAll}
                onClick={() => void revealAll()}
              >
                {revealingAll ? "Saving pulls…" : "Reveal all"}
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
          {allRevealed && newlyUnlockedThemeIds.length > 0 && (
            <div className="pack-theme-unlock" role="status">
              <span className="pack-theme-unlock__seal" aria-hidden="true">✦</span>
              <div>
                <p className="eyebrow">VAULT REWARD UNLOCKED</p>
                {newlyUnlockedThemeIds.map((themeId) => {
                  const theme = PACK_THEMES.find((item) => item.id === themeId);
                  return theme ? <strong key={theme.id}>{theme.name}</strong> : null;
                })}
                <small>Choose it from your account customisation settings.</small>
              </div>
              <Link className="pack-button pack-button--secondary" to="/account">
                View themes
              </Link>
            </div>
          )}
          {allRevealed && (
            <div
              className={`pack-table pack-table--${tableThemeStyle}${revealedAllAtOnce ? " pack-table--instant" : ""}`}
              role="list"
              aria-label="Your cards"
            >
              {pack.map((card, index) => (
                <DealtCard
                  key={`${packsOpened}-${index}-${card.id}`}
                  card={card}
                  index={index}
                  isNew={newlyCollectedPositions.has(index)}
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
          rarityByCardId={rarityByCardId}
          displayId={collectionDisplayId}
          displayChoices={collectionDisplayChoices}
          disabled={savingProgress}
          onDisplayChange={(id) => void changeCollectionDisplay(id)}
        />
      )}
    </PageFrame>
  );
}
