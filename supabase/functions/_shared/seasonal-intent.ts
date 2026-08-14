export type ClimatePreference = 'warm' | 'mild' | 'cool' | 'cold';

export type SeasonalIntent = {
  climate?: ClimatePreference;
  months: number[];
  label?: string;
};

const MONTHS: Array<[number, RegExp]> = [
  [1, /\bjan(?:uary)?\b/i], [2, /\bfeb(?:ruary)?\b/i], [3, /\bmar(?:ch)?\b/i],
  [4, /\bapr(?:il)?\b/i], [5, /\bmay\b/i], [6, /\bjun(?:e)?\b/i],
  [7, /\bjul(?:y)?\b/i], [8, /\baug(?:ust)?\b/i], [9, /\bsep(?:t(?:ember)?)?\b/i],
  [10, /\boct(?:ober)?\b/i], [11, /\bnov(?:ember)?\b/i], [12, /\bdec(?:ember)?\b/i],
];

export function inferSeasonalIntent(message: string): SeasonalIntent {
  const explicitMonths = MONTHS.filter(([, pattern]) => pattern.test(message)).map(([month]) => month);
  let months = explicitMonths;
  let label: string | undefined;
  if (!months.length) {
    if (/\b(?:australian|new zealand|southern hemisphere) winter\b/i.test(message)) {
      months = [6, 7, 8];
      label = 'June–August';
    } else if (/\bwinter(?:time)?\b/i.test(message)) {
      months = [12, 1, 2];
      label = 'December–February';
    } else if (/\bspring(?:time)?\b/i.test(message)) {
      months = [3, 4, 5];
      label = 'March–May';
    } else if (/\bsummer(?:time)?\b/i.test(message)) {
      months = [6, 7, 8];
      label = 'June–August';
    } else if (/\b(?:autumn|fall)\b/i.test(message)) {
      months = [9, 10, 11];
      label = 'September–November';
    }
  }

  let climate: ClimatePreference | undefined;
  if (/\b(?:mild|temperate|not too hot|comfortable weather)\b/i.test(message)) climate = 'mild';
  else if (/\b(?:warm|hot|sunny|tropical|beach weather|escape the cold)\b/i.test(message)) climate = 'warm';
  else if (/\b(?:cool|crisp|sweater weather)\b/i.test(message)) climate = 'cool';
  else if (/\b(?:cold|snowy|snow|ski|winter sports)\b/i.test(message)) climate = 'cold';

  return { climate, months: [...new Set(months)], label };
}

export function climateEligibility(
  avgHighByMonth: unknown,
  months: number[],
  climate?: ClimatePreference,
): { eligible: boolean; averageHighC?: number; minimumHighC?: number } {
  if (!climate || !months.length) return { eligible: true };
  const values = months.map((month) => {
    if (!avgHighByMonth || typeof avgHighByMonth !== 'object') return undefined;
    const value = (avgHighByMonth as Record<string, unknown>)[String(month)];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  });
  if (values.some((value) => value === undefined)) return { eligible: false };
  const temperatures = values as number[];
  const averageHighC = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
  const minimumHighC = Math.min(...temperatures);
  const maximumHighC = Math.max(...temperatures);
  const eligible = climate === 'warm'
    ? averageHighC >= 20 && minimumHighC >= 18
    : climate === 'mild'
      ? minimumHighC >= 14 && maximumHighC <= 27
      : climate === 'cool'
        ? averageHighC >= 7 && maximumHighC <= 20
        : maximumHighC <= 12;
  return { eligible, averageHighC, minimumHighC };
}
