import { beforeEach, describe, expect, it } from "vitest";
import {
  compactSetSummaries,
  readFavourites,
  readSetCatalogue,
  writeFavourites,
  writeSetCatalogue,
} from "./local";
import { SET_CACHE_KEY, type SetSummary } from "../tcgdex/types";

describe("browser storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("deduplicates favourite IDs and keeps the schema version and language", () => {
    writeFavourites(["base1-4", "base1-4", "swsh3-136"]);
    expect(readFavourites()).toEqual({
      version: 1,
      language: "en",
      ids: ["base1-4", "swsh3-136"],
    });
  });

  it("recovers safely from corrupt catalogue and favourites data", () => {
    window.localStorage.setItem(SET_CACHE_KEY, "{broken");
    window.localStorage.setItem("card-atlas.favourites.v1", "{broken");
    expect(readSetCatalogue()).toBeNull();
    expect(readFavourites()).toEqual({ version: 1, language: "en", ids: [] });
  });

  it("persists set date summaries without nested card lists", () => {
    const set: SetSummary = {
      id: "swsh3",
      name: "Darkness Ablaze",
      metadataResolved: true,
      logo: null,
      symbol: null,
      totalCards: 201,
      officialCards: 189,
      releaseDate: "2020-08-14",
      releaseYear: 2020,
      serieId: "swsh",
      serieName: "Sword & Shield",
      cards: [
        {
          id: "swsh3-136",
          name: "Furret",
          localId: "136",
          image: null,
          setId: "swsh3",
          setName: "Darkness Ablaze",
        },
      ],
    };
    const compact = compactSetSummaries([set]);
    writeSetCatalogue({
      version: 2,
      savedAt: Date.now(),
      sets: compact,
      completedIds: ["swsh3"],
    });

    expect(compact[0]).not.toHaveProperty("cards");
    expect(readSetCatalogue()?.sets[0]).not.toHaveProperty("cards");
    expect(window.localStorage.getItem(SET_CACHE_KEY)).not.toContain(
      "swsh3-136",
    );
  });
});
