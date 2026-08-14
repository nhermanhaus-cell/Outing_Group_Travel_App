# Analytics operations

Outing sends typed semantic events to `analytics-ingest`. The Edge Function validates and stores the first-party event, then forwards a reduced property set to PostHog when `POSTHOG_PROJECT_TOKEN` is configured.

## Required configuration

Set Supabase Edge Function secrets:

```sh
supabase secrets set \
  POSTHOG_PROJECT_TOKEN=phc_... \ 
  POSTHOG_HOST=https://us.i.posthog.com \
  ANALYTICS_FORWARD_SECRET=... \
  ANALYTICS_HASH_SECRET=...
```

Deploy `analytics-ingest` and `analytics-forward`, then schedule:

- `analytics-forward` every five minutes with the `x-analytics-secret` header.
- `select public.purge_expired_analytics_events();` daily.

The `analytics_policy` row is the administrative kill switch. Semantic analytics and personalization default on; public session replay defaults off.

## Data boundaries

- Raw semantic events remain in Supabase for 60 days.
- Authenticated accounts are represented in analytics by a deterministic, server-derived pseudonymous ID; the Supabase user ID is never forwarded to PostHog.
- PostHog does not receive destination slugs, collection IDs, raw search text, questionnaire answers, trip/member IDs, coordinates, addresses, dates, comments, or feedback text.
- Preference signals remain in Supabase and local app storage. Signals older than 180 days are ignored by recommendation ranking.
- Authenticated event rows cascade on account deletion. Anonymous rows expire through retention.

## Internal session replay

React Native replay is compiled in but starts only when both of these build variables are set:

```sh
EXPO_PUBLIC_INTERNAL_ANALYTICS_BUILD=1
EXPO_PUBLIC_SESSION_REPLAY_ENABLED=1
```

Replay also requires `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN`. It samples 10% of eligible native sessions, masks text inputs and images, disables logs/network telemetry, and opts out on auth, questionnaire, profile, settings, invitations, sharing, and all trip screens. Never set the internal-build flag in a public store profile.

## Initial PostHog dashboards

1. Questionnaire: started → completed → destination match → trip created.
2. Planning: destination viewed → path selected → trip created → itinerary generated.
3. Itinerary: generation, re-optimization, edits, reactions, free-window saves, polls.
4. Monetization: offer impression → affiliate click → booking handoff by provider/category.
5. Quality: operation failures and provider success/latency buckets.
6. Engagement: active screen duration and 1/7/30-day return rates.
