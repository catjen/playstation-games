import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model } from "./gamelist.ts";

const lib = (id: string) => ({
  id,
  conceptId: id.slice(8),
  title: `Game ${id}`,
  platforms: ["PS5"],
  access: "owned" as const,
  productIds: [],
  titleIds: [],
  imageUrl: null,
});

async function repo(games: unknown[] | null) {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/docs`);
  if (games) await Deno.writeTextFile(`${dir}/docs/games.json`, JSON.stringify({ games }));
  return dir;
}

const opts = (methodName: string, dir: string) => ({
  methodName,
  repoDir: dir,
  globalArgs: { path: "docs/games.json" },
});

Deno.test("plan on a missing list fetches every game", async () => {
  const dir = await repo(null);
  const { context, getWrittenResources } = createModelTestContext(opts("plan", dir));
  await model.methods.plan.execute({ games: [lib("concept:1"), lib("concept:2")], mode: "new" }, context);
  assertEquals(getWrittenResources()[0].data.ids, ["concept:1", "concept:2"]);
});

Deno.test("plan refuses an empty library when the list has games", async () => {
  const dir = await repo([]);
  const { context: c1 } = createModelTestContext(opts("write", dir));
  await model.methods.write.execute(
    { games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-10-01" },
    c1,
  );
  const { context } = createModelTestContext(opts("plan", dir));
  await assertRejects(() => model.methods.plan.execute({ games: [], mode: "new" }, context), Error, "empty library");
});

Deno.test("write creates the list file with a trailing newline and reports the change", async () => {
  const dir = await repo(null);
  const { context, getWrittenResources } = createModelTestContext(opts("write", dir));
  await model.methods.write.execute(
    { games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-10-01" },
    context,
  );
  const text = await Deno.readTextFile(`${dir}/docs/games.json`);
  assertEquals(text.endsWith("}\n"), true);
  assertEquals(JSON.parse(text).games[0].addedOn, "2026-10-01");
  assertEquals(getWrittenResources()[0].data.message, "Add 1 game");
});

Deno.test("a dry run reports the change but leaves the file untouched", async () => {
  const dir = await repo([]);
  const before = await Deno.readTextFile(`${dir}/docs/games.json`);
  const { context, getWrittenResources } = createModelTestContext(opts("write", dir));
  await model.methods.write.execute(
    { games: [lib("concept:1")], store: [], igdb: [], dryRun: true, today: "2026-10-01" },
    context,
  );
  assertEquals(await Deno.readTextFile(`${dir}/docs/games.json`), before);
  assertEquals(getWrittenResources()[0].data.message, "Add 1 game");
  assertEquals(getWrittenResources()[0].data.dryRun, true);
});

Deno.test("no change leaves the file untouched and gives no commit message", async () => {
  const dir = await repo(null);
  await model.methods.write.execute(
    { games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-10-01" },
    createModelTestContext(opts("write", dir)).context,
  );
  const before = (await Deno.stat(`${dir}/docs/games.json`)).mtime;
  await new Promise((r) => setTimeout(r, 20));
  const second = createModelTestContext(opts("write", dir));
  await model.methods.write.execute(
    { games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-11-01" },
    second.context,
  );
  assertEquals((await Deno.stat(`${dir}/docs/games.json`)).mtime, before);
  assertEquals(second.getWrittenResources()[0].data.message, null);
});
