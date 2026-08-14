# Architecture

```
apps/mobile          Expo Router UI (SwiftUI deferred)
packages/domain      Pure TS engines (no RN imports)
packages/providers   Plugin registry + mocks + live shells
packages/shared      Zod + shared types + analytics names
packages/db          Drizzle schema mirroring supabase/migrations
fixtures/seed        Destination catalog JSON
fixtures/golden      Engine golden vectors
schemas/             JSON Schema DTOs for future clients
```

## Data flow

Screens → domain engines / provider slots → mock seed (default) or Supabase/live adapters.

Provider resolution: in-app override → `GAYI_PROVIDER_<SLOT>` env → healthy keyed plugin → mock.

## Privacy defaults

No precise live location by default. Public trip payloads strip lodging addresses, booking confirmations, legal names, and sensitive preferences (`toTripPublicPayload`).
