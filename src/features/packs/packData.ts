import { getSet } from "../../lib/tcgdex/api";
import type { CardSummary, SetSummary } from "../../lib/tcgdex/types";
import packSetConfig from "../../../config/pack-sets.json";

export type PackRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "doubleRare"
  | "ultraRare"
  | "illustrationRare"
  | "specialIllustrationRare"
  | "hyperRare"
  | "megaAttackRare"
  | "megaHyperRare"
  | "blackWhiteRare"
  | "aceSpecRare"
  | "shinyRare"
  | "shinyUltraRare"
  | "classicCollection"
  | "futureRare"
  | "pikachu";

export type PackFinish = "normal" | "holo" | "reverse";
type PackPullSlot = "bonus" | "rare" | "anniversary";

export const GOD_PACK_RARITIES = [
  "illustrationRare",
  "ultraRare",
  "shinyUltraRare",
  "megaAttackRare",
  "specialIllustrationRare",
  "hyperRare",
  "megaHyperRare",
  "blackWhiteRare",
  "futureRare",
] as const satisfies readonly PackRarity[];
const GOD_PACK_RARITY_SET: ReadonlySet<PackRarity> = new Set(
  GOD_PACK_RARITIES,
);

export interface PackRate {
  rarity: Exclude<PackRarity, "common" | "uncommon" | "rare" | "pikachu">;
  percent: number;
  odds: string;
  slot: PackPullSlot;
}

export interface PackProfile {
  setId: string;
  cardsPerPack: number;
  name: string;
  code: string;
  seriesLabel: string;
  packDescription: string;
  slots: { common: number; uncommon: number; reverse: number; rare: number };
  rates: PackRate[];
  foilEnergyPercent: number;
  guaranteedPikachu?: boolean;
  sourceLabel: string;
  sourceUrl: string;
  rateNote: string;
}

type PackProfileDefinition = Omit<PackProfile, "cardsPerPack">;

const pullnomicsSource = "https://pullnomics.com/pull-rates";

