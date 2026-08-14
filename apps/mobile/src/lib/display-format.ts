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

export function normalizeDisplayCurrency(value: unknown): DisplayCurrency {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return DISPLAY_CURRENCIES.includes(normalized as DisplayCurrency)
    ? normalized as DisplayCurrency
    : DEFAULT_DISPLAY_PREFERENCES.currency;
}

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatCurrencyValue(value: number, currency: DisplayCurrency): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(finiteAmount(value));
  } catch {
    return `${currency} ${Math.round(finiteAmount(value)).toLocaleString()}`;
  }
}

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
  sourceCurrency: string | null | undefined,
  displayCurrency: DisplayCurrency | null | undefined,
): { amount: number; currency: string; converted: boolean } {
  const source = normalizeDisplayCurrency(sourceCurrency);
  const target = normalizeDisplayCurrency(displayCurrency);
  const sourceRate = USD_DISPLAY_RATES[source];
  const targetRate = USD_DISPLAY_RATES[target];
  if (!Number.isFinite(amount)) {
    return { amount: 0, currency: target, converted: source !== target };
  }
  return {
    amount: amount / sourceRate * targetRate,
    currency: target,
    converted: source !== target,
  };
}

export function formatMoney(
  amount: number,
  sourceCurrency: string | null | undefined,
  displayCurrency: DisplayCurrency | null | undefined,
  showCode = true,
): string {
  const converted = convertCurrency(amount, sourceCurrency, displayCurrency);
  const currency = normalizeDisplayCurrency(converted.currency);
  const formatted = formatCurrencyValue(converted.amount, currency);
  return showCode ? `${formatted} ${converted.currency}` : formatted;
}

export function formatMoneyRange(
  low: number,
  high: number,
  sourceCurrency: string | null | undefined,
  displayCurrency: DisplayCurrency | null | undefined,
  showCode = true,
): string {
  const lowValue = convertCurrency(low, sourceCurrency, displayCurrency);
  const highValue = convertCurrency(high, sourceCurrency, displayCurrency);
  const currency = normalizeDisplayCurrency(
    lowValue.currency === highValue.currency ? lowValue.currency : displayCurrency,
  );
  const lowAmount = finiteAmount(lowValue.amount);
  const highAmount = finiteAmount(highValue.amount);
  const lower = Math.min(lowAmount, highAmount);
  const upper = Math.max(lowAmount, highAmount);
  const formattedLow = formatCurrencyValue(lower, currency);
  const formattedHigh = formatCurrencyValue(upper, currency);
  return `${formattedLow}–${formattedHigh}${showCode ? ` ${currency}` : ''}`;
}
