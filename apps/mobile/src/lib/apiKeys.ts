import Constants from 'expo-constants';

type Extra = {
  googleMapsApiKey?: string;
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
  // Places web-service credentials stay in Supabase Edge Functions.
  return undefined;
}

export function getGoogleMapsApiKey(): string | undefined {
  const key =
    extra().googleMapsApiKey ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return present(key) ? key!.trim() : undefined;
}

export function getViatorApiKey(): string | undefined {
  // Viator affiliate credentials stay in Supabase Edge Functions.
  return undefined;
}

export type ApiKeyStatus = {
  maps: boolean;
  places: boolean;
  viator: boolean;
};

/** Runtime key presence from expo.extra / EXPO_PUBLIC_* (never prints secret values). */
export function getApiKeyStatus(): ApiKeyStatus {
  const hasTravelApi = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
  return {
    maps: Boolean(getGoogleMapsApiKey()),
    places: hasTravelApi,
    viator: hasTravelApi,
  };
}

export function googlePlacePhotoUrl(
  photoReference: string,
  maxWidth = 800,
): string | undefined {
  void maxWidth;
  void photoReference;
  return undefined;
}