const PACK_PROFILE_DATA: PackProfileDefinition[] = [
  {
    setId: "sv03.5",
    name: "Scarlet & Violet—151",
    code: "SV 151 · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 24.83,
    rates: [
      {
        rarity: "doubleRare",
        percent: 13.28,
        odds: "about 1 in 8",
        slot: "rare",
      },
      {
        rarity: "illustrationRare",
        percent: 8.5,
        odds: "about 1 in 12",
        slot: "bonus",
      },
      {
        rarity: "ultraRare",
        percent: 6.44,
        odds: "about 1 in 16",
        slot: "rare",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 3.11,
        odds: "about 1 in 32",
        slot: "bonus",
      },
      {
        rarity: "hyperRare",
        percent: 1.94,
        odds: "about 1 in 51",
        slot: "bonus",
      },
    ],
    sourceLabel: "TCGplayer’s 151 sample and methodology",
    sourceUrl:
      "https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Scarlet-Violet-151-Pull-Rates/b237df74-fbb0-40d0-9e13-d69ee6e804d9/",
    rateNote:
      "These are community-observed English 151 pull rates, not official guarantees.",
  },
  {
    setId: "sv09",
    name: "Journey Together",
    code: "JTG · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 20, odds: "about 1 in 5", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 9.09,
        odds: "about 1 in 11",
        slot: "bonus",
      },
      {
        rarity: "ultraRare",
        percent: 6.67,
        odds: "about 1 in 15",
        slot: "rare",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.075,
        odds: "about 1 in 93",
        slot: "bonus",
      },
      {
        rarity: "hyperRare",
        percent: 0.763,
        odds: "about 1 in 131",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Journey Together odds are estimates from recorded pack openings, not official guarantees.",
  },
  {
    setId: "sv08.5",
    name: "Prismatic Evolutions",
    code: "PRE · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      {
        rarity: "doubleRare",
        percent: 16.67,
        odds: "about 1 in 6",
        slot: "rare",
      },
      {
        rarity: "ultraRare",
        percent: 5.13,
        odds: "about 1 in 19.5",
        slot: "rare",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 2.04,
        odds: "about 1 in 49",
        slot: "bonus",
      },
      {
        rarity: "hyperRare",
        percent: 0.602,
        odds: "about 1 in 166",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Prismatic Evolutions has no Illustration Rare tier. Odds are estimates from observed openings, not guarantees.",
  },
  {
    setId: "me05",
    name: "Pitch Black",
    code: "PBL · EN",
    seriesLabel: "MEGA EVOLUTION",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 20, odds: "about 1 in 5", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 10,
        odds: "about 1 in 10",
        slot: "bonus",
      },
      {
        rarity: "ultraRare",
        percent: 8.33,
        odds: "about 1 in 12",
        slot: "rare",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 0.976,
        odds: "about 1 in 102.5",
        slot: "bonus",
      },
      {
        rarity: "megaHyperRare",
        percent: 0.076,
        odds: "about 1 in 1,315",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Pitch Black odds are community estimates and are especially uncertain for its rarest cards.",
  },
  {
    setId: "me02.5",
    name: "Ascended Heroes",
    code: "ASC · EN",
    seriesLabel: "MEGA EVOLUTION",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      {
        rarity: "doubleRare",
        percent: 20.37,
        odds: "about 1 in 5",
        slot: "rare",
      },
      {
        rarity: "illustrationRare",
        percent: 11.11,
        odds: "about 1 in 9",
        slot: "bonus",
      },
      {
        rarity: "ultraRare",
        percent: 4.8,
        odds: "about 1 in 20",
        slot: "rare",
      },
      {
        rarity: "megaAttackRare",
        percent: 3.45,
        odds: "about 1 in 29",
        slot: "rare",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.44,
        odds: "about 1 in 70",
        slot: "bonus",
      },
      {
        rarity: "megaHyperRare",
        percent: 0.19,
        odds: "about 1 in 530",
        slot: "bonus",
      },
    ],
    sourceLabel: "TCGplayer sample, summarized by UltraBall",
    sourceUrl: "https://ultraball.com/sets/ascended-heroes/pull-rates",
    rateNote:
      "Ascended Heroes odds are based on a 2,000-pack sample. Real products can vary.",
  },
  {
    setId: "30th",
    name: "30th Celebration (30th Anniversary)",
    code: "30TH · EN",
    seriesLabel: "30TH CELEBRATION",
    packDescription: "5 FOIL CARDS + FOIL ENERGY · ENGLISH",
    slots: { common: 3, uncommon: 0, reverse: 0, rare: 1 },
    foilEnergyPercent: 100,
    guaranteedPikachu: true,
    rates: [
      {
        rarity: "doubleRare",
        percent: 24.4,
        odds: "about 1 in 4.1",
        slot: "anniversary",
      },
      {
        rarity: "illustrationRare",
        percent: 19.9,
        odds: "about 1 in 5",
        slot: "anniversary",
      },
      {
        rarity: "classicCollection",
        percent: 10.3,
        odds: "about 1 in 9.7",
        slot: "anniversary",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 5.8,
        odds: "about 1 in 17",
        slot: "anniversary",
      },
      {
        rarity: "futureRare",
        percent: 1.2,
        odds: "about 1 in 80",
        slot: "anniversary",
      },
    ],
    sourceLabel: "2,003-pack retail sample and methodology",
    sourceUrl:
      "https://tcgcardinvestor.com/articles/30th-celebration-pull-rates",
    rateNote:
      "This observed sample is early; the rarest-tier estimates may shift as more packs are recorded.",
  },
  {
    setId: "me04",
    name: "Chaos Rising",
    code: "CHR · EN",
    seriesLabel: "MEGA EVOLUTION",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 22.22, odds: "1 in 4.5", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 10.53,
        odds: "1 in 9.5",
        slot: "bonus",
      },
      { rarity: "ultraRare", percent: 6.06, odds: "1 in 16.5", slot: "rare" },
      {
        rarity: "specialIllustrationRare",
        percent: 1.21,
        odds: "1 in 82.5",
        slot: "bonus",
      },
      {
        rarity: "megaHyperRare",
        percent: 0.103,
        odds: "1 in 975",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Community-observed rates, not official guarantees. The rarest-tier estimate is based on a small sample.",
  },
  {
    setId: "me03",
    name: "Perfect Order",
    code: "PFO · EN",
    seriesLabel: "MEGA EVOLUTION",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      {
        rarity: "illustrationRare",
        percent: 11.11,
        odds: "1 in 9",
        slot: "bonus",
      },
      { rarity: "ultraRare", percent: 9.09, odds: "1 in 11", slot: "rare" },
      { rarity: "megaAttackRare", percent: 2.5, odds: "1 in 40", slot: "rare" },
      {
        rarity: "specialIllustrationRare",
        percent: 1.25,
        odds: "1 in 80",
        slot: "bonus",
      },
      {
        rarity: "megaHyperRare",
        percent: 0.071,
        odds: "1 in 1,400",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Community-observed rates, not official guarantees. The rarest-tier estimate is based on a small sample.",
  },
  {
    setId: "me02",
    name: "Phantasmal Flames",
    code: "PHF · EN",
    seriesLabel: "MEGA EVOLUTION",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      {
        rarity: "illustrationRare",
        percent: 11.11,
        odds: "1 in 9",
        slot: "bonus",
      },
      { rarity: "ultraRare", percent: 8.33, odds: "1 in 12", slot: "rare" },
      { rarity: "megaAttackRare", percent: 2.5, odds: "1 in 40", slot: "rare" },
      {
        rarity: "specialIllustrationRare",
        percent: 1.25,
        odds: "1 in 80",
        slot: "bonus",
      },
      {
        rarity: "megaHyperRare",
        percent: 0.079,
        odds: "1 in 1,260",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Community-observed rates, not official guarantees. The rarest-tier estimate is based on a small sample.",
  },
  {
    setId: "me01",
    name: "Mega Evolution",
    code: "MEG · EN",
    seriesLabel: "MEGA EVOLUTION",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 20, odds: "1 in 5", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 11.11,
        odds: "1 in 9",
        slot: "bonus",
      },
      { rarity: "ultraRare", percent: 8, odds: "1 in 12.5", slot: "rare" },
      {
        rarity: "specialIllustrationRare",
        percent: 0.99,
        odds: "1 in 101",
        slot: "bonus",
      },
      {
        rarity: "megaHyperRare",
        percent: 0.079,
        odds: "1 in 1,260",
        slot: "bonus",
      },
    ],
    sourceLabel: "Observed pull-rate data by set",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Community-observed rates, not official guarantees. The rarest-tier estimate is based on a small sample.",
  },
  {
    setId: "sv10.5b",
    name: "Black Bolt",
    code: "BLK · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 20, odds: "1 in 5", slot: "rare" },
      { rarity: "ultraRare", percent: 6.25, odds: "1 in 16", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 16.67,
        odds: "1 in 6",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.32,
        odds: "about 1 in 76",
        slot: "bonus",
      },
      {
        rarity: "blackWhiteRare",
        percent: 0.2,
        odds: "about 1 in 500",
        slot: "bonus",
      },
    ],
    sourceLabel: "PokeBeach and PokéPatch opening samples",
    sourceUrl:
      "https://www.pokebeach.com/2025/07/black-bolt-and-white-flare-english-set-guides-full-card-lists-pull-rates-cut-cards-products-and-more",
    rateNote:
      "Rates are community estimates. Poké Ball and Master Ball reverse patterns use the simulator's generic reverse foil finish.",
  },
  {
    setId: "sv10.5w",
    name: "White Flare",
    code: "WFL · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 20, odds: "1 in 5", slot: "rare" },
      { rarity: "ultraRare", percent: 6.25, odds: "1 in 16", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 16.67,
        odds: "1 in 6",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.32,
        odds: "about 1 in 76",
        slot: "bonus",
      },
      {
        rarity: "blackWhiteRare",
        percent: 0.2,
        odds: "about 1 in 500",
        slot: "bonus",
      },
    ],
    sourceLabel: "PokeBeach and PokéPatch opening samples",
    sourceUrl:
      "https://www.pokebeach.com/2025/07/black-bolt-and-white-flare-english-set-guides-full-card-lists-pull-rates-cut-cards-products-and-more",
    rateNote:
      "Rates are community estimates. Poké Ball and Master Ball reverse patterns use the simulator's generic reverse foil finish.",
  },
  {
    setId: "sv10",
    name: "Destined Rivals",
    code: "DRI · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      {
        rarity: "doubleRare",
        percent: 20,
        odds: "era estimate: 1 in 5",
        slot: "rare",
      },
      {
        rarity: "aceSpecRare",
        percent: 5,
        odds: "era estimate: 1 in 20",
        slot: "rare",
      },
      {
        rarity: "ultraRare",
        percent: 6.67,
        odds: "era estimate: 1 in 15",
        slot: "rare",
      },
      {
        rarity: "illustrationRare",
        percent: 8.33,
        odds: "1 in 12",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.064,
        odds: "1 in 94",
        slot: "bonus",
      },
      { rarity: "hyperRare", percent: 0.671, odds: "1 in 149", slot: "bonus" },
    ],
    sourceLabel: "Pullnomics community data and era averages",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Illustration and secret-rare rates are set estimates. Double rare, Ultra rare, and ACE SPEC rates use Scarlet & Violet era averages.",
  },
  {
    setId: "sv08",
    name: "Surging Sparks",
    code: "SSP · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      {
        rarity: "doubleRare",
        percent: 16.67,
        odds: "era estimate: 1 in 6",
        slot: "rare",
      },
      {
        rarity: "aceSpecRare",
        percent: 5,
        odds: "era estimate: 1 in 20",
        slot: "rare",
      },
      { rarity: "ultraRare", percent: 6.67, odds: "1 in 15", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 7.69,
        odds: "1 in 13",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.18,
        odds: "1 in 85",
        slot: "bonus",
      },
      { rarity: "hyperRare", percent: 0.529, odds: "1 in 189", slot: "bonus" },
    ],
    sourceLabel: "Pullnomics recorded pack-opening data",
    sourceUrl: "https://pullnomics.com/guides/is-surging-sparks-worth-opening",
    rateNote:
      "Illustration and secret-rare rates are observed estimates. Double rare and ACE SPEC use Scarlet & Violet era averages.",
  },
  {
    setId: "sv07",
    name: "Stellar Crown",
    code: "SCR · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 16.67, odds: "1 in 6", slot: "rare" },
      {
        rarity: "aceSpecRare",
        percent: 5,
        odds: "era estimate: 1 in 20",
        slot: "rare",
      },
      { rarity: "ultraRare", percent: 6.67, odds: "1 in 15", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 7.69,
        odds: "1 in 13",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.11,
        odds: "1 in 90",
        slot: "bonus",
      },
      { rarity: "hyperRare", percent: 0.763, odds: "1 in 131", slot: "bonus" },
    ],
    sourceLabel: "Pullnomics community data and era averages",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Community-observed rates, not official guarantees. ACE SPEC uses the Scarlet & Violet era average.",
  },
  {
    setId: "sv06",
    name: "Twilight Masquerade",
    code: "TWM · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 16.67, odds: "1 in 6", slot: "rare" },
      {
        rarity: "aceSpecRare",
        percent: 5,
        odds: "era estimate: 1 in 20",
        slot: "rare",
      },
      { rarity: "ultraRare", percent: 6.67, odds: "1 in 15", slot: "rare" },
      {
        rarity: "illustrationRare",
        percent: 7.69,
        odds: "1 in 13",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.16,
        odds: "1 in 86",
        slot: "bonus",
      },
      { rarity: "hyperRare", percent: 0.685, odds: "1 in 146", slot: "bonus" },
    ],
    sourceLabel: "Pullnomics community data and era averages",
    sourceUrl: pullnomicsSource,
    rateNote:
      "Community-observed rates, not official guarantees. ACE SPEC uses the Scarlet & Violet era average.",
  },
  {
    setId: "sv4.5",
    name: "Paldean Fates",
    code: "PAF · EN",
    seriesLabel: "SCARLET & VIOLET",
    packDescription: "10 CARDS + ENERGY · ENGLISH",
    slots: { common: 5, uncommon: 2, reverse: 2, rare: 1 },
    foilEnergyPercent: 0,
    rates: [
      { rarity: "doubleRare", percent: 15.89, odds: "1 in 6", slot: "rare" },
      { rarity: "ultraRare", percent: 6.61, odds: "1 in 15", slot: "rare" },
      { rarity: "shinyRare", percent: 25.44, odds: "1 in 4", slot: "bonus" },
      {
        rarity: "shinyUltraRare",
        percent: 7.72,
        odds: "1 in 13",
        slot: "bonus",
      },
      {
        rarity: "illustrationRare",
        percent: 7.22,
        odds: "1 in 14",
        slot: "bonus",
      },
      {
        rarity: "specialIllustrationRare",
        percent: 1.72,
        odds: "1 in 58",
        slot: "bonus",
      },
      { rarity: "hyperRare", percent: 1.61, odds: "1 in 62", slot: "bonus" },
    ],
    sourceLabel: "Poké Life verified-opening data",
    sourceUrl: "https://www.poke-life.com/sets/paldean-fates/",
    rateNote:
      "Community-observed rates from 1,800+ packs, checked October 2026. Pull rates are estimates, not guarantees.",
  },
];

