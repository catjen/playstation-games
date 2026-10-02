import type { GameRecord, IgdbDetails, LibraryGame, StoreDetails } from "./schemas.ts";

function storeFields(s: StoreDetails, fallbackCover: string | null) {
  return {
    description: s.description,
    releaseYear: s.releaseYear,
    ageRating: s.ageRating,
    onlineRequired: s.onlineRequired,
    coverUrl: s.coverUrl ?? fallbackCover,
    localPlayers: s.localPlayers,
    onlinePlayers: s.onlinePlayers,
  };
}

// IGDB lacks multiplayer data for many games; the store fills only the gaps it
// leaves, never overriding an answer IGDB gave.
function couchFromStore(r: GameRecord, s: StoreDetails): GameRecord {
  if (s.localPlayers === 1) {
    return { ...r, couchCoop: r.couchCoop ?? false, couchVersus: r.couchVersus ?? false };
  }
  if (r.couchCoop === null && s.localCoop) {
    return { ...r, couchCoop: true, couchCoopMax: s.localPlayers };
  }
  return r;
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
    productIds: lib.productIds,
    access: lib.access,
    addedOn: today,
    goneOn: null,
    description: null,
    releaseYear: null,
    ageRating: null,
    onlineRequired: null,
    coverUrl: lib.imageUrl,
    localPlayers: null,
    onlinePlayers: null,
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
    igdbUrl: null,
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
    const merged: GameRecord = {
      ...(old ?? blank(lib, a.today)),
      title: lib.title,
      platforms: lib.platforms,
      productIds: lib.productIds,
      access: lib.access,
      goneOn: null,
      ...(s ? storeFields(s, lib.imageUrl) : {}),
      ...(d ? igdbFields(d) : {}),
    };
    const next = s ? couchFromStore(merged, s) : merged;
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
