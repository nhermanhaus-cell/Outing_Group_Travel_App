const enabled = (value: string | undefined, fallback = true) => value === undefined ? fallback : value !== 'false' && value !== '0';
let fullExperience = enabled(process.env.EXPO_PUBLIC_FEATURE_OUTING_FULL_EXPERIENCE_V1, false);

export function setRuntimeFullExperience(enabledValue: boolean): void {
  fullExperience = enabledValue;
}

export const featureFlags = {
  get outingFullExperienceV1() { return fullExperience; },
  onboardingV1: enabled(process.env.EXPO_PUBLIC_FEATURE_ONBOARDING_V1),
  homeV2: enabled(process.env.EXPO_PUBLIC_FEATURE_HOME_V2),
  tripHubV2: enabled(process.env.EXPO_PUBLIC_FEATURE_TRIP_HUB_V2),
  get assistantV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_ASSISTANT_V1, false); },
  get assistantPersonalizationV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_ASSISTANT_PERSONALIZATION_V1, false); },
  get mistralAgentV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_MISTRAL_AGENT_V1, false); },
  get proactiveInsightsV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_PROACTIVE_INSIGHTS_V1, false); },
  get globalDiscoveryV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_GLOBAL_DISCOVERY_V1, false); },
  get semanticRetrievalV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_SEMANTIC_RETRIEVAL_V1, false); },
  get decisionBriefsV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_DECISION_BRIEFS_V1, false); },
  get smartCompareV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_SMART_COMPARE_V1, false); },
  get tripAuditV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_TRIP_AUDIT_V1, false); },
  communitySignalsV1: enabled(process.env.EXPO_PUBLIC_FEATURE_COMMUNITY_SIGNALS_V1, false),
  get catalogExpansionV1() { return fullExperience || enabled(process.env.EXPO_PUBLIC_FEATURE_CATALOG_EXPANSION_V1, false); },
  qwenEvaluation: enabled(process.env.EXPO_PUBLIC_FEATURE_QWEN_EVALUATION, false),
  smartItineraryV2: enabled(process.env.EXPO_PUBLIC_FEATURE_SMART_ITINERARY_V2),
  viatorV2: enabled(process.env.EXPO_PUBLIC_FEATURE_VIATOR_V2),
  supabaseCollaboration: enabled(process.env.EXPO_PUBLIC_FEATURE_SUPABASE_COLLABORATION),
  tripWizardV2: enabled(process.env.EXPO_PUBLIC_FEATURE_TRIP_WIZARD_V2),
  collectionsV1: enabled(process.env.EXPO_PUBLIC_FEATURE_COLLECTIONS_V1),
} as const;
