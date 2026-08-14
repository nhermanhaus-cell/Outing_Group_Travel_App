import { describe, expect, it } from 'vitest';
import type { LocalTrip } from '../../apps/mobile/src/providers/AppProviders';
import { tripPlanChangeRequiresVote } from '../../apps/mobile/src/lib/tripPermissions';

function trip(overrides: Partial<LocalTrip> = {}): LocalTrip {
  return {
    tripId: 'trip',
    name: 'Test trip',
    travelers: 3,
    glamourLevel: 'midrange',
    createdAt: '2026-08-13T00:00:00Z',
    ...overrides,
  };
}

describe('trip plan permissions', () => {
  it('lets local trip owners apply choices without a phantom group vote', () => {
    expect(tripPlanChangeRequiresVote(trip({ localOnly: true }), 'user')).toBe(false);
  });

  it('lets organizers apply and routes ordinary member changes to voting', () => {
    const members: LocalTrip['members'] = [
      { id: 'owner', displayName: 'Owner', role: 'owner' },
      { id: 'member', displayName: 'Member', role: 'member' },
    ];
    expect(tripPlanChangeRequiresVote(trip({ members }), 'owner')).toBe(false);
    expect(tripPlanChangeRequiresVote(trip({ members }), 'member')).toBe(true);
  });

  it('keeps an unknown shared role on the safe proposal path', () => {
    expect(tripPlanChangeRequiresVote(trip({ members: [] }), 'user')).toBe(true);
  });
});
