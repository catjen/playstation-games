import type { IgdbDetails } from "./schemas.ts";
import type { IgdbMatch, IgdbMultiplayerMode } from "./match.ts";

export const PS5 = 167;
export const PS4 = 48;

const MULTIPLAYER_MODES = [
  "Multiplayer",
  "Co-operative",
  "Split screen",
  "Massively Multiplayer Online (MMO)",
  "Battle Royale",
];

function pickMode(modes: IgdbMultiplayerMode[] | undefined): IgdbMultiplayerMode | undefined {
  if (!modes?.length) return undefined;
  return modes.find((x) => x.platform === PS5) ?? modes.find((x) => x.platform === PS4) ?? modes[0];
}

// IGDB has a max-player count for a mode but no versus flag: versus is only
// knowable when co-op is explicitly false.
function together(coop: boolean | undefined, coopMax: number | undefined, anyMax: number | undefined) {
  const c = coop ?? null;
  let versus: boolean | null = null;
  if (anyMax !== undefined) versus = anyMax < 2 ? false : coop === false ? true : null;
  return {
    coop: c,
    coopMax: c ? coopMax ?? null : null,
    versus,
    versusMax: versus && anyMax !== undefined ? anyMax : null,
  };
}

export function mapIgdb(id: string, match: IgdbMatch | null): IgdbDetails {
  const unknown: IgdbDetails = {
    id,
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
  if (!match) return unknown;
  const g = match.game;
  const modeNames = g.game_modes?.map((x) => x.name);
  const base: IgdbDetails = {
    ...unknown,
    soloStory: modeNames ? modeNames.includes("Single player") : null,
    genres: g.genres ? g.genres.map((x) => x.name) : null,
    igdbId: g.id,
    igdbUrl: g.url ?? null,
    matchedBy: match.matchedBy,
  };
  const mm = pickMode(g.multiplayer_modes);
  if (!mm) {
    const soloOnly = modeNames !== undefined && !modeNames.some((n) => MULTIPLAYER_MODES.includes(n));
    if (!soloOnly) return base;
    return {
      ...base,
      couchCoop: false,
      couchVersus: false,
      splitScreen: false,
      onlineCoop: false,
      onlineVersus: false,
    };
  }
  const couch = together(mm.offlinecoop, mm.offlinecoopmax, mm.offlinemax);
  const online = together(mm.onlinecoop, mm.onlinecoopmax, mm.onlinemax);
  return {
    ...base,
    couchCoop: couch.coop,
    couchCoopMax: couch.coopMax,
    couchVersus: couch.versus,
    couchVersusMax: couch.versusMax,
    splitScreen: mm.splitscreen ?? null,
    onlineCoop: online.coop,
    onlineCoopMax: online.coopMax,
    onlineVersus: online.versus,
    onlineVersusMax: online.versusMax,
  };
}
