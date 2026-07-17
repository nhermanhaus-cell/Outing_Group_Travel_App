/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const appJson = require('./app.json');
  const expo = appJson.expo;

  return {
    ...expo,
    extra: {
      ...(expo.extra ?? {}),
      // Prefer EXPO_PUBLIC_* for client; fall back to server-named vars at bundle time.
      // Restrict these keys in Google Cloud / Viator dashboards (bundle ID / IP).
      googlePlacesApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        '',
      googleMapsApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.GOOGLE_PLACES_API_KEY ||
        '',
      viatorApiKey:
        process.env.EXPO_PUBLIC_VIATOR_API_KEY || process.env.VIATOR_API_KEY || '',
      getYourGuideApiKey:
        process.env.EXPO_PUBLIC_GETYOURGUIDE_API_KEY ||
        process.env.GETYOURGUIDE_API_KEY ||
        '',
    },
  };
};
