import { describe, expect, it } from "vitest";
import { assetImageUrl, cardImageUrl, mapSetSummary } from "./api";

describe("TCGdex asset URLs", () => {
  it("builds low and high card artwork URLs from the provider asset base", () => {
    const base = "https://assets.tcgdex.net/en/swsh/swsh3/136";
    expect(cardImageUrl(base, "low")).toBe(`${base}/low.webp`);
    expect(cardImageUrl(base, "high")).toBe(`${base}/high.webp`);
    expect(cardImageUrl(null, "high")).toBeNull();
  });

  it("adds a webp extension to set artwork only once", () => {
    expect(assetImageUrl("https://assets.tcgdex.net/en/swsh/swsh3/logo")).toBe(
      "https://assets.tcgdex.net/en/swsh/swsh3/logo.webp",
    );
    expect(
      assetImageUrl("https://assets.tcgdex.net/en/swsh/swsh3/logo.webp"),
    ).toBe("https://assets.tcgdex.net/en/swsh/swsh3/logo.webp");
    expect(
      assetImageUrl("https://assets.tcgdex.net/en/swsh/swsh3/logo.png"),
    ).toBe("https://assets.tcgdex.net/en/swsh/swsh3/logo.webp");
  });
});

describe("TCGdex set mapping", () => {
  it("derives years only from a valid full-set release date and attaches set context to brief cards", () => {
    const set = mapSetSummary({
      id: "swsh3",
      name: "Darkness Ablaze",
      releaseDate: "2020-08-14",
      cardCount: { total: 201, official: 189 },
      serie: { id: "swsh", name: "Sword & Shield" },
      cards: [
        {
          id: "swsh3-136",
          name: "Furret",
          localId: "136",
          image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
        },
      ],
    });

    expect(set.releaseYear).toBe(2020);
    expect(set.cards[0]).toMatchObject({
      id: "swsh3-136",
      setId: "swsh3",
      setName: "Darkness Ablaze",
    });
    expect(
      mapSetSummary({
        id: "x",
        name: "No date",
        releaseDate: "not-a-date",
        cards: [],
      }).releaseYear,
    ).toBeNull();
  });
});
