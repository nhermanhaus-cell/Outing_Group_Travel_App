import { defineProviderPlugin } from '../../registry';
import type { CommunitySignalsReq, CommunitySignalsRes, CommunitySignals } from '../../interfaces';

function mockSignals(destinationSlug: string): CommunitySignals {
  const hash = destinationSlug.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return {
    destinationSlug,
    activeUserCount: 50 + (hash % 450),
    recentCheckins: 5 + (hash % 95),
    popularPlaceIds: [],
    trendingEventIds: [],
    lastUpdated: new Date().toISOString(),
  };
}

export const communitySignalsMockSeed = defineProviderPlugin<CommunitySignalsReq, CommunitySignalsRes>({
  id: 'communitySignals:mock-seed',
  slot: 'communitySignals',
  label: 'Mock Community Signals',
  description: 'Deterministic mock community signal data for development.',
  isMock: true,
  create() {
    return {
      async call(req) {
        return { signals: mockSignals(req.destinationSlug) };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
