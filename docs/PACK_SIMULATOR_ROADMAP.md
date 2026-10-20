# Cee’s Card Vault Roadmap

## Goal

Grow the pack simulator into a persistent collection and progression experience. Players can open simulated packs, track set completion, and carry progress between visits and devices. Progression should add goals and rewards without changing the published pull rates.

This is a digital simulation. Collection progress does not represent ownership of physical cards.

## Current status

Phases 1, 2, 3, and the first collection and theme scope in Phase 5 are implemented. Phase 4 goals, optional social features, and a mobile-ready API/app remain future work.

### Implemented foundation

- The catalogue uses TCGdex for card and set data. Pack profiles and available sets are configured in the project; only sets with complete English card artwork are eligible for progression.
- The pack simulator supports guest openings of the starter set and signed-in pack progress.
- The collection roadmap records unique card identities per set, grayscales uncollected cards, and supports merging browser progress into an account. Importing cards does not award XP.
- Email/password accounts use ULID user IDs, scrypt password hashes, and HTTP-only sessions. Accounts require manual administrator approval; registration has email/IP rate limits and a honeypot. Email verification and email password recovery are not enabled.
- XP, streaks, pack reveals, set unlocks, collections, and admin audit history persist in SQLite. Guest collections remain in browser storage.
- Administrators can approve or suspend accounts, adjust XP, and configure set order, unlock thresholds, and per-set God Pack cost and rolling limits.
- Pack themes use the six paired wrapper/card-back designs from the `cees-card-vault-themes` handover. Players select themes from Account customisation; unlocks are earned through pack progress and persist to the account.
- Set mastery tracks unique card identities: Explorer (25%), Collector (50%), Archivist (75%), and Master (100%). The account shows mastery and milestones. Collection display options include grid, binder, and rarity groups.
- Pack openings preserve configured pull rates. God Packs keep energy first and use IR-or-higher cards for all remaining slots.

### Current progression rules

XP rewards are deterministic and do not change card odds:

- First card revealed in each pack: **+1 XP**.
- First copy of a card identity in a set: **+5 XP**; duplicates do not add XP.
- First holo or reverse finish on the account: **+10 XP** once.
- First full-art rarity pull on the account: **+25 XP** once.
- Complete all reveals in a pack: **+3 XP**.
- First pack session each UTC day: **+5 XP**, plus **+2 XP per consecutive streak day**, capped at **+15 XP**.

Set access uses lifetime XP thresholds and does not spend the available XP balance. The first configured set is free. Admin changes to set order and XP thresholds are saved in SQLite; `config/pack-sets.json` supplies the initial configuration. Eligibility checks ensure the set has artwork for its full English card list.

God Packs cost available XP or a rare free credit. Administrators configure cost, maximum openings, and the rolling period independently for each set. Completing a signed-in standard pack has a **1-in-1,000** chance to award a free credit; one unused credit can be held per set. Free openings count toward the limit. God Packs follow the normal XP rules, and duplicates remain possible.

## Roadmap

### Phase 1 — Collection roadmap (complete)

- Show each eligible set’s cards and collection count.
- Mark collected card identities and grayscale uncollected cards.
- Keep guest collection progress in browser storage and allow it to be imported into an account.

### Phase 2 — Accounts, approval, and synced progress (complete)

- Email/password registration and sign-in with ULID account IDs.
- Profile name, preset avatar, password change, and persistent server sessions.
- Manual approval and account management in the admin page; account registration does not send email.
- Sync collections, XP, streaks, achievements, pack reveals, and unlocks across devices.
- Merge existing browser collections without awarding XP.

**Still needed:** choose an email service before enabling email verification or password recovery. Keep manual approval and existing registration abuse controls until that work is ready.

### Phase 3 — XP, streaks, set unlocks, and God Packs (complete)

- Award XP for new cards, pack reveals, first foil/full-art milestones, pack completion, and daily activity.
- Unlock sets using lifetime XP, with order and XP costs managed in the admin panel.
- Add more sets only when the full English artwork is available and a pack profile is configured.
- Offer paid-with-XP God Packs with per-set pricing and rolling limits, plus the rare free God Pack credit.
- Keep standard pack odds independent of XP, unlocks, and streaks.

### Phase 4 — Daily and weekly goals (future)

Add optional objectives that give players short-term targets without making daily play feel mandatory.

- Examples: reveal a new card, open a pack from a chosen set, or pull a card from a rarity group.
- Consider weekly goals and a limited streak freeze earned through play.
- Keep set unlocks and collection progress permanent when a streak ends.
- Keep rewards bounded so repeated easy actions cannot overwhelm set progression.
- Streaks currently use the UTC day boundary. Decide whether to keep that rule or move streak rewards to the player’s timezone before implementing more daily goals.

