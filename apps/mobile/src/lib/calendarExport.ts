import * as Calendar from 'expo-calendar';
import type { ItineraryItem } from '@gayi/domain';

export interface CalendarTripContext {
  tripId: string;
  tripName: string;
  startDate?: string;
  destinationName?: string;
  lodgingAddress?: string;
}

export interface CalendarExportOptions {
  includeTravel: boolean;
  includeDowntime: boolean;
}

export interface CalendarExportResult {
  created: number;
  updated: number;
  skipped: number;
}

interface CalendarEventDraft {
  marker: string;
  event: Omit<Partial<Calendar.Event>, 'id'> & Pick<Calendar.Event, 'title' | 'startDate' | 'endDate'>;
}

const MARKER_PREFIX = '[Outing itinerary:';
const LEGACY_MARKER_PREFIX = '[Gay-i itinerary:';

export async function getWritableEventCalendars(): Promise<Calendar.Calendar[]> {
  if (!(await Calendar.isAvailableAsync())) throw new Error('Calendar is not available on this device');
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('CALENDAR_PERMISSION_DENIED');
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((calendar) => calendar.allowsModifications && calendar.isVisible !== false && calendar.isSynced !== false)
    .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.title.localeCompare(b.title));
}

export function calendarAccountLabel(calendar: Calendar.Calendar): string {
  const account = calendar.ownerAccount?.trim() || calendar.source?.name?.trim();
  return account && account.toLowerCase() !== calendar.title.toLowerCase()
    ? `${calendar.title} · ${account}`
    : calendar.title;
}

export function buildItineraryCalendarEvents(
  items: ItineraryItem[],
  trip: CalendarTripContext,
  options: CalendarExportOptions,
): CalendarEventDraft[] {
  const sorted = items
    .filter((item) => (item.startsAt || trip.startDate) && (options.includeDowntime || item.kind !== 'downtime'))
    .slice()
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const drafts: CalendarEventDraft[] = [];

  for (const item of sorted) {
    const timezone = item.timezone || 'UTC';
    const localStart = item.startsAt ?? localTimestampForTripDay(trip.startDate!, item.day, item.time);
    const startDate = zonedWallTimeToDate(localStart, timezone);
    const endDate = item.endsAt
      ? zonedWallTimeToDate(item.endsAt, timezone)
      : new Date(startDate.getTime() + Math.max(15, item.duration) * 60_000);
    const itemMarker = `${MARKER_PREFIX}${trip.tripId}:stop:${item.placeId}]`;
    const mapsUrl = item.coords && Number.isFinite(item.coords.lat) && Number.isFinite(item.coords.lng)
      ? `https://www.google.com/maps/search/?api=1&query=${item.coords.lat},${item.coords.lng}`
      : undefined;
    const notes = [
      item.whySelected,
      item.scheduleStatus === 'verified' ? 'Time checked against available schedule data.' : 'Time is an estimate; recheck before the trip.',
      item.bookingRequired ? 'Reservation or ticket may be required.' : undefined,
      item.arrivalBufferMinutes ? `${item.arrivalBufferMinutes}-minute arrival buffer is already included in the itinerary.` : undefined,
      mapsUrl,
      itemMarker,
    ].filter(Boolean).join('\n\n');

    if (options.includeTravel && item.travelFromPrevious && item.travelFromPrevious.durationMinutes > 0) {
      const bufferMinutes = item.arrivalBufferMinutes ?? 10;
      const travelEnd = new Date(startDate.getTime() - bufferMinutes * 60_000);
      const travelStart = new Date(travelEnd.getTime() - item.travelFromPrevious.durationMinutes * 60_000);
      const travelMarker = `${MARKER_PREFIX}${trip.tripId}:travel:${item.placeId}]`;
      drafts.push({
        marker: travelMarker,
        event: {
          title: `Travel to ${item.title}`,
          startDate: travelStart,
          endDate: travelEnd,
          timeZone: timezone,
          endTimeZone: timezone,
          location: trip.destinationName ?? null,
          notes: [
            `${formatMode(item.travelFromPrevious.mode)} · about ${item.travelFromPrevious.durationMinutes} minutes`,
            item.travelFromPrevious.estimated ? 'Travel time is estimated.' : 'Travel time calculated from route data.',
            mapsUrl,
            travelMarker,
          ].filter(Boolean).join('\n\n'),
          alarms: [],
        },
      });
    }

    drafts.push({
      marker: itemMarker,
      event: {
        title: item.kind === 'downtime' ? item.title : `${item.title} · ${trip.tripName}`,
        startDate,
        endDate,
        timeZone: timezone,
        endTimeZone: timezone,
        location: item.kind === 'downtime' ? trip.lodgingAddress ?? trip.destinationName ?? null : trip.destinationName ?? null,
        notes,
        ...(mapsUrl ? { url: mapsUrl } : {}),
        alarms: item.bookingRequired ? [{ relativeOffset: -(item.arrivalBufferMinutes ?? 15) }] : [],
      },
    });
  }
  return drafts;
}

export async function exportItineraryToCalendar(
  calendarId: string,
  items: ItineraryItem[],
  trip: CalendarTripContext,
  options: CalendarExportOptions,
): Promise<CalendarExportResult> {
  const drafts = buildItineraryCalendarEvents(items, trip, options);
  if (drafts.length === 0) return { created: 0, updated: 0, skipped: items.length };
  const starts = drafts.map((draft) => new Date(draft.event.startDate).getTime());
  const ends = drafts.map((draft) => new Date(draft.event.endDate).getTime());
  const windowStart = new Date(Math.min(...starts) - 24 * 60 * 60_000);
  const windowEnd = new Date(Math.max(...ends) + 24 * 60 * 60_000);
  const existing = await Calendar.getEventsAsync([calendarId], windowStart, windowEnd);
  let created = 0;
  let updated = 0;

  for (const draft of drafts) {
    const legacyMarker = draft.marker.replace(MARKER_PREFIX, LEGACY_MARKER_PREFIX);
    const match = existing.find(
      (event) =>
        event.notes?.includes(draft.marker) ||
        event.notes?.includes(legacyMarker),
    );
    if (match) {
      await Calendar.updateEventAsync(match.id, draft.event);
      updated += 1;
    } else {
      await Calendar.createEventAsync(calendarId, draft.event);
      created += 1;
    }
  }
  return { created, updated, skipped: items.length - drafts.filter((draft) => draft.marker.includes(':stop:')).length };
}

export async function openItineraryItemInCalendar(
  item: ItineraryItem,
  trip: CalendarTripContext,
): Promise<void> {
  const draft = buildItineraryCalendarEvents([item], trip, { includeTravel: false, includeDowntime: true })[0];
  if (!draft) throw new Error('Add trip dates before sending this item to a calendar');
  await Calendar.createEventInCalendarAsync(draft.event);
}

function formatMode(mode: string): string {
  return mode ? `${mode[0]?.toUpperCase()}${mode.slice(1)}` : 'Travel';
}

function localTimestampForTripDay(startDate: string, day: number, time: string): string {
  const date = new Date(`${startDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(0, day - 1));
  return `${date.toISOString().slice(0, 10)}T${time}:00`;
}

/** Convert a provider's offset-free destination timestamp into an absolute Date. */
function zonedWallTimeToDate(localIso: string, timezone: string): Date {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(localIso)) return new Date(localIso);
  const target = new Date(`${localIso}Z`);
  if (Number.isNaN(target.getTime()) || timezone === 'UTC') return target;
  let guess = target.getTime();
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const represented = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    guess -= represented - target.getTime();
  }
  return new Date(guess);
}
