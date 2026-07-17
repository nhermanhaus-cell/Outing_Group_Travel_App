const path = require('path');
const fs = require('fs');

// Load monorepo-root .env then apps/mobile/.env (local overrides).
// Expo only auto-loads .env next to app.config by default — our secrets live at repo root.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../.env'));
loadEnvFile(path.resolve(__dirname, '.env'));

function presentKey(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower === 'empty' ||
    lower === 'your_key_here' ||
    lower.includes('replace') ||
    lower.includes('paste_your')
  ) {
    return '';
  }
  return trimmed;
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require('./app.json');
  const expo = appJson.expo;

  const mapsKey = presentKey(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      '',
  );

  const placesKey = presentKey(
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      mapsKey,
  );

  const viatorKey = presentKey(
    process.env.EXPO_PUBLIC_VIATOR_API_KEY || process.env.VIATOR_API_KEY || '',
  );

  // Helpful at `expo start` time (does not print secret values)
  const keyStatus = {
    maps: Boolean(mapsKey),
    places: Boolean(placesKey),
    viator: Boolean(viatorKey),
  };
  console.log(
    `[gayi] API keys loaded — maps:${keyStatus.maps} places:${keyStatus.places} viator:${keyStatus.viator}`,
  );

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
      googlePlacesApiKey: placesKey,
      googleMapsApiKey: mapsKey,
      viatorApiKey: viatorKey,
      getYourGuideApiKey: presentKey(
        process.env.EXPO_PUBLIC_GETYOURGUIDE_API_KEY ||
          process.env.GETYOURGUIDE_API_KEY ||
          '',
      ),
      apiKeyStatus: keyStatus,
    },
  };
};
