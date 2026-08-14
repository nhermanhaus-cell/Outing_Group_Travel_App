type SearchParam = string | string[] | undefined;

export type SelectedDestination = {
  destinationSlug: string;
  destinationName: string;
  destinationCandidateId?: string;
};

type QuestionnaireHref = {
  pathname: '/quiz';
  params: SelectedDestination & { quizAnswers?: string };
};

type TripDetailsHref = {
  pathname: '/trips/new';
  params: SelectedDestination & { quizAnswers: string };
};

type QuizResultsHref = {
  pathname: '/quiz/results';
  params: { answers: string };
};

function firstValue(value: SearchParam): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;
  const trimmed = resolved?.trim();
  return trimmed || undefined;
}

export function selectedDestinationFromParams(params: {
  destinationSlug?: SearchParam;
  destinationName?: SearchParam;
  destinationCandidateId?: SearchParam;
}): SelectedDestination | undefined {
  const destinationSlug = firstValue(params.destinationSlug);
  const destinationName = firstValue(params.destinationName);
  if (!destinationSlug || !destinationName) return undefined;
  const destinationCandidateId = firstValue(params.destinationCandidateId);
  return { destinationSlug, destinationName, ...(destinationCandidateId ? { destinationCandidateId } : {}) };
}

export function destinationPlanHref(
  destination: SelectedDestination,
  quizAnswers?: SearchParam,
): QuestionnaireHref {
  const completedAnswers = firstValue(quizAnswers);
  return {
    pathname: '/quiz',
    params: {
      ...destination,
      ...(completedAnswers ? { quizAnswers: completedAnswers } : {}),
    },
  };
}

export function questionnaireCompletionHref(
  answers: unknown,
  destination?: SelectedDestination,
): QuizResultsHref | TripDetailsHref {
  const quizAnswers = JSON.stringify(answers);
  if (destination) {
    return {
      pathname: '/trips/new',
      params: { ...destination, quizAnswers },
    };
  }

  return {
    pathname: '/quiz/results',
    params: { answers: quizAnswers },
  };
}

export function suggestedTripEndDate(
  startDate: string,
  currentEndDate: string | undefined,
  durationDays: number | undefined,
): string {
  if (currentEndDate && currentEndDate >= startDate) return currentEndDate;
  if (!durationDays || durationDays < 1) return '';

  const [year, month, day] = startDate.split('-').map(Number);
  if (!year || !month || !day) return '';

  const end = new Date(Date.UTC(year, month - 1, day));
  end.setUTCDate(end.getUTCDate() + Math.max(0, Math.round(durationDays) - 1));
  return end.toISOString().slice(0, 10);
}
