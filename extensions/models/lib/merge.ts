import type { GameRecord, IgdbDetails, LibraryGame, StoreDetails } from "./schemas.ts";

export type Mode = "new" | "rebuild";

export function idsToFetch(existing: GameRecord[], library: LibraryGame[], mode: Mode): string[] {
  if (mode === "rebuild") return library.map((g) => g.id);
  const known = new Set(existing.map((g) => g.id));
  return library.filter((g) => !known.has(g.id)).map((g) => g.id);
}

export function checkPlausible(existing: GameRecord[], library: LibraryGame[]): void {
  const present = existing.filter((g) => g.access !== "gone");
  if (present.length === 0) return;
  if (library.length === 0) {
    throw new Error("PSN returned an empty library; refusing to mark every game as gone. Rerun later.");
  }
  const ids = new Set(library.map((g) => g.id));
  const missing = present.filter((g) => !ids.has(g.id)).length;
  if (present.length >= 10 && missing > present.length / 2) {
    throw new Error(
      `PSN returned ${library.length} games but ${missing} of ${present.length} listed games are missing; refusing to mark them gone. Rerun later.`,
    );
  }
}

function storeFields(s: StoreDetails, fallbackCover: string | null) {
  return {
    description: s.description,
    releaseYear: s.releaseYear,
    ageRating: s.ageRating,
    onlineRequired: s.onlineRequired,
    coverUrl: s.coverUrl ?? fallbackCover,
  };
}

function igdbFields(d: IgdbDetails) {
  const { id: _id, ...rest } = d;
  return rest;
}

function blank(lib: LibraryGame, today: string): GameRecord {
  return {
    id: lib.id,
    title: lib.title,
    platforms: lib.platforms,
    access: lib.access,
    addedOn: today,
    goneOn: null,
    description: null,
    releaseYear: null,
    ageRating: null,
    onlineRequired: null,
    coverUrl: lib.imageUrl,
    soloStory: null,
    couchCoop: null,
    couchCoopMax: null,
    couchVersus: null,
    couchVersusMax: null,
    splitScreen: null,
    onlineCoop: null,
    onlineCoopMax: null,
    onlineVersus: null,
    onlineVersusMax: null,
    genres: null,
    igdbId: null,
    matchedBy: null,
  };
}

export function applyRun(a: {
  existing: GameRecord[];
  library: LibraryGame[];
  store: StoreDetails[];
  igdb: IgdbDetails[];
  today: string;
}): { games: GameRecord[]; added: string[]; updated: string[]; gone: string[] } {
  const storeById = new Map(a.store.map((s) => [s.id, s]));
  const igdbById = new Map(a.igdb.map((d) => [d.id, d]));
  const oldById = new Map(a.existing.map((g) => [g.id, g]));
  const inLibrary = new Set(a.library.map((g) => g.id));
  const added: string[] = [];
  const updated: string[] = [];
  const gone: string[] = [];
  const games: GameRecord[] = [];

  for (const lib of a.library) {
    const s = storeById.get(lib.id);
    if (s?.kind === "other") continue;
    const d = igdbById.get(lib.id);
    const old = oldById.get(lib.id);
    const next: GameRecord = {
      ...(old ?? blank(lib, a.today)),
      title: lib.title,
      platforms: lib.platforms,
      access: lib.access,
      goneOn: null,
      ...(s ? storeFields(s, lib.imageUrl) : {}),
      ...(d ? igdbFields(d) : {}),
    };
    if (!old) added.push(lib.id);
    else if (JSON.stringify(old) !== JSON.stringify(next)) updated.push(lib.id);
    games.push(next);
  }

  for (const old of a.existing) {
    if (inLibrary.has(old.id)) continue;
    if (old.access === "gone") {
      games.push(old);
      continue;
    }
    games.push({ ...old, access: "gone", goneOn: a.today });
    gone.push(old.id);
  }

  games.sort((x, y) => y.addedOn.localeCompare(x.addedOn));
  return { games, added, updated, gone };
}
