export function normalizeSavedDestinationSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter((item): item is string =>
      typeof item === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item)),
  )];
}

export function mergeSavedDestinationSlugs(local: unknown, remote: unknown): string[] {
  return normalizeSavedDestinationSlugs([
    ...normalizeSavedDestinationSlugs(local),
    ...normalizeSavedDestinationSlugs(remote),
  ]);
}
