import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_STORAGE_KEY = 'outing:onboarding:v1:complete';

const BYPASS_PREFIXES = ['/welcome', '/invite', '/share/', '/auth/'];

export function shouldOfferOnboarding(input: {
  enabled: boolean;
  completed: boolean;
  pathname: string;
}): boolean {
  if (!input.enabled || input.completed) return false;
  return !BYPASS_PREFIXES.some((prefix) => input.pathname === prefix || input.pathname.startsWith(prefix));
}

export async function readOnboardingComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)) === 'true';
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
