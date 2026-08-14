# Account deletion

Outing supports permanent account deletion in both required locations:

- In the native app: **You → Settings → Account → Delete account**.
- On the public web: `https://gayi.expo.app/account-deletion`.

The web route lets a user authenticate with the account they want to delete and complete deletion without reinstalling the native app. Use this URL for the Google Play Console account-deletion field.

## Production setup

Apply and deploy the additive backend changes before submitting a build:

```sh
npx supabase db push
npx supabase functions deploy account-deletion
```

For automatic Sign in with Apple revocation, configure these Edge Function secrets:

```sh
npx supabase secrets set \
  APPLE_TEAM_ID=YOUR_TEAM_ID \
  APPLE_KEY_ID=YOUR_SIGN_IN_WITH_APPLE_KEY_ID \
  APPLE_CLIENT_ID=com.gayi.app \
  APPLE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
```

Apple users are asked to reauthenticate during deletion so the server can exchange the short-lived authorization code and revoke the resulting Apple token. If revocation cannot be completed, Outing still deletes the account and shows Apple's manual revocation steps, as required by Apple's account-deletion guidance.

To delete the user's PostHog person, events, and recordings, create a narrowly scoped PostHog personal API key with `person:write`, then configure:

```sh
npx supabase secrets set \
  POSTHOG_PERSONAL_API_KEY=phx_your_scoped_personal_key \
  POSTHOG_PROJECT_ID=your_numeric_project_id \
  POSTHOG_API_HOST=https://us.posthog.com
```

The ordinary `POSTHOG_PROJECT_TOKEN` is an ingestion credential and cannot request privacy deletion.

Then publish the static Expo web export so the external deletion URL is live:

```sh
cd apps/mobile
pnpm export:hosting
npx eas-cli@latest deploy --prod
```

Before store submission, verify the public URL in a signed-out browser, complete one deletion with a test account, and confirm that the user can no longer sign in with the deleted session.
