import { describe, expect, it } from 'vitest';
import {
  destinationPlanHref,
  questionnaireCompletionHref,
  selectedDestinationFromParams,
} from '../../apps/mobile/src/lib/tripPlanningFlow';

const destination = {
  destinationSlug: 'barcelona',
  destinationName: 'Barcelona',
};

describe('trip planning flow', () => {
  it('starts the questionnaire when planning from a destination page', () => {
    expect(destinationPlanHref(destination)).toEqual({
      pathname: '/quiz',
      params: destination,
    });
  });

  it('continues from the questionnaire to trip details with the destination preserved', () => {
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
});
