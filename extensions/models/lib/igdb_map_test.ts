import { assertEquals } from "@std/assert";
import { mapIgdb, PS4, PS5 } from "./igdb_map.ts";
import type { IgdbGame } from "./match.ts";

const m = (game: IgdbGame) => mapIgdb("concept:1", { game, matchedBy: "psn-id" });

Deno.test("no match gives unknown everywhere", () => {
  const d = mapIgdb("concept:1", null);
  assertEquals([d.couchCoop, d.soloStory, d.genres, d.igdbId, d.matchedBy], [null, null, null, null, null]);
});

Deno.test("a co-op game: couch co-op with max, versus unknown", () => {
  const d = m({
    id: 7,
    name: "It Takes Two",
    game_modes: [{ name: "Multiplayer" }, { name: "Co-operative" }],
    multiplayer_modes: [{
      platform: PS5,
      offlinecoop: true,
      offlinecoopmax: 2,
      offlinemax: 2,
      onlinecoop: true,
      onlinecoopmax: 2,
      onlinemax: 2,
      splitscreen: true,
    }],
  });
  assertEquals([d.couchCoop, d.couchCoopMax, d.couchVersus, d.couchVersusMax], [true, 2, null, null]);
  assertEquals([d.onlineCoop, d.onlineCoopMax, d.splitScreen], [true, 2, true]);
  assertEquals(d.soloStory, false);
  assertEquals([d.igdbId, d.matchedBy], [7, "psn-id"]);
});

Deno.test("a versus game: couch versus with max, no couch co-op", () => {
  const d = m({
    id: 8,
    name: "EA FC",
    game_modes: [{ name: "Single player" }, { name: "Multiplayer" }],
    multiplayer_modes: [{ platform: PS5, offlinecoop: false, offlinemax: 4, onlinecoop: false, onlinemax: 22 }],
  });
  assertEquals([d.couchCoop, d.couchCoopMax, d.couchVersus, d.couchVersusMax], [false, null, true, 4]);
  assertEquals([d.onlineVersus, d.onlineVersusMax], [true, 22]);
  assertEquals(d.soloStory, true);
});

Deno.test("a single-player-only game is false everywhere, not unknown", () => {
  const d = m({ id: 9, name: "God of War", game_modes: [{ name: "Single player" }] });
  assertEquals(
    [d.soloStory, d.couchCoop, d.couchVersus, d.onlineCoop, d.onlineVersus, d.splitScreen],
    [true, false, false, false, false, false],
  );
});

Deno.test("unknown game modes and no multiplayer data stay unknown", () => {
  const d = m({ id: 10, name: "Obscure" });
  assertEquals([d.soloStory, d.couchCoop, d.onlineCoop], [null, null, null]);
});

Deno.test("PS5 multiplayer data is preferred over PS4 and other platforms", () => {
  const d = m({
    id: 11,
    name: "X",
    game_modes: [{ name: "Multiplayer" }],
    multiplayer_modes: [
      { platform: 6, offlinecoop: false, offlinemax: 8 },
      { platform: PS4, offlinecoop: true, offlinecoopmax: 2 },
      { platform: PS5, offlinecoop: true, offlinecoopmax: 4 },
    ],
  });
  assertEquals(d.couchCoopMax, 4);
});

Deno.test("genres are mapped to their names", () => {
  assertEquals(m({ id: 12, name: "X", genres: [{ name: "Adventure" }, { name: "Platform" }] }).genres, [
    "Adventure",
    "Platform",
  ]);
});

Deno.test("the IGDB page address is kept for the link on the page", () => {
  assertEquals(m({ id: 13, name: "X", url: "https://www.igdb.com/games/x" }).igdbUrl, "https://www.igdb.com/games/x");
  assertEquals(mapIgdb("concept:1", null).igdbUrl, null);
});
