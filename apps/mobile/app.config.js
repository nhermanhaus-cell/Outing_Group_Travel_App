/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require('./app.json');
  const expo = appJson.expo;

  const mapsKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    '';

  return {
    ...expo,
    ios: {
      ...(expo.ios ?? {}),
      config: {
        ...((expo.ios && expo.ios.config) || {}),
        googleMapsApiKey: mapsKey,
      },
    },
    android: {
      ...(expo.android ?? {}),
      config: {
        ...((expo.android && expo.android.config) || {}),
        googleMaps: {
          apiKey: mapsKey,
        },
      },
    },
    extra: {
      ...(expo.extra ?? {}),
      googlePlacesApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.GOOGLE_PLACES_API_KEY ||
        mapsKey,
      googleMapsApiKey: mapsKey,
      viatorApiKey:
        process.env.EXPO_PUBLIC_VIATOR_API_KEY || process.env.VIATOR_API_KEY || '',
      getYourGuideApiKey:
        process.env.EXPO_PUBLIC_GETYOURGUIDE_API_KEY ||
        process.env.GETYOURGUIDE_API_KEY ||
        '',
    },
  };
};