const packProfilesBySetId = new Map(
  PACK_PROFILE_DATA.map((profile) => [profile.setId, profile]),
);

export const PACK_PROFILES: PackProfile[] = packSetConfig.flatMap((set) => {
    const profile = packProfilesBySetId.get(set.id);
    return profile ? [{ ...profile, cardsPerPack: set.cardsPerPack }] : [];
  });

export const DEFAULT_PACK_PROFILE = PACK_PROFILES[0]!;

const TCGDEX_API = "https://api.tcgdex.net/v2/en";
const RARITY_GROUPS = [
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["aceSpecRare", "ACE SPEC Rare"],
  ["doubleRare", "Double rare"],
  ["ultraRare", "Ultra rare"],
  ["shinyRare", "Shiny rare"],
  ["shinyUltraRare", "Shiny ultra rare"],
  ["illustrationRare", "Illustration rare"],
  ["specialIllustrationRare", "Special illustration rare"],
  ["hyperRare", "Hyper rare"],
  ["megaAttackRare", "Mega Attack Rare"],
  ["megaHyperRare", "Mega Hyper Rare"],
  ["blackWhiteRare", "Black White Rare"],
  ["futureRare", "Futuristic Rare"],
] as const;

const RARITY_GROUP_BY_KEY = new Map<string, string>(RARITY_GROUPS);

