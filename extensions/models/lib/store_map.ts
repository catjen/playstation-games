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

const LOCAL_COOP =
  /\b(local|couch|split[- ]?screen|same[- ]screen|shared[- ]screen)\b[^.\n]{0,40}\bco-?op|\bco-?op\b[^.\n]{0,20}\b(local|couch|split[- ]?screen)\b/i;

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
      localPlayers: null,
      onlinePlayers: null,
      localCoop: null,
    };
  }
  const conceptRef: string | undefined = p.concept?.__ref ?? (p.concept?.id ? `Concept:${p.concept.id}` : undefined);
  const category: string | undefined = p.topCategory ?? p.type;
  const descriptions: Raw[] = p.descriptions ?? [];
  const text = descriptions.find((d) => d.type === "SHORT")?.value ?? descriptions.find((d) => d.type === "LONG")?.value;
  const notices: Raw[] = p.compatibilityNoticesByPlatform?.Common ?? [];
  const notice = (...types: string[]) => notices.find((n) => types.includes(n.type))?.value;
  const online = notice("ONLINE_PLAY_MODE");
  const count = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const allText = descriptions.filter((d) => d.type === "SHORT" || d.type === "LONG").map((d) => plainText(d.value)).join("\n");
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
    localPlayers: count(notice("NO_OF_PLAYERS")),
    onlinePlayers: count(notice("NO_OF_NETWORK_PLAYERS", "NO_OF_NETWORK_PLAYERS_PS_PLUS")),
    localCoop: LOCAL_COOP.test(allText) ? true : null,
  };
}
