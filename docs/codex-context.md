# Outing — Codex handoff context

**Product:** Outing — LGBTQ+ travel discovery, planning, and social trip coordination (not dating).
**Compatibility:** The former `gayi` technical namespace remains in package scopes, deep links, storage keys, deployed domains, and bundle IDs so existing installs and trip data continue working.
**Repo:** `github.com/nhermanhaus-cell/gayi-travel-planner`  
**Working branch:** `cursor/gayi-expo-mvp-d31a` (base: `main`)  
**PR:** https://github.com/nhermanhaus-cell/gayi-travel-planner/pull/1  
**Owner:** Noah Herman (`nhermanhaus@gmail.com`)

Use this file to continue building without re-deriving product/tech decisions.

---

## Stack (locked)

| Layer | Choice |
|-------|--------|
| Client | **Expo Router + TypeScript**, SDK **54** (App Store Expo Go compatible) |
| Monorepo | **pnpm** workspaces |
| Domain logic | `@gayi/domain` |
| Shared types | `@gayi/shared` |
| Data plugins | `@gayi/providers` (registry + mock/live shells) |
| DB (optional) | Supabase + Drizzle `@gayi/db` — app runs offline on fixtures/mock |
| Tests | Vitest (`pnpm test`) — ~83 unit tests |
| Design | Editorial travel aesthetic (ink/parchment/coral), light/dark |

**Deferred:** SwiftUI native app (`docs/future-swiftui.md`).

---

## Repo layout

```
apps/mobile/                 Expo app (primary UI)
  app/                       Expo Router screens
  components/                UI + maps/TripMap.tsx
  src/lib/                   googlePlaces, experiences, travelTimes, mapsLinks, lgbtqVibe
  src/providers/AppProviders.tsx   Auth/trips/destinations contexts; loads seed JSON
  assets/seed|editorial|public/    Bundled fixtures (synced from fixtures/)
  app.config.js              Injects Google/Viator keys into expo.extra + Maps SDK keys

packages/
  domain/     recommendation, origin buckets, groupBlend, nearby, itinerary, budget, pulse, privacy, invites
  providers/  plugin registry + OSM/ILGA/Equaldex/Wikidata/Viator/Google Places/…
  shared/     TravelPreferences, Place, Destination types + zod schemas
  db/         Drizzle schema (Supabase)

fixtures/
  seed/           destinations.json (18), destinations.scoring.json, experiences.json
  editorial/      inspiration-sources.json, origin-hubs.json, home.json
  public/         ilga-*, equaldex-cited, travel-advisories, wikidata-events-sample

docs/
  architecture.md, providers.md, privacy.md, google-maps-apis.md, setup.md, decisions.md
```

**Seed pipeline:** edit `fixtures/` → `pnpm seed:score` → `pnpm seed:sync` (copies into `apps/mobile/assets/`).

---

## Product principles (do not violate)

1. **No scraping** blogs or dating apps. Blogs = inspiration + further-reading attribution only; blurbs are original editorial.
2. **Never claim a destination is universally “safe.”** Use vibe labels + context + official advisory **links**.
3. **Fixture-first providers.** Live APIs when keyed; always fall back to seed.
4. **Maps stay in-app** for primary UX (MapView + travel times). Do not make “Open in Google Maps” the main flow.
5. **Equaldex live API stays OFF** until commercial license (`equaldex-cited` fixture only).
6. **Airbnb/TripAdvisor** are not inventory APIs. Airbnb = lodging address paste only.
7. **Google Saved Lists** cannot be created via API — use in-app shared places + optional export URLs only.

---

## What works today

### Destinations & editorial
- **18 destinations** including Guerneville, LA, Las Vegas
- Places with real queer landmarks; `sources[]` attribution
- Home: featured destinations + Places to visit (`fixtures/editorial/home.json`)
- Vibe badges: **Hella Fierce / Slay / It's Giving / Read the Room** (`src/lib/lgbtqVibe.ts`)
- LGBTQ tab: legal scores, humanRightsSummary, advocacyNotes, recentRelevantEvents, gov advisory links

### Quiz & recommendations
- Quiz includes: origin airport, months, duration, group, glamour, interests, **activityPace** (packed/balanced/downtime), **lodgingStatus** + address, nightlife, social prefs
- Origin-aware buckets: Weekend nearby / Quick flights / Best matches; **hard-excludes home city** (`origin-hubs.json` + `domain/recommendation/origin.ts`)

### Trip planning intelligence
- `blendGroupPreferences` for group interest blending
- Pace-aware `generateItinerary` (downtime inserts free blocks)
- Lodging booked → geocode → **Nearby Places** (rating ≥ 4) merged with editorial
- No lodging → queer neighborhood suggestions (non-absolute language)

### Experiences / monetization path
- `experiences` provider slot + `fixtures/seed/experiences.json`
- Live **Viator** Partner API (`POST /partner/products/search`, taxonomy + freetext fallback)
- GetYourGuide shell (keyed fallback)
- Affiliate disclosure in UI when `bookingMode: 'external'`

### In-app maps
- `react-native-maps` `TripMap` on trip **Itinerary** + **Map** tabs
- Markers: lodging, numbered selected-day itinerary stops, Google nearby, and experiences
- **Routes API** legs (auto / walk / transit / drive) with encoded polylines between lodging and every stop
- See `docs/google-maps-apis.md`

### Sharing
- RN `Share.share`, WhatsApp / Partiful deep links
- Invite: universal HTTPS `/invite?token=…` with one-use token redemption