export interface PackCard extends CardSummary {
  rarity: PackRarity | "energy";
  finish: PackFinish;
  energyType?: string;
  energySymbol?: string;
}

export interface PackCatalogue {
  set: SetSummary;
  profile: PackProfile;
  cards: Record<PackRarity, CardSummary[]>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCardSummary(
  value: unknown,
  cardsById: Map<string, CardSummary>,
  set: SetSummary,
): CardSummary | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  const fromSet = cardsById.get(value.id);
  if (fromSet) return fromSet;
  if (
    typeof value.name !== "string" ||
    (typeof value.localId !== "string" && typeof value.localId !== "number")
  )
    return null;
  return {
    id: value.id,
    name: value.name,
    localId: String(value.localId),
    image: typeof value.image === "string" ? value.image : null,
    setId: set.id,
    setName: set.name,
  };
}

async function getRarityCards(
  set: SetSummary,
  rarity: string,
  cardsById: Map<string, CardSummary>,
  signal?: AbortSignal,
): Promise<CardSummary[]> {
  const cards: CardSummary[] = [];
  const pageSize = 100;

  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({
      "set.id": `eq:${set.id}`,
      rarity: `eq:${rarity}`,
      "pagination:page": String(page),
      "pagination:itemsPerPage": String(pageSize),
    });
    const response = await fetch(`${TCGDEX_API}/cards?${params}`, {
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new Error(`TCGdex could not load the ${rarity} card pool.`);
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("TCGdex returned an invalid rarity card list.");
    }
    cards.push(
      ...data
        .map((card) => toCardSummary(card, cardsById, set))
        .filter((card): card is CardSummary => card !== null),
    );
    if (data.length < pageSize) break;
  }

  return cards;
}

