const ACCOUNT_DATA_PREFIXES = [
  'gayi:',
  'outing:active-trip-',
  'outing:analytics:',
  'outing:assistant-',
  'outing:awareness:',
  'outing:destination-discovery-',
  'outing:generated-destination:',
  'outing:inspiration-',
  'outing:notification-',
  'outing:personalization-',
  'outing:preference-',
  'outing:saved-destinations:',
  'outing:today:',
] as const;

export function isAccountDataStorageKey(key: string): boolean {
  return ACCOUNT_DATA_PREFIXES.some((prefix) => key.startsWith(prefix));
}
