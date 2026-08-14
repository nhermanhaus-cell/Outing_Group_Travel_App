import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canDeleteTrip } from '../../apps/mobile/src/lib/tripPermissions';
import type { LocalTrip } from '../../apps/mobile/src/providers/AppProviders';

const baseTrip: LocalTrip = {
  tripId: '10000000-0000-4000-8000-000000000099',
  name: 'Weekend away',
  travelers: 3,
  glamourLevel: 'comfortably_fabulous',
  createdAt: '2026-08-07T00:00:00.000Z',
  members: [
    { id: 'owner', displayName: 'Owner', role: 'owner' },
    { id: 'organizer', displayName: 'Organizer', role: 'organizer' },
    { id: 'member', displayName: 'Member', role: 'member' },
  ],
};

describe('trip deletion', () => {
  it('allows local drafts, owners, and organizers but not ordinary members', () => {
    expect(canDeleteTrip({ ...baseTrip, localOnly: true }, 'member')).toBe(true);
    expect(canDeleteTrip(baseTrip, 'owner')).toBe(true);
    expect(canDeleteTrip(baseTrip, 'organizer')).toBe(true);
    expect(canDeleteTrip(baseTrip, 'member')).toBe(false);
  });

  it('uses a permission-checked soft-delete RPC', () => {
    const migration = readFileSync('supabase/migrations/0010_trip_soft_delete.sql', 'utf8');
    const provider = readFileSync('apps/mobile/src/providers/AppProviders.tsx', 'utf8');
    expect(migration).toContain('public.is_trip_organizer(p_trip_id)');
    expect(migration).toContain('set deleted_at = now()');
    expect(migration).toContain('grant execute on function public.soft_delete_trip(uuid) to authenticated');
    expect(provider).toContain("rpc('soft_delete_trip'");
  });
});
