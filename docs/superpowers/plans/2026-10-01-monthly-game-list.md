# Monthly PlayStation Game List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A monthly swamp workflow that reads the user's PSN library, enriches new games from the PlayStation Store and IGDB, writes `docs/games.json`, and pushes it to a public GitHub Pages site with a sortable, filterable table.

**Architecture:** Three custom swamp extension models (`@catjen/psn`, `@catjen/igdb`, `@catjen/gamelist`) with all decision logic in pure, unit-tested TypeScript modules under `extensions/models/lib/`. A swamp workflow `monthly-sync` chains them and commits/pushes with the official `@swamp/git` model. A static `docs/index.html` renders the list. Windows Task Scheduler on WIN11-79 runs the workflow monthly.

**Tech Stack:** swamp 20260922, Deno 2.9 (swamp's bundled binary), TypeScript, `npm:zod@4`, `npm:psn-api@2.18.1`, IGDB API v4, `jsr:@std/assert`, `jsr:@swamp-club/swamp-testing`, vanilla HTML/JS.

**Spec:** `docs/superpowers/specs/2026-10-01-monthly-game-list-design.md`. Glossary: `CONTEXT.md`. Read both before starting any task.

## Global Constraints

- All repo text is ASCII. Never write an em dash or en dash, curly quotes or ellipsis characters, in code, comments, logs, commit messages or docs. Use `\u` escapes in regexes for non-ASCII characters.
- Model files import zod as `import { z } from "npm:zod@4";` and pin every npm import with an exact version (`npm:psn-api@2.18.1`). Static imports only.
- Model files live in `extensions/models/*.ts` and export `export const model`. Pure logic lives in `extensions/models/lib/*.ts`. Tests are `*_test.ts` next to the code.
- Run tests with swamp's bundled Deno. In Git Bash: `DENO=~/.swamp/deno/deno.exe` then `$DENO test -A <path>`.
- Vault name: `games`. Vault keys: `psn-npsso`, `psn-refresh-token`, `igdb-client-id`, `igdb-client-secret`.
- Nothing secret in `docs/`, in committed files, in fixtures or in log lines. Never pass a secret on a command line (swamp's audit log records commands); secrets reach models only through `${{ vault.get(...) }}`.
- Store locale `en-NO`. Page UI in English.
- `docs/games.json` shape: `{ "games": GameRecord[] }`, 2-space indent, trailing newline. Machine-owned.
- A run either completes or changes nothing in `docs/`.
- TDD for every lib module: failing test first, watch it fail, minimal code, pass, commit.
- Commit after each task with a message that says why, ending with the session's attribution lines. This is the user's own repo: commit on `main` and push once a remote exists.

## Review Focus

1. **Sony returns an empty or half library** (API hiccup, expired session returning nothing). Expected: the run fails without touching `docs/games.json` rather than marking most games Gone. Pinned in Task 3 (`checkPlausible`).
2. **Refresh token dead after a long gap.** Expected: the run fails at the first step with the exact renewal steps (ssocookie URL, `swamp vault put games psn-npsso`, `swamp workflow run psn-login`). Pinned in Task 7.
3. **IGDB has two games with the same normalised title within a year** (remakes, re-releases). Expected: no match, `?` on the page, never a guess. Pinned in Task 4.
4. **A Game with a null concept ID** (old PS4 titles). Expected: still one row, grouped by title ID, not dropped. Pinned in Task 2.
5. **A Gone game reappears** (refund reversed, re-claimed). Expected: access recalculated, `goneOn` back to null, not counted as added. Pinned in Task 3.

---

## File Structure

```
deno.json                                  test imports (std/assert, swamp-testing)
extensions/models/lib/schemas.ts           zod schemas + inferred types for every record
extensions/models/lib/collapse.ts          entitlements -> LibraryGame[]
extensions/models/lib/merge.ts             idsToFetch, checkPlausible, applyRun
extensions/models/lib/summary.ts           commitMessage
extensions/models/lib/match.ts             normalizeTitle, pickIgdbMatch
extensions/models/lib/igdb_map.ts          IGDB game -> IgdbDetails
extensions/models/lib/store_map.ts         store response -> StoreDetails   (Task 6, after probe)
extensions/models/lib/psn_library.ts       psn-api purchased item -> Entitlement, pagination
extensions/models/lib/igdb_client.ts       IGDB auth + paced POST
extensions/models/fixtures/*.json          sanitized real responses captured in Task 1
extensions/models/psn.ts                   @catjen/psn: login, library, details
extensions/models/igdb.ts                  @catjen/igdb: details
extensions/models/gamelist.ts              @catjen/gamelist: plan, write
workflows/ (created by swamp)              psn-login, monthly-sync
docs/index.html                            the page
docs/games.json                            the list (written by runs)
docs/.nojekyll                             serve files as-is on Pages
scripts/monthly-sync.ps1                   what Task Scheduler runs
```

---

### Task 0: Repo setup and secrets

**Files:**
- Create: `deno.json`
- Create (via swamp): `vaults/local_encryption/<id>.yaml`, models `git` from `@swamp/git`

**Interfaces:**
- Produces: vault `games` holding `psn-npsso`, `igdb-client-id`, `igdb-client-secret`; `deno.json` import map with `@std/assert` and `@swamp-club/swamp-testing`.

- [ ] **Step 1: Create the vault**

Run: `swamp vault create local_encryption games --json`
Expected: JSON with `"name": "games"`. `git status` shows a new file under `vaults/local_encryption/` and nothing under `.swamp/`.

- [ ] **Step 2: User puts the secrets in (the agent never sees them)**

Ask the user to:
1. Log in at https://www.playstation.com, open https://ca.account.sony.com/api/v1/ssocookie and copy the 64-character `npsso` value.
2. Register an app at https://dev.twitch.tv/console/apps (OAuth redirect `http://localhost`, category "Application Integration"), then copy the Client ID and generate a Client Secret.
3. In their own terminal (not through the agent), run `swamp vault put games psn-npsso`, `swamp vault put games igdb-client-id` and `swamp vault put games igdb-client-secret`, entering each value when prompted. First check `swamp help vault put` for whether omitting the value prompts or reads stdin, and tell the user which.

Expected: `swamp vault describe games --json` lists the three keys.

- [ ] **Step 3: Test tooling**

Run (Git Bash, repo root):
```bash
DENO=~/.swamp/deno/deno.exe
$DENO add jsr:@std/assert jsr:@swamp-club/swamp-testing
```
Expected: `deno.json` with both imports pinned to exact versions, plus `deno.lock`.

- [ ] **Step 4: Pull the git extension and create its model**

Run: `swamp extension pull @swamp/git` then `swamp model create @swamp/git git` then `swamp model type describe @swamp/git --json > /c/Project/temp/claude/git-type.json`.
Expected: the describe output lists `commit` and `push` with their argument schemas. Keep the file; Task 10 copies argument names from it.

- [ ] **Step 5: Commit**

```bash
git add deno.json deno.lock vaults/ models/ extensions/ .gitignore
git commit -m "Set up vault, test tooling and the git extension"
```

---

### Task 1: Probe the live APIs and capture fixtures (throwaway code, kept fixtures)

The research left open questions that decide code in later tasks. This task answers them against the real account and saves sanitized responses as test fixtures. The probe model itself is deleted at the end.

**Files:**
- Create then delete: `extensions/models/probe.ts`
- Create: `extensions/models/fixtures/purchased_page.json`, `extensions/models/fixtures/store_concept_*.json`, `extensions/models/fixtures/igdb_*.json`
- Create: `docs/superpowers/specs/2026-10-01-api-findings.md`

**Questions to answer (write each answer into the findings file):**
1. Does `exchangeRefreshTokenForAuthTokens` return a different refresh token, and what is `refreshTokenExpiresIn`?
2. Does the purchased-games list contain DLC, demos or apps? How many items, how many with `conceptId: null`, how many `membership: "PS_PLUS"`?
3. The store request that returns description, release date, age rating, content type (game vs add-on) and online notices for a concept in `en-NO`: URL, operation name, persisted-query hash, whether it needs auth.
4. IGDB: the `external_game_sources` ids whose name contains "PlayStation", what `external_games.uid` holds for them (product ID, title ID or concept ID), and the exact `game_modes` names.

- [ ] **Step 1: Write the probe model**

```typescript
// extensions/models/probe.ts  (THROWAWAY - deleted in Step 6)
import { z } from "npm:zod@4";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getPurchasedGames,
} from "npm:psn-api@2.18.1";

const Out = z.object({ report: z.record(z.string(), z.unknown()) });

async function igdb(clientId: string, token: string, endpoint: string, body: string) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}` },
    body,
  });
  return await res.json();
}

export const model = {
  type: "@catjen/probe",
  version: "2026.10.01.1",
  globalArguments: z.object({}),
  resources: {
    report: { description: "probe output", schema: Out, lifetime: "infinite", garbageCollection: 3 },
  },
  methods: {
    run: {
      description: "Capture live API shapes. No secrets in the output.",
      arguments: z.object({ npsso: z.string(), igdbId: z.string(), igdbSecret: z.string() }),
      execute: async (args: { npsso: string; igdbId: string; igdbSecret: string }, context: any) => {
        const code = await exchangeNpssoForAccessCode(args.npsso);
        const first = await exchangeAccessCodeForAuthTokens(code);
        const second = await exchangeRefreshTokenForAuthTokens(first.refreshToken);
        const page = await getPurchasedGames(first, { size: 500, start: 0 });
        const items = page.data.purchasedTitlesRetrieve.games;

        const tw = await (await fetch(
          `https://id.twitch.tv/oauth2/token?client_id=${args.igdbId}&client_secret=${args.igdbSecret}&grant_type=client_credentials`,
          { method: "POST" },
        )).json();
        const sources = await igdb(args.igdbId, tw.access_token, "external_game_sources", 'fields id,name; where name ~ *"PlayStation"*; limit 50;');
        const modes = await igdb(args.igdbId, tw.access_token, "game_modes", "fields id,name; limit 50;");
        const sample = items.slice(0, 5);
        const uids = sample.flatMap((g: any) => [g.productId, g.titleId, g.conceptId]).filter(Boolean);
        const ext = await igdb(args.igdbId, tw.access_token, "external_games",
          `fields game,uid,external_game_source; where uid = (${uids.map((u: string) => `"${u}"`).join(",")}); limit 50;`);

        const report = {
          refreshRotates: first.refreshToken !== second.refreshToken,
          refreshTokenExpiresIn: [first.refreshTokenExpiresIn, second.refreshTokenExpiresIn],
          purchasedCount: items.length,
          nullConcept: items.filter((g: any) => !g.conceptId).length,
          psPlus: items.filter((g: any) => g.membership === "PS_PLUS").length,
          purchasedItems: items,
          igdbSources: sources,
          igdbModes: modes,
          igdbExternalForSample: ext,
        };
        const handle = await context.writeResource("report", "report", { report });
        return { dataHandles: [handle] };
      },
    },
  },
};
```

- [ ] **Step 2: Run it through a one-off workflow so secrets come from the vault**

Run `swamp workflow create probe`, then edit the created file under `workflows/` so its jobs are:
```yaml
jobs:
  - name: probe
    steps:
      - name: run
        task:
          type: model_method
          modelIdOrName: probe
          methodName: run
          inputs:
            npsso: ${{ vault.get("games", "psn-npsso") }}
            igdbId: ${{ vault.get("games", "igdb-client-id") }}
            igdbSecret: ${{ vault.get("games", "igdb-client-secret") }}
