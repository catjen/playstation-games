import { collapseEntitlements } from "./collapse.ts";
import type { Mode } from "./plan.ts";
import type { Entitlement, GameRecord, LibraryGame, StoreDetails, StoreProduct } from "./schemas.ts";

// Only applied to entitlements the store has no page for: a delisted game must
// not vanish, but apps and old test builds are not games.
const NOT_A_GAME = /\b(demo|beta|trial|alpha)\b/i;
const APPS = /^(netflix|youtube|spotify|disney\+|prime video|amazon prime video|twitch|apple tv|crunchyroll|plex|viaplay|tv 2 play|nrk tv|hbo max|media player)\b/i;

export function groupLibrary(a: {
  entitlements: Entitlement[];
  existing: GameRecord[];
  products: StoreProduct[];
  mode: Mode;
}): { games: LibraryGame[]; ids: string[]; store: StoreDetails[] } {
  const productById = new Map(a.products.map((p) => [p.productId, p]));
  const conceptFromList = new Map<string, string>();
  for (const g of a.existing) {
    if (!g.id.startsWith("concept:")) continue;
    for (const p of g.productIds) conceptFromList.set(p, g.id.slice("concept:".length));
  }

  const kept = a.entitlements.filter((e) => {
    const p = productById.get(e.productId);
    if (p?.listed) return p.kind !== "other";
    if (p && !p.listed) return !NOT_A_GAME.test(e.name) && !APPS.test(e.name);
    return true;
  });

  const games = collapseEntitlements(
    kept,
    (e) => productById.get(e.productId)?.conceptId ?? conceptFromList.get(e.productId) ?? null,
  );

  const known = new Set(a.existing.map((g) => g.id));
  const ids = a.mode === "rebuild" ? games.map((g) => g.id) : games.filter((g) => !known.has(g.id)).map((g) => g.id);

  const store: StoreDetails[] = [];
  for (const g of games) {
    const p = g.productIds.map((id) => productById.get(id)).find((x) => x?.listed && x.kind === "game");
    if (!p) continue;
    store.push({
      id: g.id,
      kind: "game",
      description: p.description,
      releaseYear: p.releaseYear,
      ageRating: p.ageRating,
      onlineRequired: p.onlineRequired,
      coverUrl: p.coverUrl,
    });
  }
  return { games, ids, store };
}
