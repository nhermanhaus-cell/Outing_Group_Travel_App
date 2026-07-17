export const SLOTS = [
  'destinations',
  'places',
  'events',
  'lgbtqContext',
  'communitySignals',
  'weather',
  'flights',
  'lodging',
  'currency',
  'maps',
  'trips',
  'auth',
  'ai',
  'analytics',
  'share',
  'eventInvitation',
  'images',
  'notifications',
] as const;

export type Slot = (typeof SLOTS)[number];
