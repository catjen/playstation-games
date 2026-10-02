import { assertEquals } from "@std/assert";
import { fetchAllEntitlements, toEntitlement } from "./psn_library.ts";

const items = JSON.parse(await Deno.readTextFile(new URL("../fixtures/purchased_page.json", import.meta.url)));
const aWayOut = items.find((i: { name: string }) => i.name === "A Way Out");

Deno.test("a purchased item maps to an entitlement", () => {
  assertEquals(toEntitlement(aWayOut), {
    conceptId: null,
    entitlementId: aWayOut.entitlementId,
    productId: "EP0006-CUSA08004_00-AWAYOUTEU0000000",
    titleId: "CUSA08004_00",
    name: "A Way Out",
    platform: "PS4",
    membership: "NONE",
    imageUrl: aWayOut.image.url,
  });
});

Deno.test("every item in the captured fixture maps without throwing", () => {
  for (const item of items) toEntitlement(item);
});

Deno.test("pagination keeps fetching until a short page", async () => {
  const pages = [Array(100).fill(aWayOut), Array(3).fill(aWayOut)];
  const starts: number[] = [];
  const fake = (_auth: unknown, opts: { size: number; start: number }) => {
    starts.push(opts.start);
    return Promise.resolve({ data: { purchasedTitlesRetrieve: { games: pages.shift()! } } });
  };
  const all = await fetchAllEntitlements({ accessToken: "x" }, fake);
  assertEquals(all.length, 103);
  assertEquals(starts, [0, 100]);
});
