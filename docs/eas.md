# EAS / TestFlight

```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas build --platform ios --profile preview
eas submit --platform ios
```

Configure `eas.json` when connecting an Expo account. The legacy bundle ID `com.gayi.app` remains intentional after the Outing rename so existing installs and update channels are not orphaned.

Sign in with Apple is required for App Store if other third-party logins are offered.
