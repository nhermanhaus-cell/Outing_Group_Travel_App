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
