import { describe, expect, it } from 'vitest';
import {
  buildTripDateRecommendations,
  googleFlightsSearchUrl,
  upcomingCandidateMonths,
} from '../../apps/mobile/src/lib/dateRecommendations';

describe('trip date recommendations', () => {
  it('ranks the lowest observed route fare first', () => {
    const recommendations = buildTripDateRecommendations({
      originIata: 'SFO',
      destinationIata: 'BCN',
      durationDays: 7,
      fareObservations: [
        {
          requestedMonth: '2026-10',
          deal: {
            id: 'higher',
            originIata: 'SFO',
            destinationIata: 'BCN',
            destinationName: 'Barcelona',
            price: 620,
            currency: 'USD',
            direct: false,
            observedAt: '2026-07-30T00:00:00Z',
            source: 'skyscanner_indicative',
          },
        },
        {
          requestedMonth: '2026-11',
          deal: {
            id: 'lower',
            originIata: 'SFO',
            destinationIata: 'BCN',
            destinationName: 'Barcelona',
            departureDate: '2026-11-10',
            price: 440,
            currency: 'USD',
            direct: false,
            observedAt: '2026-07-30T00:00:00Z',
            source: 'skyscanner_indicative',
          },
        },
      ],
      events: [],
      preferences: {
        interests: ['food'],
        goals: ['explore'],
        hallmarkIds: [],
        nightlife: 2,
        preferredMonths: [],
      },
      now: new Date('2026-07-30T12:00:00Z'),
    });
    expect(recommendations[0]).toMatchObject({
      source: 'fare_observation',
      price: 440,
      startDate: '2026-11-10',
      endDate: '2026-11-16',
    });
  });

  it('adds future events that match questionnaire preferences', () => {
    const recommendations = buildTripDateRecommendations({
      originIata: 'JFK',
      destinationIata: 'MAD',
      durationDays: 5,
      fareObservations: [],
      events: [{
        id: 'pride',
        title: 'Madrid Pride',
        startDate: '2027-07-03',
        endDate: '2027-07-05',
        category: 'pride',
      }],
      preferences: {
        interests: ['pride'],
        goals: ['connect'],
        hallmarkIds: ['pride'],
        nightlife: 4,
        preferredMonths: [],
      },
      now: new Date('2026-07-30T12:00:00Z'),
    });
    expect(recommendations[0]).toMatchObject({
      source: 'matching_event',
      eventTitle: 'Madrid Pride',
      startDate: '2027-07-02',
    });
  });

  it('builds a Google Flights verification handoff with exact dates', () => {
    expect(decodeURIComponent(
      googleFlightsSearchUrl('SFO', 'NRT', '2026-10-06', '2026-10-13'),
    )).toContain('Flights from SFO to NRT on 2026-10-06 returning 2026-10-13');
  });

  it('respects preferred travel months when choosing fare searches', () => {
    expect(upcomingCandidateMonths(
      new Date('2026-07-30T12:00:00Z'),
      [10, 11],
      2,
    )).toEqual(['2026-10', '2026-11']);
  });
});