```
Run: `swamp model create @catjen/probe probe`, `swamp workflow validate probe --json`, `swamp workflow run probe --json`.
Expected: success. If it fails, read `swamp report get @swamp/workflow-summary --workflow probe --json` before changing anything.

- [ ] **Step 3: Extract fixtures**

Run: `swamp data get probe report --json > /c/Project/temp/claude/probe.json`. From it write:
- `extensions/models/fixtures/purchased_page.json`: the first 30 `purchasedItems`, keeping every field, plus any DLC/app/null-concept items found beyond 30.
- `extensions/models/fixtures/igdb_sources.json`, `igdb_modes.json`, `igdb_external_sample.json`: as returned.

Check: `grep -ri "token\|npsso\|secret" extensions/models/fixtures/` returns nothing.

- [ ] **Step 4: Capture the store request in the browser**

Use the claude-in-chrome tools: open `https://store.playstation.com/en-no/concept/<conceptId>` for three concepts from the fixture (one PS5 game, one PS4-only game, one PS Plus claim). Read the network requests (`read_network_requests`, filter `graphql`). Find the request whose response holds the description, release date, content rating and the add-on/full-game classification. Record the URL, `operationName`, `variables`, `extensions.persistedQuery.sha256Hash` and request headers. Replay it with `curl` from Git Bash without cookies to check whether it needs auth. Save each response as `extensions/models/fixtures/store_concept_<conceptId>.json`. Also save one response for an add-on concept if the library has one.

- [ ] **Step 5: Write the findings file**

Write `docs/superpowers/specs/2026-10-01-api-findings.md` answering questions 1 to 4 with the evidence (counts, field names, the store request recipe). Then amend this plan:
- Task 6: replace the "write after probe" block with the real mapper code and tests against the saved store fixtures.
- Task 4/8: if `uid` turns out to be one specific ID type, note it; the code already tries product ID, title ID and concept ID.
- Spec: update the refresh-token open point with the answer.

- [ ] **Step 6: Delete the probe and commit**

```bash
swamp model delete probe
swamp workflow delete probe
rm extensions/models/probe.ts
```
Run each of these three as its own command, never chained (the probe file was never committed, so a plain `rm` is enough). Confirm with `swamp help model delete` and `swamp help workflow delete` first.
```bash
git add extensions/models/fixtures docs/superpowers
git commit -m "Capture live PSN, store and IGDB shapes as fixtures"
```

---

### Task 2: Schemas and entitlement collapsing

**Files:**
- Create: `extensions/models/lib/schemas.ts`
- Create: `extensions/models/lib/collapse.ts`
- Test: `extensions/models/lib/collapse_test.ts`

**Interfaces:**
- Produces (schemas.ts): `EntitlementSchema`, `LibraryGameSchema`, `StoreDetailsSchema`, `IgdbDetailsSchema`, `GameRecordSchema`, `GameListSchema` and types `Entitlement`, `LibraryGame`, `StoreDetails`, `IgdbDetails`, `GameRecord`, `Access`.
- Produces (collapse.ts): `cleanTitle(name: string): string`, `collapseEntitlements(e: Entitlement[]): LibraryGame[]`.

- [ ] **Step 1: Write schemas.ts (types only, no logic to test)**

```typescript
// extensions/models/lib/schemas.ts
import { z } from "npm:zod@4";

export const EntitlementSchema = z.object({
  conceptId: z.string().nullable(),
  entitlementId: z.string(),
  productId: z.string(),
  titleId: z.string(),
  name: z.string(),
  platform: z.string(),
  membership: z.enum(["NONE", "PS_PLUS"]),
  imageUrl: z.string().nullable(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;

export const LibraryGameSchema = z.object({
  id: z.string(),
  conceptId: z.string().nullable(),
  title: z.string(),
  platforms: z.array(z.string()),
  access: z.enum(["owned", "claimed"]),
  productIds: z.array(z.string()),
  titleIds: z.array(z.string()),
  imageUrl: z.string().nullable(),
});
export type LibraryGame = z.infer<typeof LibraryGameSchema>;

export const StoreDetailsSchema = z.object({
  id: z.string(),
  kind: z.enum(["game", "other"]),
  description: z.string().nullable(),
  releaseYear: z.number().int().nullable(),
  ageRating: z.string().nullable(),
  onlineRequired: z.boolean().nullable(),
  coverUrl: z.string().nullable(),
});
export type StoreDetails = z.infer<typeof StoreDetailsSchema>;

export const IgdbDetailsSchema = z.object({
  id: z.string(),
  soloStory: z.boolean().nullable(),
  couchCoop: z.boolean().nullable(),
  couchCoopMax: z.number().int().nullable(),
  couchVersus: z.boolean().nullable(),
  couchVersusMax: z.number().int().nullable(),
  splitScreen: z.boolean().nullable(),
  onlineCoop: z.boolean().nullable(),
  onlineCoopMax: z.number().int().nullable(),
  onlineVersus: z.boolean().nullable(),
  onlineVersusMax: z.number().int().nullable(),
  genres: z.array(z.string()).nullable(),
  igdbId: z.number().int().nullable(),
  matchedBy: z.enum(["psn-id", "title-year"]).nullable(),
});
export type IgdbDetails = z.infer<typeof IgdbDetailsSchema>;

export const GameRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  platforms: z.array(z.string()),
  access: z.enum(["owned", "claimed", "gone"]),
  addedOn: z.string(),
  goneOn: z.string().nullable(),
  ...StoreDetailsSchema.omit({ id: true, kind: true }).shape,
  ...IgdbDetailsSchema.omit({ id: true }).shape,
});
export type GameRecord = z.infer<typeof GameRecordSchema>;
export type Access = GameRecord["access"];

export const GameListSchema = z.object({ games: z.array(GameRecordSchema) });
```

- [ ] **Step 2: Write the failing tests**

```typescript
// extensions/models/lib/collapse_test.ts
import { assertEquals } from "@std/assert";
import { cleanTitle, collapseEntitlements } from "./collapse.ts";
import type { Entitlement } from "./schemas.ts";

function ent(over: Partial<Entitlement>): Entitlement {
  return {
    conceptId: "100", entitlementId: "E1", productId: "P1", titleId: "CUSA00001_00",
    name: "Game", platform: "PS4", membership: "NONE", imageUrl: null, ...over,
  };
}

Deno.test("PS4 and PS5 entitlements of one concept become one game on both platforms", () => {
  const games = collapseEntitlements([
    ent({ platform: "PS5", productId: "P5", titleId: "PPSA00001_00" }),
    ent({ platform: "PS4" }),
  ]);
  assertEquals(games.length, 1);
  assertEquals(games[0].id, "concept:100");
  assertEquals(games[0].platforms, ["PS4", "PS5"]);
  assertEquals(games[0].productIds, ["P5", "P1"]);
});

Deno.test("an edition collapses into the base game and the shortest title wins", () => {
  const games = collapseEntitlements([
    ent({ name: "Horizon Zero Dawn Complete Edition" }),
    ent({ name: "Horizon Zero Dawn", entitlementId: "E2" }),
  ]);
  assertEquals(games[0].title, "Horizon Zero Dawn");
});

Deno.test("one bought entitlement makes the game owned", () => {
  const games = collapseEntitlements([
    ent({ membership: "PS_PLUS", platform: "PS4" }),
    ent({ membership: "NONE", platform: "PS5" }),
  ]);
  assertEquals(games[0].access, "owned");
});

Deno.test("only PS Plus entitlements make the game claimed", () => {
  const games = collapseEntitlements([ent({ membership: "PS_PLUS" })]);
  assertEquals(games[0].access, "claimed");
});

Deno.test("a null concept id groups by title id instead of being dropped", () => {
  const games = collapseEntitlements([
    ent({ conceptId: null, titleId: "CUSA09999_00", name: "Old Game" }),
    ent({ conceptId: null, titleId: "CUSA08888_00", name: "Other Old Game" }),
  ]);
  assertEquals(games.map((g) => g.id), ["title:CUSA09999_00", "title:CUSA08888_00"]);
  assertEquals(games[0].conceptId, null);
});

Deno.test("trademark signs are stripped from titles", () => {
  assertEquals(cleanTitle("Rocket League\u00AE"), "Rocket League");
  assertEquals(cleanTitle("Horizon\u2122  Zero Dawn"), "Horizon Zero Dawn");
});

Deno.test("Sony's order (newest activation first) is preserved", () => {
  const games = collapseEntitlements([
    ent({ conceptId: "2", name: "Newer" }),
    ent({ conceptId: "1", name: "Older" }),
    ent({ conceptId: "2", name: "Newer", platform: "PS5" }),
  ]);
  assertEquals(games.map((g) => g.title), ["Newer", "Older"]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `$DENO test -A extensions/models/lib/collapse_test.ts`
Expected: FAIL, module `./collapse.ts` not found.

- [ ] **Step 4: Implement**

```typescript
// extensions/models/lib/collapse.ts
import type { Entitlement, LibraryGame } from "./schemas.ts";

const MARKS = /[\u00AE\u2122\u00A9]/g;

export function cleanTitle(name: string): string {
  return name.replace(MARKS, "").replace(/\s+/g, " ").trim();
}

