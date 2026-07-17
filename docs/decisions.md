# Decision log

| Decision | Choice | Why |
|----------|--------|-----|
| Client | Expo + RN (not SwiftUI for MVP) | Faster dual-platform path; SwiftUI later via contracts |
| ORM | Drizzle + SQL migrations | Lightweight, Supabase-friendly |
| Providers | Plugin registry, mock-first | Zero-key MVP; easy live swaps |
| Scoring | Deterministic TS engine | Inspectable; AI only summarizes |
| Auth | Magic link + Apple (mock until Supabase) | App Store-ready path |
| Maps | Optional RN maps / seed coords | Avoid hard Mapbox dependency |
| Package manager | pnpm workspaces | Spec |
