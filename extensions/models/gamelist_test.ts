import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model } from "./gamelist.ts";

type Written = { specName: string; data: Record<string, unknown> }[];
const out = (w: Written, spec: string) => w.find((r) => r.specName === spec)?.data as Record<string, unknown>;

const lib = (id: string) => ({
  id,
  conceptId: id.slice(8),
  title: `Game ${id}`,
  platforms: ["PS5"],
  access: "owned" as const,
  productIds: [`P-${id}`],
  titleIds: [],
  imageUrl: null,
});
const ent = (productId: string) => ({
  conceptId: null,
  entitlementId: productId,
  productId,
  titleId: `T-${productId}`,
  name: `Game ${productId}`,
  platform: "PS5",
  membership: "NONE" as const,
  imageUrl: null,
});
const product = (productId: string, conceptId: string) => ({
  productId,
  listed: true,
  conceptId,
  kind: "game" as const,
  description: "d",
  releaseYear: 2020,
  ageRating: "PEGI 7",
  onlineRequired: false,
  coverUrl: null,
});

async function repo(list: unknown | null) {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/docs`);
  if (list) await Deno.writeTextFile(`${dir}/docs/games.json`, JSON.stringify(list));
  return dir;
}
const opts = (methodName: string, dir: string) => ({ methodName, repoDir: dir, globalArgs: { path: "docs/games.json" } });
const write = (dir: string, games: ReturnType<typeof lib>[], over: { dryRun?: boolean; today?: string } = {}) => {
  const c = createModelTestContext(opts("write", dir));
  return model.methods.write.execute({ games, store: [], igdb: [], dryRun: false, today: "2026-10-01", ...over }, c.context)
    .then(() => c);
};

Deno.test("plan on a missing list looks up every product", async () => {
  const dir = await repo(null);
  const { context, getWrittenResources } = createModelTestContext(opts("plan", dir));
  await model.methods.plan.execute({ entitlements: [ent("A"), ent("B")], mode: "new" }, context);
  assertEquals(out(getWrittenResources(), "plan").productIds, ["A", "B"]);
});

Deno.test("plan refuses an empty account when the list has games", async () => {
  const dir = await repo(null);
  await write(dir, [lib("concept:1")]);
  const { context } = createModelTestContext(opts("plan", dir));
  await assertRejects(() => model.methods.plan.execute({ entitlements: [], mode: "new" }, context), Error, "empty library");
});

Deno.test("group writes one game per concept and the games needing details", async () => {
  const dir = await repo(null);
  const { context, getWrittenResources } = createModelTestContext(opts("group", dir));
  await model.methods.group.execute({
    entitlements: [ent("A"), ent("B")],
    products: [product("A", "7"), product("B", "7")],
    mode: "new",
  }, context);
  const g = out(getWrittenResources(), "grouped");
  assertEquals((g.games as { id: string }[]).map((x) => x.id), ["concept:7"]);
  assertEquals(g.ids, ["concept:7"]);
});

Deno.test("write creates the list with the sync date and reports the change", async () => {
  const dir = await repo(null);
  const c = await write(dir, [lib("concept:1")]);
  const text = await Deno.readTextFile(`${dir}/docs/games.json`);
  assertEquals(text.endsWith("}\n"), true);
  assertEquals(JSON.parse(text).lastSync, "2026-10-01");
  assertEquals(JSON.parse(text).games[0].addedOn, "2026-10-01");
  assertEquals(out(c.getWrittenResources(), "summary").message, "Add 1 game");
});

Deno.test("a dry run reports the change but leaves the file untouched", async () => {
  const dir = await repo({ lastSync: "2026-09-01", games: [] });
  const before = await Deno.readTextFile(`${dir}/docs/games.json`);
  const c = await write(dir, [lib("concept:1")], { dryRun: true });
  assertEquals(await Deno.readTextFile(`${dir}/docs/games.json`), before);
  assertEquals(out(c.getWrittenResources(), "summary").message, "Add 1 game");
  assertEquals(out(c.getWrittenResources(), "summary").dryRun, true);
});

Deno.test("a month with no game changes still records the sync date", async () => {
  const dir = await repo(null);
  await write(dir, [lib("concept:1")]);
  const c = await write(dir, [lib("concept:1")], { today: "2026-11-01" });
  const list = JSON.parse(await Deno.readTextFile(`${dir}/docs/games.json`));
  assertEquals(list.lastSync, "2026-11-01");
  assertEquals(list.games[0].addedOn, "2026-10-01");
  assertEquals(out(c.getWrittenResources(), "summary").message, "Sync: no game changes");
});

Deno.test("a list from before lastSync existed still loads", async () => {
  const dir = await repo({ games: [] });
  const c = await write(dir, [lib("concept:1")]);
  assertEquals(out(c.getWrittenResources(), "summary").message, "Add 1 game");
});
