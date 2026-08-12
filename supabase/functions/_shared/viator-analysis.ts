type JsonRecord = Record<string, unknown>;

export type ViatorScheduleSummary = {
  status: 'schedule_available' | 'unavailable_for_date' | 'inactive' | 'unknown';
  requestedDate?: string;
  currency?: string;
  productOptionCodes: string[];
  availableDays: string[];
  startTimes: string[];
  unavailableDates: string[];
  liveAvailabilityConfirmed: false;
  checkedAt: string;
  note: string;
};

export type ViatorAnalysisIntent = {
  destination: string;
  searchTerm?: string;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validDate(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
  return Number.isNaN(new Date(`${candidate}T12:00:00Z`).getTime()) ? undefined : candidate;
}

function overlapsDate(season: JsonRecord, requestedDate?: string): boolean {
  if (!requestedDate) return true;
  const start = validDate(season.startDate);
  const end = validDate(season.endDate);
  return (!start || requestedDate >= start) && (!end || requestedDate <= end);
}

function weekday(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
    .toUpperCase();
}

/**
 * Route clear experience-comparison intent deterministically so provider
 * retrieval does not depend on whether the language model elects to call a
 * tool. Scoped destination identity always wins over text extraction.
 */
export function inferViatorAnalysisIntent(
  message: string,
  scopedDestination?: string,
): ViatorAnalysisIntent | null {
  const normalized = message.replace(/\s+/g, ' ').trim();
  const mentionsViator = /\bviator\b/i.test(normalized);
  const mentionsExperiences = /\b(tours?|activities|experiences?|excursions?|things to do)\b/i.test(normalized);
  const asksForAnalysis = /\b(compare|comparison|best|better|which|analy[sz]e|recommend|options?|choose|pick)\b/i.test(normalized);
  if ((!mentionsViator && !mentionsExperiences) || !asksForAnalysis) return null;

  const extracted = normalized.match(/\b(?:in|near|around|for)\s+([A-Z][A-Za-zÀ-ÿ.'’ -]{1,80}?)(?=(?:[?.!,;]|\s+(?:on|with|during|under|below|within|that|and|then)\b|$))/)?.[1]?.trim();
  const destination = scopedDestination?.replaceAll('-', ' ').trim() || extracted;
  if (!destination) return null;
  const withoutDestination = normalized
    .replace(/\b(?:compare|comparison|best|better|which|analy[sz]e|recommend|options?|choose|pick|current|viator)\b/gi, ' ')
    .replace(new RegExp(`\\b(?:in|near|around|for)\\s+${destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    destination,
    ...(withoutDestination.length >= 2 ? { searchTerm: withoutDestination.slice(0, 160) } : {}),
  };
}

/**
 * Reduce Viator's schedule payload to bounded evidence suitable for the model.
 * A schedule match is not a real-time inventory check, so this deliberately
 * never reports live availability as confirmed.
 */
export function summarizeViatorSchedule(
  value: unknown,
  requestedDateValue?: string,
  checkedAt = new Date().toISOString(),
): ViatorScheduleSummary {
  const schedule = record(value);
  const requestedDate = validDate(requestedDateValue);
  const items = schedule && Array.isArray(schedule.bookableItems)
    ? schedule.bookableItems.map(record).filter((item): item is JsonRecord => Boolean(item))
    : [];
  const currency = schedule ? text(schedule.currency) : undefined;
  const productOptionCodes = new Set<string>();
  const availableDays = new Set<string>();
  const startTimes = new Set<string>();
  const unavailableDates = new Set<string>();
  let matchingRecordCount = 0;
  const requestedWeekday = requestedDate ? weekday(requestedDate) : undefined;

  for (const item of items) {
    const optionCode = text(item.productOptionCode);
    if (optionCode) productOptionCodes.add(optionCode);
    const seasons = Array.isArray(item.seasons)
      ? item.seasons.map(record).filter((season): season is JsonRecord => Boolean(season))
      : [];
    for (const season of seasons.filter((candidate) => overlapsDate(candidate, requestedDate))) {
      const pricingRecords = Array.isArray(season.pricingRecords)
        ? season.pricingRecords.map(record).filter((entry): entry is JsonRecord => Boolean(entry))
        : [];
      for (const pricing of pricingRecords) {
        const days = Array.isArray(pricing.daysOfWeek)
          ? pricing.daysOfWeek.filter((day): day is string => typeof day === 'string')
          : [];
        for (const day of days) availableDays.add(day);
        if (requestedWeekday && days.length > 0 && !days.includes(requestedWeekday)) continue;
        const timedEntries = Array.isArray(pricing.timedEntries)
          ? pricing.timedEntries.map(record).filter((entry): entry is JsonRecord => Boolean(entry))
          : [];
        if (timedEntries.length === 0) {
          matchingRecordCount += 1;
          continue;
        }
        for (const entry of timedEntries) {
          const time = text(entry.startTime);
          const blocked = Array.isArray(entry.unavailableDates)
            ? entry.unavailableDates.filter((date): date is string => typeof date === 'string')
            : [];
          for (const date of blocked.slice(0, 24)) unavailableDates.add(date);
          if (requestedDate && blocked.includes(requestedDate)) continue;
          if (time) startTimes.add(time);
          matchingRecordCount += 1;
        }
      }
    }
  }

  const status: ViatorScheduleSummary['status'] = !schedule
    ? 'unknown'
    : items.length === 0
      ? 'inactive'
      : requestedDate && matchingRecordCount === 0
        ? 'unavailable_for_date'
        : 'schedule_available';
  const note = status === 'unknown'
    ? 'Viator schedule data was unavailable.'
    : status === 'inactive'
      ? 'Viator returned no active bookable options.'
      : status === 'unavailable_for_date'
        ? `No matching scheduled option was found for ${requestedDate}.`
        : requestedDate
          ? `Viator schedule data includes ${requestedDate}; final inventory and price are confirmed at provider handoff.`
          : 'Viator publishes an active schedule; choose a date before treating availability as date-specific.';

  return {
    status,
    ...(requestedDate ? { requestedDate } : {}),
    ...(currency ? { currency } : {}),
    productOptionCodes: [...productOptionCodes].slice(0, 12),
    availableDays: [...availableDays].slice(0, 7),
    startTimes: [...startTimes].sort().slice(0, 12),
    unavailableDates: [...unavailableDates].sort().slice(0, 24),
    liveAvailabilityConfirmed: false,
    checkedAt,
    note,
  };
}
