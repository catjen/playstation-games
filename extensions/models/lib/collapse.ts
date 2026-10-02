import type { Entitlement, LibraryGame } from "./schemas.ts";

const MARKS = /[®™©]/g;

export function cleanTitle(name: string): string {
  return name.replace(MARKS, "").replace(/\s+/g, " ").trim();
}

export function collapseEntitlements(entitlements: Entitlement[]): LibraryGame[] {
  const groups = new Map<string, Entitlement[]>();
  for (const e of entitlements) {
    const key = e.conceptId ? `concept:${e.conceptId}` : `title:${e.titleId}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()].map(([id, ents]) => ({
    id,
    conceptId: ents[0].conceptId,
    title: ents.map((e) => cleanTitle(e.name)).reduce((a, b) => (b.length < a.length ? b : a)),
    platforms: [...new Set(ents.map((e) => e.platform))].sort(),
    access: ents.some((e) => e.membership === "NONE") ? "owned" : "claimed",
    productIds: ents.map((e) => e.productId),
    titleIds: ents.map((e) => e.titleId),
    imageUrl: ents.find((e) => e.imageUrl)?.imageUrl ?? null,
  }));
}
