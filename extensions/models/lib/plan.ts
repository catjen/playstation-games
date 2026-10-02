import type { Entitlement, GameRecord } from "./schemas.ts";

export type Mode = "new" | "rebuild";

export function productsToLookUp(existing: GameRecord[], entitlements: Entitlement[], mode: Mode): string[] {
  const all = [...new Set(entitlements.map((e) => e.productId))];
  if (mode === "rebuild") return all;
  const known = new Set(existing.flatMap((g) => g.productIds));
  return all.filter((p) => !known.has(p));
}

export function checkPlausible(existing: GameRecord[], entitlements: Entitlement[]): void {
  const present = existing.filter((g) => g.access !== "gone");
  if (present.length === 0) return;
  if (entitlements.length === 0) {
    throw new Error("PSN returned an empty library; refusing to mark every game as gone. Rerun later.");
  }
  const onAccount = new Set(entitlements.map((e) => e.productId));
  const missing = present.filter((g) => !g.productIds.some((p) => onAccount.has(p))).length;
  if (present.length >= 10 && missing > present.length / 2) {
    throw new Error(
      `PSN returned ${entitlements.length} entitlements but ${missing} of ${present.length} listed games are missing; refusing to mark them gone. Rerun later.`,
    );
  }
}
