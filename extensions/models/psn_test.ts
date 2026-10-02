import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model, RENEW_STEPS } from "./psn.ts";
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

Deno.test("check logs in and writes nothing", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "check" });
  await model.methods.check.execute({
    npsso: "n".repeat(64),
    _client: { login: () => Promise.resolve({ accessToken: "acc" }), entitlements: () => Promise.resolve([]) },
  }, context);
  assertEquals(getWrittenResources().length, 0);
});
