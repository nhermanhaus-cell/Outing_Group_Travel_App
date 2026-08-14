import { describe, it, expect } from 'vitest';
import { toTripPublicPayload, isSafePublicPayload } from '@gayi/domain';
import { generateInviteToken, validateInviteToken } from '@gayi/domain';
import type { Trip } from '@gayi/shared';
import { isExactViatorProductUrl } from '@gayi/shared';

describe('privacy helpers', () => {
  const trip: Trip = {
    tripId: 't1',
    userId: 'u1',
    destinationSlug: 'amsterdam',
    startDate: '2026-07-01',
    endDate: '2026-07-08',
    groupSize: 2,
    isPublic: true,
    lodgingAddress: '123 Secret St',
    bookingConfirmations: { hotel: 'ABC' },
    legalName: 'Legal Name',
    sensitivePreferences: { transHealthcare: true },
    highlights: ['Pride'],
  };

  it('strips sensitive fields from public payload', () => {
    const pub = toTripPublicPayload(trip, 'Amsterdam');
    expect((pub as { lodgingAddress?: string }).lodgingAddress).toBeUndefined();
    expect((pub as { bookingConfirmations?: unknown }).bookingConfirmations).toBeUndefined();
    expect((pub as { legalName?: string }).legalName).toBeUndefined();
    expect((pub as { sensitivePreferences?: unknown }).sensitivePreferences).toBeUndefined();
    expect((pub as { userId?: string }).userId).toBeUndefined();
    expect(pub.destinationSlug).toBe('amsterdam');
    expect(pub.destinationName).toBe('Amsterdam');
    expect(isSafePublicPayload(pub)).toBe(true);
  });
});

describe('invite tokens', () => {
  it('generates and validates opaque tokens', () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThan(16);
    expect(validateInviteToken(token)).toBe(true);
    expect(validateInviteToken('bad')).toBe(false);
  });
});

describe('Viator booking links', () => {
  it('rejects generic home and search links', () => {
    expect(isExactViatorProductUrl('https://www.viator.com/')).toBe(false);
    expect(isExactViatorProductUrl('https://www.viator.com/searchResults/all?text=Berlin')).toBe(false);
    expect(isExactViatorProductUrl('https://www.viator.com/tours/Berlin/Example/d488-123P1')).toBe(true);
  });
});
