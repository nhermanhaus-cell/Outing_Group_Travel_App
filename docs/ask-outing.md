# Ask Outing

Ask Outing is an account-required travel assistant behind
`EXPO_PUBLIC_FEATURE_ASSISTANT_V1`. The mobile client streams through the
authenticated `travel-assistant` Supabase Edge Function; model and travel
provider credentials never enter the app bundle.

## Production configuration

The production adapter is pinned to managed Mistral Small 4:

```sh
npx supabase secrets set MISTRAL_API_KEY=replace_with_mistral_key
npx supabase functions deploy travel-assistant
```

After the secret is present, set this in the mobile environment and restart
Expo:

```dotenv
EXPO_PUBLIC_FEATURE_ASSISTANT_V1=true
```

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

## Safety and data boundaries

- Provider and deterministic Outing results are factual truth; the model
  orchestrates and explains them.
- Tool inputs and proposal payloads are validated, provider markup is stripped,
  tool rounds are capped, requests can be cancelled, and user message rate is
  limited.
- Model trip context excludes contact data, comments, lodging addresses, and
  raw coordinates.
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
```

The evaluation fixture is in `tests/evals/assistant-cases.json`; native journeys
are in `tests/maestro`.
