import { assertEquals } from "@std/assert";
import { applyRun } from "./merge.ts";
import type { GameRecord, IgdbDetails, LibraryGame, StoreDetails } from "./schemas.ts";

const TODAY = "2026-11-01";

function lib(id: string, over: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id,
    conceptId: id.replace("concept:", ""),
    title: `Game ${id}`,
    platforms: ["PS5"],
    access: "owned",
    productIds: [`P-${id}`],
    titleIds: [`T-${id}`],
    imageUrl: "https://img/x.png",
    ...over,
  };
}
function store(id: string, over: Partial<StoreDetails> = {}): StoreDetails {
  return {
    id,
    kind: "game",
    description: "desc",
    releaseYear: 2021,
    ageRating: "PEGI 12",
    onlineRequired: false,
    coverUrl: "https://img/cover.png",
    localPlayers: null,
    onlinePlayers: null,
    localCoop: null,
    ...over,
  };
}
function igdb(id: string, over: Partial<IgdbDetails> = {}): IgdbDetails {
  return {
    id,
    soloStory: true,
    couchCoop: true,
    couchCoopMax: 2,
    couchVersus: null,
    couchVersusMax: null,
    splitScreen: true,
    onlineCoop: true,
    onlineCoopMax: 2,
    onlineVersus: null,
    onlineVersusMax: null,
    genres: ["Adventure"],
    igdbId: 1,
    igdbUrl: null,
    matchedBy: "psn-id",
    ...over,
  };
}
function record(id: string, over: Partial<GameRecord> = {}): GameRecord {
  const { id: _s, kind: _k, localCoop: _c, ...s } = store(id);
  const { id: _i, ...g } = igdb(id);
  return {
    id,
    title: `Game ${id}`,
    platforms: ["PS5"],
    productIds: [`P-${id}`],
    access: "owned",
    addedOn: "2026-10-01",
    goneOn: null,
    ...s,
    ...g,
    ...over,
  };
}



Deno.test("a new game is added with today's date and its details", () => {
  const r = applyRun({
    existing: [],
    library: [lib("concept:1")],
    store: [store("concept:1")],
    igdb: [igdb("concept:1")],
    today: TODAY,
  });
  assertEquals(r.added, ["concept:1"]);
  assertEquals(r.games[0].addedOn, TODAY);
  assertEquals(r.games[0].couchCoop, true);
  assertEquals(r.games[0].ageRating, "PEGI 12");
});

