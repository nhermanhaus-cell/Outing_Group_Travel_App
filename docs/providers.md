# Provider plug-ins

Outing uses a **provider registry** so each data capability is a swappable plugin.

## Slots

`destinations`, `places`, `events`, `lgbtqContext`, `communitySignals`, `weather`, `flights`, `lodging`, `currency`, `maps`, `trips`, `auth`, `ai`, `analytics`, `share`, `eventInvitation`, `images`, `notifications`, `experiences`

## Defaults

Every slot ships a **mock** plugin. Live shells register but fail `healthCheck` until keys exist, then the registry falls back to mock.

## Public data sources (MVP)

All integrations are **fixture-first**. Live adapters run only when keyed / online and fall back to fixtures.

| Source | Plugin / slot | Attribution | Notes |
|--------|---------------|-------------|--------|
| **OpenStreetMap** (`lgbtq=primary` / `welcome`) | `places:osm-overpass` | © OpenStreetMap contributors (ODbL) | Overpass by destination bbox; merge/dedupe with editorial places |
| **ILGA-Europe Rainbow Map** | `lgbtqContext:ilga-europe` | ILGA-Europe + year | Snapshot in `fixtures/public/ilga-europe-rainbow.json` |
| **ILGA World** | `lgbtqContext:ilga-world` | ILGA World + report year | Snapshot in `fixtures/public/ilga-world-legal.json` |
| **Gov travel advisories** | `lgbtqContext:gov-advisories` | Official agency pages | Links only from `fixtures/public/travel-advisories.json` — never invents safety ratings |
| **Wikidata** | `events:wikidata` | Wikidata / CC0 | Pride/LGBTQ events SPARQL + `fixtures/public/wikidata-events-sample.json` fallback |
| **Weather** | `weather:mock-seasonal` / `weather:weather-api` | Provider-specific | Fixture default; live when `WEATHER_API_KEY` set |
| **FX / currency** | `currency:mock-rates` / `currency:fx-api` | Provider-specific | Static rates default; live when `FX_API_KEY` set |
| **Equaldex Equality Index** | `lgbtqContext:equaldex-cited` | Credit Equaldex page URLs | **Editorial cited snapshot only** (`fixtures/public/equaldex-cited-scores.json`). Live `lgbtqContext:equaldex-api` stays **OFF** until a commercial license |
| **Experiences (excursions)** | `experiences:mock-editorial` / `viator` / `getyourguide` | Affiliate disclosure when linked | Editorial seed + **live Viator** when keyed |
| **Google Maps (in-app)** | `react-native-maps` + Places / Geocoding / Distance Matrix | Google | See [`docs/google-maps-apis.md`](google-maps-apis.md). Map, nearby places, and travel times stay in-app. |
| **Booking.com Demand API** | `lodging` via `travel-api` Edge proxy | Booking.com | Live dated stays, guest ratings, imagery, exact property URLs, and Travel Proud program labels. |
| **Skyscanner Travel APIs** | `flights` via `travel-api` Edge proxy | Skyscanner | Indicative destination discovery from saved home airports; never presented as a live bookable fare. |
| **OurAirports** | build-time airport index | OurAirports / public domain | 4,000+ scheduled-service airports for city/name/IATA search and nearby suggestions. |
| **Open-Meteo** | `weather` via `travel-api` Edge proxy | Open-Meteo | Seven-day destination forecast; optional commercial customer key. |
| **Ticketmaster Discovery API** | `events` via `travel-api` Edge proxy | Ticketmaster | Current official event listings and exact listing URLs. |
| **National Park Service** | destination context via `travel-api` Edge proxy | U.S. National Park Service | Official park descriptions and links for U.S. destinations. |
| **Pexels** | destination/activity imagery via `travel-api` Edge proxy | Photographer + linked Pexels photo page | Searches the named activity or place first. If the result is not relevant enough, rotates through destination-level fallback themes. Results are cached for 14 days. |
| **Wikimedia Commons** | image fallback via `travel-api` Edge proxy | Per-file author/license | Place-specific search only after Google has no photo; attribution retained on every result. |

### Google APIs required for in-app maps

| API | Why |
|-----|-----|
| **Maps SDK for iOS** | In-app MapView (pins, route polyline) |
| **Maps SDK for Android** | Same on Android builds |
| **Geocoding API** | Lodging address → coordinates |
| **Places API** | Highly rated nearby places around your stay |
| **Distance Matrix API** | Walk / transit / drive time between itinerary stops |

Optional later: Places API (New), Routes API. Primary UX does **not** open the Google Maps app.

### Equaldex license gate

Equaldex’s commercial API is non-commercial-only by default. Do **not** enable live Equaldex in production without a paid commercial license.

```bash
# Keep off for MVP:
# GAYI_ENABLE_EQUALDEX_LIVE=1
# EQUALDEX_API_KEY=
GAYI_PROVIDER_LGBTQCONTEXT=mock
# or equaldex-cited / ilga-europe / ilga-world / gov-advisories via Integrations panel
```

## Env

```bash
GAYI_PROVIDER_PLACES=mock
# or osm-overpass / supabase / google-places when implemented and keyed

GAYI_PROVIDER_EVENTS=mock
# or wikidata / ticketmaster

GAYI_PROVIDER_LGBTQCONTEXT=mock
# or equaldex-cited / ilga-europe / ilga-world / gov-advisories

GAYI_PROVIDER_EXPERIENCES=mock
# or viator / getyourguide when keyed

VIATOR_API_KEY= # Supabase Edge secret
GETYOURGUIDE_API_KEY=
GOOGLE_PLACES_API_KEY= # Supabase Edge secret
PEXELS_API_KEY= # Supabase Edge secret; never EXPO_PUBLIC_
GOOGLE_MAPS_API_KEY= # native Maps SDK only
WEATHER_API_KEY=
FX_API_KEY=
EQUALDEX_API_KEY=
GAYI_ENABLE_EQUALDEX_LIVE=0
```

## In-app panel

Profile → Integrations (when `EXPO_PUBLIC_PROVIDER_PANEL=1` or `__DEV__`) lists slots, active plugins, and overrides.

## Attribution UX

Destination **Sources** sections should list:

- OpenStreetMap © contributors (ODbL) when OSM places are shown
- ILGA-Europe / ILGA World with year + link
- Equaldex credit link when cited scores are shown
- Official advisory links
- Blog further-reading links (exact article URLs and metadata only — never copied article bodies or publisher images)
- Pexels photographer credit linked to the exact Pexels photo page whenever a Pexels image is visible

### Queer travel editorial index

Run `pnpm seed:insights` from the repository root to refresh destination-specific
further-reading links from the seven configured queer travel publishers. The
build-time collector respects `robots.txt`, uses public sitemaps, rate-limits
requests, and caps each source. Its generated records contain article titles,
canonical URLs, dates when supplied, and derived destination/topic tags.

Collected recommendations remain research leads. Verify a venue against the
original article and Google Places before adding it to destination or itinerary
data. Do not ingest article bodies or reuse publisher photography.

## Adding a plugin

1. Implement the slot interface in `packages/providers/src/plugins/<slot>/`
2. `defineProviderPlugin({ id, slot, label, requiredEnv, create, healthCheck })`
3. Register in `createAppProviders`
4. Document env vars in `.env.example`

Responses should include source metadata: `source`, `retrievedAt`, `confidence`, `isLive`. Never invent venues outside retrieved/seed records. Never declare a place universally “safe.”
