# Pokémon TCG Explorer — implementation handover

Prepared: 19 October 2026. Intended recipient: the AI/API coding agent implementing this project.

## 1. Goal and working assumptions

Build a small, polished web application that runs locally and uses TCGdex to browse Pokémon trading cards, explore sets grouped by release year, search cards, and inspect a card with an interactive 3D tilt and glare effect.

The owner is a PHP/Laravel developer learning TypeScript. Prefer readable, conventional code with clear boundaries over clever abstractions. This document authorises implementation of the local application; hosting and publishing are outside scope.

Default to English physical Pokémon TCG cards. Pokémon TCG Pocket, additional languages, account systems and actual collection management are separate future features. Internet access is required for fresh API data and uncached images. Running on localhost does not make the app offline.

## 2. Recommended technology choices

| Area | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript, strict mode | Typed API boundaries and a consistent language throughout the UI |
| UI | React, function components and hooks | Reusable cards, filters, pages and interactive state |
| Tooling | Vite with the React TypeScript template | Simple local development and production build |
| Styling | Plain CSS, CSS Modules for components, shared CSS variables | Direct control of layout and card effects without another styling framework |
| API | Official `@tcgdex/sdk`, behind one application adapter | Typed API access without coupling views to SDK objects |
| Remote state | TanStack Query | Request caching, deduplication, loading/error state and background refresh |
| Navigation | React Router, hash routing | Bookmarkable local views and refresh-safe navigation without server rewrite setup |
| Personal settings | `localStorage` | Small favourites list and preferences; no database needed |
| Tests | Vitest and React Testing Library | Focused unit and interaction checks |
| Browser checks | Playwright if available | A few meaningful end-to-end flows and visual checks |
| Standards | ESLint and Prettier | Consistent code and automated checks |

Use current mutually compatible stable releases at implementation time, verify supported Node.js requirements, and commit the npm lockfile. Do not invent package versions. Use npm consistently. Start from the official Vite `react-ts` template.

No Laravel, Express, Next.js, Redux, database, Docker or Three.js is required for this scope. If the SDK lacks a needed operation or cancellation mechanism, use native `fetch` inside the same adapter for that operation. Verify browser access early. If CORS actually blocks the API, add a narrowly scoped Vite development proxy and document the build/preview implications before considering a backend.

## 3. Version one scope

### Sets page

- Default landing view: sets grouped by release year, newest first.
- Each set tile shows name, logo or fallback, release date when known, and total card count.
- Filters: year and set-name search. Sort: newest or oldest, with name and ID as deterministic tie breakers.
- Keep sets with unavailable dates in an explicit “Unknown year” group. Never guess dates from IDs, names or series.
- Clicking a set opens its card grid. Display breadcrumbs, set information and a search field scoped to that set.

### Cards and global search

- Provide a separate global card-search page. Do not load every card image on startup.
- Start remote searching after at least two trimmed characters, debounced by approximately 300 ms.
- Support name search, optional set and year filters, and explicit “Load more” pagination where supported.
- Empty query shows instructions, not the entire card catalogue. A set page can show its cards without a query.
- Define filter semantics as AND: card name matches, card belongs to selected set if any, and its set belongs to selected year if any.
- A year filter means the release year of that card’s set in the selected English catalogue; it does not mean the Pokémon’s debut year or the first printing of an artwork.
- Show card name, printed/local number and image in grids. Show set name when it is known; do not trigger a full card request per tile solely to populate metadata.
- Reset pagination when filters change. A stale response must never replace a newer search.

### Card details and visual effect

- Open cards on a dedicated details route, with an explicit return link and preserved browsing context.
- Show high-quality image, name, set, number, rarity, types, HP, illustrator and available attacks/other useful fields. Omit absent fields cleanly.
- Include a restrained pointer-driven tilt, moving glare, soft shadow, and an effect on/off preference.
- Include an “Open set” action when the set relationship is available.

### Small convenience feature

- Favourites: toggle from cards/details and browse a favourites page.
- Store a versioned array of card IDs and selected language, not complete API objects. Resolve favourites with caching and bounded concurrency; preserve missing IDs so users can remove unavailable cards.
- Favourites are browser-local; clearing browser storage removes them.

### Deferred

Accounts, owned quantities, collection completion, prices, marketplaces, deck building, trades, multilingual switching, Pocket cards, offline image downloads and deployment. Complete the core explorer before adding any of these.

## 4. API integration and data strategy

Official references are listed in section 13. The following are documented API capabilities; exact SDK method signatures and live response shapes must be verified during implementation.

TCGdex supplies card, set and series resources. Full set records expose `releaseDate` and a brief card list. The documented brief set object does not expose `releaseDate`; do not assume a set listing supplies enough information for year grouping. [References 1–4]

