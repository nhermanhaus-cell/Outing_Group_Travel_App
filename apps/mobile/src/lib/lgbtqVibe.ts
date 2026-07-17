/**
 * Playful vibe labels from legal-equality score.
 * These are tone-of-voice only — never a safety claim.
 */
export function lgbtqVibeLabel(legalEqualityScore: number): string {
  if (legalEqualityScore >= 85) return 'Hella Fierce';
  if (legalEqualityScore >= 60) return 'Slay';
  if (legalEqualityScore >= 40) return "It's Giving";
  return 'Read the Room';
}

export function lgbtqVibeVariant(
  legalEqualityScore: number,
): 'success' | 'info' | 'warning' | 'error' {
  if (legalEqualityScore >= 85) return 'success';
  if (legalEqualityScore >= 60) return 'info';
  if (legalEqualityScore >= 40) return 'warning';
  return 'error';
}
