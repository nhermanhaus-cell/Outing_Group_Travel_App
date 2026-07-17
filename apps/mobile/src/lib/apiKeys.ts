import Constants from 'expo-constants';

type Extra = {
  googlePlacesApiKey?: string;
  googleMapsApiKey?: string;
  viatorApiKey?: string;
  getYourGuideApiKey?: string;
  apiKeyStatus?: {
    maps?: boolean;
    places?: boolean;
    viator?: boolean;
  };
};

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

function present(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  // Treat common placeholders as missing so UI status stays honest.
  const lower = trimmed.toLowerCase();
  if (
    lower === 'empty' ||
    lower === 'your_key_here' ||
    lower.includes('replace') ||
    lower.includes('paste')
  ) {
    return false;
  }
  return true;
}

export function getGooglePlacesApiKey(): string | undefined {
  const key =
    extra().googlePlacesApiKey ||
    extra().googleMapsApiKey ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return present(key) ? key!.trim() : undefined;
}

export function getGoogleMapsApiKey(): string | undefined {
  const key =
    extra().googleMapsApiKey ||
    extra().googlePlacesApiKey ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  return present(key) ? key!.trim() : undefined;
}

export function getViatorApiKey(): string | undefined {
  const key = extra().viatorApiKey || process.env.EXPO_PUBLIC_VIATOR_API_KEY;
  return present(key) ? key!.trim() : undefined;
}

export type ApiKeyStatus = {
  maps: boolean;
  places: boolean;
  viator: boolean;
};

/** Runtime key presence from expo.extra / EXPO_PUBLIC_* (never prints secret values). */
export function getApiKeyStatus(): ApiKeyStatus {
  return {
    maps: Boolean(getGoogleMapsApiKey()),
    places: Boolean(getGooglePlacesApiKey()),
    viator: Boolean(getViatorApiKey()),
  };
}

export function googlePlacePhotoUrl(
  photoReference: string,
  maxWidth = 800,
): string | undefined {
  const key = getGooglePlacesApiKey();
  if (!key || !photoReference) return undefined;
  const url = new URL('https://maps.googleapis.com/maps/api/place/photo');
  url.searchParams.set('maxwidth', String(maxWidth));
  url.searchParams.set('photo_reference', photoReference);
  url.searchParams.set('key', key);
  return url.toString();
}
