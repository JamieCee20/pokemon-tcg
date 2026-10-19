import { describe, expect, it } from "vitest";
import type { CardSummary, SetSummary } from "../../lib/tcgdex/types";
import {
  groupSetsByReleaseYear,
  sortCardsByNumber,
  sortSets,
} from "./setHelpers";

function makeSet(
  id: string,
  name: string,
  releaseDate: string | null,
): SetSummary {
  return {
    id,
    name,
    logo: null,
    symbol: null,
    totalCards: 0,
    officialCards: 0,
    metadataResolved: true,
    releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    serieId: null,
    serieName: null,
    cards: [],
  };
}

describe("set catalogue ordering", () => {
  it("sorts dated sets newest or oldest and keeps undated sets separate", () => {
    const sets = [
      makeSet("future", "Future", "2025-01-01"),
      makeSet("unknown", "Unknown", null),
      makeSet("older", "Older", "1999-01-01"),
    ];
    expect(sortSets(sets, "newest").map((set) => set.id)).toEqual([
      "future",
      "older",
      "unknown",
    ]);
    expect(sortSets(sets, "oldest").map((set) => set.id)).toEqual([
      "older",
      "future",
      "unknown",
    ]);
    expect(groupSetsByReleaseYear(sets).map((group) => group.year)).toEqual([
      2025,
      1999,
      null,
    ]);
  });

  it("keeps unresolved set dates out of the confirmed unknown-year group", () => {
    const unknown = makeSet("unknown", "Unknown date", null);
    const pending = {
      ...makeSet("pending", "Pending", null),
      metadataResolved: false,
    };
    expect(
      groupSetsByReleaseYear([unknown, pending]).map((group) => group.status),
    ).toEqual(["unknown", "pending"]);
  });
});

describe("card number ordering", () => {
  it("sorts natural printed numbers and keeps promotional identifiers", () => {
    const card = (id: string, localId: string): CardSummary => ({
      id,
      name: id,
      localId,
      image: null,
      setId: null,
      setName: null,
    });
    const cards = [
      card("promo", "TG05"),
      card("ten", "10"),
      card("two", "2"),
      card("one", "1"),
    ];
    expect(sortCardsByNumber(cards).map((item) => item.localId)).toEqual([
      "1",
      "2",
      "10",
      "TG05",
    ]);
  });
});
