import { assertEquals } from "@std/assert";
import { type IgdbGame, normalizeTitle, pickIgdbMatch } from "./match.ts";

const y = (year: number) => Date.UTC(year, 5, 1) / 1000;
const q = { title: "Doom", releaseYear: 2016, psnUids: ["EP1-CUSA02092_00-DOOM"], psnSourceIds: [36] };

Deno.test("edition names, platforms and trademark signs normalise away", () => {
  assertEquals(normalizeTitle("Horizon Zero Dawn\u2122 Complete Edition"), "horizon zero dawn");
  assertEquals(normalizeTitle("It Takes Two PS4 & PS5"), "it takes two");
  assertEquals(normalizeTitle("God of War Ragnar\u00F6k Digital Deluxe Edition"), "god of war ragnarok");
  assertEquals(normalizeTitle("Marvel's Spider-Man: Miles Morales"), "marvel s spider man miles morales");
});

Deno.test("a PSN id link wins over a title match", () => {
  const linked: IgdbGame = {
    id: 1,
    name: "DOOM (2016)",
    external_games: [{ uid: "EP1-CUSA02092_00-DOOM", external_game_source: 36 }],
  };
  const sameName: IgdbGame = { id: 2, name: "Doom", first_release_date: y(2016) };
  assertEquals(pickIgdbMatch([sameName, linked], q), { game: linked, matchedBy: "psn-id" });
});

Deno.test("a PSN id link from another source does not count", () => {
  const other: IgdbGame = {
    id: 1,
    name: "Something",
    external_games: [{ uid: "EP1-CUSA02092_00-DOOM", external_game_source: 1 }],
  };
  assertEquals(pickIgdbMatch([other], q), null);
});

Deno.test("title and year within one match", () => {
  const g: IgdbGame = { id: 2, name: "DOOM", first_release_date: y(2017) };
  assertEquals(pickIgdbMatch([g], q), { game: g, matchedBy: "title-year" });
});

Deno.test("a year two off does not match", () => {
  assertEquals(pickIgdbMatch([{ id: 3, name: "Doom", first_release_date: y(1993) }], q), null);
});

Deno.test("two equal titles within the year window is ambiguous and gives no match", () => {
  const a: IgdbGame = { id: 4, name: "Doom", first_release_date: y(2016) };
  const b: IgdbGame = { id: 5, name: "Doom", first_release_date: y(2017) };
  assertEquals(pickIgdbMatch([a, b], q), null);
});

Deno.test("without a release year only a PSN id link can match", () => {
  const g: IgdbGame = { id: 2, name: "Doom", first_release_date: y(2016) };
  assertEquals(pickIgdbMatch([g], { ...q, releaseYear: null }), null);
});
