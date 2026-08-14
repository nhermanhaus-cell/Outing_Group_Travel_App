import type { ActivityPreferenceChoice } from '@gayi/shared';

export type ActivitySwipeAction = 'pass' | 'interested' | 'must_see';

export const ACTIVITY_SWIPE_GUIDE = [
  { action: 'pass' as const, label: 'Swipe left', detail: 'Not for this trip' },
  { action: 'must_see' as const, label: 'Tap the star', detail: 'Must see' },
  { action: 'interested' as const, label: 'Swipe right', detail: 'Interested' },
];

export function activityChoiceForSwipe(action: ActivitySwipeAction): ActivityPreferenceChoice {
  if (action === 'pass') return 'not_for_this_trip';
  if (action === 'must_see') return 'must_do';
  return 'interested';
}