### First implementation checkpoint

Inspect representative live responses for the sets list, full set, card list/search and full card. Verify optional/missing image behaviour, SDK browser compatibility, cancellation, search field support, pagination and cross-origin requests. Record concrete findings in the README. Do this before committing to a search strategy.

### Set catalogue

1. Fetch brief sets once and display useful tiles immediately.
2. Reuse cached full set metadata where possible. Fetch missing full records in the background with a concurrency cap of about four.
3. Normalise each response into a small application set summary containing ID, name, image references, counts, series ID/name when supplied, release date and derived release year.
4. Persist only the compact summary index in a versioned local cache, with a timestamp and a proposed 24-hour freshness period. Do not persist every set’s nested card array in `localStorage`.
5. Reconcile cached IDs with the current listing. Show progress while grouping is incomplete, and offer retry for failed records. Failed fetches mean unresolved metadata, not proof that a set has no date.
6. Keep a visible distinction between a completely indexed year catalogue and partially loaded results. Do not present partial year-search results as complete.

Full set requests may contain substantial card lists. Avoid a fresh catalogue sweep on every navigation or reload; preserve completed metadata and retry only unresolved work. If the initial sweep is too expensive in practice, retain progressive loading and explain it in the UI rather than inventing a bulk endpoint.

### Search strategy

TCGdex documents filtering, sorting and opt-in pagination. Its lists are not necessarily paginated by default. Use documented query parameters or SDK equivalents and encode user input safely. [Reference 5]

Prefer API-side name and set filtering where verified. Do not assume that `releaseDate` on a card query means its set release date, or that nested set filters are supported without testing them.

For an active year filter, use the set catalogue to find eligible sets. Their cached/fetched brief card lists can be searched locally for card names, then combined in deterministic order and paginated for display. For a selected set, search that set’s brief card list locally. Limit fetching to eligible sets, cap concurrency and show preparation progress. Distinguish client-side display pagination from network pagination in the adapter and documentation.

For unrestricted global searches, use remote name search with pagination. Do not filter only one fetched page by year and call that the complete result. A “no results” state is valid only after the relevant search/index work completes successfully.

The brief card response may omit the set relationship. When a card comes from a set list, attach the known set ID in the adapter. For global results, obtain authoritative set information on detail load; do not derive set IDs by splitting card ID strings unless that convention is explicitly verified and tested.

### Images and failures

- Build card URLs from the API-provided asset base: `/low.webp` for grids and `/high.webp` for details. Logos/symbols use `.webp`, without a card quality segment. [Reference 6]
- Centralise these rules in tested image helpers. Missing images show a neutral card-shaped placeholder. Prevent infinite image-error fallback loops.
- Reserve image space using the supplied image proportions; preserve full artwork with `object-fit: contain`.
- Lazy-load grid images and load details eagerly. Never prefetch all high-resolution images.
- Cache query results with resource/language/filters/page in query keys. Suggested stale time: 24 hours for set metadata, 10 minutes for searches and card details. These are app defaults, not provider guarantees.
- Retry transient failures at most twice with backoff; do not retry not-found responses indefinitely. Respect provider throttling and Retry-After when returned.
- Use AbortSignal where supported. Otherwise keep results keyed by request parameters and ignore obsolete completions; do not claim that an uncancellable SDK request was aborted.

## 5. Architecture and project organisation

Use a small feature-oriented structure. Create files as needed rather than generating empty scaffolding.

```text
src/
  app/                  # router, providers, app shell
  components/           # genuinely shared controls and UI states
  features/
    sets/               # catalogue, year groups, set cards and set page
    cards/              # search, card grid, details and tilt component
    favourites/         # persistence hook and favourites page
  lib/
    tcgdex/             # client, adapter, response mapping, image helpers
    storage/            # versioned cache and safe localStorage utilities
  styles/               # tokens, global styles, reset
  test/                 # shared test setup and small fixtures
```

Suggested routes: `/#/sets`, `/#/sets/:setId`, `/#/cards?q=pikachu`, `/#/cards/:cardId`, `/#/favourites`. Put active search/filter/sort parameters in URL search parameters inside the hash route. Unknown routes and missing resources need friendly recovery links.

Data flow: page or feature hook → query layer → TCGdex adapter → SDK/fetch. Components render application models; they should not know raw endpoint URLs or SDK relationship-loading methods.

Use SDK types at the boundary and small application types such as `SetSummary`, `CardSummary`, `CardDetails` and `SearchFilters` inside features. Do not reproduce the provider’s entire schema. Keep brief and full records distinct so code cannot accidentally treat a summary as a complete card.

TanStack Query owns remote state; URL parameters own navigable filters; local React state owns temporary interaction; localStorage owns favourites and preferences. Avoid copying the same state into several stores. Do not persist SDK instances or methods.

