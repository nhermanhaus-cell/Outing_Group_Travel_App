import { describe, expect, it, vi } from 'vitest';
import { exitTripPlanning, TRIP_PLANNING_HOME_HREF } from '../../apps/mobile/src/lib/planning-navigation';

describe('trip planning navigation', () => {
  it('dismisses the accumulated planning stack directly to Home', () => {
    const dismissTo = vi.fn();
    exitTripPlanning({ dismissTo });
    expect(dismissTo).toHaveBeenCalledWith(TRIP_PLANNING_HOME_HREF);
    expect(dismissTo).toHaveBeenCalledTimes(1);
  });
});
