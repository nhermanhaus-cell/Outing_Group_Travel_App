import { describe, expect, it } from 'vitest';
import { normalizeActivityPreferenceChoice } from '@gayi/domain';
import {
  ACTIVITY_SWIPE_GUIDE,
  activityChoiceForSwipe,
} from '../../apps/mobile/src/lib/activitySwipe';

describe('activity swipe controls', () => {
  it('maps left, right, and must-see actions to backward-compatible preference choices', () => {
    expect(activityChoiceForSwipe('pass')).toBe('not_for_this_trip');
    expect(activityChoiceForSwipe('interested')).toBe('interested');
    expect(activityChoiceForSwipe('must_see')).toBe('must_do');
  });

  it('keeps must-see equivalent to the strongest positive group weight', () => {
    expect(normalizeActivityPreferenceChoice(activityChoiceForSwipe('must_see'))).toBe('very_interested');
    expect(normalizeActivityPreferenceChoice(activityChoiceForSwipe('pass'))).toBe('uninterested');
  });

  it('provides a visible explanation for every action', () => {
    expect(ACTIVITY_SWIPE_GUIDE.map((item) => item.action)).toEqual([
      'pass',
      'must_see',
      'interested',
    ]);
    expect(ACTIVITY_SWIPE_GUIDE.every((item) => item.label && item.detail)).toBe(true);
  });
});
