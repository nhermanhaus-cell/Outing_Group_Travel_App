# Future SwiftUI client

The MVP is Expo. A native SwiftUI app can attach later without rewriting product logic if it:

1. Uses the same Supabase project (schema + RLS)
2. Generates Swift models from `schemas/*.json`
3. Reimplements `@gayi/domain` engines against `fixtures/golden/*`
4. Implements provider slot protocols matching `packages/providers` interfaces
5. Reuses `design-tokens.json` for visual parity
6. Keeps the same deep link paths (`gayi://`, invite URLs) and analytics event names

Do not share UI code across SwiftUI and RN — share contracts and backend.
