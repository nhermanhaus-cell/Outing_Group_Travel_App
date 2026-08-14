import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const appDomain = (Deno.env.get('APP_PUBLIC_URL') ?? 'https://gayi.expo.app').replace(/\/$/, '');

type InviteRequest =
  | { operation: 'create'; tripId: string }
  | { operation: 'preview'; token: string }
  | { operation: 'redeem'; token: string }
  | { operation: 'revoke'; inviteId: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);
  try {
    const body = await readJson(request) as unknown as InviteRequest;
    if (body.operation === 'preview') return await preview(body.token);
    const user = await authenticatedUser(request);
    if (!user) return errorResponse('Authentication required', 401);
    if (body.operation === 'redeem') return await redeem(request, body.token);
    if (body.operation === 'create') return await createInvite(user.id, body.tripId);
    if (body.operation === 'revoke') return await revokeInvite(user.id, body.inviteId);
    return errorResponse('Unknown operation', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Invite request failed', 400);
  }
});

async function authenticatedUser(request: Request): Promise<{ id: string } | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const value = await response.json();
  return typeof value?.id === 'string' ? { id: value.id } : null;
}

async function createInvite(userId: string, tripId: string) {
  const tripResponse = await serviceFetch(`trips?id=eq.${encodeURIComponent(tripId)}&owner_id=eq.${userId}&select=id`);
  const trips = await tripResponse.json();
  if (!Array.isArray(trips) || trips.length === 0) return errorResponse('Only the trip owner can invite people', 403);
  const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = encodeBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const response = await serviceFetch('trip_invites', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ trip_id: tripId, token_hash: tokenHash, created_by: userId, max_uses: 1 }),
  });
  if (!response.ok) throw new Error('Unable to create invite');
  const [invite] = await response.json();
  return json({ inviteId: invite.id, token, inviteUrl: `${appDomain}/invite?token=${encodeURIComponent(token)}` });
}

async function preview(token: string) {
  if (!token) return errorResponse('Missing token', 400);
  const hash = await sha256(token);
  const inviteResponse = await serviceFetch(`trip_invites?token_hash=eq.${hash}&revoked_at=is.null&select=trip_id,expires_at,max_uses,use_count`);
  const invites = await inviteResponse.json();
  const invite = Array.isArray(invites) ? invites[0] : null;
  if (!invite || (invite.expires_at && new Date(invite.expires_at) <= new Date()) || (invite.max_uses && invite.use_count >= invite.max_uses)) return errorResponse('Invite is invalid or expired', 404);
  const tripResponse = await serviceFetch(`trips?id=eq.${invite.trip_id}&select=id,name,destination_slug,start_date,end_date,traveler_count,payload`);
  const [trip] = await tripResponse.json();
  if (!trip) return errorResponse('Trip not found', 404);
  return json({ trip: { tripId: trip.id, name: trip.name, destinationSlug: trip.destination_slug, destinationName: trip.payload?.destinationName, startDate: trip.start_date, endDate: trip.end_date, travelers: trip.traveler_count } });
}

async function redeem(request: Request, token: string) {
  const authorization = request.headers.get('Authorization') ?? '';
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/redeem_trip_invite`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  if (!response.ok) return errorResponse('Invite is invalid, expired, or already used', 400);
  return json({ tripId: await response.json() });
}

async function revokeInvite(userId: string, inviteId: string) {
  const inviteResponse = await serviceFetch(`trip_invites?id=eq.${encodeURIComponent(inviteId)}&select=id,trip_id`);
  const [invite] = await inviteResponse.json();
  if (!invite) return errorResponse('Invite not found', 404);
  const tripResponse = await serviceFetch(`trips?id=eq.${invite.trip_id}&owner_id=eq.${userId}&select=id`);
  const trips = await tripResponse.json();
  if (!Array.isArray(trips) || trips.length === 0) return errorResponse('Only the trip owner can revoke invites', 403);
  const response = await serviceFetch(`trip_invites?id=eq.${encodeURIComponent(inviteId)}`, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error('Unable to revoke invite');
  return json({ revoked: true });
}

function serviceFetch(path: string, init: RequestInit = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