export async function loadPackCatalogue(
  setId = DEFAULT_PACK_PROFILE.setId,
  signal?: AbortSignal,
): Promise<PackCatalogue> {
  const profile = PACK_PROFILES.find((candidate) => candidate.setId === setId);
  if (!profile)
    throw new Error("That set is not available in the pack simulator.");

  const set = await getSet(profile.setId, signal, "en", false);
  const cardsById = new Map(set.cards.map((card) => [card.id, card]));
  const requiredRarities = new Set<PackRarity>([
    "common",
    "uncommon",
    "rare",
    ...profile.rates.map((rate) => rate.rarity),
  ]);
  const queries = [...requiredRarities].flatMap((key) => {
    const rarity = RARITY_GROUP_BY_KEY.get(key);
    return rarity ? [{ key, rarity }] : [];
  });
  const groups = await Promise.all(
    queries.map(
      async ({ key, rarity }) =>
        [key, await getRarityCards(set, rarity, cardsById, signal)] as const,
    ),
  );
  const cards = Object.fromEntries(
    RARITY_GROUPS.map(([key]) => [key, [] as CardSummary[]]),
  ) as Record<PackRarity, CardSummary[]>;
  cards.pikachu = profile.guaranteedPikachu
    ? set.cards.filter((card) => card.name.toLowerCase() === "pikachu")
    : [];
  cards.classicCollection = [];
  for (const [key, pool] of groups) cards[key] = pool;

  if (profile.setId === "30th") {
    const classicSet = await getSet("30th-c", signal, "en", false);
    cards.classicCollection = classicSet.cards.map((card) => ({
      ...card,
      setId: set.id,
      setName: set.name,
    }));
  }

  for (const required of ["common"] as const) {
    if (cards[required].length === 0) {
      throw new Error(
        `TCGdex did not return any ${required} cards for ${set.name}.`,
      );
    }
  }
  if (!profile.guaranteedPikachu && cards.uncommon.length === 0) {
    throw new Error(
      `TCGdex did not return any uncommon cards for ${set.name}.`,
    );
  }
  if (profile.guaranteedPikachu && cards.pikachu.length === 0) {
    throw new Error(
      `TCGdex did not return the guaranteed Pikachu cards for ${set.name}.`,
    );
  }
  if (profile.guaranteedPikachu && cards.classicCollection.length === 0) {
    throw new Error(
      `TCGdex did not return the Classic Collection cards for ${set.name}.`,
    );
  }
  return { set, profile, cards };
}

