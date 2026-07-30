type SearchParam = string | string[] | undefined;

export type SelectedDestination = {
  destinationSlug: string;
  destinationName: string;
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
}): SelectedDestination | undefined {
  const destinationSlug = firstValue(params.destinationSlug);
  const destinationName = firstValue(params.destinationName);
  if (!destinationSlug || !destinationName) return undefined;
  return { destinationSlug, destinationName };
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
