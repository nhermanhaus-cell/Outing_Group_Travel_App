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

## API keys (Google / Viator)

Put secrets in the **monorepo-root** `.env` (not only `apps/mobile/.env`).
`apps/mobile/app.config.js` loads root `.env` first, then injects keys into `expo.extra` and Maps native config.

```bash
# repo root .env
GOOGLE_MAPS_API_KEY=...
GOOGLE_PLACES_API_KEY=...   # can be the same key if APIs are enabled
VIATOR_API_KEY=...
```

Restart Expo so config reloads:

```bash
cd apps/mobile
npx expo start --go --clear
```

In the Metro terminal you should see:

```text
[gayi] API keys loaded — maps:true places:true viator:true
```

If those flags are `false`, the app stays on editorial/fixture fallbacks. Settings → Integrations also shows live key status (never prints secret values).

Place photos ship with the seed catalog (Unsplash). Live Google Nearby results use Place Photos when a Places key is present.

## Supabase (optional)

```bash
npx supabase start
npx supabase db reset   # applies supabase/migrations + seed
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Until then, auth/trips stay on local mock storage.

## Tests

```bash
pnpm test
```

## Monorepo notes

Metro is configured in `apps/mobile/metro.config.js` to resolve `@gayi/*` workspace packages from source.
