import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  celsiusToFahrenheit,
  formatClockRange,
  formatClockTime,
  formatMoney,
  formatMoneyRange,
  formatTemperature,
  normalizeClockInput,
} from '../../apps/mobile/src/lib/display-format';

describe('traveler display formatting', () => {
  it('defaults to 12-hour time, Fahrenheit, and USD', () => {
    expect(DEFAULT_DISPLAY_PREFERENCES).toEqual({
      timeFormat: '12h',
      temperatureUnit: 'fahrenheit',
      currency: 'USD',
    });
  });

  it('formats canonical itinerary times in either selected clock style', () => {
    expect(formatClockTime('00:00', '12h')).toBe('12:00 AM');
    expect(formatClockTime('18:05', '12h')).toBe('6:05 PM');
    expect(formatClockTime('6:05', '24h')).toBe('06:05');
    expect(formatClockRange('18:00', '20:30', '12h')).toBe('6:00 PM–8:30 PM');
  });

  it('accepts both clock styles and normalizes them for itinerary storage', () => {
    expect(normalizeClockInput('2:30 PM')).toBe('14:30');
    expect(normalizeClockInput('12 AM')).toBe('00:00');
    expect(normalizeClockInput('07:15')).toBe('07:15');
    expect(normalizeClockInput('25:00')).toBeUndefined();
  });

  it('converts Celsius forecast data to Fahrenheit for the default display', () => {
    expect(celsiusToFahrenheit(20)).toBe(68);
    expect(formatTemperature(20, 'fahrenheit')).toBe('68°F');
    expect(formatTemperature(20, 'celsius')).toBe('20°C');
  });

  it('labels destination planning ranges with the selected currency', () => {
    expect(formatMoneyRange(100, 200, 'USD', 'USD')).toMatch(/USD$/);
    expect(formatMoneyRange(100, 200, 'USD', 'EUR')).toMatch(/EUR$/);
  });

  it('falls back to USD instead of crashing when a saved currency is missing', () => {
    expect(formatMoneyRange(100, 200, 'USD', undefined)).toMatch(/USD$/);
    expect(formatMoney(150, 'USD', undefined)).toMatch(/USD$/);
  });

  it('keeps malformed amounts from reaching Intl or native rendering', () => {
    expect(formatMoneyRange(Number.NaN, Number.POSITIVE_INFINITY, 'USD', undefined)).toMatch(/USD$/);
  });
});
