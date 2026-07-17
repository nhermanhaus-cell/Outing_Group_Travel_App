# Provider plug-ins

Gay-i uses a **provider registry** so each data capability is a swappable plugin.

## Slots

`destinations`, `places`, `events`, `lgbtqContext`, `communitySignals`, `weather`, `flights`, `lodging`, `currency`, `maps`, `trips`, `auth`, `ai`, `analytics`, `share`, `eventInvitation`, `images`, `notifications`

## Defaults

Every slot ships a **mock** plugin. Live shells register but fail `healthCheck` until keys exist, then the registry falls back to mock.

## Env

```bash
GAYI_PROVIDER_PLACES=mock
# or supabase / google-places when implemented and keyed
```

## In-app panel

Profile → Integrations (when `EXPO_PUBLIC_PROVIDER_PANEL=1` or `__DEV__`) lists slots, active plugins, and overrides.

## Adding a plugin

1. Implement the slot interface in `packages/providers/src/plugins/<slot>/`
2. `defineProviderPlugin({ id, slot, label, requiredEnv, create, healthCheck })`
3. Register in `createAppProviders`
4. Document env vars in `.env.example`

Responses should include source metadata: `source`, `retrievedAt`, `confidence`, `isLive`. Never invent venues outside retrieved/seed records.
