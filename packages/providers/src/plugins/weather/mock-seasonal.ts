import { defineProviderPlugin } from '../../registry';
import type { WeatherReq, WeatherRes, WeatherData } from '../../interfaces';

/** Seasonal averages keyed by month (1-12) for a selection of destinations. */
const SEASONAL: Record<string, Partial<Record<number, Omit<WeatherData, 'destinationSlug' | 'month'>>>> = {
  'barcelona-es': {
    1:  { avgHighC: 14, avgLowC: 8,  avgRainyDays: 5,  description: 'Mild winter',        uvIndex: 2 },
    4:  { avgHighC: 19, avgLowC: 12, avgRainyDays: 8,  description: 'Warm spring',         uvIndex: 5 },
    7:  { avgHighC: 29, avgLowC: 21, avgRainyDays: 2,  description: 'Hot, dry summer',     uvIndex: 9 },
    10: { avgHighC: 22, avgLowC: 16, avgRainyDays: 7,  description: 'Pleasant autumn',     uvIndex: 4 },
  },
  'amsterdam-nl': {
    1:  { avgHighC: 6,  avgLowC: 2,  avgRainyDays: 14, description: 'Cold, grey winter',   uvIndex: 1 },
    4:  { avgHighC: 13, avgLowC: 6,  avgRainyDays: 10, description: 'Cool spring',         uvIndex: 4 },
    7:  { avgHighC: 22, avgLowC: 14, avgRainyDays: 8,  description: 'Warm, lively summer', uvIndex: 6 },
    10: { avgHighC: 14, avgLowC: 8,  avgRainyDays: 11, description: 'Crisp autumn',        uvIndex: 2 },
  },
  'berlin-de': {
    1:  { avgHighC: 3,  avgLowC: -1, avgRainyDays: 12, description: 'Cold winter',         uvIndex: 1 },
    4:  { avgHighC: 13, avgLowC: 5,  avgRainyDays: 9,  description: 'Fresh spring',        uvIndex: 4 },
    7:  { avgHighC: 24, avgLowC: 14, avgRainyDays: 7,  description: 'Warm summer',         uvIndex: 7 },
    10: { avgHighC: 13, avgLowC: 6,  avgRainyDays: 10, description: 'Colourful autumn',    uvIndex: 2 },
  },
};

function interpolate(slug: string, month: number): WeatherData {
  const table = SEASONAL[slug];
  if (table) {
    const exact = table[month as keyof typeof table];
    if (exact) return { destinationSlug: slug, month, ...exact };
    // find nearest available month
    const months = Object.keys(table).map(Number);
    const nearest = months.reduce((a, b) =>
      Math.abs(b - month) < Math.abs(a - month) ? b : a,
    );
    const base = table[nearest as keyof typeof table]!;
    return { destinationSlug: slug, month, ...base };
  }
  return {
    destinationSlug: slug,
    month,
    avgHighC: 22,
    avgLowC: 14,
    avgRainyDays: 6,
    description: 'Typical seasonal weather',
    uvIndex: 5,
  };
}

export const weatherMockSeasonal = defineProviderPlugin<WeatherReq, WeatherRes>({
  id: 'weather:mock-seasonal',
  slot: 'weather',
  label: 'Mock Seasonal Weather',
  description: 'Returns seasonal weather estimates from an inline table.',
  isMock: true,
  create() {
    return {
      async call(req) {
        return { weather: interpolate(req.destinationSlug, req.month) };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
