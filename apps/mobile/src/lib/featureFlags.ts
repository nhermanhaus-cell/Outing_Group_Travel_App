const enabled = (value: string | undefined, fallback = true) => value === undefined ? fallback : value !== 'false' && value !== '0';

export const featureFlags = {
  onboardingV1: enabled(process.env.EXPO_PUBLIC_FEATURE_ONBOARDING_V1),
  homeV2: enabled(process.env.EXPO_PUBLIC_FEATURE_HOME_V2),
  tripHubV2: enabled(process.env.EXPO_PUBLIC_FEATURE_TRIP_HUB_V2),
  assistantV1: enabled(process.env.EXPO_PUBLIC_FEATURE_ASSISTANT_V1, false),
  qwenEvaluation: enabled(process.env.EXPO_PUBLIC_FEATURE_QWEN_EVALUATION, false),
  smartItineraryV2: enabled(process.env.EXPO_PUBLIC_FEATURE_SMART_ITINERARY_V2),
  viatorV2: enabled(process.env.EXPO_PUBLIC_FEATURE_VIATOR_V2),
  supabaseCollaboration: enabled(process.env.EXPO_PUBLIC_FEATURE_SUPABASE_COLLABORATION),
  tripWizardV2: enabled(process.env.EXPO_PUBLIC_FEATURE_TRIP_WIZARD_V2),
  collectionsV1: enabled(process.env.EXPO_PUBLIC_FEATURE_COLLECTIONS_V1),
} as const;
