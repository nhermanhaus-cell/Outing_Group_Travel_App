# Ask Outing

Ask Outing is an account-required travel assistant behind
`EXPO_PUBLIC_FEATURE_ASSISTANT_V1`. The mobile client streams through the
authenticated `travel-assistant` Supabase Edge Function; model and travel
provider credentials never enter the app bundle.

## Production configuration

The production adapter is pinned to managed Mistral Small 4 and uses the
customized Studio Agent through non-persistent Conversations. Supabase is the
only conversation store:

```sh
npx supabase secrets set \
  MISTRAL_API_KEY=replace_with_mistral_key \
  MISTRAL_AGENT_ID=replace_with_agent_id \
  MISTRAL_AGENT_VERSION=outing-travel-agent-v1 \
  MISTRAL_MODEL=mistral-small-2603 \
  AI_ENABLE_MISTRAL_AGENT=true \
  AI_ENABLE_GLOBAL_DISCOVERY=false
npx supabase db push
npx supabase functions deploy travel-assistant assistant-insights destination-discovery
```

Validate the Studio configuration against the versioned repository copy before
deployment. `agent:sync` updates the Studio Agent, so use it only when the
reported differences are intentional:

```sh
pnpm agent:validate
# pnpm agent:sync
```

Publish the bundled 18-destination catalog after the migration. This command is
idempotent and requires a root `.env` with `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_URL` (or `EXPO_PUBLIC_SUPABASE_URL`):

```sh
pnpm db:publish-catalog -- --dry-run
pnpm db:publish-catalog
```

After the secret is present, set this in the mobile environment and restart
Expo:

```dotenv
EXPO_PUBLIC_FEATURE_ASSISTANT_V1=true
EXPO_PUBLIC_FEATURE_ASSISTANT_PERSONALIZATION_V1=true
EXPO_PUBLIC_FEATURE_MISTRAL_AGENT_V1=true
EXPO_PUBLIC_FEATURE_PROACTIVE_INSIGHTS_V1=true
EXPO_PUBLIC_FEATURE_GLOBAL_DISCOVERY_V1=false
EXPO_PUBLIC_FEATURE_SEMANTIC_RETRIEVAL_V1=false
EXPO_PUBLIC_FEATURE_DECISION_BRIEFS_V1=false
EXPO_PUBLIC_FEATURE_SMART_COMPARE_V1=false
EXPO_PUBLIC_FEATURE_TRIP_AUDIT_V1=false
EXPO_PUBLIC_FEATURE_COMMUNITY_SIGNALS_V1=false
```

Enable global discovery only for the intended initial cohort by setting both
the mobile rollout flag and the server-side `AI_ENABLE_GLOBAL_DISCOVERY=true`
secret. Also set `DISCOVERY_HASH_SECRET` to a long random server-only value.
The first authenticated request generates a reusable provisional destination;
after automated checks succeed, later users can find the saved overview without
running the model again. Generated sections remain visibly provisional until
editorial review.

## Editorial destination review

The first release uses a service-role CLI rather than a customer-facing admin
screen:

```sh
pnpm db:review-destinations list
pnpm db:review-destinations review <candidate-id>
pnpm db:review-destinations reject <candidate-id>
pnpm db:review-destinations publish <candidate-id> <published-destination-id>
```

`publish` requires a separately reviewed, already-published destination row. It
never turns generated candidate copy into catalog content automatically.

The optional Qwen3.5-27B adapter is evaluation-only:

```sh
npx supabase secrets set \
  AI_ENABLE_QWEN_EVALUATION=true \
  QWEN_BASE_URL=https://your-openai-compatible-endpoint/v1 \
  QWEN_API_KEY=replace_with_provider_key \
  QWEN_MODEL=Qwen3.5-27B
```

Keep `EXPO_PUBLIC_FEATURE_QWEN_EVALUATION=false` in production clients unless a
controlled evaluation is in progress.

## Decision intelligence and semantic retrieval

Migration `0009_mistral_decision_intelligence.sql` adds versioned decision
insights, the 1,024-dimension pgvector catalog, and thresholded community
signals. Apply migrations before enabling any of the new flags, then publish
the approved catalog embeddings:

```sh
npx supabase db push
npx supabase functions deploy travel-assistant
npx supabase functions deploy assistant-insights
pnpm db:index-assistant --dry-run
pnpm db:index-assistant
```

The indexing command requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`MISTRAL_API_KEY`. Set these Edge Function secrets separately:

```sh
npx supabase secrets set \
  MISTRAL_EMBED_MODEL=mistral-embed-2312 \
  AI_ENABLE_SEMANTIC_RETRIEVAL=true \
  AI_ENABLE_COMMUNITY_SIGNALS=false
```

Roll out in this order: semantic retrieval, decision briefs, saved comparison,
trip audits, then community signals. Community aggregates remain unavailable
until 25 distinct users have contributed a non-sensitive signal for the same
destination, activity category, or provider. Their ranking effect is capped at
five points and explicit requirements are applied afterward.

Decision Briefs are cached in `assistant_insights`; the mobile client also
keeps the last valid structured result locally for offline display. Prompts and
responses are never placed in PostHog or the semantic knowledge index.

## Safety and data boundaries

- Provider and deterministic Outing results are factual truth; the model
  orchestrates and explains them.
- Tool inputs and proposal payloads are validated, provider markup is stripped,
  tool rounds are capped, requests can be cancelled, and user message rate is
  limited.
- Model trip context excludes contact data, comments, lodging addresses, and
  raw coordinates.
- Explicit accessibility, budget, avoidance, safety, and travel constraints
  take precedence over learned behavior. Learned signals can adjust rankings by
  at most ten points and stop influencing ranking after 180 days.
- Per-user context is derived from the authenticated JWT on the server; the
  mobile app never sends a user ID or preference profile to Mistral.
- Every proposed trip change has an explicit review state. Group members send
  proposals to a majority vote; organizers resolve ties.
- The assistant cannot book, purchase, or silently mutate a trip.
- Conversation content stays in RLS-protected assistant tables. PostHog receives
  only semantic lifecycle events and latency/error metadata.

## Verification

```sh
pnpm test
pnpm typecheck
npx supabase migration list
npx deno check --node-modules-dir=auto supabase/functions/travel-assistant/index.ts supabase/functions/assistant-insights/index.ts
```

The evaluation fixture is in `tests/evals/assistant-cases.json`; native journeys
are in `tests/maestro`.
