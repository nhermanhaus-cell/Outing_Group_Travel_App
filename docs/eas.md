# EAS / TestFlight

```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas build --platform ios --profile preview
eas submit --platform ios
```

Configure `eas.json` when connecting an Expo account. Bundle ID placeholder: `com.gayi.app`.

Sign in with Apple is required for App Store if other third-party logins are offered.
