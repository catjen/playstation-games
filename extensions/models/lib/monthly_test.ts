import { assertEquals, assertThrows } from "@std/assert";
import { isClaimed, monthlyGamePaths, plusOffer } from "./monthly.ts";
import type { Entitlement } from "./schemas.ts";

// Shaped like playstation.com/en-no/ps-plus/whats-new/ on 04.11.2026.
const whatsNew = `
<section class="gpdc-section" id="highlights"><a href="/en-no/games/mafia-the-old-country/">x</a></section>
<section style="background-color:#D9DCE8;" class="gpdc-section theme--lightAlt" id="monthly-games">
  <h2>Your latest monthly games</h2>
</section>
<section style="background-color:#D9DCE8;" class="gpdc-section theme--light ">
  <a href="/en-no/games/dead-island-2/">Dead Island 2</a><a href="/en-no/games/dead-island-2/">logo</a>
  <a href="/en-no/games/monster-train-2/">Monster Train 2</a>
  <a href="https://www.youtube.com/watch?v=x">trailer</a>
</section>
<section class="gpdc-section theme--dark component-hidden--mobile "></section>
<section class="gpdc-section" id="trials"><a href="/en-no/games/007-first-light/">x</a></section>`;

const gamePage = (productId: string) => `
<meta name="conceptId" content="10012399" />
<script id="env:d4b3" type="application/json">${JSON.stringify({
  cache: {
    [`Product:${productId}`]: { id: productId, name: "Monster Train 2" },
    [`GameCTA:UPSELL_PS_PLUS_FREE:ADD_TO_CART:${productId}-E001:SUB001-SUBC00002_00-OKI55HC98I54SF1M`]: { type: "ADD_TO_CART" },
  },
})}</script>`;

const ent = (productId: string, titleId: string): Entitlement => ({
  conceptId: null, entitlementId: productId, productId, titleId, name: "A",
  platform: "PS5", membership: "PS_PLUS", imageUrl: null,
});

Deno.test("monthly game paths come only from the monthly games section, once each", () => {
  assertEquals(monthlyGamePaths(whatsNew), ["/en-no/games/dead-island-2/", "/en-no/games/monster-train-2/"]);
});

Deno.test("a whats-new page without a monthly games section is an error, not an empty month", () => {
  assertThrows(() => monthlyGamePaths("<section id=\"trials\"></section>"), Error, "monthly-games");
});

Deno.test("a monthly games section without game links is an error, not an empty month", () => {
  assertThrows(() => monthlyGamePaths('<section id="monthly-games"></section><section id="trials">'), Error, "no game links");
});

Deno.test("the PS Plus offer gives the product, its concept and its name", () => {
  assertEquals(plusOffer(gamePage("EP8909-PPSA25758_00-0047300101977880")), {
    conceptId: "10012399",
    productId: "EP8909-PPSA25758_00-0047300101977880",
    name: "Monster Train 2",
  });
});

Deno.test("a game page without a PS Plus offer has no offer", () => {
  assertEquals(plusOffer('<meta name="conceptId" content="1" />'), null);
});

Deno.test("a game is claimed when any entitlement shares its title id, whatever the edition or platform", () => {
  const offer = "EP8909-PPSA25758_00-0047300101977880";
  assertEquals(isClaimed(offer, [ent("EP8909-PPSA25758_00-0700653113516281", "PPSA25758_00")]), true);
  assertEquals(isClaimed(offer, [ent("EP8909-CUSA11111_00-0000000000000000", "PPSA25758_00")]), true);
  assertEquals(isClaimed(offer, [ent("EP8909-PPSA99999_00-0047300101977880", "PPSA99999_00")]), false);
});
