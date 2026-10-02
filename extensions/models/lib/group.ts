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
  // Products the store step was asked for; one missing from `products` failed.
  planned?: string[];
  mode: Mode;
}): { games: LibraryGame[]; ids: string[]; store: StoreDetails[] } {
  const productById = new Map(a.products.map((p) => [p.productId, p]));
  const conceptFromList = new Map<string, string>();
  for (const g of a.existing) {
    if (!g.id.startsWith("concept:")) continue;
    for (const p of g.productIds) conceptFromList.set(p, g.id.slice("concept:".length));
  }

  const knownProducts = new Set(a.existing.flatMap((g) => g.productIds));
  const failed = new Set((a.planned ?? []).filter((id) => !productById.has(id)));

  const kept = a.entitlements.filter((e) => {
    // A new product whose lookup failed is treated as not seen yet: writing it
    // would mark it known, and new mode would never look it up again.
    if (failed.has(e.productId) && !knownProducts.has(e.productId)) return false;
    const p = productById.get(e.productId);
    if (p?.listed) return p.kind !== "other";
    if (p && !p.listed) return !NOT_A_GAME.test(e.name) && !APPS.test(e.name);
    return true;
  });

  const games = collapseEntitlements(
    kept,
    (e) => productById.get(e.productId)?.conceptId ?? conceptFromList.get(e.productId) ?? null,
  );

  // New mode also retries known games IGDB has not matched yet, so a failed or
  // missing IGDB answer is not permanent.
  const matched = new Set(a.existing.filter((g) => g.igdbId !== null).map((g) => g.id));
  const ids = a.mode === "rebuild" ? games.map((g) => g.id) : games.filter((g) => !matched.has(g.id)).map((g) => g.id);

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
      localPlayers: p.localPlayers,
      onlinePlayers: p.onlinePlayers,
      localCoop: p.localCoop,
    });
  }
  return { games, ids, store };
}
