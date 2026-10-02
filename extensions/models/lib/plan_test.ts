import { assertEquals, assertThrows } from "@std/assert";
import { checkPlausible, productsToLookUp } from "./plan.ts";
import type { Entitlement, GameRecord } from "./schemas.ts";

function ent(productId: string, over: Partial<Entitlement> = {}): Entitlement {
  return {
    conceptId: null,
    entitlementId: productId,
    productId,
    titleId: `T-${productId}`,
    name: `Name ${productId}`,
    platform: "PS5",
    membership: "NONE",
    imageUrl: null,
    ...over,
  };
}
function rec(id: string, productIds: string[], over: Partial<GameRecord> = {}): GameRecord {
  return {
    id, title: id, platforms: ["PS5"], productIds, access: "owned", addedOn: "2026-10-01", goneOn: null,
    description: null, releaseYear: null, ageRating: null, onlineRequired: null, coverUrl: null,
    localPlayers: null, onlinePlayers: null,
    soloStory: null, couchCoop: null, couchCoopMax: null, couchVersus: null, couchVersusMax: null,
    splitScreen: null, onlineCoop: null, onlineCoopMax: null, onlineVersus: null, onlineVersusMax: null,
    genres: null, igdbId: null, igdbUrl: null, matchedBy: null, ...over,
  };
}

Deno.test("new mode looks up only products no listed game holds", () => {
  assertEquals(productsToLookUp([rec("concept:1", ["A"])], [ent("A"), ent("B")], "new"), ["B"]);
});

Deno.test("rebuild mode looks up every product once", () => {
  assertEquals(productsToLookUp([rec("concept:1", ["A"])], [ent("A"), ent("B"), ent("B")], "rebuild"), ["A", "B"]);
});

Deno.test("an empty account is refused when the list has games", () => {
  assertThrows(() => checkPlausible([rec("concept:1", ["A"])], []), Error, "empty library");
});

Deno.test("an account missing more than half of ten or more listed games is refused", () => {
  const existing = Array.from({ length: 10 }, (_, i) => rec(`concept:${i}`, [`P${i}`]));
  assertThrows(() => checkPlausible(existing, [ent("P0"), ent("P1"), ent("P2"), ent("P3")]), Error, "refusing");
});

Deno.test("a game counts as present when any of its products is on the account", () => {
  const existing = Array.from({ length: 10 }, (_, i) => rec(`concept:${i}`, [`P${i}`, `Q${i}`]));
  checkPlausible(existing, existing.map((_, i) => ent(`Q${i}`)));
});

Deno.test("gone games do not count toward the plausibility check", () => {
  const existing = Array.from({ length: 10 }, (_, i) => rec(`concept:${i}`, [`P${i}`], { access: "gone" }));
  checkPlausible(existing, [ent("X")]);
});

Deno.test("the first run with an empty list passes the plausibility check", () => {
  checkPlausible([], [ent("A")]);
});
