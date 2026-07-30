export interface QuizResultsAnswersShape {
  months: number[];
  duration: number;
  groupSize: number;
  interests: string[];
  socialPrefs: string[];
}

export function parseQuizResultsAnswers<T extends QuizResultsAnswersShape>(
  raw: string | string[] | undefined,
): T | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const value = JSON.parse(raw) as Partial<QuizResultsAnswersShape>;
    if (
      !Array.isArray(value.months) ||
      !Array.isArray(value.interests) ||
      !Array.isArray(value.socialPrefs) ||
      typeof value.duration !== 'number' ||
      !Number.isFinite(value.duration) ||
      typeof value.groupSize !== 'number' ||
      !Number.isFinite(value.groupSize)
    ) {
      return null;
    }
    return value as T;
  } catch {
    return null;
  }
}
