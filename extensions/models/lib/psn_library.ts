import { getPurchasedGames } from "npm:psn-api@2.18.1";
import { type Entitlement, EntitlementSchema } from "./schemas.ts";

// deno-lint-ignore no-explicit-any
export function toEntitlement(item: any): Entitlement {
  return EntitlementSchema.parse({
    conceptId: item.conceptId ?? null,
    entitlementId: item.entitlementId,
    productId: item.productId,
    titleId: item.titleId,
    name: item.name,
    platform: item.platform,
    membership: item.membership,
    imageUrl: item.image?.url ?? null,
  });
}

type PageFn = (
  auth: { accessToken: string },
  opts: { size: number; start: number },
  // deno-lint-ignore no-explicit-any
) => Promise<{ data: { purchasedTitlesRetrieve: { games: any[] } } }>;

export async function fetchAllEntitlements(
  auth: { accessToken: string },
  page: PageFn = getPurchasedGames as unknown as PageFn,
): Promise<Entitlement[]> {
  const size = 100;
  const out: Entitlement[] = [];
  for (let start = 0;; start += size) {
    const res = await page(auth, { size, start });
    const games = res.data.purchasedTitlesRetrieve.games;
    out.push(...games.map(toEntitlement));
    if (games.length < size) return out;
  }
}
