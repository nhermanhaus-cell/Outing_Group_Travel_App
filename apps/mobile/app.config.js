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
  const expo = require('./app.base.json');

  const mapsKey = presentKey(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '',
  );
  const appDomain = (process.env.EXPO_PUBLIC_APP_DOMAIN || 'gayi.expo.app')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  // Helpful at `expo start` time (does not print secret values)
  const keyStatus = {
    maps: Boolean(mapsKey),
    places: Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL),
    viator: Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  };
  console.log(
    `[gayi] integrations configured — maps-sdk:${keyStatus.maps} places-proxy:${keyStatus.places} viator-proxy:${keyStatus.viator}`,
  );

  return {
    ...expo,
    ios: {
      ...(expo.ios ?? {}),
      associatedDomains: [`applinks:${appDomain}`],
      infoPlist: {
        ...((expo.ios && expo.ios.infoPlist) || {}),
        NSContactsUsageDescription: 'Outing uses contacts only when you choose travel buddies to invite. Phone numbers stay on this device.',
        NSCalendarsUsageDescription: 'Outing uses calendar access only when you choose to add or update itinerary events.',
        NSLocationWhenInUseUsageDescription: 'Outing uses an approximate one-time location only when you ask for nearby airport suggestions.',
      },
      config: {
        ...((expo.ios && expo.ios.config) || {}),
        googleMapsApiKey: mapsKey,
      },
    },
    android: {
      ...(expo.android ?? {}),
      intentFilters: [
        ...((expo.android && expo.android.intentFilters) || []),
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: appDomain, pathPrefix: '/invite' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      config: {
        ...((expo.android && expo.android.config) || {}),
        googleMaps: {
          apiKey: mapsKey,
        },
      },
    },
    extra: {
      ...(expo.extra ?? {}),
      googleMapsApiKey: mapsKey,
      getYourGuideApiKey: presentKey(
        process.env.EXPO_PUBLIC_GETYOURGUIDE_API_KEY ||
          process.env.GETYOURGUIDE_API_KEY ||
          '',
      ),
      apiKeyStatus: keyStatus,
      appDomain,
    },
  };
};
