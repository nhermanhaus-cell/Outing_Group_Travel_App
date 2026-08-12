import { describe, expect, it } from 'vitest';
import { inferViatorAnalysisIntent, summarizeViatorSchedule } from '../../supabase/functions/_shared/viator-analysis';

describe('Viator option analysis', () => {
  const schedule = {
    currency: 'USD',
    bookableItems: [{
      productOptionCode: 'MORNING',
      seasons: [{
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        pricingRecords: [{
          daysOfWeek: ['MONDAY', 'TUESDAY'],
          timedEntries: [{ startTime: '09:30', unavailableDates: ['2026-08-18'] }],
        }],
      }],
    }],
  };

  it('summarizes an active date without claiming real-time inventory', () => {
    expect(summarizeViatorSchedule(schedule, '2026-08-17', '2026-08-12T12:00:00.000Z')).toMatchObject({
      status: 'schedule_available',
      requestedDate: '2026-08-17',
      currency: 'USD',
      productOptionCodes: ['MORNING'],
      startTimes: ['09:30'],
      liveAvailabilityConfirmed: false,
    });
  });

  it('marks a date unavailable when every matching start time is blocked', () => {
    expect(summarizeViatorSchedule(schedule, '2026-08-18').status).toBe('unavailable_for_date');
  });

  it('treats an empty schedule as inactive', () => {
    expect(summarizeViatorSchedule({ currency: 'EUR', bookableItems: [] }).status).toBe('inactive');
  });

  it('routes explicit Viator comparisons without relying on model tool choice', () => {
    expect(inferViatorAnalysisIntent('Compare the best current Viator food experiences in San Francisco.')).toMatchObject({
      destination: 'San Francisco',
    });
  });

  it('uses trusted scoped destination identity ahead of free text', () => {
    expect(inferViatorAnalysisIntent('Which food tours are best?', 'new-york-city')).toMatchObject({
      destination: 'new york city',
    });
  });

  it('does not prefetch for a generic non-experience question', () => {
    expect(inferViatorAnalysisIntent('Which destination is best in March?')).toBeNull();
  });
});