### Phase 5 — Mastery, collection tools, and unlockable artwork (implemented first scope)

- Track per-set mastery from unique card identities and display ranks and milestones.
- Add the six handover themes, with paired pack/card-back art and achievement-style unlocks:
  - Vault Classic is available by default.
  - Ember Forge unlocks after opening 25 packs.
  - Tidal Depths unlocks after pulling 15 Water-type cards.
  - Verdant Grove unlocks after opening packs on 7 different local dates.
  - Storm Circuit unlocks after pulling 5 holo rares.
  - Eclipse Prism is secret and unlocks after the other five themes.
- Let players inspect theme unlock progress and select unlocked art from Account customisation.
- Provide grid, binder, and rarity-grouped collection displays.

The former generic cosmetic choices were removed from the Account customisation block in favor of the handover’s pack/card art. Any future cosmetics should extend this theme system deliberately rather than reintroducing overlapping wrapper and card-back styles.

**Possible later collection improvements:**

- Track normal, holo, and reverse as separate owned finishes, if finish-level completion is desired. The current collection records card identity; a reveal’s finish is recorded in pack history but does not create separate collection entries.
- Add duplicate counts and rarity/finish summaries.
- Add a searchable pull journal with set, rarity, finish, and date filters.
- Improve the collection completion summary without promising a number of packs needed to finish a set.

### Phase 6 — Accessibility and play quality (future)

- Add an option to reduce or skip pack opening animations and jump to the pull summary.
- Improve keyboard and screen-reader support for reveal and collection interactions.
- Offer adjustable reveal pacing and honor reduced-motion settings throughout the pack flow.
- Consider a “surprise me” option that picks from the player’s unlocked sets.

### Phase 7 — Sharing and social features (optional)

Only pursue social features after privacy controls and account export/deletion expectations are clear.

- Allow a player to share a read-only collection summary or a selected pack opening.
- Make shared profiles opt-in, with controls to hide email, full name, or selected sets.
- Consider leaderboards for mastery and collection milestones rather than raw pack volume.
- Keep simulated trading optional. Trading needs duplicate ownership rules, abuse controls, and fair exchange design; it must not be required to complete a set.

### Phase 8 — Mobile-ready API and app (future)

The progress service already owns the account, collection, pack reveal, progression, and theme state. The current `/api/account/*` routes are an internal web-app contract, however; they are not yet versioned or documented as a mobile API. Build a stable first-party API before starting a mobile client.

**8.1 Define and document the API**

- Add a versioned contract such as `/api/v1/` with an OpenAPI document and consistent error responses.
- Cover sign-in/profile, eligible sets and catalogue summaries, pack start/reveal, collection/mastery, XP/unlocks, God Pack availability, and selected themes.
- Add pagination for card/history endpoints and use idempotency keys for operations that may be retried by mobile networks.
- Keep TCGdex and pricing-provider credentials on the server; the mobile app should call this app’s API, not receive provider secrets.

**8.2 Add native-app authentication**

- Design short-lived access tokens and rotating, revocable refresh tokens for native clients rather than relying on browser cookie behavior.
- Support per-device session listing and revocation, secure token storage, logout, and account suspension consistently with the web app.
- Decide on password recovery and email verification delivery before relying on email as the only recovery method.
- Add API-specific rate limits and audit events for authentication and progression changes.

**8.3 Build a small mobile release**

- Consider Expo/React Native to share TypeScript types and selected presentation logic with the existing React app.
- Start with sign-in, set progression, opening packs, collection/mastery, and choosing unlocked themes.
- Treat pack results and XP as server-authoritative. Cache read-only catalogue and collection views for responsiveness, but require connectivity for pack reveals and progression changes.
- Add push notifications only as an opt-in follow-up; do not make notifications or daily attendance necessary for progression.
- Release to a small beta, validate account/session and migration behavior, then prepare store listings and support/privacy information.

This should initially be a private API for the first-party app, not an unrestricted public developer API. A public API would need separate quotas, keys, terms, and support commitments.

## Decisions before future work

1. Should normal, holo, and reverse finishes count as separate collection entries?
2. Should streak rewards continue to reset at 00:00 UTC?
3. Which email provider should handle verification and password recovery?
4. For a mobile app, should the first release be Expo/React Native, and which platforms are in scope?
5. Should collection sharing be public-by-link, invite-only, or omitted from the first social release?

## Guardrails

- Keep pull rates visible and independent of XP, collection status, streaks, and cosmetics.
- Do not make paid currency, real-money purchases, or trading necessary for collection progress.
- Keep newly introduced sets limited to verified artwork-complete catalogues and sourced pack profiles.
- Preserve account and collection data across routine deployments; back up the SQLite volume before schema changes or migrations.
- Keep this clearly identified as a fan-made digital simulator, not physical-card ownership or an official Pokémon product.
