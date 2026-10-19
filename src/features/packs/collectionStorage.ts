export const PACK_COLLECTION_STORAGE_KEY = "card-atlas.pack-collection.v1";

export function readPackCollection(): Record<string, string[]> {
  try {
    const stored = window.localStorage.getItem(PACK_COLLECTION_STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([setId, cardIds]) =>
        Array.isArray(cardIds) && cardIds.every((id) => typeof id === "string")
          ? [[setId, cardIds]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export function writePackCollection(collection: Record<string, string[]>) {
  try {
    window.localStorage.setItem(
      PACK_COLLECTION_STORAGE_KEY,
      JSON.stringify(collection),
    );
  } catch {
    // Collection progress still works for the current session without storage.
  }
}
