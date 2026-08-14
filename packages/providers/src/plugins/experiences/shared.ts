import experiencesSeed from '../../../../../fixtures/seed/experiences.json';
import type { Experience, ExperiencesReq } from '../../interfaces';

const EDITORIAL_EXPERIENCES = experiencesSeed as Experience[];

export function getEditorialExperiences(req: ExperiencesReq): Experience[] {
  let experiences = EDITORIAL_EXPERIENCES.filter(
    (experience) => experience.destinationSlug === req.destinationSlug,
  );
  if (req.limit != null) {
    experiences = experiences.slice(0, req.limit);
  }
  return experiences.map((experience) => ({ ...experience }));
}

export function slugToDestinationName(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildExternalFallbackExperiences(
  req: ExperiencesReq,
  provider: Experience['provider'],
  searchBaseUrl: string,
): Experience[] {
  const destinationName = slugToDestinationName(req.destinationSlug);

  return getEditorialExperiences(req).map((experience) => ({
    ...experience,
    provider,
    bookingMode: 'external',
    affiliateUrl: `${searchBaseUrl}${encodeURIComponent(`${destinationName} ${experience.title}`)}`,
  }));
}

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