## 6. Design direction

Aim for a tidy collector’s catalogue: artwork first, calm surrounding UI, familiar navigation.

- Default to a dark navy/charcoal background, slightly lighter panels, warm light text and one restrained gold accent. Keep text contrast accessible; validate actual colours during implementation.
- Use a system font stack; no external font dependency needed. Use clear headings, short labels, consistent spacing and readable metadata.
- Desktop: navigation/header, prominent search/filter row and responsive grid. Mobile: compact header, wrapping filters and typically two card columns when width permits.
- Separate set tiles from card tiles visually. Group years with clear headings and a count of sets, labelled accurately during loading.
- Give the card image visual priority. Keep labels outside the tilted artwork so text remains easy to read.
- Use subtle skeletons while loading, contextual errors with retry, useful empty states and placeholders for missing art.
- Keep set order and card order stable while scrolling. Use natural printed-number ordering where appropriate, retaining nonnumeric promo identifiers; never treat card numbers as guaranteed integers.
- Include unobtrusive TCGdex attribution and an unofficial fan-project note. Use real API artwork; do not generate substitute trading-card images.

## 7. 3D effect implementation requirements

Use CSS transforms and a decorative overlay, without WebGL. The effect is visual presentation of a flat image; it does not require a 3D model.

- Apply perspective to an outer wrapper and rotation to an inner visual layer. Start around 900px perspective and a maximum tilt of 8 degrees in either direction; tune visually.
- Normalise pointer position relative to the stable outer wrapper, clamp values and update CSS custom properties through a ref, batched with requestAnimationFrame.
- Avoid React state updates for every pointer movement. Recompute bounds on pointer entry and relevant size/scroll changes rather than measuring transformed bounds every frame.
- Move a low-opacity radial/linear gradient with the pointer. Decorative layers use `pointer-events: none` and are hidden from assistive technology.
- Reset tilt and glare on pointer leave, pointer cancellation and blur where relevant. Cancel outstanding animation callbacks on unmount.
- Use a short easing transition for entry/reset. Avoid permanent idle animation and excessive glare that hides the artwork.
- Enable tilt only on fine pointers with hover support. Touch users retain normal scrolling and tapping, without device-motion permissions.
- Honour `prefers-reduced-motion`, and persist the effect toggle. Disable decorative movement when reduced motion is requested.
- Use the strongest effect on details; grid hover should be subtle. Keep focus outlines visible and interactive controls outside problematic transformed/overlaid layers.
- The glare is decorative, not an assertion that a specific printing is holographic. Do not label card variants based on the animation.

## 8. Coding standards

1. Enable TypeScript strict mode. Avoid `any`, unchecked type assertions and non-null assertions used to silence uncertainty. Narrow unknown data and handle nullable fields explicitly.
2. Use function components, hooks and named exports for application modules. PascalCase for components/types; camelCase for functions/variables; `use` prefix for hooks.
3. Prefer straightforward functions and composition. No service containers, generic repositories or class hierarchy merely to resemble Laravel.
4. Keep API calls, storage parsing and image construction outside presentational components. Extract a helper when it has a clear responsibility, not solely to reduce line counts.
5. Use immutable updates, stable resource IDs as list keys, and derived values rather than duplicate state. Effects synchronise with external systems; they should not replace ordinary calculations.
6. Keep query keys and defaults centralised. Never fetch during render or place unbounded asynchronous maps across the catalogue.
7. Centralise design tokens for colour, spacing, radius, shadows and motion. Use CSS Modules for local styles; avoid unexplained magic values scattered across files.
8. Use semantic HTML, labelled inputs, real links/buttons, keyboard navigation and visible focus. No clickable divs or nested buttons/links. Announce search/progress status sensibly without noisy per-card announcements.
9. Parse stored data defensively with a schema version. Corrupted data or quota/storage exceptions must not crash the app. Cache eviction must not clear favourites.
10. Render API content as text. Do not inject provider strings as HTML. Keep credentials out of source; Vite client environment variables are public. No credentials should be required for the proposed initial public-data workflow; verify current provider requirements.
11. Add comments for tradeoffs, edge cases and non-obvious API behaviour. Avoid narrating obvious code. Leave no abandoned scaffolding, console spam or unexplained TODOs.
12. Keep changes focused and preserve unrelated existing work. Commit the lockfile; ignore dependencies, build output and local environment files.

## 9. Ordered build plan

