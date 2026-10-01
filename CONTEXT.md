# PlayStation game list

A personal, public list of the games on my PSN account, enriched with the
details that matter when picking something to play, and kept current by a
monthly sync.

## Language

**Game**:
One title as a person would name it, regardless of how many platforms or
editions of it the account holds. One row on the page.
_Avoid_: Title, product, entitlement

**Entitlement**:
Sony's record that the account may download one specific item for one
platform. Several entitlements can belong to one **Game**; DLC, demos, betas
and apps are entitlements that belong to no **Game**.
_Avoid_: Purchase, game

**Owned**:
A **Game** with at least one bought **Entitlement**; playable for good.
_Avoid_: Purchased, bought

**Claimed**:
A **Game** whose every **Entitlement** came through the monthly PS Plus games;
playable only while subscribed.
_Avoid_: PS Plus game, free game

**Gone**:
A **Game** that was on the list but that Sony no longer reports for the
account (refunded, delisted, or otherwise lost). Kept on the list, hidden by
default.
_Avoid_: Deleted, removed

**Catalogue game**:
A game borrowed from the PS Plus Extra catalogue. Not part of the list: it
leaves when Sony rotates the catalogue, and was never on the account.
_Avoid_: PS Plus game

**Account facts**:
What Sony says about a **Game** on this account: whether it is **Owned** or
**Claimed**, and on which platforms. Recalculated on every sync.
_Avoid_: Metadata

**Game details**:
What the world says about a **Game**: description, release year, age rating,
co-op and multiplayer modes, genres. Fetched once, when the **Game** enters the
list, unless a rebuild is asked for.
_Avoid_: Metadata, enrichment

### Ways to play

**Solo story**:
A single-player campaign that can be played through alone.
_Avoid_: Local story, campaign mode

**Online required**:
The **Game** cannot be played at all without a network connection, solo
included.
_Avoid_: Online, always-online

**Couch co-op**:
Two or more people on one console playing on the same side.
_Avoid_: Local multiplayer, couch play

**Couch versus**:
Two or more people on one console playing against each other.
_Avoid_: Local multiplayer, couch play

**Online co-op** / **Online versus**:
The same two modes, with players on separate consoles over the network.
_Avoid_: Multiplayer (on its own)

**Split screen**:
A way a game shows several local players on one TV. A property of how
**Couch co-op** or **Couch versus** is displayed, not a mode of its own.

## Flagged ambiguities

- "Game" in Sony's own APIs often means an **Entitlement**. In this repo it
  always means the collapsed title.
- "PS Plus game" covers both **Claimed** and **Catalogue game**, which behave
  differently. Use the precise term.
