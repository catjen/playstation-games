export interface IgdbMultiplayerMode {
  platform?: number;
  offlinecoop?: boolean;
  offlinecoopmax?: number;
  offlinemax?: number;
  onlinecoop?: boolean;
  onlinecoopmax?: number;
  onlinemax?: number;
  splitscreen?: boolean;
}

export interface IgdbGame {
  id: number;
  name: string;
  url?: string;
  first_release_date?: number;
  genres?: { name: string }[];
  game_modes?: { name: string }[];
  multiplayer_modes?: IgdbMultiplayerMode[];
  external_games?: { uid?: string; external_game_source?: number }[];
}

export type IgdbMatch = { game: IgdbGame; matchedBy: "psn-id" | "title-year" | "title" };

const EDITION =
  /\b(?:digital\s+)?(?:deluxe|gold|ultimate|complete|standard|definitive|special|anniversary|game of the year|goty|premium|launch|cross-gen|digital)\s+edition\b/g;
const PLATFORMS = /\(?\bps[45](?:\s*(?:&|and|\/)\s*ps[45])?\b\)?/g;

export function normalizeTitle(t: string): string {
  // Marks go first: NFKD would turn the trademark sign into the letters "TM".
  return t
    .replace(/[\u00AE\u2122\u00A9]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(PLATFORMS, " ")
    .replace(EDITION, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const yearOf = (seconds: number) => new Date(seconds * 1000).getUTCFullYear();

export function pickIgdbMatch(
  candidates: IgdbGame[],
  q: { title: string; releaseYear: number | null; psnUids: string[]; psnSourceIds: number[] },
): IgdbMatch | null {
  const linked = candidates.find((c) =>
    c.external_games?.some((x) =>
      x.uid !== undefined && x.external_game_source !== undefined &&
      q.psnSourceIds.includes(x.external_game_source) && q.psnUids.includes(x.uid)
    )
  );
  if (linked) return { game: linked, matchedBy: "psn-id" };
  const want = normalizeTitle(q.title);
  // Delisted games have no store page and so no year; an exact name that only
  // one IGDB game carries is accepted then (decided 02.10.2026).
  if (q.releaseYear === null) {
    const named = candidates.filter((c) => normalizeTitle(c.name) === want);
    return named.length === 1 ? { game: named[0], matchedBy: "title" } : null;
  }
  const year = q.releaseYear;
  const hits = candidates.filter((c) =>
    normalizeTitle(c.name) === want && c.first_release_date !== undefined &&
    Math.abs(yearOf(c.first_release_date) - year) <= 1
  );
  return hits.length === 1 ? { game: hits[0], matchedBy: "title-year" } : null;
}
