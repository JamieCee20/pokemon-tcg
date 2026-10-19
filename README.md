# Card Atlas

A local Pokémon TCG catalogue for browsing sets and cards in multiple languages, viewing card details and market prices, and keeping browser-local favourites. Card data and artwork come from TCGdex; market prices come from Pokemon API. This is an unofficial fan project; it is not affiliated with Nintendo, Creatures Inc. or GAME FREAK.

The app needs an internet connection for fresh catalogue data and uncached artwork. It does not download artwork for offline use.

## Requirements and commands

Use Node.js 20.19+ or 22.12+ and npm. The project was scaffolded from Vite's React TypeScript template; use `package-lock.json` to install the exact dependency tree.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
```

Vite prints the local development URL after `npm run dev` starts.

## Features

- Sets can be browsed in the languages provided by TCGdex. Set names can be searched, and dated sets can be ordered newest or oldest. Sets with no valid release date stay under “Unknown year”.
- Physical Pokémon TCG expansions and Pokémon TCG Pocket sets have separate catalogue tabs. Pocket sets belong to TCGdex's `tcgp` series; they are digital Pocket expansions rather than physical booster sets.
- The brief set list is shown first. Full set records are then fetched with a four-request concurrency cap. A versioned compact catalogue cache keeps release-date and set metadata between visits, without nested card lists; year searches load matching set card briefs on demand. Unfinished or failed set records remain visible as unresolved and can be retried.
- Set pages search their card briefs locally. Global card search starts after two trimmed characters, waits 300 ms, uses TCGdex name filtering and offers explicit pagination. Set and release-year filters use full set card lists and are combined with the name filter using AND semantics.
- Card details show available provider fields and high-quality artwork. Mouse and pen tilt is limited to fine pointers, can be turned off, and respects reduced-motion preferences.
- Card details look up exact card IDs in Pokemon API and show Cardmarket and TCGplayer price fields when available. Browser and server caches keep results for 12 hours to reduce provider requests. Japanese lookups use the provider's Japanese catalog; Chinese-language pages try the English catalog and show a price only for an exact card ID match. Prices can be displayed in GBP, EUR, or USD; conversions use daily exchange rates and are marked as approximate, while provider currencies remain the source values.
- Set pages can sort card numbers in either direction or sort by TCGplayer market price or Cardmarket near-mint price. Price sorting uses the provider's batch lookup in groups of at most 20 cards; cards without a matching price stay at the end.
- The separate APITCG explorer previews product images, card and set details, TCGplayer printing prices, and raw product records. Searches use the server proxy and its persistent 24-hour cache and daily request cap.
- Favourites store card IDs separately for each selected language in local storage. Their records are resolved with a four-request concurrency cap; IDs remain removable when a card is unavailable.

## Structure

- `src/lib/tcgdex/` contains the API adapter, provider-to-app mapping, image URL helpers and app-level types.
- `server/pricing-api.mjs` keeps provider keys server-side, proxies exact card-ID price lookups, and provides a bounded APITCG trial proxy with a persistent cache.
- `src/features/sets/` handles progressive set enrichment, release-year grouping and set browsing.
- `src/features/cards/` contains remote and set-scoped search, card details, card artwork and the tilt effect.
- `src/features/apitcg/` contains the separate APITCG product data explorer.
- `src/features/favourites/` stores and resolves local card IDs.
- `src/lib/storage/` parses versioned browser data defensively.

TanStack Query caches remote resources, the hash router keeps browse filters bookmarkable, and local storage holds the compact set index, favourites and the card-effect preference.

## TCGdex API notes

The adapter uses the official `@tcgdex/sdk` for full set and card lookups, with a client for the selected language. It replaces the SDK's browser local-storage cache with its in-memory cache, so full set card arrays are not persisted. It uses the documented REST API for brief set lists, Pocket series membership and paginated name search so those requests can receive an `AbortSignal`. SDK lookups do not accept an abort signal in the documented method examples; the adapter discards their results if the route/query was cancelled. SDK and application models are kept behind the adapter. If the SDK cannot initialize because browser storage access is blocked, full set and card requests use the same REST adapter fallback.

The current TCGdex references document that brief set entries contain logo, symbol and card counts but no release date; full set entries add `releaseDate`, series information and card briefs. Search supports name filtering and opt-in pagination, while card and set assets use an API-provided asset base with `.webp` variants. A live smoke check on 19 October 2026 confirmed the English sets list, full set, paginated card search and full card endpoints returned HTTP 200. The sampled brief search omitted set information, while the full card included its set relationship. All four endpoint responses included `Access-Control-Allow-Origin: *`, so no development proxy was needed.

Language coverage varies across TCGdex collections. The app keeps separate catalogue caches and favourites for each selected language. Pocket expansions such as “Space-Time Smackdown” and “Celestial Guardians” are from the separate Pokémon TCG Pocket series; they appear in the Pocket tab, not the physical-set tab. An English Pocket image is an English-language digital Pocket card, not a Japanese or Chinese physical card.

The app follows these documented shapes:

- [TCGdex TypeScript SDK](https://tcgdex.dev/sdks/typescript)
- [TCGdex supported languages and data status](https://tcgdex.dev/status)
- [TCG Pocket series integration](https://tcgdex.dev/tcg-pocket)
- [Full set object](https://tcgdex.dev/reference/set) and [brief set object](https://tcgdex.dev/reference/set-brief)
- [Filtering, sorting and pagination](https://tcgdex.dev/rest/filtering-sorting-pagination)
- [Asset URL formats](https://tcgdex.dev/assets)
- [Vite setup and supported Node.js versions](https://vite.dev/guide/)

The adapter does not guess release dates or set relationships from card IDs. Global brief search results show set information only when the API includes it; the full card record supplies the authoritative relationship on the details page.

## Card pricing

Market prices are fetched on card details pages and on demand for set price sorting. The server calls the provider's exact `tcgid` search and confirms returned IDs before displaying or sorting data. Set sorting sends batches of at most 20 IDs per request. The RapidAPI key is read by the pricing proxy at runtime; it is never bundled into the public Vite app. The provider's Japanese catalog requires an Ultra or Mega plan, so Japanese lookups can fail when the subscribed plan does not include it. Chinese-language card pages query the English catalog and show a result only when the provider has the exact same card ID. Prices are reference data and are not adjusted for the selected finish or card condition.

For local development, run the proxy and Vite in separate terminals. In terminal 1, set the key only in the proxy process:

```sh
POKEMON_API_KEY=your_rapidapi_key npm run dev:pricing
```

In terminal 2, run Vite:

```sh
npm run dev
```

The proxy listens on port 3001 locally; Vite forwards `/api/pricing` to it. In production, Docker runs the proxy on a private app network and Nginx forwards the same path to it. The proxy caps uncached provider requests at 90 per UTC day by default. Set `POKEMON_PRICE_DAILY_LIMIT` in `.env` to a higher value for a larger plan, or `0` to disable the cap; cached lookups do not count.

### APITCG trial and cache

APITCG is available through the server-only trial routes `/api/apitcg/sets` and `/api/apitcg/products`. For example, `/api/apitcg/products?name=charizard&limit=10` asks APITCG for matching Pokémon cards. The proxy sends the secret in the `x-api-key` header and never exposes it to the browser bundle. The API explorer also has a full catalogue import that stores cards with their embedded set information locally, so browsing imported cards does not make APITCG requests.

Search responses are cached on the server for 24 hours and kept in the Docker named volume `apitcg-cache`. The same volume stores the imported catalogue and sync progress, so a container restart or rebuild does not erase them. The default allows at most two uncached APITCG requests per UTC day. The import fetches the sets list once, then reads Pokémon cards in documented pages of up to 100 records. If it reaches the daily cap, it pauses and resumes after UTC midnight. When the initial import completes, it checks for changed cards daily with `updatedSince` and refreshes the sets list weekly. The UI's “Import catalogue” / “Sync updates” button starts or resumes this work. The cap is shared with API explorer searches; raise `APITCG_DAILY_REQUEST_LIMIT` in `.env` if you want the first import to finish faster, keeping your APITCG plan's monthly quota in mind. Search cache holds up to 1,000 query results.

For local development, create `.env` from `.env.example` and put the key there, just as you do for Docker. `npm run dev:pricing` loads that file for the server process:

```sh
npm run dev:pricing
```

Vite forwards `/api/apitcg` to the local proxy. To inspect one small result, use `curl -i 'http://localhost:5173/api/apitcg/products?name=charizard&limit=1'`; check the `X-APITCG-Cache` and `X-APITCG-Requests-Today` response headers to see whether it used the cache and how many upstream calls have been made today. Catalogue status is available at `/api/apitcg/catalog`; locally stored cards are paged at `/api/apitcg/catalog/products?set=SET_ID&page=1&limit=24`. In Docker, the cache and catalogue volume is created automatically.

Currency conversion rates are fetched server-side from [Frankfurter](https://frankfurter.dev/) and cached for 12 hours. These are daily reference rates, so converted prices are estimates rather than additional market quotes. The currency selection is saved in the browser.

Plan limits and any charges are managed by RapidAPI. Subscribe to the provider's [CardMarket API TCG product](https://rapidapi.com/tcggopro/api/cardmarket-api-tcg), which is the host used by the [TCGGO API v1 documentation](https://www.tcggo.com/api-docs/v1/). The [Pokemon API site](https://www.pokemon-api.com/) links to the same provider.

The TCGdex documentation was checked on 19 October 2026. The Vite version in the lockfile supports Node.js 20.19+ or 22.12+; use a current supported Node release if the package manager reports a stricter template requirement. No browser automation was available in this environment, so visual checks at mobile/tablet/desktop widths still need to be done in a browser.

## Local data and reset

The browser stores the English set summary index under `card-atlas.set-catalogue.v2` and other language indexes with a language suffix, such as `card-atlas.set-catalogue.v2.ja`. Favourites use `card-atlas.favourites.v1` for English and a language suffix for other languages. The selected language is stored under `card-atlas.catalogue-language.v1`; the price currency uses `card-atlas.price-currency.v1`, and the card-effect preference uses `card-atlas.card-effect.v1`. Clear these keys in the browser's developer tools to reset individual app data. Clearing browser storage also removes favourites. Catalogue caches expire after 24 hours; card search and details use a 10-minute query stale time.

The app is not offline-first. It does not provide accounts, owned quantities, or offline image downloads. Price data requires a configured provider key and an internet connection.

## Deploy with Docker on a server

The production image builds the Vite app and serves its static files with Nginx. The app container joins an existing external Docker network so your Nginx reverse proxy can reach it by the stable name `card-atlas`. The app does not publish a host port; your existing proxy remains responsible for public HTTP/HTTPS and certificates.

### Requirements

- A Linux server with [Docker Engine](https://docs.docker.com/engine/install/) and the [Docker Compose plugin](https://docs.docker.com/compose/install/) (`docker compose` command).
- An Nginx reverse proxy running in Docker and attached to a user-defined Docker network.
- A subdomain configured in your DNS and reverse proxy.

This Compose setup expects the reverse proxy to be a container on the shared Docker network. It does not publish the app on a host port.

### Get the project files

Clone the repository on the server and move into its root directory:

```sh
git clone git@github.com:JamieCee20/pokemon-tcg.git
cd pokemon-tcg
```

### Find the reverse proxy network

On the server, list Docker networks and inspect the Nginx container to find the network it uses:

```sh
docker ps --format 'table {{.Names}}\t{{.Networks}}'
docker network ls
docker inspect <nginx-container-name> --format '{{json .NetworkSettings.Networks}}'
```

Use the exact network name from that output. If the reverse proxy is not attached to a user-defined Docker network, create one and connect both the proxy and this app to it; containers on a shared user-defined network can reach one another by name.

### Configure and start the app

From the project root on the server, create `.env`:

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env`, set the existing proxy network name, and add your RapidAPI key:

```dotenv
DOCKER_NETWORK=nginx-proxy
POKEMON_API_KEY=your_rapidapi_key
POKEMON_PRICE_DAILY_LIMIT=90
APITCG_API_KEY=your_apitcg_key
APITCG_DAILY_REQUEST_LIMIT=2
```

Replace `nginx-proxy` with the exact name you found. Get a key by subscribing to the provider's [CardMarket API TCG product on RapidAPI](https://rapidapi.com/tcggopro/api/cardmarket-api-tcg). Keep the key in `.env`; the pricing proxy reads it at container runtime. Do not put it in a `VITE_*` variable because Vite embeds those values in the public browser bundle. The app can still browse cards if the key is empty, but price lookups will report that pricing is not configured.

Paste your APITCG key as the value of `APITCG_API_KEY` in this same project-root `.env` file. Leave the existing `POKEMON_API_KEY` setting for the current pricing provider. APITCG's key is passed only by the server as an `x-api-key` request header. `APITCG_DAILY_REQUEST_LIMIT=2` caps uncached APITCG calls per UTC day; set it to `1` for a more conservative trial or `0` to remove the local cap. The search response cache, catalogue, and sync progress persist in the Docker `apitcg-cache` volume.

Build and start it:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

The `web` container exposes port 80 only inside the shared Docker network. Compose adds the network alias `card-atlas`; point the Nginx reverse proxy at `http://card-atlas:80`. The `pricing-api` service has no published port and is reachable only by the app's Nginx container on its private Docker network.