export function collapseEntitlements(entitlements: Entitlement[]): LibraryGame[] {
  const groups = new Map<string, Entitlement[]>();
  for (const e of entitlements) {
    const key = e.conceptId ? `concept:${e.conceptId}` : `title:${e.titleId}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()].map(([id, ents]) => ({
    id,
    conceptId: ents[0].conceptId,
    title: ents.map((e) => cleanTitle(e.name)).reduce((a, b) => (b.length < a.length ? b : a)),
    platforms: [...new Set(ents.map((e) => e.platform))].sort(),
    access: ents.some((e) => e.membership === "NONE") ? "owned" : "claimed",
    productIds: ents.map((e) => e.productId),
    titleIds: ents.map((e) => e.titleId),
    imageUrl: ents.find((e) => e.imageUrl)?.imageUrl ?? null,
  }));
}
```

- [ ] **Step 5: Run to verify pass**

Run: `$DENO test -A extensions/models/lib/collapse_test.ts`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add extensions/models/lib/schemas.ts extensions/models/lib/collapse.ts extensions/models/lib/collapse_test.ts
git commit -m "Collapse PSN entitlements into one game per concept"
```

---

### Task 3: Merge rules and commit summary

**Files:**
- Create: `extensions/models/lib/merge.ts`, `extensions/models/lib/summary.ts`
- Test: `extensions/models/lib/merge_test.ts`, `extensions/models/lib/summary_test.ts`

**Interfaces:**
- Consumes: types from `schemas.ts` (Task 2).
- Produces: `type Mode = "new" | "rebuild"`, `idsToFetch(existing: GameRecord[], library: LibraryGame[], mode: Mode): string[]`, `checkPlausible(existing: GameRecord[], library: LibraryGame[]): void` (throws), `applyRun(a: { existing: GameRecord[]; library: LibraryGame[]; store: StoreDetails[]; igdb: IgdbDetails[]; today: string }): { games: GameRecord[]; added: string[]; updated: string[]; gone: string[] }`, `commitMessage(added: number, updated: number, gone: number): string | null`.

- [ ] **Step 1: Write the failing merge tests**

```typescript
// extensions/models/lib/merge_test.ts
import { assertEquals, assertThrows } from "@std/assert";
import { applyRun, checkPlausible, idsToFetch } from "./merge.ts";
import type { GameRecord, IgdbDetails, LibraryGame, StoreDetails } from "./schemas.ts";

const TODAY = "2026-11-01";

function lib(id: string, over: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id, conceptId: id.replace("concept:", ""), title: `Game ${id}`, platforms: ["PS5"],
    access: "owned", productIds: [`P-${id}`], titleIds: [`T-${id}`], imageUrl: "https://img/x.png", ...over,
  };
}
function store(id: string, over: Partial<StoreDetails> = {}): StoreDetails {
  return {
    id, kind: "game", description: "desc", releaseYear: 2021, ageRating: "PEGI 12",
    onlineRequired: false, coverUrl: "https://img/cover.png", ...over,
  };
}
function igdb(id: string, over: Partial<IgdbDetails> = {}): IgdbDetails {
  return {
    id, soloStory: true, couchCoop: true, couchCoopMax: 2, couchVersus: null, couchVersusMax: null,
    splitScreen: true, onlineCoop: true, onlineCoopMax: 2, onlineVersus: null, onlineVersusMax: null,
    genres: ["Adventure"], igdbId: 1, matchedBy: "psn-id", ...over,
  };
}
function record(id: string, over: Partial<GameRecord> = {}): GameRecord {
  const { id: _s, kind: _k, ...s } = store(id);
  const { id: _i, ...g } = igdb(id);
  return { id, title: `Game ${id}`, platforms: ["PS5"], access: "owned", addedOn: "2026-10-01", goneOn: null, ...s, ...g, ...over };
}

Deno.test("new mode fetches only games not in the list", () => {
  assertEquals(idsToFetch([record("concept:1")], [lib("concept:1"), lib("concept:2")], "new"), ["concept:2"]);
});

Deno.test("rebuild mode fetches every game in the library", () => {
  assertEquals(idsToFetch([record("concept:1")], [lib("concept:1"), lib("concept:2")], "rebuild"), ["concept:1", "concept:2"]);
});

Deno.test("a new game is added with today's date and its details", () => {
  const r = applyRun({ existing: [], library: [lib("concept:1")], store: [store("concept:1")], igdb: [igdb("concept:1")], today: TODAY });
  assertEquals(r.added, ["concept:1"]);
  assertEquals(r.games[0].addedOn, TODAY);
  assertEquals(r.games[0].couchCoop, true);
  assertEquals(r.games[0].ageRating, "PEGI 12");
});

Deno.test("a new game whose lookups failed is still added, with unknown details", () => {
  const r = applyRun({ existing: [], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals(r.added, ["concept:1"]);
  assertEquals(r.games[0].description, null);
  assertEquals(r.games[0].couchCoop, null);
  assertEquals(r.games[0].genres, null);
  assertEquals(r.games[0].coverUrl, "https://img/x.png");
});

Deno.test("an item the store classifies as not a game is left out", () => {
  const r = applyRun({ existing: [], library: [lib("concept:9")], store: [store("concept:9", { kind: "other" })], igdb: [], today: TODAY });
  assertEquals(r.games, []);
  assertEquals(r.added, []);
});

Deno.test("a claimed game bought later becomes owned and counts as updated", () => {
  const r = applyRun({ existing: [record("concept:1", { access: "claimed" })], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].access, "owned");
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("an unchanged existing game is neither added nor updated", () => {
  const r = applyRun({ existing: [record("concept:1")], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals([r.added, r.updated, r.gone], [[], [], []]);
});

Deno.test("a game missing from the library is marked gone with today's date", () => {
  const r = applyRun({ existing: [record("concept:1")], library: [], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].access, "gone");
  assertEquals(r.games[0].goneOn, TODAY);
  assertEquals(r.gone, ["concept:1"]);
});

Deno.test("an already gone game keeps its original gone date", () => {
  const old = record("concept:1", { access: "gone", goneOn: "2026-10-01" });
  const r = applyRun({ existing: [old], library: [], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].goneOn, "2026-10-01");
  assertEquals(r.gone, []);
});

Deno.test("a gone game that reappears gets its access back and no gone date", () => {
  const old = record("concept:1", { access: "gone", goneOn: "2026-10-01" });
  const r = applyRun({ existing: [old], library: [lib("concept:1", { access: "claimed" })], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].access, "claimed");
  assertEquals(r.games[0].goneOn, null);
  assertEquals(r.added, []);
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("a rebuild keeps previous details when a lookup failed", () => {
  const old = record("concept:1", { description: "kept", couchCoop: true });
  const r = applyRun({ existing: [old], library: [lib("concept:1")], store: [], igdb: [], today: TODAY });
  assertEquals(r.games[0].description, "kept");
  assertEquals(r.games[0].couchCoop, true);
});

Deno.test("a rebuild overwrites details when the lookup succeeded", () => {
  const old = record("concept:1", { description: "old" });
  const r = applyRun({ existing: [old], library: [lib("concept:1")], store: [store("concept:1", { description: "new" })], igdb: [], today: TODAY });
  assertEquals(r.games[0].description, "new");
  assertEquals(r.updated, ["concept:1"]);
});

Deno.test("games are ordered newest added first, keeping Sony's order within a date", () => {
  const r = applyRun({
    existing: [record("concept:1", { addedOn: "2026-10-01" })],
    library: [lib("concept:3"), lib("concept:2"), lib("concept:1")],
    store: [], igdb: [], today: TODAY,
  });
  assertEquals(r.games.map((g) => g.id), ["concept:3", "concept:2", "concept:1"]);
});

Deno.test("an empty library is refused when the list has games", () => {
  assertThrows(() => checkPlausible([record("concept:1")], []), Error, "empty library");
});

Deno.test("a library missing more than half of ten or more listed games is refused", () => {
  const existing = Array.from({ length: 10 }, (_, i) => record(`concept:${i}`));
  const library = [lib("concept:0"), lib("concept:1"), lib("concept:2"), lib("concept:3")];
  assertThrows(() => checkPlausible(existing, library), Error, "refusing");
});

Deno.test("a normal monthly change passes the plausibility check", () => {
  const existing = Array.from({ length: 10 }, (_, i) => record(`concept:${i}`));
  const library = existing.slice(1).map((g) => lib(g.id));
  checkPlausible(existing, library);
});

Deno.test("the first run with an empty list passes the plausibility check", () => {
  checkPlausible([], [lib("concept:1")]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `$DENO test -A extensions/models/lib/merge_test.ts`
Expected: FAIL, `./merge.ts` not found.

- [ ] **Step 3: Implement**

```typescript
// extensions/models/lib/merge.ts
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
    id: lib.id, title: lib.title, platforms: lib.platforms, access: lib.access,
    addedOn: today, goneOn: null,
    description: null, releaseYear: null, ageRating: null, onlineRequired: null, coverUrl: lib.imageUrl,
    soloStory: null, couchCoop: null, couchCoopMax: null, couchVersus: null, couchVersusMax: null,
    splitScreen: null, onlineCoop: null, onlineCoopMax: null, onlineVersus: null, onlineVersusMax: null,
    genres: null, igdbId: null, matchedBy: null,
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
```

- [ ] **Step 4: Run to verify pass**

Run: `$DENO test -A extensions/models/lib/merge_test.ts`
Expected: 17 passed.

- [ ] **Step 5: Write the failing summary tests**

```typescript
// extensions/models/lib/summary_test.ts
import { assertEquals } from "@std/assert";
import { commitMessage } from "./summary.ts";

Deno.test("no changes means no commit", () => {
  assertEquals(commitMessage(0, 0, 0), null);
});
Deno.test("one added game is singular", () => {
  assertEquals(commitMessage(1, 0, 0), "Add 1 game");
});
Deno.test("all three kinds of change are listed", () => {
  assertEquals(commitMessage(3, 1, 2), "Add 3 games, update 1, mark 2 gone");
});
Deno.test("updates alone are described", () => {
  assertEquals(commitMessage(0, 4, 0), "Update 4 games");
});
```

- [ ] **Step 6: Run to verify failure**

Run: `$DENO test -A extensions/models/lib/summary_test.ts`
Expected: FAIL, `./summary.ts` not found.

- [ ] **Step 7: Implement**

```typescript
// extensions/models/lib/summary.ts
const games = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

export function commitMessage(added: number, updated: number, gone: number): string | null {
  const parts: string[] = [];
  if (added) parts.push(`Add ${games(added)}`);
  if (updated) parts.push(parts.length ? `update ${updated}` : `Update ${games(updated)}`);
  if (gone) parts.push(parts.length ? `mark ${gone} gone` : `Mark ${games(gone)} gone`);
  return parts.length ? parts.join(", ") : null;
}
```

- [ ] **Step 8: Run to verify pass, then commit**

Run: `$DENO test -A extensions/models/lib/`
Expected: all pass.
```bash
git add extensions/models/lib/merge.ts extensions/models/lib/merge_test.ts extensions/models/lib/summary.ts extensions/models/lib/summary_test.ts
git commit -m "Merge rules: account facts refresh, gone games, rebuild keeps old values"
```

---

### Task 4: Title normalisation and IGDB match selection

**Files:**
- Create: `extensions/models/lib/match.ts`
- Test: `extensions/models/lib/match_test.ts`

**Interfaces:**
- Produces: `interface IgdbGame { id: number; name: string; first_release_date?: number; genres?: { name: string }[]; game_modes?: { name: string }[]; multiplayer_modes?: IgdbMultiplayerMode[]; external_games?: { uid?: string; external_game_source?: number }[] }`, `interface IgdbMultiplayerMode { platform?: number; offlinecoop?: boolean; offlinecoopmax?: number; offlinemax?: number; onlinecoop?: boolean; onlinecoopmax?: number; onlinemax?: number; splitscreen?: boolean }`, `type IgdbMatch = { game: IgdbGame; matchedBy: "psn-id" | "title-year" }`, `normalizeTitle(t: string): string`, `pickIgdbMatch(candidates: IgdbGame[], q: { title: string; releaseYear: number | null; psnUids: string[]; psnSourceIds: number[] }): IgdbMatch | null`.

- [ ] **Step 1: Write the failing tests**

```typescript
// extensions/models/lib/match_test.ts
import { assertEquals } from "@std/assert";
import { type IgdbGame, normalizeTitle, pickIgdbMatch } from "./match.ts";

const y = (year: number) => Date.UTC(year, 5, 1) / 1000;
const q = { title: "Doom", releaseYear: 2016, psnUids: ["EP1-CUSA02092_00-DOOM"], psnSourceIds: [36] };

Deno.test("edition names, platforms and trademark signs normalise away", () => {
  assertEquals(normalizeTitle("Horizon Zero Dawn\u2122 Complete Edition"), "horizon zero dawn");
  assertEquals(normalizeTitle("It Takes Two PS4 & PS5"), "it takes two");
  assertEquals(normalizeTitle("God of War Ragnar\u00F6k Digital Deluxe Edition"), "god of war ragnarok");
  assertEquals(normalizeTitle("Marvel's Spider-Man: Miles Morales"), "marvel s spider man miles morales");
});

Deno.test("a PSN id link wins over a title match", () => {
  const linked: IgdbGame = { id: 1, name: "DOOM (2016)", external_games: [{ uid: "EP1-CUSA02092_00-DOOM", external_game_source: 36 }] };
  const sameName: IgdbGame = { id: 2, name: "Doom", first_release_date: y(2016) };
  assertEquals(pickIgdbMatch([sameName, linked], q), { game: linked, matchedBy: "psn-id" });
});

Deno.test("a PSN id link from another source does not count", () => {
  const other: IgdbGame = { id: 1, name: "Something", external_games: [{ uid: "EP1-CUSA02092_00-DOOM", external_game_source: 1 }] };
  assertEquals(pickIgdbMatch([other], q), null);
});

Deno.test("title and year within one match", () => {
  const g: IgdbGame = { id: 2, name: "DOOM", first_release_date: y(2017) };
  assertEquals(pickIgdbMatch([g], q), { game: g, matchedBy: "title-year" });
});

Deno.test("a year two off does not match", () => {
  assertEquals(pickIgdbMatch([{ id: 3, name: "Doom", first_release_date: y(1993) }], q), null);
});

Deno.test("two equal titles within the year window is ambiguous and gives no match", () => {
  const a: IgdbGame = { id: 4, name: "Doom", first_release_date: y(2016) };
  const b: IgdbGame = { id: 5, name: "Doom", first_release_date: y(2017) };
  assertEquals(pickIgdbMatch([a, b], q), null);
});

Deno.test("without a release year only a PSN id link can match", () => {
  const g: IgdbGame = { id: 2, name: "Doom", first_release_date: y(2016) };
  assertEquals(pickIgdbMatch([g], { ...q, releaseYear: null }), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `$DENO test -A extensions/models/lib/match_test.ts`
Expected: FAIL, `./match.ts` not found.

- [ ] **Step 3: Implement**

```typescript
// extensions/models/lib/match.ts
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
  first_release_date?: number;
  genres?: { name: string }[];
  game_modes?: { name: string }[];
  multiplayer_modes?: IgdbMultiplayerMode[];
  external_games?: { uid?: string; external_game_source?: number }[];
}

export type IgdbMatch = { game: IgdbGame; matchedBy: "psn-id" | "title-year" };

const EDITION =
  /\b(?:digital\s+)?(?:deluxe|gold|ultimate|complete|standard|definitive|special|anniversary|game of the year|goty|premium|launch|cross-gen|digital)\s+edition\b/g;
const PLATFORMS = /\(?\bps[45](?:\s*(?:&|and|\/)\s*ps[45])?\b\)?/g;

export function normalizeTitle(t: string): string {
  // Marks go first: NFKD would turn the trademark sign into the letters "TM".
  return t
    .replace(/[\u00AE\u2122\u00A9]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
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
  if (q.releaseYear === null) return null;
  const want = normalizeTitle(q.title);
  const hits = candidates.filter((c) =>
    normalizeTitle(c.name) === want && c.first_release_date !== undefined &&
    Math.abs(yearOf(c.first_release_date) - q.releaseYear!) <= 1
  );
  return hits.length === 1 ? { game: hits[0], matchedBy: "title-year" } : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `$DENO test -A extensions/models/lib/match_test.ts`
Expected: 7 passed. If the `Marvel's` case fails because `'` became something else, fix the regex, not the test.

- [ ] **Step 5: Commit**

```bash
git add extensions/models/lib/match.ts extensions/models/lib/match_test.ts
git commit -m "Match IGDB games by PSN id, then exact title and year, never a guess"
```

---

### Task 5: IGDB game to game details

**Files:**
- Create: `extensions/models/lib/igdb_map.ts`
- Test: `extensions/models/lib/igdb_map_test.ts`

**Interfaces:**
- Consumes: `IgdbGame`, `IgdbMatch` (Task 4), `IgdbDetails` (Task 2).
- Produces: `mapIgdb(id: string, match: IgdbMatch | null): IgdbDetails`, constants `PS5 = 167`, `PS4 = 48`.

Rules (from the spec's co-op/versus split): co-op comes straight from IGDB's coop flags. Versus is inferred from the max-player count: fewer than 2 means false, 2 or more with co-op explicitly false means true, 2 or more with co-op true or unknown means unknown (IGDB cannot tell them apart). A game whose `game_modes` are known and include no multiplayer mode gets `false` everywhere instead of unknown.

- [ ] **Step 1: Write the failing tests**

```typescript
// extensions/models/lib/igdb_map_test.ts
import { assertEquals } from "@std/assert";
import { mapIgdb, PS4, PS5 } from "./igdb_map.ts";
import type { IgdbGame } from "./match.ts";

const m = (game: IgdbGame) => mapIgdb("concept:1", { game, matchedBy: "psn-id" });

Deno.test("no match gives unknown everywhere", () => {
  const d = mapIgdb("concept:1", null);
  assertEquals([d.couchCoop, d.soloStory, d.genres, d.igdbId, d.matchedBy], [null, null, null, null, null]);
});

Deno.test("a co-op game: couch co-op with max, versus unknown", () => {
  const d = m({
    id: 7, name: "It Takes Two", game_modes: [{ name: "Multiplayer" }, { name: "Co-operative" }],
    multiplayer_modes: [{ platform: PS5, offlinecoop: true, offlinecoopmax: 2, offlinemax: 2, onlinecoop: true, onlinecoopmax: 2, onlinemax: 2, splitscreen: true }],
  });
  assertEquals([d.couchCoop, d.couchCoopMax, d.couchVersus, d.couchVersusMax], [true, 2, null, null]);
  assertEquals([d.onlineCoop, d.onlineCoopMax, d.splitScreen], [true, 2, true]);
  assertEquals(d.soloStory, false);
  assertEquals([d.igdbId, d.matchedBy], [7, "psn-id"]);
});

Deno.test("a versus game: couch versus with max, no couch co-op", () => {
  const d = m({
    id: 8, name: "EA FC", game_modes: [{ name: "Single player" }, { name: "Multiplayer" }],
    multiplayer_modes: [{ platform: PS5, offlinecoop: false, offlinemax: 4, onlinecoop: false, onlinemax: 22 }],
  });
  assertEquals([d.couchCoop, d.couchCoopMax, d.couchVersus, d.couchVersusMax], [false, null, true, 4]);
  assertEquals([d.onlineVersus, d.onlineVersusMax], [true, 22]);
  assertEquals(d.soloStory, true);
});

Deno.test("a single-player-only game is false everywhere, not unknown", () => {
  const d = m({ id: 9, name: "God of War", game_modes: [{ name: "Single player" }] });
  assertEquals([d.soloStory, d.couchCoop, d.couchVersus, d.onlineCoop, d.onlineVersus, d.splitScreen], [true, false, false, false, false, false]);
});

Deno.test("unknown game modes and no multiplayer data stay unknown", () => {
  const d = m({ id: 10, name: "Obscure" });
  assertEquals([d.soloStory, d.couchCoop, d.onlineCoop], [null, null, null]);
});

Deno.test("PS5 multiplayer data is preferred over PS4 and other platforms", () => {
  const d = m({
    id: 11, name: "X", game_modes: [{ name: "Multiplayer" }],
    multiplayer_modes: [
      { platform: 6, offlinecoop: false, offlinemax: 8 },
      { platform: PS4, offlinecoop: true, offlinecoopmax: 2 },
      { platform: PS5, offlinecoop: true, offlinecoopmax: 4 },
    ],
  });
  assertEquals(d.couchCoopMax, 4);
});

Deno.test("genres are mapped to their names", () => {
  assertEquals(m({ id: 12, name: "X", genres: [{ name: "Adventure" }, { name: "Platform" }] }).genres, ["Adventure", "Platform"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `$DENO test -A extensions/models/lib/igdb_map_test.ts`
Expected: FAIL, `./igdb_map.ts` not found.

- [ ] **Step 3: Implement**

```typescript
// extensions/models/lib/igdb_map.ts
import type { IgdbDetails } from "./schemas.ts";
import type { IgdbMatch, IgdbMultiplayerMode } from "./match.ts";

export const PS5 = 167;
export const PS4 = 48;

const MULTIPLAYER_MODES = ["Multiplayer", "Co-operative", "Split screen", "Massively Multiplayer Online (MMO)", "Battle Royale"];

function pickMode(modes: IgdbMultiplayerMode[] | undefined): IgdbMultiplayerMode | undefined {
  if (!modes?.length) return undefined;
  return modes.find((x) => x.platform === PS5) ?? modes.find((x) => x.platform === PS4) ?? modes[0];
}

function together(coop: boolean | undefined, coopMax: number | undefined, anyMax: number | undefined) {
  const c = coop ?? null;
  let versus: boolean | null = null;
  if (anyMax !== undefined) versus = anyMax < 2 ? false : coop === false ? true : null;
  return {
    coop: c,
    coopMax: c ? coopMax ?? null : null,
    versus,
    versusMax: versus ? anyMax! : null,
  };
}

export function mapIgdb(id: string, match: IgdbMatch | null): IgdbDetails {
  const unknown: IgdbDetails = {
    id, soloStory: null, couchCoop: null, couchCoopMax: null, couchVersus: null, couchVersusMax: null,
    splitScreen: null, onlineCoop: null, onlineCoopMax: null, onlineVersus: null, onlineVersusMax: null,
    genres: null, igdbId: null, matchedBy: null,
  };
  if (!match) return unknown;
  const g = match.game;
  const modeNames = g.game_modes?.map((x) => x.name);
  const base: IgdbDetails = {
    ...unknown,
    soloStory: modeNames ? modeNames.includes("Single player") : null,
    genres: g.genres ? g.genres.map((x) => x.name) : null,
    igdbId: g.id,
    matchedBy: match.matchedBy,
  };
  const mm = pickMode(g.multiplayer_modes);
  if (!mm) {
    const solo = modeNames !== undefined && !modeNames.some((n) => MULTIPLAYER_MODES.includes(n));
    if (!solo) return base;
    return {
      ...base, couchCoop: false, couchVersus: false, splitScreen: false, onlineCoop: false, onlineVersus: false,
    };
  }
  const couch = together(mm.offlinecoop, mm.offlinecoopmax, mm.offlinemax);
  const online = together(mm.onlinecoop, mm.onlinecoopmax, mm.onlinemax);
  return {
    ...base,
    couchCoop: couch.coop, couchCoopMax: couch.coopMax, couchVersus: couch.versus, couchVersusMax: couch.versusMax,
    splitScreen: mm.splitscreen ?? null,
    onlineCoop: online.coop, onlineCoopMax: online.coopMax, onlineVersus: online.versus, onlineVersusMax: online.versusMax,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `$DENO test -A extensions/models/lib/igdb_map_test.ts`
Expected: 7 passed. If the probe's `igdb_modes.json` shows different mode names than `MULTIPLAYER_MODES` or `"Single player"`, fix the constants to the fixture's exact names and keep the tests' names in step.

- [ ] **Step 5: Commit**

```bash
git add extensions/models/lib/igdb_map.ts extensions/models/lib/igdb_map_test.ts
git commit -m "Map IGDB modes onto couch and online co-op and versus"
```

---

### Task 6: Store response to store details (written after Task 1)

**Files:**
- Create: `extensions/models/lib/store_map.ts`, `extensions/models/lib/store_client.ts`
- Test: `extensions/models/lib/store_map_test.ts`

**Interfaces:**
- Consumes: `StoreDetails` (Task 2), fixtures `extensions/models/fixtures/store_concept_*.json` (Task 1).
- Produces: `mapStore(id: string, response: unknown): StoreDetails` and `fetchStore(conceptId: string, locale: string): Promise<unknown>` (the raw store response; throws on a non-2xx status).

CHECKPOINT: this task's test and implementation code is written into this plan at the end of Task 1, Step 5, from the captured fixtures, because the store API's shape is undocumented and was not known when the plan was written. Do not start Task 6 until that amendment exists. The amended task must pin, each in its own test against a real fixture:
1. description is the store's short description as plain text (HTML tags stripped);
2. `releaseYear` from the release date;
3. `ageRating` as `"PEGI <n>"`;
4. `kind: "other"` for an add-on/DLC/app fixture, `"game"` for a full game;
5. `onlineRequired: true` only when the store states online play is required, `null` when it says nothing;
6. `coverUrl` picks the store's cover/master art image;
7. a response missing a field gives `null` for that field, not an exception.

`fetchStore` uses the request recipe from the findings file (URL, operation name, hash, headers) with `locale` `en-NO`, and is called through an injectable `fetch` (`fetchFn: typeof fetch = fetch`) so model tests can stub it.

---

### Task 7: The psn model

**Files:**
- Create: `extensions/models/lib/psn_library.ts`, `extensions/models/psn.ts`
- Test: `extensions/models/lib/psn_library_test.ts`, `extensions/models/psn_test.ts`

**Interfaces:**
- Consumes: `collapseEntitlements` (Task 2), `mapStore`, `fetchStore` (Task 6), schemas.
- Produces: model type `@catjen/psn` with methods `login({ npsso })`, `library({ refreshToken })` writing data `library` = `{ games: LibraryGame[] }`, `details({ ids, games })` writing data `store` = `{ details: StoreDetails[] }`; resource `auth` with the refresh token stored in vault `games` key `psn-refresh-token`. Exported `RENEW_STEPS: string`.

- [ ] **Step 1: Failing test for the purchased-item mapping (fixture-based)**

```typescript
// extensions/models/lib/psn_library_test.ts
import { assertEquals } from "@std/assert";
import { fetchAllEntitlements, toEntitlement } from "./psn_library.ts";

const rocketLeague = {
  conceptId: "203715", entitlementId: "EP2002-CUSA01433_00-ROCKETLEAGUEEU01",
  image: { url: "https://image.api.playstation.com/x/icon0.png" }, isActive: true, isDownloadable: true,
  isPreOrder: false, membership: "NONE", name: "Rocket League\u00AE", platform: "PS4",
  productId: "EP2002-CUSA01433_00-ROCKETLEAGUEEU01", titleId: "CUSA01433_00",
};

Deno.test("a purchased item maps to an entitlement", () => {
  assertEquals(toEntitlement(rocketLeague), {
    conceptId: "203715", entitlementId: "EP2002-CUSA01433_00-ROCKETLEAGUEEU01",
    productId: "EP2002-CUSA01433_00-ROCKETLEAGUEEU01", titleId: "CUSA01433_00",
    name: "Rocket League\u00AE", platform: "PS4", membership: "NONE",
    imageUrl: "https://image.api.playstation.com/x/icon0.png",
  });
});

Deno.test("every item in the captured fixture maps without throwing", async () => {
  const items = JSON.parse(await Deno.readTextFile(new URL("../fixtures/purchased_page.json", import.meta.url)));
  for (const item of items) toEntitlement(item);
});

Deno.test("pagination keeps fetching until a short page", async () => {
  const pages = [Array(100).fill(rocketLeague), Array(3).fill(rocketLeague)];
  const starts: number[] = [];
  const fake = (_auth: unknown, opts: { start: number }) => {
    starts.push(opts.start);
    return Promise.resolve({ data: { purchasedTitlesRetrieve: { games: pages.shift()! } } });
  };
  const all = await fetchAllEntitlements({ accessToken: "x" }, fake);
  assertEquals(all.length, 103);
  assertEquals(starts, [0, 100]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `$DENO test -A extensions/models/lib/psn_library_test.ts`
Expected: FAIL, `./psn_library.ts` not found.

- [ ] **Step 3: Implement psn_library.ts**

```typescript
// extensions/models/lib/psn_library.ts
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

type PageFn = (auth: { accessToken: string }, opts: { size: number; start: number }) => Promise<
  // deno-lint-ignore no-explicit-any
  { data: { purchasedTitlesRetrieve: { games: any[] } } }
>;

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
```

Run: `$DENO test -A extensions/models/lib/psn_library_test.ts`
Expected: 3 passed. If the fixture test fails on `membership`, the fixture has a value outside `NONE`/`PS_PLUS`: add it to `EntitlementSchema` and to the Owned/Claimed rule in `collapse.ts` with a test, after checking with the user what it means.

- [ ] **Step 4: Failing model tests**

```typescript
// extensions/models/psn_test.ts
import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model, RENEW_STEPS } from "./psn.ts";

const tokens = {
  accessToken: "acc", expiresIn: 3600, idToken: "id", refreshToken: "new-refresh",
  refreshTokenExpiresIn: 5183999, scope: "s", tokenType: "bearer",
};

Deno.test("library stores the rotated refresh token and the collapsed games", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "library" });
  await model.methods.library.execute({
    refreshToken: "old",
    _client: {
      refresh: () => Promise.resolve(tokens),
      entitlements: () => Promise.resolve([
        { conceptId: "1", entitlementId: "E1", productId: "P1", titleId: "T1", name: "A", platform: "PS4", membership: "NONE", imageUrl: null },
        { conceptId: "1", entitlementId: "E2", productId: "P2", titleId: "T2", name: "A", platform: "PS5", membership: "NONE", imageUrl: null },
      ]),
    },
  }, context);
  const written = getWrittenResources();
  assertEquals(written.find((r) => r.specName === "auth")?.data.refreshToken, "new-refresh");
  assertEquals(written.find((r) => r.specName === "library")?.data.games.length, 1);
});

Deno.test("a dead refresh token fails with the renewal steps and writes nothing", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "library" });
  await assertRejects(
    () => model.methods.library.execute({
      refreshToken: "dead",
      _client: { refresh: () => Promise.reject(new Error("invalid_grant")), entitlements: () => Promise.resolve([]) },
    }, context),
    Error,
    RENEW_STEPS,
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("details keeps going when one store lookup fails", async () => {
  const { context, getWrittenResources, getLogsByLevel } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    ids: ["concept:1", "concept:2"],
    games: [
      { id: "concept:1", conceptId: "1", title: "A", platforms: ["PS5"], access: "owned", productIds: [], titleIds: [], imageUrl: null },
      { id: "concept:2", conceptId: "2", title: "B", platforms: ["PS5"], access: "owned", productIds: [], titleIds: [], imageUrl: null },
    ],
    _client: {
      store: (conceptId: string) => conceptId === "1" ? Promise.resolve({}) : Promise.reject(new Error("503")),
    },
  }, context);
  const store = getWrittenResources().find((r) => r.specName === "store")?.data.details;
  assertEquals(store.map((s: { id: string }) => s.id), ["concept:1"]);
  assertEquals(getLogsByLevel("warning").length, 1);
});
```

- [ ] **Step 5: Run to verify failure**

Run: `$DENO test -A extensions/models/psn_test.ts`
Expected: FAIL, `./psn.ts` not found.

- [ ] **Step 6: Implement psn.ts**

```typescript
// extensions/models/psn.ts
import { z } from "npm:zod@4";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
} from "npm:psn-api@2.18.1";
import { collapseEntitlements } from "./lib/collapse.ts";
import { fetchAllEntitlements } from "./lib/psn_library.ts";
import { fetchStore } from "./lib/store_client.ts";
import { mapStore } from "./lib/store_map.ts";
import { type Entitlement, type LibraryGame, LibraryGameSchema, StoreDetailsSchema, type StoreDetails } from "./lib/schemas.ts";

export const RENEW_STEPS =
  "PSN login has expired. Log in at https://www.playstation.com, open https://ca.account.sony.com/api/v1/ssocookie, " +
  "copy the npsso value, run 'swamp vault put games psn-npsso' and then 'swamp workflow run psn-login'.";

const AuthSchema = z.object({
  refreshToken: z.string().meta({ sensitive: true, vaultName: "games", vaultKey: "psn-refresh-token" }),
  refreshTokenExpiresAt: z.string(),
});

type Tokens = { accessToken: string; refreshToken: string; refreshTokenExpiresIn: number };
type Client = {
  refresh: (refreshToken: string) => Promise<Tokens>;
  entitlements: (auth: { accessToken: string }) => Promise<Entitlement[]>;
};
type StoreClient = { store: (conceptId: string) => Promise<unknown> };

const liveClient: Client = {
  refresh: (t) => exchangeRefreshTokenForAuthTokens(t),
  entitlements: (auth) => fetchAllEntitlements(auth),
};
const liveStore: StoreClient = { store: (conceptId) => fetchStore(conceptId, "en-NO") };

// deno-lint-ignore no-explicit-any
async function writeAuth(context: any, t: Tokens) {
  const expires = new Date(Date.now() + t.refreshTokenExpiresIn * 1000).toISOString();
  context.logger.info("PSN refresh token valid until {expires}", { expires });
  return await context.writeResource("auth", "auth", { refreshToken: t.refreshToken, refreshTokenExpiresAt: expires });
}

export const model = {
  type: "@catjen/psn",
  version: "2026.10.01.1",
  globalArguments: z.object({}),
  resources: {
    auth: { description: "PSN refresh token (stored in the vault)", schema: AuthSchema, lifetime: "infinite", garbageCollection: 3 },
    library: { description: "Games on the account", schema: z.object({ games: z.array(LibraryGameSchema) }), lifetime: "infinite", garbageCollection: 6 },
    store: { description: "Store details for requested games", schema: z.object({ details: z.array(StoreDetailsSchema) }), lifetime: "infinite", garbageCollection: 6 },
  },
  methods: {
    login: {
      description: "Exchange an NPSSO token for a refresh token and store it in the vault",
      arguments: z.object({ npsso: z.string().length(64) }),
      // deno-lint-ignore no-explicit-any
      execute: async (args: { npsso: string }, context: any) => {
        const code = await exchangeNpssoForAccessCode(args.npsso);
        const tokens = await exchangeAccessCodeForAuthTokens(code);
        return { dataHandles: [await writeAuth(context, tokens)] };
      },
    },
    library: {
      description: "Refresh the login, then list and collapse the games on the account",
      arguments: z.object({ refreshToken: z.string() }),
      // deno-lint-ignore no-explicit-any
      execute: async (args: { refreshToken: string; _client?: Client }, context: any) => {
        const client = args._client ?? liveClient;
        let tokens: Tokens;
        try {
          tokens = await client.refresh(args.refreshToken);
        } catch (err) {
          throw new Error(`${RENEW_STEPS} (cause: ${(err as Error).message})`);
        }
        const authHandle = await writeAuth(context, tokens);
        const games = collapseEntitlements(await client.entitlements(tokens));
        context.logger.info("PSN library has {count} games", { count: games.length });
        const handle = await context.writeResource("library", "library", { games });
        return { dataHandles: [authHandle, handle] };
      },
    },
    details: {
      description: "Fetch store details for the given game ids",
      arguments: z.object({ ids: z.array(z.string()), games: z.array(LibraryGameSchema) }),
      // deno-lint-ignore no-explicit-any
      execute: async (args: { ids: string[]; games: LibraryGame[]; _client?: StoreClient }, context: any) => {
        const client = args._client ?? liveStore;
        const byId = new Map(args.games.map((g) => [g.id, g]));
        const details: StoreDetails[] = [];
        for (const id of args.ids) {
          const conceptId = byId.get(id)?.conceptId;
          if (!conceptId) continue;
          try {
            details.push(mapStore(id, await client.store(conceptId)));
          } catch (err) {
            context.logger.warning("Store lookup failed for {id}: {error}", { id, error: (err as Error).message });
          }
        }
        const handle = await context.writeResource("store", "store", { details });
        return { dataHandles: [handle] };
      },
    },
  },
};
```

Note: the `library` test checks that a failed refresh throws BEFORE any write, which is why `writeAuth` comes after the `try`. A game without a concept ID gets no store lookup and therefore stays with unknown store fields; that is intended.

- [ ] **Step 7: Run to verify pass**

Run: `$DENO test -A extensions/models/psn_test.ts extensions/models/lib/`
Expected: all pass. `assertRejects(..., Error, RENEW_STEPS)` matches because the thrown message starts with `RENEW_STEPS`.

- [ ] **Step 8: Register the model and the login workflow, then log in for real**

Run: `swamp model create @catjen/psn psn` and `swamp workflow create psn-login`, then set its jobs to:
```yaml
jobs:
  - name: login
    steps:
      - name: login
        task:
          type: model_method
          modelIdOrName: psn
          methodName: login
          inputs:
            npsso: ${{ vault.get("games", "psn-npsso") }}
```
Run: `swamp workflow validate psn-login --json`, then `swamp workflow run psn-login --json`.
Expected: success, and `swamp vault describe games --json` now lists `psn-refresh-token`. `swamp data get psn auth --json` shows a `vault.get(...)` reference, not the token.

- [ ] **Step 9: Commit**

```bash
git add extensions/models/psn.ts extensions/models/psn_test.ts extensions/models/lib/psn_library.ts extensions/models/lib/psn_library_test.ts models/ workflows/
git commit -m "PSN model: login, library with rotated refresh token, store details"
```

---

### Task 8: The igdb model

**Files:**
- Create: `extensions/models/lib/igdb_client.ts`, `extensions/models/igdb.ts`
- Test: `extensions/models/igdb_test.ts`

**Interfaces:**
- Consumes: `pickIgdbMatch`, `IgdbGame` (Task 4), `mapIgdb` (Task 5), schemas.
- Produces: model type `@catjen/igdb`, method `details({ clientId, clientSecret, ids, games, store })` writing data `igdb` = `{ details: IgdbDetails[] }`. `igdb_client.ts` exports `GAME_FIELDS`, `createIgdb(clientId, clientSecret, fetchFn?)` returning `{ post(endpoint: string, body: string): Promise<unknown[]> }`.

- [ ] **Step 1: Implement igdb_client.ts (thin I/O, exercised through the model test)**

```typescript
// extensions/models/lib/igdb_client.ts
export const GAME_FIELDS =
  "fields name,first_release_date,genres.name,game_modes.name,multiplayer_modes.*,external_games.uid,external_games.external_game_source;";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createIgdb(clientId: string, clientSecret: string, fetchFn: typeof fetch = fetch) {
  let token: string | null = null;
  let last = 0;
  return {
    async post(endpoint: string, body: string): Promise<unknown[]> {
      if (!token) {
        const res = await fetchFn(
          `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`Twitch token request failed with status ${res.status}`);
        token = (await res.json()).access_token;
      }
      const wait = 260 - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetchFn(`https://api.igdb.com/v4/${endpoint}`, {
        method: "POST",
        headers: { "Client-ID": clientId, Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) throw new Error(`IGDB ${endpoint} failed with status ${res.status}`);
      return await res.json();
    },
  };
}
```

- [ ] **Step 2: Failing model tests**

```typescript
// extensions/models/igdb_test.ts
import { assertEquals } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model } from "./igdb.ts";

const game = (id: string, title: string) => ({
  id, conceptId: id.replace("concept:", ""), title, platforms: ["PS5"], access: "owned" as const,
  productIds: [`P${id}`], titleIds: [`T${id}`], imageUrl: null,
});
const store = (id: string, year: number) => ({
  id, kind: "game" as const, description: null, releaseYear: year, ageRating: null, onlineRequired: null, coverUrl: null,
});

function fakeIgdb(routes: Record<string, (body: string) => unknown[]>) {
  return { post: (endpoint: string, body: string) => Promise.resolve(routes[endpoint](body)) };
}

Deno.test("a PSN id link is used before a title search", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    clientId: "c", clientSecret: "s", ids: ["concept:1"],
    games: [game("concept:1", "Doom")], store: [store("concept:1", 2016)],
    _igdb: fakeIgdb({
      external_game_sources: () => [{ id: 36, name: "PlayStation Store US" }],
      external_games: () => [{ game: 99 }],
      games: (body) => body.includes("where id = (99)")
        ? [{ id: 99, name: "DOOM", external_games: [{ uid: "Pconcept:1", external_game_source: 36 }], game_modes: [{ name: "Single player" }] }]
        : [],
    }),
  }, context);
  const d = getWrittenResources().find((r) => r.specName === "igdb")?.data.details[0];
  assertEquals([d.igdbId, d.matchedBy, d.soloStory], [99, "psn-id", true]);
});

Deno.test("no link falls back to title and year", async () => {
  const { context, getWrittenResources } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    clientId: "c", clientSecret: "s", ids: ["concept:2"],
    games: [game("concept:2", "It Takes Two")], store: [store("concept:2", 2021)],
    _igdb: fakeIgdb({
      external_game_sources: () => [{ id: 36, name: "PlayStation Store US" }],
      external_games: () => [],
      games: () => [{ id: 7, name: "It Takes Two", first_release_date: Date.UTC(2021, 2, 26) / 1000 }],
    }),
  }, context);
  const d = getWrittenResources().find((r) => r.specName === "igdb")?.data.details[0];
  assertEquals([d.igdbId, d.matchedBy], [7, "title-year"]);
});

Deno.test("a failed lookup is left out rather than written as unknown", async () => {
  const { context, getWrittenResources, getLogsByLevel } = createModelTestContext({ methodName: "details" });
  await model.methods.details.execute({
    clientId: "c", clientSecret: "s", ids: ["concept:3"],
    games: [game("concept:3", "X")], store: [store("concept:3", 2020)],
    _igdb: {
      post: (endpoint: string) => endpoint === "external_game_sources" ? Promise.resolve([]) : Promise.reject(new Error("429")),
    },
  }, context);
  assertEquals(getWrittenResources().find((r) => r.specName === "igdb")?.data.details, []);
  assertEquals(getLogsByLevel("warning").length, 1);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `$DENO test -A extensions/models/igdb_test.ts`
Expected: FAIL, `./igdb.ts` not found.

- [ ] **Step 4: Implement igdb.ts**

```typescript
// extensions/models/igdb.ts
import { z } from "npm:zod@4";
import { createIgdb, GAME_FIELDS } from "./lib/igdb_client.ts";
import { mapIgdb } from "./lib/igdb_map.ts";
import { type IgdbGame, pickIgdbMatch } from "./lib/match.ts";
import { type IgdbDetails, IgdbDetailsSchema, type LibraryGame, LibraryGameSchema, type StoreDetails, StoreDetailsSchema } from "./lib/schemas.ts";

type Igdb = { post: (endpoint: string, body: string) => Promise<unknown[]> };
const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

export const model = {
  type: "@catjen/igdb",
  version: "2026.10.01.1",
  globalArguments: z.object({}),
  resources: {
    igdb: { description: "IGDB details for requested games", schema: z.object({ details: z.array(IgdbDetailsSchema) }), lifetime: "infinite", garbageCollection: 6 },
  },
  methods: {
    details: {
      description: "Look up co-op, versus, solo and genre details on IGDB",
      arguments: z.object({
        clientId: z.string(), clientSecret: z.string(), ids: z.array(z.string()),
        games: z.array(LibraryGameSchema), store: z.array(StoreDetailsSchema),
      }),
      execute: async (
        args: { clientId: string; clientSecret: string; ids: string[]; games: LibraryGame[]; store: StoreDetails[]; _igdb?: Igdb },
        // deno-lint-ignore no-explicit-any
        context: any,
      ) => {
        const igdb = args._igdb ?? createIgdb(args.clientId, args.clientSecret);
        const sources = (await igdb.post("external_game_sources", 'fields id,name; where name ~ *"PlayStation"*; limit 50;')) as { id: number }[];
        const psnSourceIds = sources.map((s) => s.id);
        const gameById = new Map(args.games.map((g) => [g.id, g]));
        const yearById = new Map(args.store.map((s) => [s.id, s.releaseYear]));
        const details: IgdbDetails[] = [];
        for (const id of args.ids) {
          const g = gameById.get(id);
          if (!g) continue;
          const psnUids = [...g.productIds, ...g.titleIds, ...(g.conceptId ? [g.conceptId] : [])];
          const q = { title: g.title, releaseYear: yearById.get(id) ?? null, psnUids, psnSourceIds };
          try {
            let candidates: IgdbGame[] = [];
            if (psnSourceIds.length && psnUids.length) {
              const links = (await igdb.post("external_games",
                `fields game; where uid = (${psnUids.map(quote).join(",")}) & external_game_source = (${psnSourceIds.join(",")}); limit 10;`)) as { game: number }[];
              if (links.length) {
                candidates = (await igdb.post("games", `${GAME_FIELDS} where id = (${links.map((l) => l.game).join(",")});`)) as IgdbGame[];
              }
            }
            let match = pickIgdbMatch(candidates, q);
            if (!match) {
              candidates = (await igdb.post("games", `${GAME_FIELDS} search ${quote(g.title)}; limit 10;`)) as IgdbGame[];
              match = pickIgdbMatch(candidates, q);
            }
            details.push(mapIgdb(id, match));
          } catch (err) {
            context.logger.warning("IGDB lookup failed for {title}: {error}", { title: g.title, error: (err as Error).message });
          }
        }
        context.logger.info("IGDB matched {matched} of {total}", { matched: details.filter((d) => d.igdbId !== null).length, total: args.ids.length });
        const handle = await context.writeResource("igdb", "igdb", { details });
        return { dataHandles: [handle] };
      },
    },
  },
};
```

- [ ] **Step 5: Run to verify pass**

Run: `$DENO test -A extensions/models/igdb_test.ts`
Expected: 3 passed. In the first test the fake answers `games` only for `where id = (99)`; the title search returns `[]`, which proves the link path was used.

- [ ] **Step 6: Register and commit**

Run: `swamp model create @catjen/igdb igdb`
```bash
git add extensions/models/igdb.ts extensions/models/igdb_test.ts extensions/models/lib/igdb_client.ts models/
git commit -m "IGDB model: PSN-linked lookup first, paced to the rate limit"
```

---

### Task 9: The gamelist model

**Files:**
- Create: `extensions/models/gamelist.ts`
- Test: `extensions/models/gamelist_test.ts`

**Interfaces:**
- Consumes: `idsToFetch`, `checkPlausible`, `applyRun` (Task 3), `commitMessage` (Task 3), schemas.
- Produces: model type `@catjen/gamelist`, global argument `path` (default `docs/games.json`), method `plan({ games, mode })` writing data `plan` = `{ ids: string[] }`, method `write({ games, store, igdb, dryRun, today? })` writing data `summary` = `{ message: string | null, added: number, updated: number, gone: number, dryRun: boolean }`.

- [ ] **Step 1: Failing tests**

```typescript
// extensions/models/gamelist_test.ts
import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@swamp-club/swamp-testing";
import { model } from "./gamelist.ts";

const lib = (id: string) => ({
  id, conceptId: id.slice(8), title: `Game ${id}`, platforms: ["PS5"], access: "owned" as const,
  productIds: [], titleIds: [], imageUrl: null,
});

async function repo(games: unknown[] | null) {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/docs`);
  if (games) await Deno.writeTextFile(`${dir}/docs/games.json`, JSON.stringify({ games }));
  return dir;
}

Deno.test("plan on a missing list fetches every game", async () => {
  const dir = await repo(null);
  const { context, getWrittenResources } = createModelTestContext({ methodName: "plan", repoDir: dir, globalArgs: { path: "docs/games.json" } });
  await model.methods.plan.execute({ games: [lib("concept:1"), lib("concept:2")], mode: "new" }, context);
  assertEquals(getWrittenResources()[0].data.ids, ["concept:1", "concept:2"]);
});

Deno.test("plan refuses an empty library when the list has games", async () => {
  const dir = await repo([]);
  const { context: c1 } = createModelTestContext({ methodName: "write", repoDir: dir, globalArgs: { path: "docs/games.json" } });
  await model.methods.write.execute({ games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-10-01" }, c1);
  const { context } = createModelTestContext({ methodName: "plan", repoDir: dir, globalArgs: { path: "docs/games.json" } });
  await assertRejects(() => model.methods.plan.execute({ games: [], mode: "new" }, context), Error, "empty library");
});

Deno.test("write creates the list file with a trailing newline and reports the change", async () => {
  const dir = await repo(null);
  const { context, getWrittenResources } = createModelTestContext({ methodName: "write", repoDir: dir, globalArgs: { path: "docs/games.json" } });
  await model.methods.write.execute({ games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-10-01" }, context);
  const text = await Deno.readTextFile(`${dir}/docs/games.json`);
  assertEquals(text.endsWith("}\n"), true);
  assertEquals(JSON.parse(text).games[0].addedOn, "2026-10-01");
  assertEquals(getWrittenResources()[0].data.message, "Add 1 game");
});

Deno.test("a dry run reports the change but leaves the file untouched", async () => {
  const dir = await repo([]);
  const before = await Deno.readTextFile(`${dir}/docs/games.json`);
  const { context, getWrittenResources } = createModelTestContext({ methodName: "write", repoDir: dir, globalArgs: { path: "docs/games.json" } });
  await model.methods.write.execute({ games: [lib("concept:1")], store: [], igdb: [], dryRun: true, today: "2026-10-01" }, context);
  assertEquals(await Deno.readTextFile(`${dir}/docs/games.json`), before);
  assertEquals(getWrittenResources()[0].data.message, "Add 1 game");
  assertEquals(getWrittenResources()[0].data.dryRun, true);
});

Deno.test("no change leaves the file untouched and gives no commit message", async () => {
  const dir = await repo(null);
  const opts = { methodName: "write", repoDir: dir, globalArgs: { path: "docs/games.json" } };
  await model.methods.write.execute({ games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-10-01" }, createModelTestContext(opts).context);
  const before = await Deno.stat(`${dir}/docs/games.json`);
  const second = createModelTestContext(opts);
  await model.methods.write.execute({ games: [lib("concept:1")], store: [], igdb: [], dryRun: false, today: "2026-11-01" }, second.context);
  assertEquals((await Deno.stat(`${dir}/docs/games.json`)).mtime, before.mtime);
  assertEquals(second.getWrittenResources()[0].data.message, null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `$DENO test -A extensions/models/gamelist_test.ts`
Expected: FAIL, `./gamelist.ts` not found.

- [ ] **Step 3: Implement**

```typescript
// extensions/models/gamelist.ts
import { z } from "npm:zod@4";
import { applyRun, checkPlausible, idsToFetch, type Mode } from "./lib/merge.ts";
import { commitMessage } from "./lib/summary.ts";
import {
  type GameRecord, GameListSchema, type IgdbDetails, IgdbDetailsSchema, type LibraryGame, LibraryGameSchema,
  type StoreDetails, StoreDetailsSchema,
} from "./lib/schemas.ts";

const Global = z.object({ path: z.string().default("docs/games.json") });

async function readList(file: string): Promise<GameRecord[]> {
  try {
    return GameListSchema.parse(JSON.parse(await Deno.readTextFile(file))).games;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
}

export const model = {
  type: "@catjen/gamelist",
  version: "2026.10.01.1",
  globalArguments: Global,
  resources: {
    plan: { description: "Games to fetch details for", schema: z.object({ ids: z.array(z.string()) }), lifetime: "infinite", garbageCollection: 6 },
    summary: {
      description: "What a write changed",
      schema: z.object({ message: z.string().nullable(), added: z.number(), updated: z.number(), gone: z.number(), dryRun: z.boolean() }),
      lifetime: "infinite",
      garbageCollection: 12,
    },
  },
  methods: {
    plan: {
      description: "Compare the library with the list and decide which games need details",
      arguments: z.object({ games: z.array(LibraryGameSchema), mode: z.enum(["new", "rebuild"]) }),
      // deno-lint-ignore no-explicit-any
      execute: async (args: { games: LibraryGame[]; mode: Mode }, context: any) => {
        const existing = await readList(`${context.repoDir}/${context.globalArgs.path}`);
        checkPlausible(existing, args.games);
        const ids = idsToFetch(existing, args.games, args.mode);
        context.logger.info("{count} games need details ({mode})", { count: ids.length, mode: args.mode });
        return { dataHandles: [await context.writeResource("plan", "plan", { ids })] };
      },
    },
    write: {
      description: "Merge the run into the list file",
      arguments: z.object({
        games: z.array(LibraryGameSchema), store: z.array(StoreDetailsSchema), igdb: z.array(IgdbDetailsSchema),
        dryRun: z.boolean().default(false), today: z.string().optional(),
      }),
      execute: async (
        args: { games: LibraryGame[]; store: StoreDetails[]; igdb: IgdbDetails[]; dryRun: boolean; today?: string },
        // deno-lint-ignore no-explicit-any
        context: any,
      ) => {
        const file = `${context.repoDir}/${context.globalArgs.path}`;
        const existing = await readList(file);
        const today = args.today ?? new Date().toISOString().slice(0, 10);
        const r = applyRun({ existing, library: args.games, store: args.store, igdb: args.igdb, today });
        const message = commitMessage(r.added.length, r.updated.length, r.gone.length);
        if (message && !args.dryRun) {
          await Deno.writeTextFile(file, JSON.stringify({ games: r.games }, null, 2) + "\n");
        }
        context.logger.info("{message}{dry}", { message: message ?? "No changes", dry: args.dryRun ? " (dry run)" : "" });
        const handle = await context.writeResource("summary", "summary", {
          message, added: r.added.length, updated: r.updated.length, gone: r.gone.length, dryRun: args.dryRun,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `$DENO test -A extensions/models/gamelist_test.ts`
Expected: 5 passed.

- [ ] **Step 5: Register and commit**

Run: `swamp model create @catjen/gamelist gamelist` (then check `swamp model get gamelist --json` shows `path: docs/games.json`; set it with `--global-arg path=docs/games.json` if the default was not applied).
```bash
git add extensions/models/gamelist.ts extensions/models/gamelist_test.ts models/
git commit -m "Game list model: plan the fetch, write the list, dry run"
```

---

### Task 10: The monthly-sync workflow and a dry run

**Files:**
- Create (via swamp): `workflows/<id>.yaml` for `monthly-sync`

**Interfaces:**
- Consumes: models `psn`, `igdb`, `gamelist`, `git` and the argument names of `@swamp/git` `commit` and `push` from the Task 0 describe output.
- Produces: workflow `monthly-sync` with inputs `mode` (`new` | `rebuild`, default `new`) and `dryRun` (boolean, default `false`).

- [ ] **Step 1: Create the workflow**

Run: `swamp workflow create monthly-sync`, keep the generated `id`, and set the rest of the file to the following. Replace the `git` step `inputs` keys with the exact argument names from `/c/Project/temp/claude/git-type.json` (the intent: stage `docs/games.json`, commit with the summary message; push the current branch to `origin`).

```yaml
name: monthly-sync
version: 1
inputs:
  properties:
    mode:
      type: string
      enum: ["new", "rebuild"]
      default: "new"
    dryRun:
      type: boolean
      default: false
  required: []
jobs:
  - name: sync
    steps:
      - name: library
        task:
          type: model_method
          modelIdOrName: psn
          methodName: library
          inputs:
            refreshToken: ${{ vault.get("games", "psn-refresh-token") }}
      - name: plan
        dependsOn: [{ step: library, condition: { type: succeeded } }]
        task:
          type: model_method
          modelIdOrName: gamelist
          methodName: plan
          inputs:
            games: ${{ data.latest("psn", "library").attributes.games }}
            mode: ${{ inputs.mode }}
      - name: store
        dependsOn: [{ step: plan, condition: { type: succeeded } }]
        task:
          type: model_method
          modelIdOrName: psn
          methodName: details
          inputs:
            ids: ${{ data.latest("gamelist", "plan").attributes.ids }}
            games: ${{ data.latest("psn", "library").attributes.games }}
      - name: igdb
        dependsOn: [{ step: store, condition: { type: succeeded } }]
        task:
          type: model_method
          modelIdOrName: igdb
          methodName: details
          inputs:
            clientId: ${{ vault.get("games", "igdb-client-id") }}
            clientSecret: ${{ vault.get("games", "igdb-client-secret") }}
            ids: ${{ data.latest("gamelist", "plan").attributes.ids }}
            games: ${{ data.latest("psn", "library").attributes.games }}
            store: ${{ data.latest("psn", "store").attributes.details }}
      - name: write
        dependsOn: [{ step: igdb, condition: { type: succeeded } }]
        task:
          type: model_method
          modelIdOrName: gamelist
          methodName: write
          inputs:
            games: ${{ data.latest("psn", "library").attributes.games }}
            store: ${{ data.latest("psn", "store").attributes.details }}
            igdb: ${{ data.latest("igdb", "igdb").attributes.details }}
            dryRun: ${{ inputs.dryRun }}
      - name: commit
        dependsOn: [{ step: write, condition: { type: succeeded } }]
        guard: ${{ inputs.dryRun || data.latest("gamelist", "summary").attributes.message == null }}
        task:
          type: model_method
          modelIdOrName: git
          methodName: commit
          inputs:
            paths: ["docs/games.json"]
            message: ${{ data.latest("gamelist", "summary").attributes.message }}
      - name: push
        dependsOn: [{ step: commit, condition: { type: succeeded } }]
        guard: ${{ inputs.dryRun }}
        task:
          type: model_method
          modelIdOrName: git
          methodName: push
          inputs:
            remote: origin
```

The `push` step runs even when `commit` was skipped, so a commit left behind by an earlier failed push goes out next month (spec: "Push fails: the commit stays local; the next run pushes it"). If the validator rejects step-level `dependsOn` in this form, use the form `swamp workflow validate` suggests and keep the same order.

- [ ] **Step 2: Validate**

Run: `swamp workflow validate monthly-sync --json`
Expected: valid. Fix any reported key names before going on.

- [ ] **Step 3: Dry run against the real account**

Run: `swamp workflow run monthly-sync --input dryRun=true --json`
Expected: success; `git status` shows no change to `docs/`; `swamp data get gamelist summary --json` shows `message` like `Add 312 games` and `dryRun: true`; the `commit` and `push` steps show as skipped. Report to the user: library size, IGDB match rate (from the igdb step log), how many games have no store details. A match rate under about 60 percent is a finding to raise, not to tune silently.

- [ ] **Step 4: Commit the workflow**

```bash
git add workflows/
git commit -m "Monthly sync workflow chaining PSN, IGDB, the list and git"
```

---

### Task 11: The page

**Files:**
- Create: `docs/index.html`, `docs/.nojekyll`, `docs/sample-games.json`

**Interfaces:**
- Consumes: `docs/games.json` shape (Global Constraints) and `GameRecord` fields (Task 2).

- [ ] **Step 1: Write a sample list for local checking**

Create `docs/sample-games.json` with three records copied from the shape in the spec: one Owned co-op game, one Claimed versus game, one Gone game with `goneOn` set and several `null` fields.

- [ ] **Step 2: Write the page**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PlayStation Games</title>
<style>
  :root { --bg: #fff; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e3e3e3; --accent: #0050c8; --chip: #f1f4fa; }
  @media (prefers-color-scheme: dark) { :root { --bg: #121417; --fg: #e8e8e8; --muted: #9a9a9a; --line: #2a2e33; --accent: #7aa7ff; --chip: #1d2229; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, sans-serif; }
  header { padding: 16px; border-bottom: 1px solid var(--line); }
  h1 { margin: 0 0 12px; font-size: 20px; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .filters input, .filters select { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
  .filters input[type=search] { flex: 1 1 200px; }
  .count { color: var(--muted); margin-top: 8px; font-size: 13px; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 900px; }
  th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { cursor: pointer; user-select: none; white-space: nowrap; font-size: 13px; color: var(--muted); }
  th[aria-sort=ascending]::after { content: " \25B2"; }
  th[aria-sort=descending]::after { content: " \25BC"; }
  tr.game { cursor: pointer; }
  tr.desc td { color: var(--muted); background: var(--chip); }
  img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; display: block; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; background: var(--chip); font-size: 12px; }
  .gone { opacity: 0.55; }
</style>
</head>
<body>
<header>
  <h1>PlayStation Games</h1>
  <div class="filters">
    <input type="search" id="q" placeholder="Search title" aria-label="Search title">
    <select id="access" aria-label="Access">
      <option value="present">Owned + claimed</option><option value="owned">Owned</option>
      <option value="claimed">Claimed</option><option value="gone">Gone</option><option value="all">All</option>
    </select>
    <select id="platform" aria-label="Platform"><option value="">Any platform</option><option>PS5</option><option>PS4</option></select>
    <select id="couch" aria-label="Couch play">
      <option value="">Couch: any or none</option><option value="coop">Couch co-op</option>
      <option value="versus">Couch versus</option><option value="any">Couch: any</option>
    </select>
    <select id="online" aria-label="Online play">
      <option value="">Online: any or none</option><option value="coop">Online co-op</option><option value="versus">Online versus</option>
    </select>
    <label><input type="checkbox" id="solo"> Solo story</label>
  </div>
  <div class="count" id="count"></div>
</header>
<div class="wrap"><table>
  <thead><tr>
    <th data-k="coverUrl"></th><th data-k="title">Title</th><th data-k="platforms">Platform</th>
    <th data-k="releaseYear">Year</th><th data-k="ageRating">Age</th><th data-k="soloStory">Solo</th>
    <th data-k="couchCoopMax">Couch co-op</th><th data-k="couchVersusMax">Couch versus</th>
    <th data-k="onlineCoop">Online co-op</th><th data-k="onlineVersus">Online versus</th>
    <th data-k="genres">Genres</th><th data-k="addedOn" aria-sort="descending">Added</th>
  </tr></thead>
  <tbody id="rows"></tbody>
</table></div>
<script>
const src = new URLSearchParams(location.search).get("src") || "games.json";
let games = [], sortKey = "addedOn", sortDir = -1, open = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const yn = (v) => v === null || v === undefined ? "?" : v ? "Yes" : "No";
const withMax = (v, max) => v === null || v === undefined ? "?" : v ? (max ? `Yes (${max})` : "Yes") : "No";

function keep(g) {
  const a = $("access").value;
  if (a === "present" && g.access === "gone") return false;
  if (a !== "present" && a !== "all" && g.access !== a) return false;
  if ($("q").value && !g.title.toLowerCase().includes($("q").value.toLowerCase())) return false;
  if ($("platform").value && !g.platforms.includes($("platform").value)) return false;
  const c = $("couch").value;
  if (c === "coop" && !g.couchCoop) return false;
  if (c === "versus" && !g.couchVersus) return false;
  if (c === "any" && !g.couchCoop && !g.couchVersus) return false;
  const o = $("online").value;
  if (o === "coop" && !g.onlineCoop) return false;
  if (o === "versus" && !g.onlineVersus) return false;
  if ($("solo").checked && !g.soloStory) return false;
  return true;
}

function cmp(a, b) {
  const x = a[sortKey], y = b[sortKey];
  if (x === y) return 0;
  if (x === null || x === undefined) return 1;
  if (y === null || y === undefined) return -1;
  const xs = Array.isArray(x) ? x.join(",") : x, ys = Array.isArray(y) ? y.join(",") : y;
  return (xs < ys ? -1 : 1) * sortDir;
}

function render() {
  const list = games.filter(keep).sort(cmp);
  $("count").textContent = `${list.length} of ${games.length} games`;
  $("rows").innerHTML = list.map((g) => `
    <tr class="game ${g.access === "gone" ? "gone" : ""}" data-id="${esc(g.id)}">
      <td>${g.coverUrl ? `<img loading="lazy" alt="" src="${esc(g.coverUrl)}">` : ""}</td>
      <td>${esc(g.title)} ${g.access === "claimed" ? '<span class="tag">PS Plus</span>' : ""}${g.access === "gone" ? `<span class="tag">Gone ${esc(g.goneOn || "")}</span>` : ""}</td>
      <td>${esc(g.platforms.join(", "))}</td>
      <td>${g.releaseYear ?? "?"}</td>
      <td>${esc(g.ageRating ?? "?")}</td>
      <td>${yn(g.soloStory)}</td>
      <td>${withMax(g.couchCoop, g.couchCoopMax)}</td>
      <td>${withMax(g.couchVersus, g.couchVersusMax)}</td>
      <td>${withMax(g.onlineCoop, g.onlineCoopMax)}</td>
      <td>${withMax(g.onlineVersus, g.onlineVersusMax)}</td>
      <td>${esc((g.genres || ["?"]).join(", "))}</td>
      <td>${esc(g.addedOn)}</td>
    </tr>
    ${open === g.id ? `<tr class="desc"><td></td><td colspan="11">${esc(g.description ?? "No description.")}</td></tr>` : ""}`).join("");
}

document.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => {
  const k = th.dataset.k;
  sortDir = sortKey === k ? -sortDir : 1;
  sortKey = k;
  document.querySelectorAll("th").forEach((x) => x.removeAttribute("aria-sort"));
  th.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
  render();
}));
$("rows").addEventListener("click", (e) => {
  const tr = e.target.closest("tr.game");
  if (!tr) return;
  open = open === tr.dataset.id ? null : tr.dataset.id;
  render();
});
["q", "access", "platform", "couch", "online", "solo"].forEach((id) => $(id).addEventListener("input", render));

fetch(src).then((r) => r.json()).then((d) => { games = d.games; render(); })
  .catch(() => { $("count").textContent = "Could not load the game list."; });
</script>
</body>
</html>
```

Default sort is `addedOn` descending, and `Array.prototype.sort` is stable, so games sharing a date keep the file's order (Sony's activation order).

- [ ] **Step 3: Check it locally against the sample**

Run (Git Bash, repo root): `$DENO run -A jsr:@std/http/file-server docs --port 8765` in the background, then open `http://localhost:8765/?src=sample-games.json` with the claude-in-chrome tools at desktop width and at 390px width.
Expected: the Gone game is hidden until Access is set to Gone or All; "Couch: any" shows both the co-op and the versus game; clicking a row shows its description; clicking "Year" sorts by year; `null` fields show `?`; no horizontal page scroll at 390px apart from the table's own scroll box.

- [ ] **Step 4: Commit**

```bash
touch docs/.nojekyll
git add docs/index.html docs/.nojekyll docs/sample-games.json
git commit -m "Sortable, filterable game list page for GitHub Pages"
```

---

### Task 12: First real run, GitHub Pages and the schedule

**Files:**
- Create: `scripts/monthly-sync.ps1`
- Create (by the run): `docs/games.json`

- [ ] **Step 1: Create the GitHub repo (ask first)**

Ask the user for their GitHub account name and confirm creating a PUBLIC repo `playstation-games` under it. Then run `gh repo create <account>/playstation-games --public --source . --remote origin --push`.
Expected: the repo exists with the commits so far.

- [ ] **Step 2: Turn on Pages**

Run: `gh api -X POST repos/<account>/playstation-games/pages -f "source[branch]=main" -f "source[path]=/docs"`
Expected: JSON with `html_url`. Report the URL to the user.

- [ ] **Step 3: First real run**

Run: `swamp workflow run monthly-sync --json`
Expected: success; `git log -1` shows `Add N games`; `git status` is clean; `git log origin/main -1` equals `HEAD`. After a minute, the Pages URL shows the list. Spot-check five games with the user, including one known couch co-op game.

- [ ] **Step 4: Verify refresh-token rotation stored**

Run: `swamp vault describe games --json` and `swamp data list psn --json`.
Expected: `psn-refresh-token` present and the `auth` data has a new version from this run.

- [ ] **Step 5: The scheduled script**

```powershell
# scripts/monthly-sync.ps1
# Run by Windows Task Scheduler once a month. Exit code is the workflow's.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
& swamp workflow run monthly-sync --json | Out-File -Encoding ascii (Join-Path ".swamp" "last-monthly-sync.json")
exit $LASTEXITCODE
```

Run it once by hand from PowerShell (not Git Bash): `pwsh -NoProfile -File C:\Project\gh-private\playstation-games\scripts\monthly-sync.ps1; $LASTEXITCODE`.
Expected: `0`, and `.swamp/last-monthly-sync.json` exists. This also proves swamp works under PowerShell's home directory, which differs from Git Bash's; if swamp complains about missing auth or deno there, fix it now, not after the first scheduled failure.

- [ ] **Step 6: Register the task**

Run in PowerShell:
```powershell
$swamp = (Get-Command swamp).Source
schtasks /Create /TN "playstation-games monthly sync" /SC MONTHLY /D 1 /ST 10:00 /TR "pwsh.exe -NoProfile -File C:\Project\gh-private\playstation-games\scripts\monthly-sync.ps1" /F
$t = Get-ScheduledTask -TaskName "playstation-games monthly sync"
$t.Settings.StartWhenAvailable = $true
Set-ScheduledTask -InputObject $t
Get-ScheduledTask -TaskName "playstation-games monthly sync" | Select-Object TaskName, State, @{n="StartWhenAvailable";e={$_.Settings.StartWhenAvailable}}
```
Expected: State `Ready`, `StartWhenAvailable` `True`. If `swamp` is not on the task's PATH, replace `swamp` in the script with the full `$swamp` path.

- [ ] **Step 7: Commit and push**

```bash
git add scripts/monthly-sync.ps1
git commit -m "Script the monthly sync for Task Scheduler"
git push
```

- [ ] **Step 8: Hand over to the user**

Tell the user: the Pages URL, the schedule (1st of each month at 10:00, or at next start if the PC was off), how to ask for a rebuild (`swamp workflow run monthly-sync --input mode=rebuild`), what to do when PSN login expires (the `RENEW_STEPS` text), and the probe's answer on refresh-token rotation.
