# Monthly PlayStation game list - design

Date: 01.10.2026. Status: reviewed in a grilling session 01.10.2026; terms in `CONTEXT.md`.

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
| PS Plus | Monthly claims included as `access: "claimed"`, bought ones are `"owned"`; Extra catalogue games excluded |
| Where the list lives | `docs/games.json` in this repo, rendered by `docs/index.html` on GitHub Pages |
| Visibility | Public repo, public page. The list is not secret; credentials never enter the repo |
| PSN auth | NPSSO token, exchanged for access + refresh tokens. No email/password |
| Secret storage | A local swamp vault |
| Where it runs | WIN11-79 (the always-on PC), Windows Task Scheduler, monthly, "run as soon as possible after a missed start" |
| Store locale | `en-NO`: English text, Norwegian region (PEGI ratings); better title matches against English-only IGDB. Page UI in English |
| Detail sources | PlayStation Store (basics, age rating) + IGDB (co-op and multiplayer modes) |
| Build approach | Custom swamp extension models `psn` and `igdb`, a swamp workflow, `@swamp/git` |

## Architecture

```
Task Scheduler (monthly)
  -> swamp workflow "monthly-sync"
       1. psn.library     NPSSO from vault -> access token -> every
                          entitlement on the account
       2. gamelist.plan   entitlements whose product is not in docs/games.json
                          yet (rebuild mode: all)
       3. psn.details     store product page per new product: concept, game or
                          add-on, description, release date, PEGI rating,
                          online required, cover image
       4. gamelist.group  entitlements -> one Game per concept; decides which
                          Games need IGDB details
       5. igdb.details    per new Game, matched as in "IGDB matching": solo
                          story, couch/online co-op and versus (+ max players),
                          split screen, genres
       6. gamelist.write  add new entries, refresh account facts on existing
                          ones, set lastSync, write docs/games.json
       7. git             commit + push -> Pages rebuilds
```

Units and their single job:

- **`psn` model** (extension). Auth (NPSSO -> tokens on every run), list the
  account's entitlements, fetch store product pages. No knowledge of the list
  file. See `2026-10-01-api-findings.md` for why there is no stored refresh
  token and why grouping needs the store.
- **`igdb` model** (extension). Twitch client-credentials auth, title search,
  multiplayer-mode lookup for a set of titles. Paced to IGDB's 4 requests/s.
- **List logic** (pure functions, no I/O): diff, merge, title normalisation for
  matching, mapping API responses to a game record.
- **Workflow** `monthly-sync`: wires the steps with CEL, no logic of its own.
- **Page** `docs/index.html`: one static file, loads `games.json`, renders a
  table with column sorting and filters. No build step, no framework.

"Since last time" needs no state file: the list itself is the state.

**Modes.** The workflow takes a `mode` input:

- `new` (default, what the schedule runs): game details are fetched only for
  games not in the list yet.
- `rebuild` (run on request): game details are fetched for every game, so
  improvements in the sources reach old entries. If a lookup fails for a game
  already in the list, its previous values are kept rather than blanked.

In both modes the **account facts** (`access`, `platforms`) of every existing
entry are recalculated from Sony, so a Claimed game bought later becomes Owned
and a platform bought later is added.

`addedOn` is the date of the run that first saw the Game. Set once. Research
on 01.10.2026 found that Sony's purchased-games list carries no activation
date (only a sort order by it), so the first run gives the whole existing
library the same date; within that block the list keeps Sony's newest-first
activation order, so "newest first" still reads right.

A game in the list that Sony no longer returns gets `access: "gone"` and
`goneOn` set to the date of the run that first noticed (so it is accurate to
within a month, not to the day). The row stays, and the page hides gone rows by
default. If it shows up again, its access is recalculated as usual and
`goneOn` goes back to `null`.

## Game record (MVP)

```json
{
  "id": "concept:10001234",
  "title": "It Takes Two",
  "platforms": ["PS5"],
  "productIds": ["EP0006-CUSA08004_00-AWAYOUTEU0000000"],
  "access": "owned",
  "addedOn": "2026-10-01",
  "goneOn": null,
  "description": "Short store description",
  "releaseYear": 2021,
  "ageRating": "PEGI 12",
  "soloStory": true,
  "couchCoop": true,
  "couchCoopMax": 2,
  "couchVersus": false,
  "couchVersusMax": null,
  "splitScreen": true,
  "onlineCoop": true,
  "onlineCoopMax": 2,
  "onlineVersus": false,
  "onlineVersusMax": null,
  "onlineRequired": false,
  "genres": ["Adventure", "Platform"],
  "coverUrl": "https://...",
  "igdbId": 25076,
  "matchedBy": "psn-id"
}
```

One record per Game (see `CONTEXT.md`): entitlements sharing a PSN concept ID
collapse into one record, editions included. DLC, demos, betas and apps are
dropped. `id` is the concept ID. The purchased-games list has no content-type
field, so whether an item is a game comes from its store data.

