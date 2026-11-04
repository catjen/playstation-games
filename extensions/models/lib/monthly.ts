import type { Entitlement } from "./schemas.ts";
import { extractProduct } from "./store_map.ts";

export type PlusOffer = { conceptId: string; productId: string; name: string };

// The monthly games are the game links on the marketing page from the section
// with id monthly-games up to the next section with an id; the sections between
// carry no id. The page has no structured list of them.
export function monthlyGamePaths(html: string): string[] {
  const start = html.indexOf('id="monthly-games"');
  if (start < 0) throw new Error("The PS Plus page has no monthly-games section; the page may have changed.");
  const next = html.slice(start).search(/<section[^>]* id="/);
  const section = html.slice(start, next < 0 ? undefined : start + next);
  const paths = [...new Set([...section.matchAll(/href="(\/[a-z]{2}-[a-z]{2}\/games\/[^"#?]+)"/g)].map((m) => m[1]))];
  if (paths.length === 0) throw new Error("The monthly-games section has no game links; the page may have changed.");
  return paths;
}

// The game page offers the PS Plus edition as a free "add to cart" call to action.
export function plusOffer(html: string): PlusOffer | null {
  const productId = html.match(/PS_PLUS_FREE:ADD_TO_CART:([A-Z0-9]+-[A-Z0-9_]+-[A-Z0-9]+)-[A-Z0-9]+:/)?.[1];
  const conceptId = html.match(/<meta name="conceptId" content="(\d+)"/)?.[1];
  if (!productId || !conceptId) return null;
  return { conceptId, productId, name: extractProduct(html, productId)?.name ?? productId };
}

// Product ids look like EP8909-PPSA25758_00-0047300101977880; the middle part is
// the title id, shared by every edition and the claimed entitlement.
const titleOf = (productId: string) => productId.split("-")[1];

export function isClaimed(productId: string, entitlements: Entitlement[]): boolean {
  const title = titleOf(productId);
  return entitlements.some((e) => e.titleId === title || titleOf(e.productId) === title);
}
