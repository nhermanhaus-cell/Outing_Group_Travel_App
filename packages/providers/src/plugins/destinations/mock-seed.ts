import { defineProviderPlugin } from '../../registry';
import type { DestinationsReq, DestinationsRes } from '../../interfaces';
import type { Destination } from '@gayi/shared';
import catalogScoring from './catalog-scoring.json';

// This adapter and the mobile offline fallback consume the same generated
// scoring file. Do not add a second hand-maintained destination list here.
const SEED = catalogScoring as Destination[];

export const destinationsMockSeed = defineProviderPlugin<DestinationsReq, DestinationsRes>({
  id: 'destinations:mock-seed',
  slot: 'destinations',
  label: 'Bundled destination catalog',
  description: 'Offline destination data.',
  isMock: true,
  create() {
    return {
      async call(req): Promise<DestinationsRes> {
        let items = [...SEED];
        if (req.slugs?.length) {
          const set = new Set(req.slugs);
          items = items.filter((destination) => set.has(destination.slug));
        }
        if (req.filter?.continentCode) {
          items = items.filter((destination) => destination.continentCode === req.filter!.continentCode);
        }
        if (req.filter?.minSafetyScore != null) {
          items = items.filter((destination) => destination.safetyScore >= req.filter!.minSafetyScore!);
        }
        if (req.filter?.legalStatuses?.length) {
          const set = new Set(req.filter.legalStatuses);
          items = items.filter((destination) => set.has(destination.legalStatus));
        }
        if (req.limit != null) items = items.slice(0, req.limit);
        return { destinations: items };
      },
    };
  },
});
