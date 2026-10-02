import type { StoreProduct } from "./schemas.ts";

// deno-lint-ignore no-explicit-any
type Raw = Record<string, any>;

const ENV_BLOCK = /<script id="env:[^"]*" type="application\/json">([\s\S]*?)<\/script>/g;

// The store page splits its data over several embedded caches; the product
// record is the merge of every block's entry for it.
export function extractProduct(html: string, productId: string): Raw | null {
  const key = `Product:${productId}`;
  let found: Raw | null = null;
  for (const m of html.matchAll(ENV_BLOCK)) {
    const entry = JSON.parse(m[1])?.cache?.[key];
    if (entry) found = { ...(found ?? {}), ...entry };
  }
  return found;
}

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Sony stores Norwegian midnight as 22:00 or 23:00 UTC the day before; shifting
// by half a day gives the local calendar year.
function yearOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + 12 * 3600 * 1000).getUTCFullYear();
}

export function mapProduct(productId: string, p: Raw | null | undefined): StoreProduct {
  if (!p) {
    return {
      productId,
      listed: false,
      conceptId: null,
      kind: null,
      description: null,
      releaseYear: null,
      ageRating: null,
      onlineRequired: null,
      coverUrl: null,
    };
  }
  const conceptRef: string | undefined = p.concept?.__ref ?? (p.concept?.id ? `Concept:${p.concept.id}` : undefined);
  const category: string | undefined = p.topCategory ?? p.type;
  const descriptions: Raw[] = p.descriptions ?? [];
  const text = descriptions.find((d) => d.type === "SHORT")?.value ?? descriptions.find((d) => d.type === "LONG")?.value;
  const online = (p.compatibilityNoticesByPlatform?.Common ?? []).find((n: Raw) => n.type === "ONLINE_PLAY_MODE")?.value;
  const media: Raw[] = p.media ?? [];
  const cover = media.find((m) => m.role === "MASTER")?.url ?? media.find((m) => m.role === "GAMEHUB_COVER_ART")?.url;
  return {
    productId,
    listed: true,
    conceptId: conceptRef ? conceptRef.replace(/^Concept:/, "") : null,
    kind: category === undefined ? null : category === "GAME" ? "game" : "other",
    description: text ? plainText(text) : null,
    releaseYear: yearOf(p.releaseDate),
    ageRating: p.contentRating?.description ?? null,
    onlineRequired: online === "REQUIRED" ? true : online === "OPTIONAL" ? false : null,
    coverUrl: cover ?? null,
  };
}
