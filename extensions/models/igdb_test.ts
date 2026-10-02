import { assertEquals } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model } from "./igdb.ts";
import type { IgdbDetails } from "./lib/schemas.ts";

type Written = { specName: string; data: Record<string, unknown> }[];
const igdbOut = (w: Written) => w.find((r) => r.specName === "igdb")?.data.details as IgdbDetails[];

const game = (id: string, title: string) => ({
  id,
  conceptId: id.replace("concept:", ""),
  title,
  platforms: ["PS5"],
  access: "owned" as const,
  productIds: [`P${id}`],
  titleIds: [`T${id}`],
  imageUrl: null,
});
const store = (id: string, year: number) => ({
  id,
  kind: "game" as const,
  description: null,
  releaseYear: year,
  ageRating: null,
  onlineRequired: null,
  coverUrl: null,
});

function fakeIgdb(routes: Record<string, (body: string) => unknown[]>) {
  return { post: (endpoint: string, body: string) => Promise.resolve(routes[endpoint](body)) };
}

Deno.test("a PSN id link is used before a title search", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    clientId: "c",
    clientSecret: "s",
    ids: ["concept:1"],
    games: [game("concept:1", "Doom")],
    store: [store("concept:1", 2016)],
    _igdb: fakeIgdb({
      external_game_sources: () => [{ id: 36, name: "PlayStation Store US" }],
      external_games: () => [{ game: 99 }],
      games: (body) =>
        body.includes("where id = (99)")
          ? [{
            id: 99,
            name: "DOOM",
            external_games: [{ uid: "Pconcept:1", external_game_source: 36 }],
            game_modes: [{ name: "Single player" }],
          }]
          : [],
    }),
  }, context);
  const d = igdbOut(getWrittenResources())[0];
  assertEquals([d.igdbId, d.matchedBy, d.soloStory], [99, "psn-id", true]);
});

Deno.test("no link falls back to title and year", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    clientId: "c",
    clientSecret: "s",
    ids: ["concept:2"],
    games: [game("concept:2", "It Takes Two")],
    store: [store("concept:2", 2021)],
    _igdb: fakeIgdb({
      external_game_sources: () => [{ id: 36, name: "PlayStation Store US" }],
      external_games: () => [],
      games: () => [{ id: 7, name: "It Takes Two", first_release_date: Date.UTC(2021, 2, 26) / 1000 }],
    }),
  }, context);
  const d = igdbOut(getWrittenResources())[0];
  assertEquals([d.igdbId, d.matchedBy], [7, "title-year"]);
});

Deno.test("a failed lookup is left out rather than written as unknown", async () => {
  const { context, getWrittenResources, getLogsByLevel } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    clientId: "c",
    clientSecret: "s",
    ids: ["concept:3"],
    games: [game("concept:3", "X")],
    store: [store("concept:3", 2020)],
    _igdb: {
      post: (endpoint: string) =>
        endpoint === "external_game_sources" ? Promise.resolve([]) : Promise.reject(new Error("429")),
    },
  }, context);
  assertEquals(igdbOut(getWrittenResources()), []);
  assertEquals(getLogsByLevel("warning").length, 1);
});
