import { assertEquals } from "@std/assert";
import { groupLibrary } from "./group.ts";
import type { Entitlement, GameRecord, StoreProduct } from "./schemas.ts";

function ent(productId: string, over: Partial<Entitlement> = {}): Entitlement {
  return {
    conceptId: null,
    entitlementId: productId,
    productId,
    titleId: `T-${productId}`,
    name: `Game ${productId}`,
    platform: "PS5",
    membership: "NONE",
    imageUrl: null,
    ...over,
  };
}
function product(productId: string, conceptId: string | null, over: Partial<StoreProduct> = {}): StoreProduct {
  return {
    productId, listed: true, conceptId, kind: "game", description: "d", releaseYear: 2020,
    ageRating: "PEGI 7", onlineRequired: false, coverUrl: "https://img/c.png", ...over,
  };
}
const unlisted = (productId: string) =>
  product(productId, null, { listed: false, kind: null, description: null, releaseYear: null, ageRating: null, onlineRequired: null, coverUrl: null });
function rec(id: string, productIds: string[]): GameRecord {
  return {
    id, title: id, platforms: ["PS4"], productIds, access: "owned", addedOn: "2026-10-01", goneOn: null,
    description: null, releaseYear: null, ageRating: null, onlineRequired: null, coverUrl: null,
    soloStory: null, couchCoop: null, couchCoopMax: null, couchVersus: null, couchVersusMax: null,
    splitScreen: null, onlineCoop: null, onlineCoopMax: null, onlineVersus: null, onlineVersusMax: null,
    genres: null, igdbId: null, matchedBy: null,
  };
}

Deno.test("PS4 and PS5 copies with the same store concept become one game", () => {
  const r = groupLibrary({
    entitlements: [ent("A", { platform: "PS4", name: "Wobbly Life" }), ent("B", { platform: "PS5", name: "Wobbly Life" })],
    existing: [],
    products: [product("A", "77"), product("B", "77")],
    mode: "new",
  });
  assertEquals(r.games.map((g) => [g.id, g.platforms, g.productIds]), [["concept:77", ["PS4", "PS5"], ["A", "B"]]]);
  assertEquals(r.ids, ["concept:77"]);
});

Deno.test("a product looked up earlier takes its concept from the list", () => {
  const r = groupLibrary({
    entitlements: [ent("A", { platform: "PS4" }), ent("B", { platform: "PS5" })],
    existing: [rec("concept:77", ["A"])],
    products: [product("B", "77")],
    mode: "new",
  });
  assertEquals(r.games.map((g) => g.id), ["concept:77"]);
  assertEquals(r.ids, []);
});

Deno.test("add-ons are dropped", () => {
  const r = groupLibrary({ entitlements: [ent("A")], existing: [], products: [product("A", "5", { kind: "other" })], mode: "new" });
  assertEquals(r.games, []);
});

Deno.test("unlisted demos, betas and streaming apps are dropped", () => {
  const names = ["Nioh 3 Alpha Demo", "PlanetSide 2 Closed Beta 2", "Netflix", "YouTube", "Spotify", "Some Game Trial"];
  const r = groupLibrary({
    entitlements: names.map((n, i) => ent(`P${i}`, { name: n })),
    existing: [],
    products: names.map((_, i) => unlisted(`P${i}`)),
    mode: "new",
  });
  assertEquals(r.games, []);
});

Deno.test("an unlisted product with a game name stays, keyed by its title id", () => {
  const r = groupLibrary({
    entitlements: [ent("A", { name: "Old Delisted Racer", titleId: "CUSA01234_00" })],
    existing: [],
    products: [unlisted("A")],
    mode: "new",
  });
  assertEquals(r.games.map((g) => g.id), ["title:CUSA01234_00"]);
});

Deno.test("a product whose lookup failed stays, keyed by its title id", () => {
  const r = groupLibrary({ entitlements: [ent("A", { titleId: "CUSA9_00" })], existing: [], products: [], mode: "new" });
  assertEquals(r.games.map((g) => g.id), ["title:CUSA9_00"]);
});

Deno.test("store details for a game come from its first listed game product", () => {
  const r = groupLibrary({
    entitlements: [ent("A", { platform: "PS4" }), ent("B")],
    existing: [],
    products: [product("A", "8", { description: "from A" }), product("B", "8", { description: "from B" })],
    mode: "new",
  });
  assertEquals(r.games.map((g) => g.id), ["concept:8"]);
  assertEquals(r.store.map((s) => [s.id, s.kind, s.description]), [["concept:8", "game", "from A"]]);
});

Deno.test("a game with no listed product gets no store details", () => {
  const r = groupLibrary({ entitlements: [ent("A")], existing: [], products: [unlisted("A")], mode: "new" });
  assertEquals(r.store, []);
});

Deno.test("rebuild mode asks for details on every game", () => {
  const r = groupLibrary({
    entitlements: [ent("A"), ent("B")],
    existing: [rec("concept:1", ["A"])],
    products: [product("A", "1"), product("B", "2")],
    mode: "rebuild",
  });
  assertEquals(r.ids, ["concept:1", "concept:2"]);
});
