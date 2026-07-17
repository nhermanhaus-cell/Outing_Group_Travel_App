import { defineProviderPlugin } from '../../registry';
import type { ExperiencesReq, ExperiencesRes } from '../../interfaces';
import { getEditorialExperiences } from './shared';

export const experiencesMockEditorial = defineProviderPlugin<ExperiencesReq, ExperiencesRes>({
  id: 'experiences:mock-editorial',
  slot: 'experiences',
  label: 'Mock Editorial Experiences',
  description: 'Curated editorial experiences for the Phase 1 destination seed set.',
  isMock: true,
  create() {
    return {
      async call(req) {
        return {
          experiences: getEditorialExperiences(req),
        };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
