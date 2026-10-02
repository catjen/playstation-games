# API findings from the live probe

Date: 02.10.2026. Source: one probe run against the real account (610 entitlements),
plus public store pages fetched by hand. Fixtures under `extensions/models/fixtures/`.

## PSN auth

- `exchangeRefreshTokenForAuthTokens` returned the SAME refresh token, and both the
  first and the refreshed token had `refreshTokenExpiresIn = 863999` s (10 days).
  A refresh token cannot carry a monthly job.
- Consequence: every run logs in with the NPSSO from the vault. The ssocookie page
  reports `expires_in: 5180416` for a fresh NPSSO (60 days, seen 02.10.2026), so
  one renewal covers about two monthly runs. The user renews it with `scripts/renew-psn.ps1`; the page shows a
  banner when the list is stale.

## Purchased list (`getPurchasedGames`)

- 610 items, platforms `PS4` and `PS5`, memberships `NONE` (166) and `PS_PLUS` (444).
- `conceptId` was `null` on every item. Grouping PS4/PS5 copies needs another source.
- Apps (Netflix, YouTube, Spotify), demos, betas and a soundtrack entitlement are in
  the list. There is no content-type field.

## Store (no auth)

- `https://store.playstation.com/en-no/product/<productId>` returns HTML whose
  `<script id="env:..." type="application/json">` blocks hold a `cache` object;
  merging the blocks gives `Product:<productId>` with:
  `name`, `type` (`GAME`), `storeDisplayClassification` (`FULL_GAME`, `ITEM`, ...),
  `topCategory` (`GAME`, `ADD_ON`), `concept.__ref` (`Concept:<id>`), `releaseDate`
  (ISO), `contentRating.description` (`PEGI 7`), `descriptions[]` (`SHORT`, `LONG`,
  HTML), `compatibilityNoticesByPlatform.Common[]` (`ONLINE_PLAY_MODE` =
  `OPTIONAL` | `REQUIRED`, `NO_OF_PLAYERS`, `NO_OF_NETWORK_PLAYERS`), `media[]`
  (roles `MASTER`, `GAMEHUB_COVER_ART`).
- Apps and old demos are no longer on the store: the page loads but holds no
  `Product:<productId>` record.
- A deluxe-soundtrack entitlement resolved to the game's Digital Deluxe Edition
  product, so it groups into the game.

## IGDB

- Twitch client-credentials auth works.
- `external_game_sources` with a name containing "PlayStation": only
  `{ id: 36, name: "Playstation Store US" }`.
- 15 sample EU product IDs, title IDs and concept IDs gave no `external_games` hits,
  so for this account matching will mostly be by title and year.
- `game_modes` names: Single player, Multiplayer, Co-operative, Split screen,
  Massively Multiplayer Online (MMO), Battle Royale (match `igdb_map.ts`).
