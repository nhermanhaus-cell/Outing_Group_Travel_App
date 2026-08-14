import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  destinationDiscoveryResponseSchema,
  destinationCandidateSchema,
  type DestinationCandidate,
  type DestinationDiscoveryRequest,
  type DestinationIdentity,
} from '@gayi/shared';
import { supabase } from './supabase';

const INSTALLATION_ID_KEY = 'outing:destination-discovery-installation:v1';
const CANDIDATE_CACHE_PREFIX = 'outing:generated-destination:v1:';

export class DestinationDiscoveryError extends Error {
  constructor(message: string, readonly code = 'DESTINATION_DISCOVERY_FAILED') {
    super(message);
    this.name = 'DestinationDiscoveryError';
  }
}

async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = `outing-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

async function invoke(request: DestinationDiscoveryRequest) {
  if (!supabase) throw new DestinationDiscoveryError('Outing is not connected.', 'NOT_CONFIGURED');
  const { data, error } = await supabase.functions.invoke('destination-discovery', { body: request });
  if (error) {
    let serverMessage: string | undefined;
    let serverCode: string | undefined;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.clone === 'function') {
      try {
        const payload = await context.clone().json() as { error?: unknown; code?: unknown };
        serverMessage = typeof payload.error === 'string' ? payload.error : undefined;
        serverCode = typeof payload.code === 'string' ? payload.code : undefined;
      } catch {
        // A provider or gateway may return plain text. Keep the user-facing
        // fallback below rather than exposing transport implementation copy.
      }
    }
    const technicalMessage = serverMessage ?? error.message;
    const publicMessage = /authentication required/i.test(technicalMessage)
      ? 'Sign in to generate and save this destination guide.'
      : /too many destination searches/i.test(technicalMessage)
        ? 'You’ve searched for several new places. Try again in a minute.'
        : 'Outing couldn’t verify that city right now. Check your connection and try again.';
    throw new DestinationDiscoveryError(publicMessage, serverCode ?? 'DESTINATION_DISCOVERY_UNAVAILABLE');
  }
  if (data && typeof data === 'object' && typeof data.error === 'string') {
    throw new DestinationDiscoveryError(data.error, typeof data.code === 'string' ? data.code : undefined);
  }
  const parsed = destinationDiscoveryResponseSchema.safeParse(data);
  if (!parsed.success) throw new DestinationDiscoveryError('Outing received an invalid destination response.', 'INVALID_RESPONSE');
  return parsed.data;
}

export async function lookupUnknownDestinations(query: string): Promise<DestinationIdentity[]> {
  const response = await invoke({ action: 'lookup', query, installationId: await installationId() });
  return response.matches ?? [];
}

export async function claimUnknownDestination(canonicalPlaceId: string, originalQuery: string): Promise<DestinationCandidate> {
  const response = await invoke({ action: 'claim', canonicalPlaceId, originalQuery });
  if (!response.candidate) throw new DestinationDiscoveryError('Outing could not create this destination.');
  await AsyncStorage.setItem(`${CANDIDATE_CACHE_PREFIX}${response.candidate.id}`, JSON.stringify(response.candidate));
  return response.candidate;
}

export async function loadGeneratedDestination(candidateId: string): Promise<DestinationCandidate> {
  try {
    const response = await invoke({ action: 'get', candidateId });
    if (!response.candidate) throw new DestinationDiscoveryError('This destination is unavailable.');
    await AsyncStorage.setItem(`${CANDIDATE_CACHE_PREFIX}${candidateId}`, JSON.stringify(response.candidate));
    return response.candidate;
  } catch (error) {
    const cached = await AsyncStorage.getItem(`${CANDIDATE_CACHE_PREFIX}${candidateId}`);
    let cachedValue: unknown = null;
    try { cachedValue = cached ? JSON.parse(cached) : null; } catch { /* Ignore a damaged local snapshot. */ }
    const parsed = destinationCandidateSchema.safeParse(cachedValue);
    if (parsed.success) return parsed.data;
    throw error;
  }
}

export async function generateDestination(candidateId: string, refresh = false): Promise<DestinationCandidate> {
  const response = await invoke({ action: refresh ? 'refresh' : 'generate', candidateId });
  if (!response.candidate) throw new DestinationDiscoveryError('Outing could not finish this destination.');
  await AsyncStorage.setItem(`${CANDIDATE_CACHE_PREFIX}${candidateId}`, JSON.stringify(response.candidate));
  return response.candidate;
}
