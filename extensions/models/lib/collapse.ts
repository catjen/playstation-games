import { normalizeTitle } from "./match.ts";
import type { Entitlement, LibraryGame } from "./schemas.ts";

const MARKS = /[\u00AE\u2122\u00A9]/g;

export function cleanTitle(name: string): string {
  return name.replace(MARKS, "").replace(/\s+/g, " ").trim();
}

// Sony's purchased list leaves conceptId empty, so the caller can supply it
// from the store.
export function collapseEntitlements(
  entitlements: Entitlement[],
  conceptOf: (e: Entitlement) => string | null = () => null,
): LibraryGame[] {
  const groups = new Map<string, Entitlement[]>();
  const concepts = new Map<string, string | null>();
  for (const e of entitlements) {
    const concept = conceptOf(e) ?? e.conceptId;
    // Without a concept, the PS4 and PS5 copies only share their name.
    const key = concept ? `concept:${concept}` : `title:${normalizeTitle(e.name).replace(/ /g, "-") || e.titleId}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
    concepts.set(key, concept);
  }
  return [...groups.entries()].map(([id, ents]) => ({
    id,
    conceptId: concepts.get(id) ?? null,
    title: ents.map((e) => cleanTitle(e.name)).reduce((a, b) => (b.length < a.length ? b : a)),
    platforms: [...new Set(ents.map((e) => e.platform))].sort(),
    access: ents.some((e) => e.membership === "NONE") ? "owned" : "claimed",
    productIds: ents.map((e) => e.productId),
    titleIds: ents.map((e) => e.titleId),
    imageUrl: ents.find((e) => e.imageUrl)?.imageUrl ?? null,
  }));
}