| Phase | Work | Exit condition |
| --- | --- | --- |
| 1 — Verify and initialise | Inspect existing workspace instructions; scaffold if needed; verify API shapes/browser access; configure standards | Local shell runs, typed adapter fetches a real set and card |
| 2 — Sets | Brief listing, cached date enrichment, year grouping, filters, sorting, failure recovery | Real sets appear under correct years with honest loading status |
| 3 — Set cards | Set route, card grid, image helpers, local search and natural ordering | A real set opens and its cards can be searched |
| 4 — Global search | Debouncing, cancellation/stale handling, pagination, combined set/year semantics | Search results remain correct when typing/filtering rapidly |
| 5 — Details | Details route, high-quality image, available metadata, return navigation | Deep links and back navigation work with missing fields handled |
| 6 — Visual polish | Tilt, glare, responsive spacing, reduced-motion and touch behaviour | Smooth effect without blocking reading, scrolling or keyboard use |
| 7 — Favourites | Versioned local persistence, favourites page and effect preference | Favourites survive reload and unavailable cards remain removable |
| 8 — Verify and hand over | Focused tests, browser checks, production build and README | All acceptance criteria below pass or a concrete blocker is reported |

Prioritise phases 1–6 for a useful first-day result. Favourites are the first feature to defer if time is constrained. Do not silently drop year organisation, working search or the card effect.

## 10. Verification and acceptance criteria

Use small deterministic fixtures for automated tests; keep live API smoke checks separate so provider outages do not make the entire test suite fail.

- [ ] Clean installation works using the documented supported Node.js version, `npm ci` and `npm run dev`.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` succeed; define these scripts explicitly.
- [ ] Real API sets and cards display; no production view relies on fabricated fixtures.
- [ ] Year derives from full set dates, newest/oldest ordering is correct, and unknown dates remain visible.
- [ ] Brief sets without dates trigger the intended enrichment path. Partial failures retain successful records and expose retry.
- [ ] Reload uses the compact metadata cache; expiry/schema mismatch is handled; corrupt storage does not crash startup.
- [ ] Set searches, global searches and combined year/set/name filters behave according to section 3, across multiple pages and empty results.
- [ ] Rapid query changes cannot display stale results; changing filters resets pagination; appended pages contain no duplicate card IDs.
- [ ] Image helpers produce correct card versus logo URLs. Missing/broken images have a finite fallback path.
- [ ] Missing resources, API outages and throttling show useful states without endless retries or a blank screen.
- [ ] Card details use high-quality art and survive direct navigation/reload. Returning preserves filters and, where feasible, scroll position.
- [ ] Tilt works with a mouse, resets correctly, and respects the preference and reduced-motion setting. Touch scrolling works normally.
- [ ] Favourites survive reload, are deduplicated, and remain manageable when a card fails to load.
- [ ] Keyboard-only navigation works. All controls have labels and visible focus. Check approximately 375px, 768px and 1440px widths for overflow and readable grids.
- [ ] Browser console has no uncaught errors, React key warnings or repeated failed-request loops.

Prioritise tests for date grouping, natural card-number sorting, URL construction, storage recovery, filter combination correctness, stale-response handling and favourite persistence. Add a few integration tests covering set browsing → card details → return and global search. Avoid brittle snapshots and tests that merely restate framework behaviour.

## 11. Expected deliverables

- Working local source project, organised as above or a documented equally simple equivalent.
- README with prerequisites, install/run/build/preview/test commands, architecture overview, actual API assumptions, cache reset instructions and known limitations.
- `.env.example` only if configuration is needed; no unnecessary environment setup.
- A concise implementation summary: completed features, commands actually run and their results, remaining limitations, and any material deviation from this plan.
- If browser checks cannot be run, state that explicitly rather than claiming visual or interaction verification.

## 12. Instructions to the implementation agent

Build this application, rather than only proposing another plan. Read repository instructions and inspect existing files first. Make reasonable reversible decisions within this scope and proceed without repeatedly requesting confirmation. Start by verifying the API contract and browser access, then follow the build order.

Prefer the smallest complete implementation meeting the requirements. If an assumption fails, adapt within the proposed architecture and document the reason. Do not invent API properties, endpoints, total counts, card variants or release dates. Keep the user informed at meaningful milestones. Do not publish the application or add unrelated product features.

## 13. Official references

Checked on 19 October 2026. Recheck exact package APIs and runtime requirements during setup. Architecture, UX defaults and cache timings in this document are recommendations rather than TCGdex guarantees.

1. TCGdex overview: https://tcgdex.dev/
2. TypeScript SDK: https://tcgdex.dev/sdks/typescript
3. Full set object: https://tcgdex.dev/reference/set
4. Brief set object: https://tcgdex.dev/reference/set-brief
5. Filtering, sorting and pagination: https://tcgdex.dev/rest/filtering-sorting-pagination
6. Asset URL formats: https://tcgdex.dev/assets
7. Vite setup and runtime prerequisites: https://vite.dev/guide/

