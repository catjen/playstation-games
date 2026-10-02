import { assertEquals } from "@std/assert";
import { extractProduct, mapProduct } from "./store_map.ts";

const fixtures = JSON.parse(
  await Deno.readTextFile(new URL("../fixtures/store_products.json", import.meta.url)),
);
const WOBBLY = "UP7742-PPSA29413_00-0632159817352246";
const AWAYOUT = "EP0006-CUSA08004_00-AWAYOUTEU0000000";
const OUTLAST = "EP4467-PPSA05004_00-3353269409144813";
const ADDON = "EP2002-CUSA01433_00-RLRP230000000000";
const NETFLIX = "EP4350-CUSA00127_00-NETFLIXPOLLUX001";
const map = (id: string) => mapProduct(id, fixtures[id]);

Deno.test("a full game is a listed game with its concept", () => {
  const p = map(WOBBLY);
  assertEquals([p.listed, p.kind, p.conceptId], [true, "game", "10004896"]);
});

Deno.test("an add-on is classified as other", () => {
  assertEquals(map(ADDON).kind, "other");
});

Deno.test("a product the store does not list is unlisted with unknown details", () => {
  const p = map(NETFLIX);
  assertEquals([p.listed, p.kind, p.conceptId, p.description], [false, null, null, null]);
});

Deno.test("the age rating is the PEGI description", () => {
  assertEquals(map(WOBBLY).ageRating, "PEGI 7");
  assertEquals(map(OUTLAST).ageRating, null);
});

Deno.test("online required comes from the store notice and is unknown without one", () => {
  assertEquals(map(OUTLAST).onlineRequired, true);
  assertEquals(map(WOBBLY).onlineRequired, false);
  assertEquals(map(AWAYOUT).onlineRequired, null);
});

Deno.test("the release year is the Norwegian calendar year", () => {
  assertEquals(map(AWAYOUT).releaseYear, 2018);
  const p = mapProduct("X", { ...fixtures[AWAYOUT], releaseDate: "2020-12-31T23:00:00Z" });
  assertEquals(p.releaseYear, 2021);
});

Deno.test("the description is plain text without HTML", () => {
  const d = map(AWAYOUT).description!;
  assertEquals(d.includes("<"), false);
  assertEquals(d.startsWith("From the creators of Brothers"), true);
});

Deno.test("the cover is the master art", () => {
  assertEquals(map(WOBBLY).coverUrl?.startsWith("https://image.api.playstation.com/"), true);
});

Deno.test("a product with missing fields gives nulls, not an exception", () => {
  const p = mapProduct("X", { id: "X", name: "Bare" });
  assertEquals(
    [p.listed, p.conceptId, p.description, p.releaseYear, p.ageRating, p.onlineRequired, p.coverUrl],
    [true, null, null, null, null, null, null],
  );
});

Deno.test("the product record is extracted from the page's embedded caches", () => {
  const html = `<html><script id="env:a" type="application/json">${
    JSON.stringify({ cache: { "Product:P1": { id: "P1", name: "One" } } })
  }</script><script id="env:b" type="application/json">${
    JSON.stringify({ cache: { "Product:P1": { topCategory: "GAME" }, "Concept:9": { id: "9" } } })
  }</script></html>`;
  assertEquals(extractProduct(html, "P1"), { id: "P1", name: "One", topCategory: "GAME" });
  assertEquals(extractProduct(html, "P2"), null);
});
