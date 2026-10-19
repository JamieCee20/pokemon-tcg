import type { CardSummary, SetSummary } from "../../lib/tcgdex/types";

const nameCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});
const numberCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function sortSets(
  sets: SetSummary[],
  order: "newest" | "oldest" = "newest",
): SetSummary[] {
  return [...sets].sort((left, right) => {
    if (
      left.releaseDate &&
      right.releaseDate &&
      left.releaseDate !== right.releaseDate
    ) {
      const dateOrder = left.releaseDate.localeCompare(right.releaseDate);
      return order === "newest" ? -dateOrder : dateOrder;
    }
    if (left.releaseDate && !right.releaseDate) return -1;
    if (!left.releaseDate && right.releaseDate) return 1;
    return (
      nameCollator.compare(left.name, right.name) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function groupSetsByReleaseYear(
  sets: SetSummary[],
  order: "newest" | "oldest" = "newest",
): Array<{
  year: number | null;
  status: "dated" | "unknown" | "pending";
  sets: SetSummary[];
}> {
  const groups = new Map<number | null, SetSummary[]>();
  const resolvedSets = sets.filter((set) => set.metadataResolved);
  const pendingSets = sets.filter((set) => !set.metadataResolved);
  for (const set of resolvedSets) {
    const group = groups.get(set.releaseYear) ?? [];
    group.push(set);
    groups.set(set.releaseYear, group);
  }
  const years = [...groups.keys()]
    .filter((year): year is number => year !== null)
    .sort((a, b) => (order === "newest" ? b - a : a - b));
  const result: Array<{
    year: number | null;
    status: "dated" | "unknown" | "pending";
    sets: SetSummary[];
  }> = years.map((year) => ({
    year,
    status: "dated",
    sets: sortSets(groups.get(year) ?? [], order),
  }));
  const unknown = groups.get(null);
  if (unknown?.length)
    result.push({
      year: null,
      status: "unknown",
      sets: sortSets(unknown, order),
    });
  if (pendingSets.length)
    result.push({
      year: null,
      status: "pending",
      sets: sortSets(pendingSets, order),
    });
  return result;
}

export function sortCardsByNumber(
  cards: CardSummary[],
  direction: "asc" | "desc" = "asc",
): CardSummary[] {
  return [...cards].sort((left, right) => {
    const comparison = numberCollator.compare(left.localId, right.localId);
    if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
    return left.id.localeCompare(right.id);
  });
}
