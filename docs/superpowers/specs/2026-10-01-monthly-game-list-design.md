# Monthly PlayStation game list - design

Date: 01.10.2026. Status: awaiting review.

## Goal

Once a month, find the games added to my PSN account since the last run,
gather details about each new game, and publish the full list as a sortable,
filterable web page on GitHub Pages.

This is an MVP. Which fields the list carries is expected to change once it
exists; the design keeps adding a field cheap.

## Decisions taken

| Question | Decision |
|---|---|
| What is a "new game" | A game added to my PSN account (purchased or claimed) that is not in the list yet |
| PS Plus claims | Included, flagged with `psPlus: true`, filterable on the page |
| Where the list lives | `docs/games.json` in this repo, rendered by `docs/index.html` on GitHub Pages |
| Visibility | Public repo, public page. The list is not secret; credentials never enter the repo |
| PSN auth | NPSSO token, exchanged for access + refresh tokens. No email/password |
| Secret storage | A local swamp vault |
| Where it runs | This PC, Windows Task Scheduler, monthly, "run as soon as possible after a missed start" |
| Detail sources | PlayStation Store (basics, age rating) + IGDB (co-op and multiplayer modes) |
| Build approach | Custom swamp extension models `psn` and `igdb`, a swamp workflow, `@swamp/git` |

## Architecture

```
Task Scheduler (monthly)
  -> swamp workflow "monthly-sync"
       1. psn.sync        token from vault -> access token
                          -> purchased games (incl. PS Plus flag)
                          -> rotated refresh token saved back to vault
       2. diff            library minus docs/games.json = new games
       3. psn.details     per new game: description, release date, PEGI rating,
                          player counts, online flag, cover image URL
       4. igdb.details    per new game, matched by title: offline co-op (+ max
                          players), split screen, online co-op, genres
       5. write           merge new entries into docs/games.json
       6. git             commit "Add N games" + push -> Pages rebuilds
```

Units and their single job:

- **`psn` model** (extension). Auth (NPSSO -> tokens, refresh, write back the
  rotated refresh token), list purchased games, fetch store details for a set
  of games. No knowledge of the list file.
- **`igdb` model** (extension). Twitch client-credentials auth, title search,
  multiplayer-mode lookup for a set of titles. Paced to IGDB's 4 requests/s.
- **List logic** (pure functions, no I/O): diff, merge, title normalisation for
  matching, mapping API responses to a game record.
- **Workflow** `monthly-sync`: wires the steps with CEL, no logic of its own.
- **Page** `docs/index.html`: one static file, loads `games.json`, renders a
  table with column sorting and filters. No build step, no framework.

"Since last time" needs no state file: the list itself is the state.

## Game record (MVP)

```json
{
  "id": "PPSA01234_00",
  "title": "It Takes Two",
  "platforms": ["PS5"],
  "psPlus": false,
  "addedOn": "2026-10-01",
  "description": "Short store description",
  "releaseYear": 2021,
  "ageRating": "PEGI 12",
  "players": { "localMax": 2, "onlineMax": 2 },
  "couchCoop": true,
  "splitScreen": true,
  "onlineCoop": true,
  "onlineRequired": false,
  "genres": ["Adventure", "Platform"],
  "coverUrl": "https://...",
  "igdbId": 25076
}
```

Any field a source cannot answer is `null`, shown on the page as "?". Entries
already in the file are never overwritten by a run, so hand corrections stick.

## Secrets

Vault keys: `psn-npsso`, `psn-refresh-token`, `igdb-client-id`,
`igdb-client-secret`. Nothing secret is written to `docs/`, to swamp data that is
committed, or to logs.

Getting the NPSSO: log in at playstation.com, then open
`https://ca.account.sony.com/api/v1/ssocookie` and copy the `npsso` value.

Open point to verify in implementation: whether Sony issues a new refresh token
on every refresh. If yes, monthly runs keep the login alive indefinitely. If
no, a new NPSSO is needed roughly every two months, and the failure message
says so.

## Error handling

Rule: a run either completes or changes nothing in `docs/`.

- **PSN login dead**: stop at step 1, write nothing, fail with the exact steps to
  paste a new NPSSO.
- **Store or IGDB lookup fails for one game**: the game is still added with
  `null` fields; the run logs which games were affected.
- **Unexpected response shape**: responses are validated with zod; a mismatch
  fails the run instead of writing garbage.
- **Push fails**: the commit stays local; the next run pushes it.
- **Failure visibility**: Task Scheduler's last-run result plus the swamp
  method/workflow report.

## Testing

TDD, test first, for the list logic and the response mapping:

- diff, merge (no overwrite), title normalisation (editions, trademark signs,
  punctuation), response -> record mapping, against saved sample responses.
- Models tested against recorded PSN and IGDB responses, never the live
  account.
- One manual live run: `dryRun` first (prints what would be added, writes
  nothing), then a real run, before the schedule is created.
- Page checked locally against a sample `games.json`.

## Out of scope for the MVP

- Removing games that left the library (e.g. lapsed PS Plus).
- Re-enriching existing entries.
- Notifications beyond the Task Scheduler result.
- Play time or trophy data.

## Setup the user does once

1. Create the public GitHub repo and enable Pages from `main` / `docs`.
2. Register a Twitch developer app (free) for the IGDB client ID and secret.
3. Put the four secrets in the vault.