const RARITY_ORDER: Record<PackRarity | "energy", number> = {
  energy: -1,
  common: 0,
  uncommon: 1,
  rare: 2,
  aceSpecRare: 2.75,
  pikachu: 2.5,
  doubleRare: 3,
  classicCollection: 3.5,
  illustrationRare: 4,
  ultraRare: 5,
  shinyRare: 5,
  shinyUltraRare: 5.5,
  megaAttackRare: 5.5,
  specialIllustrationRare: 6,
  hyperRare: 7,
  megaHyperRare: 8,
  blackWhiteRare: 8.5,
  futureRare: 9,
};

const RARITY_LABELS: Record<PackRarity | "energy", string> = {
  energy: "Basic Energy",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  aceSpecRare: "ACE SPEC Rare",
  pikachu: "Guaranteed Pikachu",
  doubleRare: "Double Rare · ex",
  classicCollection: "Classic Collection",
  illustrationRare: "Illustration Rare",
  ultraRare: "Ultra Rare · Full Art",
  shinyRare: "Shiny Rare",
  shinyUltraRare: "Shiny Ultra Rare",
  megaAttackRare: "Mega Attack Rare",
  specialIllustrationRare: "Special Illustration Rare",
  hyperRare: "Hyper Rare · Gold",
  megaHyperRare: "Mega Hyper Rare · Gold",
  blackWhiteRare: "Black White Rare",
  futureRare: "Futuristic Rare",
};

