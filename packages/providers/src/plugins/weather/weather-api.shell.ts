import { defineProviderPlugin } from '../../registry';
import type { WeatherReq, WeatherRes } from '../../interfaces';

export const weatherApiShell = defineProviderPlugin<WeatherReq, WeatherRes>({
  id: 'weather:weather-api',
  slot: 'weather',
  label: 'WeatherAPI.com',
  description: 'Fetches live / forecast weather via WeatherAPI.com.',
  requiredEnv: ['WEATHER_API_KEY'],
  async healthCheck() {
    return false;
  },
  create() {
    return {
      async call(_req): Promise<WeatherRes> {
        throw new Error('weather:weather-api — not configured');
      },
    };
  },
});
