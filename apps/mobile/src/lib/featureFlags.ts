const enabled = (value: string | undefined, fallback = true) => value === undefined ? fallback : value !== 'false' && value !== '0';

export const featureFlags = {
  smartItineraryV2: enabled(process.env.EXPO_PUBLIC_FEATURE_SMART_ITINERARY_V2),
  viatorV2: enabled(process.env.EXPO_PUBLIC_FEATURE_VIATOR_V2),
  supabaseCollaboration: enabled(process.env.EXPO_PUBLIC_FEATURE_SUPABASE_COLLABORATION),
  tripWizardV2: enabled(process.env.EXPO_PUBLIC_FEATURE_TRIP_WIZARD_V2),
  collectionsV1: enabled(process.env.EXPO_PUBLIC_FEATURE_COLLECTIONS_V1),
} as const;
