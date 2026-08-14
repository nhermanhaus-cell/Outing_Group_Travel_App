import type {
  ActivityPace,
  Interest,
  LookingFor,
  MemberPreferenceSnapshot,
  TravelPreferences,
} from '@gayi/shared';

const PACE_RANK: Record<ActivityPace, number> = {
  packed: 2,
  balanced: 1,
  downtime: 0,
};

const RANK_TO_PACE: ActivityPace[] = ['downtime', 'balanced', 'packed'];

function modePace(paces: ActivityPace[]): ActivityPace {
  if (paces.length === 0) return 'balanced';
  const avg =
    paces.reduce((sum, p) => sum + PACE_RANK[p], 0) / paces.length;
  const rounded = Math.round(avg);
  return RANK_TO_PACE[Math.max(0, Math.min(2, rounded))] ?? 'balanced';
}

/**
 * Blend owner preferences with optional member snapshots.
 * - Interests: prefer intersection when non-empty, else frequency-weighted union (top N)
 * - Nightlife / pace: average
 * - Looking-for: union
 * - Accessibility: union of hard needs from owner (members don't override)
 */
export function blendGroupPreferences(
  owner: TravelPreferences,
  members: MemberPreferenceSnapshot[] = [],
): TravelPreferences {
  if (members.length === 0) {
    return {
      ...owner,
      activityPace: owner.activityPace ?? 'balanced',
    };
  }

  const allInterestLists: Interest[][] = [
    owner.interests,
    ...members.map((m) => m.interests ?? []),
  ].filter((list) => list.length > 0);

  let interests: Interest[] = owner.interests;
  if (allInterestLists.length > 1) {
    const counts = new Map<Interest, number>();
    for (const list of allInterestLists) {
      for (const i of new Set(list)) {
        counts.set(i, (counts.get(i) ?? 0) + 1);
      }
    }
    const intersection = [...counts.entries()]
      .filter(([, n]) => n === allInterestLists.length)
      .map(([i]) => i);
    if (intersection.length > 0) {
      interests = intersection;
    } else {
      interests = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, Math.max(owner.interests.length, 4))
        .map(([i]) => i);
    }
  }

  const nightlifeValues = [
    owner.nightlifeImportance,
    ...members
      .map((m) => m.nightlifeImportance)
      .filter((n): n is number => typeof n === 'number'),
  ];
  const nightlifeImportance =
    nightlifeValues.reduce((a, b) => a + b, 0) / nightlifeValues.length;

  const paces: ActivityPace[] = [
    owner.activityPace ?? 'balanced',
    ...members
      .map((m) => m.activityPace)
      .filter((p): p is ActivityPace => Boolean(p)),
  ];

  const lookingFor = Array.from(
    new Set<LookingFor>([
      ...owner.lookingFor,
      ...members.flatMap((m) => m.lookingFor ?? []),
    ]),
  );

  return {
    ...owner,
    interests,
    nightlifeImportance: Math.round(nightlifeImportance * 100) / 100,
    activityPace: modePace(paces),
    lookingFor,
    groupSize: Math.max(owner.groupSize, members.length + 1),
    soloTravel: false,
  };
}
