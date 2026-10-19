# Pack Simulator Roadmap

## Goal

Grow the pack simulator into a persistent collection and progression experience. A player should be able to open simulated packs, see their set completion, and carry that progress between visits and devices. Progression should add goals and rewards without changing the published pull rates or making rare cards a requirement for enjoying the rest of the simulator.

This is a digital simulation only. Collection progress does not represent ownership of physical cards.

## Current foundation

- Packs can be opened for the configured sets, with the simulator's published pull-rate profiles.
- The set roadmap shows which card identities have been revealed and grayscales the rest.
- Guest collection progress is stored in browser local storage, per set. Signed-in progress is stored on the server and can be used across devices.
- Email/password accounts use ULID user IDs, first names, optional preset avatars, scrypt password hashes, and HTTP-only session cookies.
- Existing browser collection IDs can be merged into an account. Imported cards do not award XP.
- The tracker currently records card identity, not separate normal, holo, and reverse finishes.
- Pack catalogues are loaded from TCGdex. The current set list and pull-rate profiles are configured in the app.
- Only sets whose full English TCGdex card records all contain image URLs are eligible for unlocks. That check is cached for 12 hours.
- XP, daily streak state, achievements, pack reveals, and set unlocks are stored in SQLite on the server.

## Recommended phases

### Phase 1 — Collection roadmap (complete)

- Show the set card roadmap and collection count below the observed pull rates.
- Mark a card collected when it is revealed; keep the guest collection in browser storage.
- Keep guest pack openings available for the starter set.

### Phase 2 — Accounts and synced progress (implemented)

- Register and sign in with email and password; user IDs are ULIDs.
- Store the first name and an optional preset avatar. Profile editing and password changes are available after sign-in.
- Store sessions, XP, streak state, unlocks, achievements, pack reveals, and unique collected card IDs in the persistent SQLite database.
- Offer an explicit merge of browser collection IDs into the account. This merge does not mint XP.
- Keep guest mode. Guest XP is not tracked; only the starter set can be opened until the player signs in.
- Email verification and email password recovery remain future work. A signed-in player can change their password.

### Phase 3 — XP, streaks, and unlock rules (implemented)

Current XP rewards are deterministic and do not change pack probabilities:

- First card revealed in each pack: **+1 XP**.
- First copy of a card identity in a set: **+5 XP**; duplicates do not add XP.
- First holo or reverse finish on the account: **+10 XP** once.
- First full-art rarity pull on the account: **+25 XP** once.
- Complete all reveals in a pack: **+3 XP**.
- First pack session each UTC day: **+5 XP**, plus **+2 XP per consecutive streak day**, capped at **+15 XP**.

The first configured set is free. XP is spent when unlocking a set. The shared `config/pack-sets.json` file sets the order and cost for each pack set: Journey Together (free), Surging Sparks (350 XP), Stellar Crown (800), Twilight Masquerade (1,500), Scarlet & Violet—151 (2,500), Paldean Fates (4,000), Pitch Black (4,500), Black Bolt (5,000), White Flare (5,500), Chaos Rising (6,000), Perfect Order (6,500), Phantasmal Flames (7,000), Prismatic Evolutions (7,500), Mega Evolution (8,000), Destined Rivals (8,500), Ascended Heroes (9,000), and 30th Celebration (9,500). Move entries in this file to change the display/progression order and edit `xpCost` to tune the threshold. Each set is unlocked by XP alone; completing a previous set is not required. The progress API checks TCGdex artwork eligibility before displaying or unlocking a set.

On the next progress API deployment, a one-time migration resets existing account XP and paid set unlocks, re-unlocks the first configured set, and clears one-time XP achievement flags. It preserves player accounts, sessions, card collections, and streak state.

### Phase 4 — Goals and streak flexibility

Expand the daily streak feature without making missed days feel punishing.

- Add optional daily and weekly goals, such as revealing a new card, opening packs from a chosen set, or finding a card of a given rarity.
- Consider a limited grace day or streak freeze earned through play.
- Consider whether the daily reset should be configurable to the player's local timezone; it currently resets at 00:00 UTC.
- Never lock previously unlocked sets or remove collection progress after a missed day.
- Keep rewards bounded so streaks and repeated trivial actions cannot overwhelm the set unlock economy.

### Phase 5 — Rewards and collection tools

Use progression to personalize the simulator without changing card odds.

- Unlock pack wrappers, card backs, table themes, profile badges, and collection display styles.
- Add set mastery badges and a profile summary of completed sets and milestones.
- Add duplicate counts and collection statistics by rarity and finish.
- Add a binder view for organizing collected cards and a shareable, read-only collection link with privacy controls.
- Consider a “surprise me” pack option that selects from sets the player has unlocked.

Cosmetics and achievements should be the default rewards. Avoid paid boosts or rewards that alter pull rates; rates should remain visible and consistent with each set's stated profile.

### Phase 6 — Social features (optional)

Only pursue this after account sync and privacy controls are established.

- Allow players to compare public collection summaries or share a specific pack opening.
- Add opt-in leaderboards for collection milestones, not raw pack volume alone.
- Treat simulated card exchanges as a separate design decision. Trading introduces duplicate ownership, abuse prevention, and fairness concerns, so it should not be required for collection completion.

## Other ideas to consider

- **Set spotlight:** a rotating set with optional goals and cosmetic rewards, without changing its pull rates.
- **Personal milestones:** celebrate first card, first rare pull, first complete rarity group, and first finished set.
- **Pull journal:** searchable history with filters for set, rarity, finish, and date.
- **Collection completion estimate:** show how many unique cards remain and summarize the rarest uncollected tiers, without promising a number of packs required.
- **Accessibility options:** reduced animation, skip-to-summary, keyboard operation, and adjustable reveal pacing.
- **Seasonal cosmetics:** time-limited themes can be earned, while card catalogues and set access remain available after a season ends.

## Decisions to make before implementation

1. Should normal, holo, and reverse finishes count as separate collection entries?
2. Should the daily streak reset remain at 00:00 UTC or follow the player's local timezone?
3. Which email service should be used for verification and password recovery?
4. Which additional sets have complete image references and sufficiently sourced pull-rate profiles to add?

## First progression release (implemented)

The first progression release includes account-backed progress, an explicit guest collection merge, XP rewards, daily streaks, artwork-eligible sets, and XP-spend unlocks. More sets can be added by adding a sourced pack profile and its unlock cost. Pull odds remain independent of XP, streaks, and unlock state.
