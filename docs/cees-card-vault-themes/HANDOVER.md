# Handover: Unlockable Pack Themes for Cee's Card Vault

You are implementing a cosmetic theme system for **Cee's Card Vault**, an existing Pokémon TCG pack-opening simulator. Players unlock six pack themes in order. Each theme changes two things: the booster wrapper shown before opening, and the card back shown on face-down cards. Themes are purely cosmetic and must not change pull rates or card contents.

Before writing code, explore the existing repository to learn its framework, state management, how packs are opened, how cards and their rarity and energy type are represented, and how (or whether) player progress is persisted. Adapt everything below to the conventions you find. If something this spec depends on does not exist (for example, no persistence layer, or cards without an energy-type field), stop and ask the user how they would like it handled rather than inventing a large new subsystem.

Visual reference (design canvas, all six themes side by side): https://claude.ai/artifact/3vCSXqrG3t4nVdfQiMEZfe

## What's in this package

`themes.json` is the single source of truth for theme metadata: id, order, name, tier, tagline, a machine-readable unlock rule, palette, motif description, opening-effect spec and asset paths. Load it as data rather than hard-coding theme details in components.

`assets/packs/<id>.svg` holds the six booster wrappers at 240×430. `assets/card-backs/<id>.svg` holds the six card backs at 300×419, which is the standard 63×88 mm card ratio, so they can scale to whatever card size the app already uses.

`preview.html` is a quick gallery of every asset. Open it through a local server.

## The six themes

| Order | id | Name | Tier | Unlock |
|---|---|---|---|---|
| 1 | `vault-classic` | Vault Classic | starter | Default, always unlocked |
| 2 | `ember-forge` | Ember Forge | common | Open 25 packs (any theme) |
| 3 | `tidal-depths` | Tidal Depths | uncommon | Pull 15 Water-type cards |
| 4 | `verdant-grove` | Verdant Grove | uncommon | Open packs on 7 distinct calendar days |
| 5 | `storm-circuit` | Storm Circuit | rare | Pull 5 holo rares |
| 6 | `eclipse-prism` | Eclipse Prism | secret | Unlock all five other themes |

## Unlock rules

Each theme's `unlock` object has a `type` that the unlock evaluator must handle:

- `default`: always unlocked.
- `packs_opened` (`count`): total packs opened across all themes.
- `cards_pulled_by_energy_type` (`energyType`, `count`): cumulative cards pulled whose type matches. Duplicates count. Map `"Water"` to however the codebase stores card type.
- `distinct_days_with_pack_open` (`count`): number of unique local calendar dates (YYYY-MM-DD in the user's timezone) on which at least one pack was opened. Days do not need to be consecutive.
- `rarity_pulled` (`rarity`, `count`): cumulative cards of that rarity. Map `"holo_rare"` to the codebase's rarity naming. If the app distinguishes several holo-or-better rarities, ask the user whether higher rarities should also count.
- `themes_unlocked` (`themeIds`): unlocked once every listed theme is unlocked.

Track the minimum stats needed: `packsOpened`, `cardsByEnergyType`, `cardsByRarity`, `packOpenDates` (a set of date strings), plus `unlockedThemeIds` and `selectedThemeId`. Persist them wherever the app already persists player data; if it uses nothing, use `localStorage` under a single namespaced key (e.g. `ccv:themes:v1`) with safe parsing and a fallback to defaults when data is missing or corrupt.

Evaluate unlocks after every pack open, once the pack's contents are known. Keep the evaluator a pure function, `(stats, themes) -> unlockedIds`, so it is easy to unit test. Unlocks are permanent: never re-lock a theme.

## UI requirements

1. **Theme picker.** Somewhere natural in the existing UI (settings or next to the open-pack button), show all six themes in order. Unlocked themes show the wrapper thumbnail and can be selected. Locked themes show a dimmed or silhouetted state with their `unlockText` and progress toward it (e.g. "12 / 25 packs"). The secret theme should stay hidden behind a "???" placeholder until it is unlocked, keeping the surprise.
2. **Selection** sets `selectedThemeId`, persists it, and applies immediately to the next pack shown.
3. **Unlock moment.** When a pack open triggers a new unlock, show a short, non-blocking notification after the reveal finishes (not mid-reveal), naming the theme and offering to equip it.
4. **Applied theme.** The wrapper shown before opening uses the selected theme's pack SVG. Any face-down card uses the selected theme's card-back SVG.

## Rendering the SVGs

The lettering in the SVGs uses the **Bungee** and **Space Grotesk** fonts (Google Fonts). An SVG loaded through `<img>` or CSS `background-image` cannot load web fonts, so the text falls back to Impact. Use one of these approaches:

- **Preferred:** render the SVGs inline (as components or inlined markup) and load Bungee and Space Grotesk once at the app level.
- **Alternative:** convert the text to outlined paths in a build step so the files work as plain images.

Element ids that each SVG reuses (such as `dial`, `crimp-top`, `foil-shine`) are deliberate animation hooks. Gradient, pattern and clip-path ids are already prefixed per theme, so several themes can sit inline on one page without id collisions. Keep that prefixing if you modify the files, and make it unique per instance if the same theme is ever inlined more than once on a page (e.g. a grid of face-down cards). One option is to render a single hidden `<defs>` block per theme and reference it.

## Opening effects

Each theme has an `openingEffect.spec` in `themes.json`. Implement them using whatever animation approach the codebase already uses (CSS, Framer Motion, canvas and so on). Keep each effect short, under about 1.5 s, so it never slows down repeated openings. Respect `prefers-reduced-motion`: under reduced motion, replace particle, flash and sweep effects with a simple fade. Never add an effect that blocks input, and keep the white flash in Storm Circuit brief and low intensity for photosensitivity.

If effects for all six themes are too much for one pass, ship the theme system, unlocks, picker and static assets first, then add the effects one theme at a time.

## Intellectual property guardrails

These designs are deliberately original. The card back uses a Cee's Card Vault combination-dial emblem, not the official Pokémon card back. Do not swap in the official card back, Pokémon logos, the Poké Ball or any official artwork for the wrappers or backs. Card fronts are outside the scope of this task and should stay as they currently are.

## Acceptance criteria

- New players have only Vault Classic unlocked and selected.
- Each unlock rule triggers exactly at its threshold, and unit tests cover every rule type, including the distinct-days rule across a timezone date boundary and Eclipse Prism unlocking only once the other five are unlocked.
- Unlocks and the selected theme survive a page reload.
- Corrupt or missing saved data falls back to defaults without crashing.
- The selected theme is applied to both the wrapper and the face-down card backs.
- Locked themes show progress; Eclipse Prism stays hidden until unlocked.
- Reduced-motion users get the fallback fades.
- No change to pull rates or pack contents.
- Existing tests still pass.

## Suggested order of work

1. Read the codebase and report back a short plan that maps this spec onto it, including any questions.
2. Add `themes.json` and the assets, plus the stats tracking and a pure unlock evaluator with tests.
3. Apply the selected theme to the wrapper and card backs.
4. Build the theme picker and the unlock notification.
5. Add opening effects, one theme at a time.