function chooseCard(cards: CardSummary[], used: Set<string>): CardSummary {
  const available = cards.filter((card) => !used.has(card.id));
  const pool = available.length > 0 ? available : cards;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  if (!selected) throw new Error("TCGdex returned an empty card pool.");
  used.add(selected.id);
  return selected;
}

function addCard(
  result: PackCard[],
  pool: CardSummary[],
  used: Set<string>,
  rarity: PackRarity,
  finish: PackFinish,
) {
  if (pool.length === 0) return;
  result.push({ ...chooseCard(pool, used), rarity, finish });
}

function lowCardPool(pools: PackCatalogue["cards"]): Array<{
  card: CardSummary;
  rarity: "common" | "uncommon" | "rare";
}> {
  return [
    ...pools.common
      .filter(
        (card) => !pools.pikachu.some((pikachu) => pikachu.id === card.id),
      )
      .map((card) => ({ card, rarity: "common" as const })),
    ...pools.uncommon.map((card) => ({ card, rarity: "uncommon" as const })),
    ...pools.rare.map((card) => ({ card, rarity: "rare" as const })),
  ];
}

function addLowFoilCard(
  result: PackCard[],
  pools: PackCatalogue["cards"],
  used: Set<string>,
  finish: PackFinish = "reverse",
) {
  const lowCards = lowCardPool(pools);
  const available = lowCards.filter(({ card }) => !used.has(card.id));
  const pool = available.length > 0 ? available : lowCards;
  if (pool.length === 0) return;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  if (!selected) return;
  used.add(selected.card.id);
  result.push({ ...selected.card, rarity: selected.rarity, finish });
}

function chooseWeighted<T extends string>(
  choices: Array<{ value: T; percent: number }>,
): T | null {
  const roll = Math.random() * 100;
  let edge = 0;
  for (const choice of choices) {
    edge += choice.percent;
    if (roll < edge) return choice.value;
  }
  return null;
}

function chooseRate(
  profile: PackProfile,
  slot: PackPullSlot,
): PackRarity | null {
  return chooseWeighted(
    profile.rates
      .filter((rate) => rate.slot === slot)
      .map((rate) => ({ value: rate.rarity, percent: rate.percent })),
  );
}

function createEnergy(catalogue: PackCatalogue, foilPercent: number): PackCard {
  const energyTypes = [
    ["Grass", "✿"],
    ["Fire", "♨"],
    ["Water", "◉"],
    ["Lightning", "ϟ"],
    ["Psychic", "ψ"],
    ["Fighting", "✊"],
    ["Darkness", "☾"],
    ["Metal", "⬟"],
  ] as const;
  const energy = energyTypes[Math.floor(Math.random() * energyTypes.length)]!;
  return {
    id: `sim-energy-${energy[0].toLowerCase()}`,
    name: `${energy[0]} Energy`,
    localId: "Energy",
    image: null,
    setId: catalogue.set.id,
    setName: catalogue.set.name,
    rarity: "energy",
    finish: Math.random() < foilPercent / 100 ? "holo" : "normal",
    energyType: energy[0].toLowerCase(),
    energySymbol: energy[1],
  };
}

function createAnniversaryPack(catalogue: PackCatalogue): PackCard[] {
  const { profile, cards: pools } = catalogue;
  const pack: PackCard[] = [createEnergy(catalogue, profile.foilEnergyPercent)];
  const used = new Set<string>();
  const pikachu = chooseCard(pools.pikachu, used);

  for (let index = 0; index < profile.slots.common; index += 1) {
    addLowFoilCard(pack, pools, used, "holo");
  }

  const specialRarity = chooseRate(profile, "anniversary");
  if (specialRarity && pools[specialRarity].length > 0) {
    addCard(pack, pools[specialRarity], used, specialRarity, "holo");
  } else {
    addLowFoilCard(pack, pools, used, "holo");
  }
  pack.push({ ...pikachu, rarity: "pikachu", finish: "holo" });
  return pack.sort((left, right) => revealOrder(left) - revealOrder(right));
}

