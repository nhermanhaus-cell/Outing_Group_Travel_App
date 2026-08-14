export type TimeFormatPreference = '12h' | '24h';
export type TemperatureUnitPreference = 'fahrenheit' | 'celsius';
export type DisplayCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'MXN' | 'CHF';

export interface DisplayPreferences {
  timeFormat: TimeFormatPreference;
  temperatureUnit: TemperatureUnitPreference;
  currency: DisplayCurrency;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  timeFormat: '12h',
  temperatureUnit: 'fahrenheit',
  currency: 'USD',
};

export const DISPLAY_CURRENCIES: DisplayCurrency[] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'CHF'];

// Approximate display rates relative to USD. Canonical planning values remain USD.
const USD_DISPLAY_RATES: Record<DisplayCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  MXN: 17.1,
  CHF: 0.89,
};

export function formatClockTime(value: string, preference: TimeFormatPreference): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
  if (preference === '24h') return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatClockRange(
  start: string,
  end: string | undefined,
  preference: TimeFormatPreference,
): string {
  const startLabel = formatClockTime(start, preference);
  return end ? `${startLabel}–${formatClockTime(end, preference)}` : startLabel;
}

/** Converts either 24-hour input or a 12-hour value such as "2:30 PM" to canonical HH:MM. */
export function normalizeClockInput(value: string): string | undefined {
  const trimmed = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/.exec(trimmed);
  if (twelveHour) {
    const displayHour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? '00');
    if (displayHour < 1 || displayHour > 12 || minute < 0 || minute > 59) return undefined;
    const hour = (displayHour % 12) + (twelveHour[3] === 'PM' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!twentyFourHour) return undefined;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function celsiusToFahrenheit(value: number): number {
  return value * 9 / 5 + 32;
}

export function formatTemperature(
  temperatureC: number,
  preference: TemperatureUnitPreference,
  includeUnit = true,
): string {
  const value = preference === 'fahrenheit' ? celsiusToFahrenheit(temperatureC) : temperatureC;
  const suffix = includeUnit ? (preference === 'fahrenheit' ? '°F' : '°C') : '°';
  return `${Math.round(value)}${suffix}`;
}

export function convertCurrency(
  amount: number,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
): { amount: number; currency: string; converted: boolean } {
  const source = sourceCurrency.toUpperCase() as DisplayCurrency;
  const sourceRate = USD_DISPLAY_RATES[source];
  const targetRate = USD_DISPLAY_RATES[displayCurrency];
  if (!Number.isFinite(amount) || !sourceRate || !targetRate) {
    return { amount, currency: sourceCurrency.toUpperCase(), converted: false };
  }
  return {
    amount: amount / sourceRate * targetRate,
    currency: displayCurrency,
    converted: source !== displayCurrency,
  };
}

export function formatMoney(
  amount: number,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  showCode = true,
): string {
  const converted = convertCurrency(amount, sourceCurrency, displayCurrency);
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: converted.currency,
    maximumFractionDigits: 0,
  }).format(converted.amount);
  return showCode ? `${formatted} ${converted.currency}` : formatted;
}

export function formatMoneyRange(
  low: number,
  high: number,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  showCode = true,
): string {
  const lowValue = convertCurrency(low, sourceCurrency, displayCurrency);
  const highValue = convertCurrency(high, sourceCurrency, displayCurrency);
  const currency = lowValue.currency === highValue.currency ? lowValue.currency : sourceCurrency.toUpperCase();
  const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(value));
  const symbol = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? currency;
  return `${symbol}${number(lowValue.amount)}–${symbol}${number(highValue.amount)}${showCode ? ` ${currency}` : ''}`;
}
