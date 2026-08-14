import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAccountDataStorageKey } from '../../apps/mobile/src/lib/account-deletion-state';
import { shouldOfferOnboarding } from '../../apps/mobile/src/lib/onboardingState';

describe('account deletion', () => {
  it('clears account data while retaining device-level appearance and onboarding choices', () => {
    expect(isAccountDataStorageKey('gayi:trips')).toBe(true);
    expect(isAccountDataStorageKey('outing:assistant-insights:v2:user:request')).toBe(true);
    expect(isAccountDataStorageKey('outing:awareness:visit-queue:v1')).toBe(true);
    expect(isAccountDataStorageKey('outing:saved-destinations:v1')).toBe(true);
    expect(isAccountDataStorageKey('outing:appearance')).toBe(false);
    expect(isAccountDataStorageKey('outing:onboarding:v1:complete')).toBe(false);
  });

  it('keeps the public deletion resource reachable before onboarding', () => {
    expect(shouldOfferOnboarding({
      enabled: true,
      completed: false,
      pathname: '/account-deletion',
    })).toBe(false);
  });

  it('derives identity from a verified token and deletes the auth user server-side', () => {
    const edgeFunction = readFileSync('supabase/functions/account-deletion/index.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/0015_account_deletion.sql', 'utf8');
    expect(edgeFunction).toContain('service.auth.getUser(token)');
    expect(edgeFunction).toContain("body.confirmation !== 'DELETE'");
    expect(edgeFunction).toContain('service.auth.admin.deleteUser(userId, false)');
    expect(edgeFunction).toContain("https://appleid.apple.com/auth/revoke");
    expect(edgeFunction).toContain('expectedSubject && payload.sub !== expectedSubject');
    expect(edgeFunction).toContain('/persons/bulk_delete/');
    expect(edgeFunction).toContain('delete_events: true');
    expect(edgeFunction).toContain('delete_recordings: true');
    expect(edgeFunction).not.toContain('body.userId');
    expect(migration).toContain('references auth.users(id) on delete cascade');
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain('delete from public.trips where owner_id = p_user_id');
    expect(migration).toContain('account_deletion_scrub_polls');
  });

  it('provides both an in-app action and a public web route', () => {
    const settings = readFileSync('apps/mobile/app/settings/index.tsx', 'utf8');
    const deletionPage = readFileSync('apps/mobile/app/account-deletion.tsx', 'utf8');
    expect(settings).toContain("router.push('/account-deletion'");
    expect(deletionPage).toContain('Delete account permanently');
    expect(deletionPage).toContain("returnTo: '/account-deletion'");
  });
});
