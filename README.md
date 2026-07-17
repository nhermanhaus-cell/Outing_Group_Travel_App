# Gay-i

LGBTQ+ travel discovery, planning, and social coordination — Expo (React Native) MVP.

Gay-i helps travelers answer where to go, when, how welcoming it may feel, what to do, where to stay, what it might cost, and how to plan with friends. It is **not** a dating app.

## Stack

- **Expo Router** + TypeScript (iOS-first, Android-ready)
- **Supabase** for auth/Postgres/RLS (optional — mock mode works offline)
- **`@gayi/domain`** — deterministic recommendation, budget, pulse, itinerary engines
- **`@gayi/providers`** — pluggable mock-first data providers
- **Drizzle** schema in `@gayi/db` + SQL migrations under `supabase/`

## Quick start

```bash
pnpm install
pnpm db:seed
pnpm test
cd apps/mobile && npx expo start --go
```

The app targets **Expo SDK 54** so it works with App Store Expo Go on a physical iPhone.

No paid API keys required. Destinations load from seed fixtures. Auth and trips use local mock storage until Supabase is configured.

## What’s in the MVP

- Browse 15 seeded destinations with LGBTQ+ context + Community Pulse
- Preference quiz → deterministic ranked recommendations with explanations
- Login (magic link / Apple mock) to create and save trips
- Trip hub: polls, itinerary generation, glamour budget, comments, invites, share + Partiful handoff
- **Settings → Integrations** provider plug-in panel (dev)

## Documentation

- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Providers / plug-ins](docs/providers.md)
- [Privacy](docs/privacy.md)
- [EAS / TestFlight](docs/eas.md)
- [Future SwiftUI](docs/future-swiftui.md)
- [Roadmap](docs/roadmap.md)
- [Decision log](docs/decisions.md)

## Limitations

- Seeded prices/events are **sample / editorial**, not live inventory
- LGBTQ+ context is demo data — never a guarantee of safety
- Community Pulse is a platform estimate with aggregation thresholds
- Full Xcode/Simulator builds need macOS; EAS used for cloud builds
- Supabase RLS is ready in SQL but the app defaults to local trip storage in MVP mock mode

## License

Private / unpublished — rights reserved by the project owner.
