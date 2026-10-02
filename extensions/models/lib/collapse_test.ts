import { assertEquals } from "@std/assert";
import { cleanTitle, collapseEntitlements } from "./collapse.ts";
import type { Entitlement } from "./schemas.ts";

function ent(over: Partial<Entitlement>): Entitlement {
  return {
    conceptId: "100",
    entitlementId: "E1",
    productId: "P1",
    titleId: "CUSA00001_00",
    name: "Game",
    platform: "PS4",
    membership: "NONE",
    imageUrl: null,
    ...over,
  };
}

Deno.test("PS4 and PS5 entitlements of one concept become one game on both platforms", () => {
  const games = collapseEntitlements([
    ent({ platform: "PS5", productId: "P5", titleId: "PPSA00001_00" }),
    ent({ platform: "PS4" }),
  ]);
  assertEquals(games.length, 1);
  assertEquals(games[0].id, "concept:100");
  assertEquals(games[0].platforms, ["PS4", "PS5"]);
  assertEquals(games[0].productIds, ["P5", "P1"]);
});

Deno.test("an edition collapses into the base game and the shortest title wins", () => {
  const games = collapseEntitlements([
    ent({ name: "Horizon Zero Dawn Complete Edition" }),
    ent({ name: "Horizon Zero Dawn", entitlementId: "E2" }),
  ]);
  assertEquals(games[0].title, "Horizon Zero Dawn");
});

Deno.test("one bought entitlement makes the game owned", () => {
  const games = collapseEntitlements([
    ent({ membership: "PS_PLUS", platform: "PS4" }),
    ent({ membership: "NONE", platform: "PS5" }),
  ]);
  assertEquals(games[0].access, "owned");
});

Deno.test("only PS Plus entitlements make the game claimed", () => {
  const games = collapseEntitlements([ent({ membership: "PS_PLUS" })]);
  assertEquals(games[0].access, "claimed");
});

Deno.test("without a concept, copies with the same name become one game keyed by the name", () => {
  const games = collapseEntitlements([
    ent({ conceptId: null, titleId: "CUSA09999_00", name: "WWE 2K24", platform: "PS4" }),
    ent({ conceptId: null, titleId: "PPSA09999_00", name: "WWE 2K24", platform: "PS5" }),
    ent({ conceptId: null, titleId: "CUSA08888_00", name: "Other Old Game" }),
  ]);
  assertEquals(games.map((g) => [g.id, g.platforms]), [["title:wwe-2k24", ["PS4", "PS5"]], ["title:other-old-game", ["PS4"]]]);
  assertEquals(games[0].conceptId, null);
});

Deno.test("trademark signs are stripped from titles", () => {
  assertEquals(cleanTitle("Rocket League\u00AE"), "Rocket League");
  assertEquals(cleanTitle("Horizon\u2122  Zero Dawn"), "Horizon Zero Dawn");
});

Deno.test("Sony's order (newest activation first) is preserved", () => {
  const games = collapseEntitlements([
    ent({ conceptId: "2", name: "Newer" }),
    ent({ conceptId: "1", name: "Older" }),
    ent({ conceptId: "2", name: "Newer", platform: "PS5" }),
  ]);
  assertEquals(games.map((g) => g.title), ["Newer", "Older"]);
});