Deno.test("a new game whose lookups failed is still added, with unknown details", () => {
  const r = applyRun({ existing: [], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals(r.added, ["concept:1"]);
  assertEquals(r.games[0].description, null);
  assertEquals(r.games[0].couchCoop, null);
  assertEquals(r.games[0].genres, null);
  assertEquals(r.games[0].coverUrl, "https://img/x.png");
});

Deno.test("an item the store classifies as not a game is left out", () => {
  const r = applyRun({
    existing: [],
    library: [lib("concept:9")],
    store: [store("concept:9", { kind: "other" })],
    igdb: [],
    today: TODAY,
  });
  assertEquals(r.games, []);
  assertEquals(r.added, []);
});

Deno.test("a claimed game bought later becomes owned and counts as updated", () => {
  const r = applyRun({
    existing: [record("concept:1", { access: "claimed" })],
    library: [lib("concept:1")],
    store: [],
    igdb: [],
    today: TODAY,
  });
  assertEquals(r.games[0].access, "owned");
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("an unchanged existing game is neither added nor updated", () => {
  const r = applyRun({ existing: [record("concept:1")], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals([r.added, r.updated, r.gone], [[], [], []]);
});

Deno.test("a game missing from the library is marked gone with today's date", () => {
  const r = applyRun({ existing: [record("concept:1")], library: [], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].access, "gone");
  assertEquals(r.games[0].goneOn, TODAY);
  assertEquals(r.gone, ["concept:1"]);
});

Deno.test("an already gone game keeps its original gone date", () => {
  const old = record("concept:1", { access: "gone", goneOn: "2026-10-01" });
  const r = applyRun({ existing: [old], library: [], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].goneOn, "2026-10-01");
  assertEquals(r.gone, []);
});

Deno.test("a gone game that reappears gets its access back and no gone date", () => {
  const old = record("concept:1", { access: "gone", goneOn: "2026-10-01" });
  const r = applyRun({
    existing: [old],
    library: [lib("concept:1", { access: "claimed" })],
    store: [],
    igdb: [],
    today: TODAY,
  });
  assertEquals(r.games[0].access, "claimed");
  assertEquals(r.games[0].goneOn, null);
  assertEquals(r.added, []);
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("a rebuild keeps previous details when a lookup failed", () => {
  const old = record("concept:1", { description: "kept", couchCoop: true });
  const r = applyRun({ existing: [old], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].description, "kept");
  assertEquals(r.games[0].couchCoop, true);
});

Deno.test("a rebuild overwrites details when the lookup succeeded", () => {
  const old = record("concept:1", { description: "old" });
  const r = applyRun({
    existing: [old],
    library: [lib("concept:1")],
    store: [store("concept:1", { description: "new" })],
    igdb: [],
    today: TODAY,
  });
  assertEquals(r.games[0].description, "new");
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("games are ordered newest added first, keeping Sony's order within a date", () => {
  const r = applyRun({
    existing: [record("concept:1", { addedOn: "2026-10-01" })],
    library: [lib("concept:3"), lib("concept:2"), lib("concept:1")],
    store: [],
    igdb: [],
    today: TODAY,
  });
  assertEquals(r.games.map((g) => g.id), ["concept:3", "concept:2", "concept:1"]);
});





Deno.test("a product bought later is added to the game's product ids", () => {
  const r = applyRun({
    existing: [record("concept:1")],
    library: [lib("concept:1", { productIds: ["P-concept:1", "P5-new"], platforms: ["PS4", "PS5"] })],
    store: [],
    igdb: [],
    today: TODAY,
  });
  assertEquals(r.games[0].productIds, ["P-concept:1", "P5-new"]);
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("the store fills couch co-op when IGDB does not know", () => {
  const r = applyRun({
    existing: [],
    library: [lib("concept:1")],
    store: [store("concept:1", { localCoop: true, localPlayers: 4 })],
    igdb: [igdb("concept:1", { couchCoop: null, couchCoopMax: null })],
    today: TODAY,
  });
  assertEquals([r.games[0].couchCoop, r.games[0].couchCoopMax, r.games[0].localPlayers], [true, 4, 4]);
});

Deno.test("IGDB's couch answer wins over the store text", () => {
  const r = applyRun({
    existing: [],
    library: [lib("concept:1")],
    store: [store("concept:1", { localCoop: true })],
    igdb: [igdb("concept:1", { couchCoop: false })],
    today: TODAY,
  });
  assertEquals(r.games[0].couchCoop, false);
});

Deno.test("one local player means no couch play at all", () => {
  const r = applyRun({
    existing: [],
    library: [lib("concept:1")],
    store: [store("concept:1", { localPlayers: 1 })],
    igdb: [igdb("concept:1", { couchCoop: null, couchVersus: null })],
    today: TODAY,
  });
  assertEquals([r.games[0].couchCoop, r.games[0].couchVersus], [false, false]);
});

Deno.test("a list written before the player-count fields existed still loads", async () => {
  const { GameListSchema } = await import("./schemas.ts");
  const { localPlayers: _l, onlinePlayers: _o, ...old } = record("concept:1");
  const list = GameListSchema.parse({ lastSync: "2026-10-02", games: [old] });
  assertEquals([list.games[0].localPlayers, list.games[0].onlinePlayers], [null, null]);
});
