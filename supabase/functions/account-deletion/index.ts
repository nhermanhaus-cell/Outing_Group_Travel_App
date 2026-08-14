import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  SignJWT,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
} from 'npm:jose@5.9.6';
import { corsHeaders } from '../_shared/http.ts';

type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function response(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

async function removeStoragePrefix(
  service: UntypedSupabaseClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  const pending = [prefix];
  const paths: string[] = [];

  while (pending.length) {
    const directory = pending.shift()!;
    let offset = 0;
    while (true) {
      const { data, error } = await service.storage.from(bucket).list(directory, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        if (/bucket not found/i.test(error.message)) return;
        throw error;
      }
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${directory}/${entry.name}`;
        if (entry.id || entry.metadata) paths.push(path);
        else pending.push(path);
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await service.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

async function revokeAppleAuthorization(
  authorizationCode: string,
  expectedSubject?: string,
): Promise<boolean> {
  const teamId = optionalEnv('APPLE_TEAM_ID');
  const keyId = optionalEnv('APPLE_KEY_ID');
  const clientId = optionalEnv('APPLE_CLIENT_ID');
  const privateKey = optionalEnv('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!teamId || !keyId || !clientId || !privateKey) return false;

  try {
    const signingKey = await importPKCS8(privateKey, 'ES256');
    const clientSecret = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(signingKey);
    const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) return false;
    const tokens = await tokenResponse.json() as {
      access_token?: unknown;
      refresh_token?: unknown;
      id_token?: unknown;
    };
    if (typeof tokens.id_token !== 'string') return false;
    const { payload } = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
      { issuer: 'https://appleid.apple.com', audience: clientId },
    );
    if (expectedSubject && payload.sub !== expectedSubject) return false;

    const token = typeof tokens.refresh_token === 'string'
      ? tokens.refresh_token
      : typeof tokens.access_token === 'string'
        ? tokens.access_token
        : undefined;
    if (!token) return false;
    const tokenType = typeof tokens.refresh_token === 'string' ? 'refresh_token' : 'access_token';
    const revokeResponse = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokenType,
      }),
    });
    return revokeResponse.ok;
  } catch {
    return false;
  }
}

async function queuePostHogDeletion(userId: string): Promise<boolean> {
  const personalApiKey = optionalEnv('POSTHOG_PERSONAL_API_KEY');
  const projectId = optionalEnv('POSTHOG_PROJECT_ID');
  if (!personalApiKey || !projectId) return false;
  const host = (optionalEnv('POSTHOG_API_HOST') || 'https://us.posthog.com').replace(/\/$/, '');
  try {
    const result = await fetch(
      `${host}/api/projects/${encodeURIComponent(projectId)}/persons/bulk_delete/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${personalApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          distinct_ids: [userId],
          delete_events: true,
          delete_recordings: true,
          keep_person: false,
        }),
      },
    );
    return result.status === 200 || result.status === 202;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'POST required' }, 405);

  try {
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) return response({ error: 'Authentication required' }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || body.confirmation !== 'DELETE') {
      return response({ error: 'Deletion confirmation is required' }, 400);
    }

    const service = createClient<any>(
      env('SUPABASE_URL'),
      env('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: identity, error: identityError } = await service.auth.getUser(token);
    if (identityError || !identity.user) return response({ error: 'Authentication required' }, 401);

    const userId = identity.user.id;
    const providers = Array.isArray(identity.user.app_metadata?.providers)
      ? identity.user.app_metadata.providers.filter((value): value is string => typeof value === 'string')
      : [];
    const appleIdentity = identity.user.identities?.find((value) => value.provider === 'apple');
    const usesApple = providers.includes('apple') || Boolean(appleIdentity);
    const appleSubject = typeof appleIdentity?.identity_data?.sub === 'string'
      ? appleIdentity.identity_data.sub
      : undefined;
    const appleAuthorizationCode = typeof body.appleAuthorizationCode === 'string'
      && body.appleAuthorizationCode.length <= 4_000
      ? body.appleAuthorizationCode
      : undefined;
    // Storage objects do not participate in public-schema cascades.
    await removeStoragePrefix(service, 'inspiration-imports', userId);

    const { error: cleanupError } = await service.rpc('prepare_account_deletion', {
      p_user_id: userId,
    });
    if (cleanupError) throw cleanupError;

    const appleRevoked = usesApple && appleAuthorizationCode
      ? await revokeAppleAuthorization(appleAuthorizationCode, appleSubject)
      : !usesApple;
    const posthogDeletionQueued = await queuePostHogDeletion(userId);

    const { error: deleteError } = await service.auth.admin.deleteUser(userId, false);
    if (deleteError) throw deleteError;

    return response({
      deleted: true,
      appleManualRevokeRequired: usesApple && !appleRevoked,
      posthogDeletionQueued,
    });
  } catch (error) {
    console.error('Account deletion failed', error instanceof Error ? error.name : 'UnknownError');
    return response({ error: 'Outing could not finish deleting the account. Please try again.' }, 500);
  }
});
