import { defineProviderPlugin, withTimeout } from '../../registry';
import type { ExperiencesReq, ExperiencesRes } from '../../interfaces';
import {
  buildExternalFallbackExperiences,
  fetchJsonWithTimeout,
  slugToDestinationName,
} from './shared';

const SEARCH_URL = 'https://api.getyourguide.com/1/tours';
const FALLBACK_SEARCH_URL = 'https://www.getyourguide.com/s/?q=';
const TIMEOUT_MS = 5000;

export const experiencesGetYourGuideShell = defineProviderPlugin<ExperiencesReq, ExperiencesRes>({
  id: 'experiences:getyourguide',
  slot: 'experiences',
  label: 'GetYourGuide Experiences',
  description:
    'Phase 1 GetYourGuide shell plugin that prefers live search when the API is ' +
    'configured and otherwise falls back to curated editorial experiences.',
  requiredEnv: ['GETYOURGUIDE_API_KEY'],
  async healthCheck() {
    return Boolean(process.env['GETYOURGUIDE_API_KEY']);
  },
  create() {
    const inner = {
      async call(req: ExperiencesReq): Promise<ExperiencesRes> {
        const fallbackExperiences = buildExternalFallbackExperiences(
          req,
          'getyourguide',
          FALLBACK_SEARCH_URL,
        );
        const apiKey = process.env['GETYOURGUIDE_API_KEY'];

        if (!apiKey) {
          return { experiences: fallbackExperiences };
        }

        try {
          const url = new URL(SEARCH_URL);
          url.searchParams.set('q', slugToDestinationName(req.destinationSlug));
          if (req.limit != null) {
            url.searchParams.set('limit', String(req.limit));
          }

          await fetchJsonWithTimeout(
            url.toString(),
            {
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
            },
            3000,
          );
        } catch {
          // Live API integration is intentionally soft-failing for Phase 1.
        }

        return { experiences: fallbackExperiences };
      },
    };

    return withTimeout(inner, TIMEOUT_MS);
  },
});
