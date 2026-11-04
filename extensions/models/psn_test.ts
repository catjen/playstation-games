import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model, NpssoArgs, RENEW_STEPS } from "./psn.ts";
import type { Entitlement, StoreProduct } from "./lib/schemas.ts";

type Written = { specName: string; data: Record<string, unknown> }[];
const out = (w: Written, spec: string) => w.find((r) => r.specName === spec)?.data as Record<string, unknown>;

const fixtures = JSON.parse(await Deno.readTextFile(new URL("./fixtures/store_products.json", import.meta.url)));
const WOBBLY = "UP7742-PPSA29413_00-0632159817352246";
const NETFLIX = "EP4350-CUSA00127_00-NETFLIXPOLLUX001";
const pageFor = (id: string) =>
  `<script id="env:x" type="application/json">${
    JSON.stringify({ cache: fixtures[id] ? { [`Product:${id}`]: fixtures[id] } : {} })
  }</script>`;

const ent: Entitlement = {
  conceptId: null, entitlementId: "E1", productId: "P1", titleId: "T1", name: "A",
  platform: "PS5", membership: "NONE", imageUrl: null,
};

Deno.test("library logs in with the NPSSO and writes the entitlements", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "library" });
  await model.methods.library.execute({
    npsso: "n".repeat(64),
    _client: { login: () => Promise.resolve({ accessToken: "acc" }), entitlements: () => Promise.resolve([ent]) },
  }, context);
  assertEquals(out(getWrittenResources(), "library").entitlements, [ent]);
});

Deno.test("an expired NPSSO fails with the renewal steps and writes nothing", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "library" });
  await assertRejects(
    () =>
      model.methods.library.execute({
        npsso: "n".repeat(64),
        _client: { login: () => Promise.reject(new Error("no code")), entitlements: () => Promise.resolve([]) },
      }, context),
    Error,
    RENEW_STEPS,
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("the renewal steps name the renew script", () => {
  assertEquals(RENEW_STEPS.includes("scripts/renew-psn.ps1"), true);
});

Deno.test("details maps listed and unlisted products and skips failed lookups", async () => {
  const { context, getWrittenResources, getLogsByLevel } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    productIds: [WOBBLY, NETFLIX, "BROKEN"],
    _store: (id: string) => id === "BROKEN" ? Promise.reject(new Error("503")) : Promise.resolve(pageFor(id)),
  }, context);
  const products = out(getWrittenResources(), "store").products as StoreProduct[];
  assertEquals(products.map((p) => [p.productId, p.listed, p.conceptId]), [[WOBBLY, true, "10004896"], [NETFLIX, false, null]]);
  assertEquals(getLogsByLevel("warning").length, 1);
});

const MT2 = "EP8909-PPSA25758_00-0047300101977880";
const DI2 = "EP4062-PPSA03099_00-DI2MAINSIEEPS500";
const plusPage = (productId: string, conceptId: string) =>
  `<meta name="conceptId" content="${conceptId}" /><script id="env:x" type="application/json">${
    JSON.stringify({ cache: { [`Product:${productId}`]: { name: productId === MT2 ? "Monster Train 2" : "Dead Island 2" } } })
  }</script><script>"UPSELL_PS_PLUS_FREE:ADD_TO_CART:${productId}-E001:SUB001-SUBC00002_00-OKI55HC98I54SF1M"</script>`;
const whatsNewPage = `<section id="monthly-games"><a href="/en-no/games/dead-island-2/">a</a>` +
  `<a href="/en-no/games/monster-train-2/">b</a><a href="/en-no/games/broken/">c</a></section><section id="trials">`;
const sitePages: Record<string, string> = {
  "/en-no/ps-plus/whats-new/": whatsNewPage,
  "/en-no/games/dead-island-2/": plusPage(DI2, "201061"),
  "/en-no/games/monster-train-2/": plusPage(MT2, "10012399"),
};

Deno.test("monthly lists this month's games, marks those on the account, and links the rest", async () => {
  const { context, getWrittenResources, getLogsByLevel } = createModelTestContext({ methodName: "monthly" });
  await model.methods.monthly.execute({
    entitlements: [{ ...ent, productId: DI2, titleId: "PPSA03099_00" }],
    _site: (path: string) => sitePages[path] ? Promise.resolve(sitePages[path]) : Promise.reject(new Error("404")),
  }, context);
  assertEquals(out(getWrittenResources(), "monthly").games, [
    { name: "Dead Island 2", conceptId: "201061", productId: DI2, claimed: true, url: "https://store.playstation.com/en-no/concept/201061" },
    { name: "Monster Train 2", conceptId: "10012399", productId: MT2, claimed: false, url: "https://store.playstation.com/en-no/concept/10012399" },
  ]);
  assertEquals(getLogsByLevel("warning").length, 1);
});

Deno.test("monthly fails and writes nothing when no game page yields a PS Plus offer", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "monthly" });
  await assertRejects(
    () =>
      model.methods.monthly.execute({
        entitlements: [],
        _site: (path: string) => Promise.resolve(path.includes("whats-new") ? whatsNewPage : "<html></html>"),
      }, context),
    Error,
    "PS Plus offer",
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("check logs in and writes nothing", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "check" });
  await model.methods.check.execute({
    npsso: "n".repeat(64),
    _client: { login: () => Promise.resolve({ accessToken: "acc" }), entitlements: () => Promise.resolve([]) },
  }, context);
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("an NPSSO with a trailing line break from a pipe is accepted and trimmed", async () => {
  const token = "n".repeat(64);
  assertEquals(NpssoArgs.parse({ npsso: `${token}\r\n` }).npsso, token);
  let used = "";
  const { context } = createModelTestContext({ methodName: "check" });
  await model.methods.check.execute({
    npsso: `${token}\r\n`,
    _client: { login: (n: string) => { used = n; return Promise.resolve({ accessToken: "acc" }); }, entitlements: () => Promise.resolve([]) },
  }, context);
  assertEquals(used, token);
});

Deno.test("details fails and writes nothing when the store is mostly failing", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "details" });
  const ids = Array.from({ length: 10 }, (_, i) => `P${i}`);
  await assertRejects(
    () => model.methods.details.execute({ productIds: ids, _store: () => Promise.reject(new Error("503")) }, context),
    Error,
    "store lookups failed",
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("details tolerates a few failed lookups", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "details" });
  const ids = Array.from({ length: 30 }, (_, i) => `P${i}`);
  await model.methods.details.execute({
    productIds: ids,
    _store: (id: string) => Number(id.slice(1)) < 6 ? Promise.reject(new Error("503")) : Promise.resolve(pageFor(WOBBLY)),
  }, context);
  assertEquals((out(getWrittenResources(), "store").products as unknown[]).length, 24);
});