Store data (description, release date, age rating, online notices, content
type) is not covered by the `psn-api` library; it comes from Sony's web store
API directly, whose request and response shape is captured by a probe before
the mapping code is written.

Co-op means playing together, versus means playing against each other; couch
means one console, online means over the network (see `CONTEXT.md`). The page
also offers a "couch: any" filter matching either couch field.

`soloStory` (a single-player campaign exists) comes from IGDB game modes.
`onlineRequired` (unplayable without a connection) comes from the store's
"Online play required" notice, which is often missing, so expect many `null`.

Entitlements the store has no product page for (apps, old demos, delisted
games) are dropped when the name says demo, beta, trial or alpha, or is a known
streaming app; anything else is kept with unknown details, so a delisted game
does not vanish. Records also keep their `productIds` (an account fact), so a
later run only looks up products it has not seen.

`games.json` is `{ "lastSync": "YYYY-MM-DD", "games": [...] }`.

Any field a source cannot answer is `null`, shown on the page as "?". The file
is machine-owned: it is not edited by hand, and any run may overwrite it.

## The page

`docs/index.html`, one static file reading `games.json`, usable on a phone.

- One row per Game with a small cover thumbnail (Sony-hosted URL).
- Columns: title, platforms, year, age rating, solo story, couch co-op (max),
  couch versus (max), online co-op, online versus, genres. Clicking a row
  expands its description.
- Default view: Gone hidden, Claimed shown, newest `addedOn` first.
- Filters: title search; toggles for access (owned / claimed / gone),
  platform, couch (co-op / versus / any), solo story, online modes.
- Every column sorts on header click. `null` shows as "?".

## IGDB matching

A wrong match is worse than none, so matching stops at the first rule that
gives an exact answer:

1. **PSN ID**: IGDB's external-games link to the PlayStation Store.
2. **Title + year**: normalised title equal, release year within one.
3. **None**: `igdbId` and `matchedBy` are `null`, the IGDB fields are `null`.
   Never a best guess.

`matchedBy` is stored in `games.json` but not shown on the page in the MVP.

## Secrets

Vault keys: `psn-npsso`, `igdb-client-id`, `igdb-client-secret`. Nothing secret is written to `docs/`, to swamp data that is
committed, or to logs.

Vault type `local_encryption` (verified 01.10.2026 with a throwaway vault):
the encrypted values and their key both live under `.swamp/secrets/`, which
is gitignored; only the vault's config file under `vaults/` is committed. The
key sits beside the ciphertext, so this guards against publishing a secret by
accident, not against someone with access to this PC. Accepted, because every
secret is revocable (PSN "sign out of all devices", regenerating the Twitch
secret) and losing them on a PC rebuild only means pasting them again.

Getting the NPSSO: log in at playstation.com, then open
`https://ca.account.sony.com/api/v1/ssocookie` and copy the `npsso` value.

Answered by the probe (02.10.2026): refresh tokens last 10 days and do not
rotate, so every run uses the NPSSO, which has to be renewed about every two
months. `scripts/renew-psn.ps1` opens the ssocookie page, takes the new value
with hidden input into the vault, and checks the login. The user asked whether
Claude could renew it by driving Chrome, or build an automation that reads it
from Chrome; declined: it means handling a login credential and defeating
Chrome's cookie encryption, which on this domain-joined work PC looks exactly
like credential-stealing malware.

## Error handling

Rule: a run either completes or changes nothing in `docs/`.

- **PSN login dead**: stop at step 1, write nothing, fail with the exact steps to
  paste a new NPSSO.
- **Store or IGDB lookup fails for one game**: the game is still added with
  `null` fields; the run logs which games were affected.
- **Unexpected response shape**: responses are validated with zod; a mismatch
  fails the run instead of writing garbage.
- **Push fails**: the commit stays local; the next run pushes it.
- **Failure visibility**: every successful run writes `lastSync` into
  `games.json` (and commits even when no game changed). The page shows
  "Updated <date>"; when `lastSync` is more than 40 days old it shows a red
  banner saying the sync has stopped and how to renew the PSN login. Decided
  02.10.2026 after the probe showed the login must be renewed regularly.

## Testing

TDD, test first, for the list logic and the response mapping:

- entitlement -> Game collapsing, Owned/Claimed/Gone, `addedOn` and `goneOn`,
  diff, merge (account facts refreshed; rebuild keeps old values on a failed
  lookup), title normalisation (editions, trademark signs, punctuation),
  IGDB match order, response -> record mapping, against saved sample responses.
- Models tested against recorded PSN and IGDB responses, never the live
  account.
- One manual live run: `dryRun` first (prints what would be added, writes
  nothing), then a real run, before the schedule is created.
- Page checked locally against a sample `games.json`.

## Out of scope for the MVP

- Failure alerts beyond the page banner (e-mail, Windows notification).
- Play time or trophy data.

## Setup the user does once

1. Create the public GitHub repo and enable Pages from `main` / `docs`.
2. Register a Twitch developer app (free) for the IGDB client ID and secret.
3. Put the three secrets in the vault.
