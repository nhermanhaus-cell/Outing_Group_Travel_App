export interface DestinationRatingInput {
  reviewScore?: number;
  communityScore?: number;
  nightlifeScore?: number;
  legalEqualityScore?: number;
  publicOpinionScore?: number;
}

export interface DestinationRating {
  score: number;
  label: 'Unmissable' | 'Must-see' | 'Stunning' | 'Standout' | 'Crowd favorite' | 'Worth the trip' | 'Full of character' | 'One to explore';
  variant: 'accent' | 'success' | 'info' | 'default';
}

export interface DestinationContextRating {
  score: number;
  label: 'More welcoming' | 'Generally welcoming' | 'Mixed signals' | 'Limited local support' | 'Plan with care';
  level: 'welcoming' | 'positive' | 'mixed' | 'limited' | 'caution';
  variant: 'success' | 'info' | 'default' | 'warning';
}

/**
 * Editorial destination rating built only from scores already assigned in the catalog.
 * It deliberately excludes the legacy "safetyScore" so this can never read as a safety claim.
 */
export function getDestinationRating(input: DestinationRatingInput): DestinationRating | null {
  const metrics = [
    metric(input.reviewScore, 5, 0.25),
    metric(input.communityScore, 100, 0.2),
    metric(input.nightlifeScore, 100, 0.25),
    metric(input.legalEqualityScore, 100, 0.15),
    metric(input.publicOpinionScore, 100, 0.15),
  ].filter((value): value is { normalized: number; weight: number } => value !== null);
  if (metrics.length < 3) return null;
  const totalWeight = metrics.reduce((total, value) => total + value.weight, 0);
  const score = Math.round(metrics.reduce((total, value) => total + value.normalized * value.weight, 0) / totalWeight);

  if (score >= 90) return { score, label: 'Unmissable', variant: 'accent' };
  if (score >= 88) return { score, label: 'Must-see', variant: 'accent' };
  if (score >= 85) return { score, label: 'Stunning', variant: 'success' };
  if (score >= 80) return { score, label: 'Standout', variant: 'success' };
  if (score >= 76) return { score, label: 'Crowd favorite', variant: 'info' };
  if (score >= 72) return { score, label: 'Worth the trip', variant: 'info' };
  if (score >= 68) return { score, label: 'Full of character', variant: 'default' };
  return { score, label: 'One to explore', variant: 'default' };
}

/**
 * A separate LGBTQ+ context signal. Public opinion carries more weight because this
 * label describes perceived local welcome; legal equality supplies structural context.
 * It is contextual planning guidance, never a guarantee of individual experience or safety.
 */
export function getDestinationContextRating(
  input: Pick<DestinationRatingInput, 'legalEqualityScore' | 'publicOpinionScore'>,
): DestinationContextRating | null {
  if (
    typeof input.legalEqualityScore !== 'number'
    || !Number.isFinite(input.legalEqualityScore)
    || typeof input.publicOpinionScore !== 'number'
    || !Number.isFinite(input.publicOpinionScore)
  ) return null;
  const legal = Math.max(0, Math.min(100, input.legalEqualityScore));
  const opinion = Math.max(0, Math.min(100, input.publicOpinionScore));
  const score = Math.round(opinion * 0.65 + legal * 0.35);

  if (score >= 88) return { score, label: 'More welcoming', level: 'welcoming', variant: 'success' };
  if (score >= 75) return { score, label: 'Generally welcoming', level: 'positive', variant: 'info' };
  if (score >= 55) return { score, label: 'Mixed signals', level: 'mixed', variant: 'default' };
  if (score >= 40) return { score, label: 'Limited local support', level: 'limited', variant: 'warning' };
  return { score, label: 'Plan with care', level: 'caution', variant: 'warning' };
}

function metric(value: number | undefined, maximum: number, weight: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return { normalized: Math.max(0, Math.min(100, value / maximum * 100)), weight };
}
