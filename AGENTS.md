# AGENTS.md

## Cursor Cloud specific instructions

Outing is an **Expo SDK 54 (React Native), iOS-first** app in a pnpm-workspace monorepo
(`apps/mobile` + `packages/@gayi/*`). It runs in **mock / offline mode by default** — no API
keys or Supabase project are required to develop, test, or run it. Legacy `@gayi/*` identifiers
are intentionally retained (see `README.md`).

### Tooling
- Node 22 + pnpm (version pinned via `packageManager` in `package.json`). Dependencies are
  installed with `pnpm install` (run automatically by the startup update script).
- Optional: `cp .env.example .env` to turn on the provider/integration panel and feature flags.
  The app works without `.env`; `.env` is gitignored.

### Commands (see `package.json` / `apps/mobile/package.json` for the full list)
- Tests: `pnpm test` (vitest; ~326 unit tests in `tests/unit` + `packages/**`).
- Typecheck: `pnpm typecheck` (runs `tsc --noEmit` across all workspace packages).
- Seed info: `pnpm db:seed` (prints seeded fixtures; no DB needed).
- Lint: `pnpm lint` **is effectively a no-op** — it calls `eslint`, which is not installed in
  this repo, and the script is guarded with `|| true`. Do not rely on it to catch anything.

### Running the app
- Documented target is Expo Go on a physical iOS/Android device: `cd apps/mobile && npx expo start`
  (or `--go`). This VM is headless Linux with **no iOS/Android simulator**, so that path can only
  be verified by confirming Metro serves the native JS bundle
  (`curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true"` → 200).
- For an **interactive browser demo** on this VM, use the web target:
  `cd apps/mobile && npx expo start --web --port 8081` and open Chrome
  (`/usr/local/bin/google-chrome`) at `http://localhost:8081/`.
- **Web caveat (non-obvious):** the web bundle fails with
  `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm` because `expo-sqlite`'s web worker imports
  a `.wasm` asset and Expo's default Metro config does not include `wasm` in
  `resolver.assetExts`. To run web locally, temporarily add
  `config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];` in
  `apps/mobile/metro.config.js`. **Do not commit this** — web is not a shipped target; native
  bundles build fine without it.
- In mock/offline mode a "Current details couldn't refresh … Reconnect to update weather and
  events" note on the destination detail screen is **expected** (no live provider keys), and the
  Metro log `[gayi] integrations configured — maps-sdk:false places-proxy:false viator-proxy:false`
  is normal without keys.
