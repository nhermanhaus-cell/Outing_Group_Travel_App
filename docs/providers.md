# Provider plug-ins

Gay-i uses a **provider registry** so each data capability is a swappable plugin.

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
| **Experiences (excursions)** | `experiences:mock-editorial` / `viator` / `getyourguide` | Affiliate disclosure when linked | Editorial seed in `fixtures/seed/experiences.json`. Viator live when `VIATOR_API_KEY` set (falls back to editorial + Viator search URL). GetYourGuide similar with `GETYOURGUIDE_API_KEY` |
| **Google Maps** | in-app markers + deep links | Google Maps | **Cannot** create collaborative Saved Lists via API. Export uses place/multi-stop Maps URLs. Places Nearby / geocode is Phase 2 with `GOOGLE_PLACES_API_KEY` / `GOOGLE_MAPS_API_KEY` |

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

VIATOR_API_KEY=
GETYOURGUIDE_API_KEY=
GOOGLE_PLACES_API_KEY=
GOOGLE_MAPS_API_KEY=
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
- Blog further-reading links (homepages only — never scraped article text)

## Adding a plugin

1. Implement the slot interface in `packages/providers/src/plugins/<slot>/`
2. `defineProviderPlugin({ id, slot, label, requiredEnv, create, healthCheck })`
3. Register in `createAppProviders`
4. Document env vars in `.env.example`

Responses should include source metadata: `source`, `retrievedAt`, `confidence`, `isLive`. Never invent venues outside retrieved/seed records. Never declare a place universally “safe.”
