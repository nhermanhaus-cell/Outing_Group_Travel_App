import { describe, expect, it } from 'vitest';
import {
  destinationPlanHref,
  questionnaireCompletionHref,
  selectedDestinationFromParams,
  suggestedTripEndDate,
} from '../../apps/mobile/src/lib/tripPlanningFlow';
import {
  ITINERARY_BUILD_MAXIMUM_MS,
  ITINERARY_BUILD_MINIMUM_MS,
  itineraryBuildRemainingMs,
} from '../../apps/mobile/src/lib/itinerary-building-state';
import {
  resolveInitialTripSection,
  TRIP_PRIMARY_AREAS,
} from '../../apps/mobile/src/lib/trip-hub-navigation';
import {
  applyWrittenTravelIntent,
  shouldIncludeQuestionnaireStep,
} from '../../apps/mobile/src/lib/questionnaire-flow';
import type { TravelPreferences } from '@gayi/shared';

const destination = {
  destinationSlug: 'barcelona',
  destinationName: 'Barcelona',
};

describe('trip planning flow', () => {
  it('asks for written intent and interests once before destination recommendations', () => {
    const state = { hasDestination: false, resumedAfterDestinationChoice: false };
    expect(shouldIncludeQuestionnaireStep('intent', state)).toBe(true);
    expect(shouldIncludeQuestionnaireStep('interest', state)).toBe(true);
    expect(shouldIncludeQuestionnaireStep('personalization', state)).toBe(false);
  });

  it('does not replay intent or interests after a recommended destination is selected', () => {
    const state = { hasDestination: true, resumedAfterDestinationChoice: true };
    expect(shouldIncludeQuestionnaireStep('foundation', state)).toBe(false);
    expect(shouldIncludeQuestionnaireStep('intent', state)).toBe(false);
    expect(shouldIncludeQuestionnaireStep('interest', state)).toBe(false);
    expect(shouldIncludeQuestionnaireStep('personalization', state)).toBe(true);
  });

  it('keeps one intent and interest pass when planning directly from a destination', () => {
    const state = { hasDestination: true, resumedAfterDestinationChoice: false };
    expect(shouldIncludeQuestionnaireStep('discovery', state)).toBe(false);
    expect(shouldIncludeQuestionnaireStep('intent', state)).toBe(true);
    expect(shouldIncludeQuestionnaireStep('interest', state)).toBe(true);
  });

  it('uses explicit written travel intent as a destination-matching signal', () => {
    const preferences = {
      interests: ['food'],
      weatherPreference: 'any',
    } as TravelPreferences;
    const enriched = applyWrittenTravelIntent(
      preferences,
      ['learn'],
      'Somewhere warm with beaches, museums, and jazz',
    );
    expect(enriched.weatherPreference).toBe('warm');
    expect(enriched.interests).toEqual(expect.arrayContaining([
      'food', 'culture', 'history', 'beach', 'art', 'music',
    ]));
  });

  it('starts the questionnaire when planning from a destination page', () => {
    expect(destinationPlanHref(destination)).toEqual({
      pathname: '/quiz',
      params: destination,
    });
  });

  it('continues from the questionnaire to date confirmation with the destination preserved', () => {
    expect(questionnaireCompletionHref({ interests: ['food'] }, destination)).toEqual({
      pathname: '/trips/new',
      params: {
        ...destination,
        quizAnswers: '{"interests":["food"]}',
      },
    });
  });

  it('keeps the recommendation results step for destination discovery', () => {
    expect(questionnaireCompletionHref({ interests: ['food'] })).toEqual({
      pathname: '/quiz/results',
      params: { answers: '{"interests":["food"]}' },
    });
  });

  it('continues into destination-specific personalization after destination discovery', () => {
    const quizAnswers = '{"interests":["nightlife"]}';
    expect(destinationPlanHref(destination, quizAnswers)).toEqual({
      pathname: '/quiz',
      params: { ...destination, quizAnswers },
    });
  });

  it('requires both destination parameters before treating the destination as fixed', () => {
    expect(selectedDestinationFromParams({ destinationSlug: 'barcelona' })).toBeUndefined();
    expect(selectedDestinationFromParams({
      destinationSlug: ['barcelona'],
      destinationName: ['Barcelona'],
    })).toEqual(destination);
  });

  it('preserves a provisional destination reference through the questionnaire', () => {
    const provisional = {
      destinationSlug: 'porto-portugal-generated',
      destinationName: 'Porto',
      destinationCandidateId: '10000000-0000-4000-8000-000000000050',
    };
    expect(destinationPlanHref(provisional)).toEqual({ pathname: '/quiz', params: provisional });
    expect(questionnaireCompletionHref({ interests: ['food'] }, provisional)).toEqual({
      pathname: '/trips/new',
      params: { ...provisional, quizAnswers: '{"interests":["food"]}' },
    });
  });

  it('fills the questionnaire trip end date from the chosen duration', () => {
    expect(suggestedTripEndDate('2026-09-10', '', 7)).toBe('2026-09-16');
  });

  it('preserves an already-valid custom end date', () => {
    expect(suggestedTripEndDate('2026-09-10', '2026-09-20', 7)).toBe('2026-09-20');
  });

  it('replaces an end date that falls before the newly selected start date', () => {
    expect(suggestedTripEndDate('2026-09-10', '2026-09-08', 3)).toBe('2026-09-12');
  });

  it('keeps the itinerary build moment brief once the plan is ready', () => {
    expect(itineraryBuildRemainingMs(2_000, true)).toBe(ITINERARY_BUILD_MINIMUM_MS - 2_000);
  });

  it('allows up to ten seconds when itinerary data is still arriving', () => {
    expect(itineraryBuildRemainingMs(2_000, false)).toBe(ITINERARY_BUILD_MAXIMUM_MS - 2_000);
    expect(itineraryBuildRemainingMs(12_000, false)).toBe(0);
  });

  it('opens a trip on its itinerary unless a contextual screen was requested', () => {
    expect(resolveInitialTripSection()).toBe('itinerary');
    expect(resolveInitialTripSection('plan')).toBe('itinerary');
    expect(resolveInitialTripSection('overview')).toBe('overview');
    expect(resolveInitialTripSection('explore')).toBe('places');
  });

  it('keeps the trip hub to three primary choices', () => {
    expect(TRIP_PRIMARY_AREAS.map((area) => area.label)).toEqual(['Plan', 'Explore', 'Group']);
  });
});