export function createPack(catalogue: PackCatalogue): PackCard[] {
  const { profile, cards: pools } = catalogue;
  if (profile.guaranteedPikachu) return createAnniversaryPack(catalogue);

  const pack: PackCard[] = [createEnergy(catalogue, profile.foilEnergyPercent)];
  const used = new Set<string>();
  for (let index = 0; index < profile.slots.common; index += 1) {
    addCard(pack, pools.common, used, "common", "normal");
  }
  for (let index = 0; index < profile.slots.uncommon; index += 1) {
    addCard(pack, pools.uncommon, used, "uncommon", "normal");
  }

  for (let index = 0; index < profile.slots.reverse - 1; index += 1) {
    addLowFoilCard(pack, pools, used);
  }
  const bonusRarity = chooseRate(profile, "bonus");
  if (bonusRarity && pools[bonusRarity].length > 0) {
    addCard(pack, pools[bonusRarity], used, bonusRarity, "holo");
  } else {
    addLowFoilCard(pack, pools, used);
  }

  for (let index = 0; index < profile.slots.rare; index += 1) {
    const rareUpgrade = chooseRate(profile, "rare");
    if (rareUpgrade && pools[rareUpgrade].length > 0) {
      addCard(pack, pools[rareUpgrade], used, rareUpgrade, "holo");
    } else {
      addCard(pack, pools.rare, used, "rare", "holo");
    }
  }

  return pack.sort((left, right) => revealOrder(left) - revealOrder(right));
}

export function createGodPack(
  catalogue: PackCatalogue,
): PackCard[] {
  type GodPackRarity = (typeof GOD_PACK_RARITIES)[number];
  const eligibleRates = catalogue.profile.rates.filter(
    (rate): rate is PackRate & { rarity: GodPackRarity } =>
      GOD_PACK_RARITY_SET.has(rate.rarity) &&
      (catalogue.cards[rate.rarity]?.length ?? 0) > 0,
  );
  if (eligibleRates.length === 0) {
    throw new Error(
      "This set has no eligible IR-or-higher cards for a God Pack.",
    );
  }

  const pack: PackCard[] = [
    createEnergy(catalogue, catalogue.profile.foilEnergyPercent),
  ];
  const usedIds = new Set<string>();
  const premiumSlots = Math.max((catalogue.profile.cardsPerPack ?? 11) - 1, 1);
  const totalWeight = eligibleRates.reduce((sum, rate) => sum + rate.percent, 0);

  for (let position = 0; position < premiumSlots; position += 1) {
    let roll = Math.random() * totalWeight;
    let selectedRarity = eligibleRates[0]!.rarity;
    for (const rate of eligibleRates) {
      roll -= rate.percent;
      if (roll < 0) {
        selectedRarity = rate.rarity;
        break;
      }
    }
    const rarityPool = catalogue.cards[selectedRarity] ?? [];
    const unusedCards = rarityPool.filter((card) => !usedIds.has(card.id));
    const cardPool = unusedCards.length > 0 ? unusedCards : rarityPool;
    const selected = cardPool[Math.floor(Math.random() * cardPool.length)]!;
    usedIds.add(selected.id);
    pack.push({ ...selected, rarity: selectedRarity, finish: "holo" });
  }

  return pack.sort((left, right) => revealOrder(left) - revealOrder(right));
}

function revealOrder(card: PackCard): number {
  if (card.rarity === "energy") return -1;
  if (card.finish === "normal") return RARITY_ORDER[card.rarity];
  if (card.finish === "reverse" && RARITY_ORDER[card.rarity] <= 2) return 3;
  if (card.rarity === "pikachu") return 3.5;
  if (card.finish === "holo" && RARITY_ORDER[card.rarity] <= 1) {
    return RARITY_ORDER[card.rarity] + 2;
  }
  return 4 + RARITY_ORDER[card.rarity];
}

export function rarityLabel(rarity: PackRarity | "energy"): string {
  return RARITY_LABELS[rarity];
}
