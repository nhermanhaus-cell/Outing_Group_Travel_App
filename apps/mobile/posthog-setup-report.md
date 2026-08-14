<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Outing (Gay-i) React Native / Expo mobile app. A new PostHog singleton (`src/config/posthog.ts`) was created using `expo-constants` extras and wired into the root layout via `PostHogProvider`. Screen tracking fires automatically on every route change. User identity is linked to Supabase user IDs at sign-in and cleared on sign-out. Nine key business events are now captured via `posthog.capture()` alongside the existing custom analytics system — with no changes to existing code paths.

| Event name | Description | File |
|---|---|---|
| `trip_created` | User successfully creates a new trip. | `app/trips/new.tsx` |
| `trip_creation_path_selected` | User chooses recommendations quiz or manual entry path. | `app/trips/new.tsx` |
| `questionnaire_started` | User begins the travel preferences quiz. | `app/quiz/index.tsx` |
| `questionnaire_completed` | User finishes all steps of the travel quiz. | `app/quiz/index.tsx` |
| `questionnaire_abandoned` | User exits the quiz before finishing it. | `app/quiz/index.tsx` |
| `invite_sent` | User sends an SMS trip invite to a travel buddy. | `app/trips/[tripId]/invite.tsx` |
| `booking_handoff` | User taps "Book on Viator" and is handed off externally. | `app/experiences/[productCode].tsx` |
| `user_signed_in` | User completes sign-in (magic link or Apple). | `src/providers/AppProviders.tsx` |
| `user_signed_out` | User signs out of the app. | `src/providers/AppProviders.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard** — [Analytics basics (wizard)](https://us.posthog.com/project/534225/dashboard/1926374)
- **Trip creation funnel** — [VQH9Yxje](https://us.posthog.com/project/534225/insights/VQH9Yxje)
- **Trips created by path** — [2tynq09A](https://us.posthog.com/project/534225/insights/2tynq09A)
- **Quiz abandonment rate** — [WMIf4aGS](https://us.posthog.com/project/534225/insights/WMIf4aGS)
- **Invites sent & booking handoffs** — [qFSpKuUt](https://us.posthog.com/project/534225/insights/qFSpKuUt)
- **New users signed in** — [luJxALp7](https://us.posthog.com/project/534225/insights/luJxALp7)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation identifies on session restore (loading → false with a user), but verify in a real device run that sign-ins via magic link callback also trigger `user_signed_in`.
- [ ] **Data warehouse**: The project uses Supabase. Run `npx @posthog/wizard warehouse` to connect your Supabase tables to PostHog's data warehouse for server-side analytics correlation.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