### Auth / trips
- Supabase sessions, synced trips, RLS, realtime edits, and a one-time local-trip migration; fixture-first fallback remains available

---

## Env / secrets

- Local secrets live in **repo-root `.env`** (gitignored). Template: `.env.example`
- `apps/mobile/app.config.js` injects only the native Maps SDK key; web-service secrets are Supabase Edge secrets
- On `expo start`, look for `[gayi] integrations configured — maps-sdk:… places-proxy:… viator-proxy:…` (booleans only)
- Settings → Integrations shows the same runtime key status

| Variable | Use |
|----------|-----|
| `VIATOR_API_KEY` | Server-only Viator affiliate Edge secret |
| `GOOGLE_PLACES_API_KEY` | Server-only Places/Routes/Geocoding/Photos Edge secret |
| `GOOGLE_MAPS_API_KEY` | Restricted native Maps SDK key |
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL `https://<id>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase **publishable** key (`sb_publishable_…`) |
| `GETYOURGUIDE_API_KEY` | Optional GYG shell |

**Never commit `.env` or paste real keys into git/chat.**

### Place photos
- Editorial places: Unsplash URLs attached via `pnpm seed:photos` → `seed:score` → `seed:sync`
- Live Google Nearby: Place Photo URLs when Places key is present

### Google Cloud — enable
1. Maps SDK for iOS  
2. Maps SDK for Android  
3. Geocoding API  
4. Places API  
5. Distance Matrix API  

iOS key restrictions: `host.exp.Exponent` (Expo Go) + `com.gayi.app`.

### Run locally
```bash
# Node 20+ required
cd apps/mobile
npx expo start --go --clear
```

---

## Key code entry points

| Feature | Path |
|---------|------|
| Home | `apps/mobile/app/(tabs)/index.tsx` |
| Quiz | `apps/mobile/app/quiz/index.tsx`, `results.tsx` |
| Destination detail | `apps/mobile/app/destinations/[slug].tsx` |
| Trip hub | `apps/mobile/app/trips/[tripId]/index.tsx` |
| Share | `apps/mobile/app/share/[tripId].tsx` |
| App data load | `apps/mobile/src/providers/AppProviders.tsx` |
| Scoring engine | `packages/domain/src/recommendation/engine.ts` |
| Origin buckets | `packages/domain/src/recommendation/origin.ts` |
| Group blend | `packages/domain/src/recommendation/groupBlend.ts` |
| Nearby / neighborhoods | `packages/domain/src/recommendation/nearby.ts` |
| Itinerary | `packages/domain/src/itinerary/engine.ts` |
| Provider registry | `packages/providers/src/app-providers.ts`, `registry.ts` |
| Viator | `packages/providers/src/plugins/experiences/viator.shell.ts` + mobile `src/lib/experiences.ts` |
| Google Places | `packages/providers/.../google-places.shell.ts` + mobile `src/lib/googlePlaces.ts` |
| Travel times | `apps/mobile/src/lib/travelTimes.ts` |
| In-app map | `apps/mobile/components/maps/TripMap.tsx` |

---

## Provider slots

`destinations`, `places`, `events`, `experiences`, `lgbtqContext`, `communitySignals`, `weather`, `flights`, `lodging`, `currency`, `maps`, `trips`, `auth`, `ai`, `analytics`, `share`, `eventInvitation`, `images`, `notifications`

Resolution: in-app override → `GAYI_PROVIDER_<SLOT>` → first healthy non-mock → mock.

Public fixtures: OSM Overpass, ILGA-Europe, ILGA World, Equaldex-cited, gov advisories, Wikidata events.

---

## Data model notes

- **Two destination shapes:** rich catalog seed (`destinations.json`) vs scoring rows (`destinations.scoring.json` with nested `catalog`) used by recommendation engine / trip hub.
- **TravelPreferences** now includes `activityPace`, `lodgingStatus`, `lodgingAddress`, optional `lodgingLat/Lng`.
- **LocalTrip** (mobile) has `memberPrefs`, lodging fields, `savedPlaces`, polls, comments — not fully mirrored to Supabase yet.
- Shared `Trip` has `lodgingAddress`; strip sensitive fields via `toTripPublicPayload` for public links.

---

## Good next builds (suggested)

1. **Photo carousels** for places (Unsplash/Wikimedia fixture pipeline; `images` slot).
2. **Server proxy** for Viator/Google secrets (avoid long-term client-held affiliate keys).
3. **Native MapView polish** — multi-day route selection, lodging→first-stop leg, clustered pins.
4. **Supabase live auth/trips** with RLS using publishable key.
5. **Per-member prefs UX** deeper in invite/onboarding flow.
6. **EAS production builds** with Maps SDK keys (Expo Go has limits vs custom `com.gayi.app` builds).
7. Place image attribution + Sources section consistency everywhere live Google/Viator data shows.

---

## Commands cheat sheet

```bash
pnpm test                 # unit tests
pnpm seed:score           # regenerate scoring from destinations.json
pnpm seed:sync            # copy fixtures → apps/mobile/assets
pnpm --filter mobile start
cd apps/mobile && npx expo start --go --clear
```

---

## Explicit non-goals (for now)

- Scraping blogs/dating apps  
- Declaring places “safe”  
- Live Equaldex without license  
- Programmatic Google collaborative Saved Lists  
- Airbnb/TripAdvisor excursion inventory APIs  
- HTTPS OG invite pages  

---

*Last updated from branch `cursor/gayi-expo-mvp-d31a` after in-app MapView + Distance Matrix travel times.*