### Add the Nginx subdomain route

Create an `A` DNS record for the subdomain (for example, `cards.example.com`) pointing to your server's public IPv4 address. Add an `AAAA` record only if IPv6 is configured and reachable. In your reverse proxy, create a host for that subdomain and route it to `card-atlas` on port `80` using HTTP. Keep the existing TLS/certificate settings on the reverse proxy.

For a regular Nginx container, add a location inside the subdomain's existing virtual host. The Docker resolver lets Nginx find the app again after its container is recreated:

```nginx
location / {
    resolver 127.0.0.11 valid=30s ipv6=off;
    set $card_atlas_upstream card-atlas;
    proxy_pass http://$card_atlas_upstream:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

If you use Nginx Proxy Manager, add a Proxy Host for the subdomain with scheme `http`, forward hostname `card-atlas`, and forward port `80`; select the TLS certificate/settings already managed there. No extra public ports or firewall rules are needed for this app container.

Once the proxy route and DNS record are active, open `https://cards.example.com`.

To check that both containers are on the shared network, run `docker network inspect nginx-proxy` and confirm the Nginx and `web` containers appear. Use the network's actual name in place of `nginx-proxy`.

To deploy a later version, update the project files and rebuild from the project root:

```sh
git pull --ff-only
docker compose up -d --build
```

To stop this app without stopping the proxy, run `docker compose down` from the project root.
