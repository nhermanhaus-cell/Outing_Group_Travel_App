# Setup

## Prerequisites

- Node 22+
- pnpm 10+
- Expo Go or iOS/Android simulators (optional)
- Docker + Supabase CLI (optional)

## Install

```bash
pnpm install
cp .env.example .env
pnpm db:seed
pnpm --filter mobile start
```

## Existing API configuration

The repository-root `.env` already contains the local configuration used by the app:

```bash
GOOGLE_MAPS_API_KEY=...
GOOGLE_PLACES_API_KEY=...
VIATOR_API_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

No additional API keys are needed. Their responsibilities are intentionally separate:

- `GOOGLE_MAPS_API_KEY` is injected only into the native Maps SDK.
- `GOOGLE_PLACES_API_KEY` is used server-side for Places, Routes, Geocoding, and Place Photos.
- `VIATOR_API_KEY` is used server-side for Viator search, product details, and schedules.
- The two `EXPO_PUBLIC_SUPABASE_*` values connect the app to Supabase and are safe client configuration.

### One-time Edge deployment

A hosted Supabase Edge Function cannot read the `.env` file on your computer. Before the first
deployment—or whenever a provider key changes—copy the **existing** server values into the
Supabase project secrets:

```bash
cd /Users/nherman/gayi-travel-planner
set -a
source .env
set +a
npx supabase login

SUPABASE_PROJECT_REF="${EXPO_PUBLIC_SUPABASE_URL#https://}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF%%.*}"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"

npx supabase secrets set \
  GOOGLE_PLACES_API_KEY="$GOOGLE_PLACES_API_KEY" \
  VIATOR_API_KEY="$VIATOR_API_KEY" \
  BOOKING_DEMAND_API_TOKEN="$BOOKING_DEMAND_API_TOKEN" \
  BOOKING_AFFILIATE_ID="$BOOKING_AFFILIATE_ID" \
  BOOKING_DEMAND_BASE_URL="${BOOKING_DEMAND_BASE_URL:-https://demandapi.booking.com/3.2}" \
  SKYSCANNER_API_KEY="$SKYSCANNER_API_KEY" \
  TICKETMASTER_API_KEY="$TICKETMASTER_API_KEY" \
  NPS_API_KEY="$NPS_API_KEY" \
  OPEN_METEO_API_KEY="$OPEN_METEO_API_KEY" \
  APP_PUBLIC_URL="https://gayi.expo.app"
npx supabase db push
npx supabase functions deploy travel-api
npx supabase functions deploy trip-invites --no-verify-jwt
```

For local Edge development, pass the existing file directly:

```bash
npx supabase functions serve --env-file .env
```

Restart Expo so config reloads:

```bash
cd apps/mobile
npx expo start --go --clear
```

### Calendar export

`expo-calendar` is included in Expo Go on iOS and Android. On a dated trip, open **Itinerary** →
**Add to calendar**, then choose a writable iCloud/Apple, Google, or device calendar already
connected to the phone. Permission is requested only after that action. Re-exporting updates
events containing Outing's private on-device marker instead of creating duplicates.

In the Metro terminal you should see:

```text
[gayi] integrations configured — maps-sdk:true places-proxy:true viator-proxy:true
```

These flags confirm that the app has a native Maps key and can reach the Supabase proxy. They do
not expose or inspect hosted provider secrets. If a hosted secret is missing, the provider call
falls back safely and the Edge logs report the configuration error without printing a key.

Live Google photo resource names are resolved by the Edge Function and cached in memory only;
provider IDs and attribution are persisted instead of expiring photo URLs.

Booking.com and Skyscanner partner access must be approved in their respective partner dashboards.
Do not add either credential to an `EXPO_PUBLIC_` variable. Booking results use only API-returned
property URLs. Skyscanner indicative prices are exploration estimates, and the app builds a
non-PII median only after repeated observations.

Refresh the public-domain airport search dataset at build time with:

```bash
pnpm seed:airports
```

## Local Supabase (optional)

```bash
npx supabase start
npx supabase db reset   # applies supabase/migrations + seed
```

The configured hosted Supabase project is used by default. The commands above are only needed
when running a separate local Supabase stack.

## Invite hosting and app links

Before the production web export, set `EXPO_APPLE_TEAM_ID`,
`ANDROID_SHA256_CERT_FINGERPRINT`, and `EXPO_PUBLIC_APP_DOMAIN`, then run:

```bash
pnpm --filter mobile export:hosting
eas deploy --prod --dir apps/mobile/dist
```

The export script generates both `.well-known` association files from the real signing identity; it intentionally fails rather than publish placeholder credentials.

## Tests

```bash
pnpm test
```

## Monorepo notes

Metro is configured in `apps/mobile/metro.config.js` to resolve `@gayi/*` workspace packages from source.
