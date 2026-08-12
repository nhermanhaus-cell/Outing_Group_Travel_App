import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { posthog } from '../config/posthog';
import {
  createLegacyTripPlan,
  type ItineraryItem,
  type TripPlan,
  type TripPlanFeedback,
} from '@gayi/domain';
import { ThemeProvider } from '../theme/ThemeProvider';
import { supabase } from '../lib/supabase';
import { featureFlags } from '../lib/featureFlags';
import { loadAssistantInsights } from '../lib/assistant-api';
import {
  AnalyticsProvider,
  useAnalytics,
} from '../analytics/analytics-provider';
import type {
  ActivityPreferenceVote,
  AssistantProposal,
  Interest,
  LookingFor,
  PendingInvite,
  PreferredTransportMode,
  TripPlanningPreferences,
  TravelRange,
  UserTravelProfile,
} from '@gayi/shared';
import destinationsCatalog from '../../assets/seed/destinations.json';
import destinationsScoring from '../../assets/seed/destinations.scoring.json';
import { SavedDestinationsProvider } from './SavedDestinationsProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthActionResult {
  error?: string;
  cancelled?: boolean;
}

export interface AuthContext {
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string, returnTo?: string) => Promise<AuthActionResult>;
  signInWithApple: () => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
}

void WebBrowser.maybeCompleteAuthSession();

export interface LocalTrip {
  tripId: string;
  destinationSlug?: string;
  destinationCandidateId?: string;
  destinationName?: string;
  name: string;
  startDate?: string;
  endDate?: string;
  origin?: string;
  travelers: number;
  glamourLevel: string;
  budget?: number;
  createdAt: string;
  members?: TripMember[];
  savedPlaces?: string[];
  activityPace?: 'packed' | 'balanced' | 'downtime';
  lodgingStatus?: 'none' | 'booked';
  lodgingAddress?: string;
  lodgingLat?: number;
  lodgingLng?: number;
  memberPrefs?: Array<{
    memberId: string;
    displayName?: string;
    interests?: string[];
    nightlifeImportance?: number;
    activityPace?: 'packed' | 'balanced' | 'downtime';
    lookingFor?: string[];
  }>;
  comments?: TripComment[];
  polls?: TripPoll[];
  interests?: Interest[];
  nightlifeImportance?: number;
  lookingFor?: LookingFor[];
  planningPreferences?: TripPlanningPreferences;
  travelRanges?: TravelRange[];
  preferredTransportMode?: PreferredTransportMode;
  pendingInvites?: PendingInvite[];
  itineraryItems?: Array<Record<string, unknown>>;
  tripPlan?: TripPlan;
  itineraryFeedback?: TripPlanFeedback[];
  activityPreferences?: ActivityPreferenceVote[];
  /** V2 source of truth; legacy activityPreferences remains yes/no for old clients. */
  activityPreferencesV2?: ActivityPreferenceVote[];
  activityPreferenceSessionComplete?: boolean;
  tripPlanProposals?: import('@gayi/domain').TripPlanPreviewProposal[];
  /** Local-first draft that will be synced after authentication. */
  localOnly?: boolean;
}

export interface TripMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: 'owner' | 'organizer' | 'member';
}

export interface TripComment {
  id: string;
  userId: string;
  displayName: string;
  text: string;
  createdAt: string;
}

export interface TripPoll {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; votes: string[] }>;
  createdAt: string;
  assistantProposal?: AssistantProposal;
  planProposalId?: string;
  resolution?: 'accepted' | 'dismissed' | 'tie';
}

export interface TripsContext {
  trips: LocalTrip[];
  createTrip: (trip: Omit<LocalTrip, 'tripId' | 'createdAt'>) => Promise<LocalTrip>;
  updateTrip: (tripId: string, updates: Partial<LocalTrip>) => Promise<void>;
  castPollVote: (tripId: string, pollId: string, optionId: string) => Promise<TripPoll[]>;
  deleteTrip: (tripId: string) => Promise<void>;
  getTrip: (tripId: string) => LocalTrip | undefined;
}

export interface ProviderOverride {
  slot: string;
  pluginId: string;
  enabled: boolean;
}

export interface IntegrationsContext {
  overrides: ProviderOverride[];
  setOverride: (slot: string, pluginId: string, enabled: boolean) => void;
  clearOverride: (slot: string) => void;
}

export interface TravelProfileContext {
  profile: UserTravelProfile;
  loading: boolean;
  updateProfile: (updates: Partial<UserTravelProfile>) => Promise<void>;
}

// ─── Seed data re-exported ────────────────────────────────────────────────────

export type CatalogDestination = (typeof destinationsCatalog)[number];
export type ScoringDestination = (typeof destinationsScoring)[number];

export interface DestinationsContext {
  catalog: CatalogDestination[];
  scoring: ScoringDestination[];
  getBySlug: (slug: string) => CatalogDestination | undefined;
  getScoringBySlug: (slug: string) => ScoringDestination | undefined;
}

// ─── Context instances ────────────────────────────────────────────────────────

const AuthCtx = createContext<AuthContext | null>(null);
const TripsCtx = createContext<TripsContext | null>(null);
const DestinationsCtx = createContext<DestinationsContext | null>(null);
const IntegrationsCtx = createContext<IntegrationsContext | null>(null);
const TravelProfileCtx = createContext<TravelProfileContext | null>(null);

// ─── QueryClient ──────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof Error && error.message.includes('not configured')),
    },
  },
});

// ─── AsyncStorage shim (in-memory fallback when native module unavailable) ────

const memStore: Record<string, string> = {};

async function storeGet(key: string): Promise<string | null> {
  try {
    const { default: AS } = await import('@react-native-async-storage/async-storage');
    return AS.getItem(key);
  } catch {
    return memStore[key] ?? null;
  }
}

async function storeSet(key: string, value: string): Promise<void> {
  try {
    const { default: AS } = await import('@react-native-async-storage/async-storage');
    await AS.setItem(key, value);
  } catch {
    memStore[key] = value;
  }
}

async function storeRemove(key: string): Promise<void> {
  try {
    const { default: AS } = await import('@react-native-async-storage/async-storage');
    await AS.removeItem(key);
  } catch {
    delete memStore[key];
  }
}

// ─── Auth Provider ────────────────────────────────────────────────────────────

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { resetIdentity: resetAnalyticsIdentity } = useAnalytics();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUserIdRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      if (user) {
        posthog.identify(user.id, {
          $set: {
            ...(user.displayName ? { name: user.displayName } : {}),
            ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
          },
          $set_once: { first_seen_at: new Date().toISOString() },
        });
        prevUserIdRef.current = user.id;
      }
      return;
    }
    if (user && prevUserIdRef.current !== user.id) {
      posthog.identify(user.id, {
        $set: {
          ...(user.displayName ? { name: user.displayName } : {}),
          ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
        },
        $set_once: { first_seen_at: new Date().toISOString() },
      });
      posthog.capture('user_signed_in', {});
      prevUserIdRef.current = user.id;
    } else if (!user && prevUserIdRef.current !== null) {
      posthog.capture('user_signed_out', {});
      posthog.reset();
      prevUserIdRef.current = null;
    }
  }, [user, loading]);

  useEffect(() => {
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => {
        const authUser = data.session?.user;
        setUser(authUser ? userFromSupabase(authUser) : null);
        setLoading(false);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ? userFromSupabase(session.user) : null);
        setLoading(false);
      });
      return () => listener.subscription.unsubscribe();
    }
    storeGet('gayi:user').then((raw) => {
      if (raw) {
        try { setUser(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoading(false);
    });
  }, []);

  const signInWithMagicLink = useCallback(async (email: string, returnTo?: string) => {
    if (supabase) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: Linking.createURL('/auth/callback', { queryParams: returnTo ? { returnTo } : undefined }) },
      });
      return error ? { error: error.message } : {};
    }
    await storeSet('gayi:pending_magic_email', email);
    // Mock: immediately resolve as signed in
    const newUser: User = { id: `mock-${Date.now()}`, email, displayName: email.split('@')[0] };
    await storeSet('gayi:user', JSON.stringify(newUser));
    setUser(newUser);
    return {};
  }, []);

  const signInWithApple = useCallback(async () => {
    try {
      const AppleAuth = await import('expo-apple-authentication');
      const cred = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });
      const email = cred.email ?? `apple-${cred.user}@privaterelay.appleid.com`;
      const displayName = [cred.fullName?.givenName, cred.fullName?.familyName]
        .filter(Boolean)
        .join(' ') || undefined;
      if (supabase && cred.identityToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: cred.identityToken,
        });
        if (error) {
          const providerDisabled = error.message.includes('issuer https://appleid.apple.com')
            || error.message.toLowerCase().includes('provider is not enabled')
            || error.message.toLowerCase().includes('missing oauth secret');
          return { error: providerDisabled ? 'Apple sign-in is not enabled for this project yet. Your trip is still saved on this phone; use email sign-in to sync it.' : error.message };
        }
        if (data.user) {
          let signedInUser = userFromSupabase(data.user);
          if (displayName) {
            const { data: updated } = await supabase.auth.updateUser({
              data: {
                full_name: displayName,
                given_name: cred.fullName?.givenName,
                family_name: cred.fullName?.familyName,
              },
            });
            signedInUser = updated.user ? userFromSupabase(updated.user) : { ...signedInUser, displayName };
          }
          setUser(signedInUser);
        }
        return {};
      }
      if (supabase) return { error: 'Apple did not return a valid sign-in token. Your local trips are unaffected; use email sign-in to sync them.' };
      const newUser: User = { id: cred.user, email, ...(displayName ? { displayName } : {}) };
      await storeSet('gayi:user', JSON.stringify(newUser));
      setUser(newUser);
      return {};
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
      if (supabase) return { error: err instanceof Error ? err.message : 'Apple sign-in could not be completed. Your local trips are unaffected.' };
      // Offline fixture fallback for simulator-only development.
      const newUser: User = { id: 'apple-mock', email: 'apple@example.com', displayName: 'Apple User' };
      await storeSet('gayi:user', JSON.stringify(newUser));
      setUser(newUser);
      return {};
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) {
      const newUser: User = { id: 'google-mock', email: 'google@example.com', displayName: 'Google User' };
      await storeSet('gayi:user', JSON.stringify(newUser));
      setUser(newUser);
      return {};
    }

    try {
      const redirectTo = Linking.createURL('/auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        const providerDisabled = error.message.toLowerCase().includes('provider is not enabled')
          || error.message.toLowerCase().includes('unsupported provider')
          || error.message.toLowerCase().includes('missing oauth secret');
        return {
          error: providerDisabled
            ? 'Google sign-in is not enabled for this project yet. You can browse as a guest in the meantime.'
            : error.message,
        };
      }
      if (!data.url) return { error: 'Google sign-in could not be started.' };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return { cancelled: true };

      const { params, errorCode } = QueryParams.getQueryParams(result.url);
      if (errorCode) {
        return { error: params.error_description ?? params.error ?? errorCode };
      }

      const sessionResult = params.code
        ? await supabase.auth.exchangeCodeForSession(params.code)
        : params.access_token && params.refresh_token
          ? await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            })
          : { data: { user: null }, error: new Error('Google did not return a valid sign-in token.') };

      if (sessionResult.error) return { error: sessionResult.error.message };
      if (sessionResult.data.user) setUser(userFromSupabase(sessionResult.data.user));
      return {};
    } catch (err: unknown) {
      return {
        error: err instanceof Error
          ? err.message
          : 'Google sign-in could not be completed. Your local trips are unaffected.',
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    await resetAnalyticsIdentity();
    if (supabase) await supabase.auth.signOut();
    await storeRemove('gayi:user');
    setUser(null);
  }, [resetAnalyticsIdentity]);

  const value = useMemo(
    () => ({ user, loading, signInWithMagicLink, signInWithApple, signInWithGoogle, signOut }),
    [user, loading, signInWithMagicLink, signInWithApple, signInWithGoogle, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function userFromSupabase(value: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): User {
  const metadata = value.user_metadata ?? {};
  const displayName =
    typeof metadata['display_name'] === 'string'
      ? metadata['display_name']
      : typeof metadata['full_name'] === 'string'
        ? metadata['full_name']
        : undefined;
  const avatarUrl = typeof metadata['avatar_url'] === 'string' ? metadata['avatar_url'] : undefined;
  return {
    id: value.id,
    email: value.email ?? '',
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

// ─── Destinations Provider ────────────────────────────────────────────────────

function DestinationsProvider({ children }: { children: React.ReactNode }) {
  const remoteCatalog = useQuery({
    queryKey: ['destination-catalog', 'published'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('destinations')
        .select('payload')
        .eq('published', true)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const payload = row.payload && typeof row.payload === 'object'
          ? row.payload as Record<string, unknown>
          : null;
        if (!payload || typeof payload.slug !== 'string') return [];
        return [payload];
      });
    },
    enabled: Boolean(supabase),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const catalog = useMemo(() => {
    const bundled = (destinationsCatalog as CatalogDestination[]).filter((destination) =>
      featureFlags.catalogExpansionV1 || destination.publicationStatus === 'published');
    const remote = (remoteCatalog.data ?? []) as CatalogDestination[];
    const selected = featureFlags.catalogExpansionV1
      ? [...new Map([...bundled, ...remote].map((destination) => [destination.slug, destination])).values()]
      : remote.length ? remote : bundled;
    return selected.map((destination) => ({
      ...destination,
      interests: [...new Set(destination.interests ?? [])],
    }));
  }, [remoteCatalog.data]);
  const scoring = useMemo(() => {
    const remote = (remoteCatalog.data ?? []).flatMap((destination) => {
      const value = destination.scoring;
      return value && typeof value === 'object' ? [value as ScoringDestination] : [];
    });
    const bundled = (destinationsScoring as ScoringDestination[]).filter((destination) =>
      catalog.some((entry) => entry.slug === destination.slug));
    return featureFlags.catalogExpansionV1
      ? [...new Map([...bundled, ...remote].map((destination) => [destination.slug, destination])).values()]
      : remote.length ? remote : bundled;
  }, [catalog, remoteCatalog.data]);

  const getBySlug = useCallback(
    (slug: string) => catalog.find((d) => d.slug === slug),
    [catalog],
  );

  const getScoringBySlug = useCallback(
    (slug: string) => scoring.find((d) => d.slug === slug),
    [scoring],
  );

  const value = useMemo(
    () => ({ catalog, scoring, getBySlug, getScoringBySlug }),
    [catalog, scoring, getBySlug, getScoringBySlug],
  );

  return <DestinationsCtx.Provider value={value}>{children}</DestinationsCtx.Provider>;
}

// ─── Trips Provider ───────────────────────────────────────────────────────────

const TRIPS_KEY = 'gayi:trips';
const LOCAL_TRIP_MIGRATION_VERSION = 4;

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

const DEFAULT_TRAVEL_PROFILE: UserTravelProfile = {
  homeAirports: [],
  defaultInterests: [],
  preferredTravelRanges: ['short_flight', 'international'],
  preferredTransportMode: 'auto',
  updatedAt: new Date(0).toISOString(),
};

const PROFILE_KEY = 'gayi:travel-profile';

function TravelProfileProvider({ children }: { children: React.ReactNode }) {
  const auth = useContext(AuthCtx);
  const [profile, setProfile] = useState<UserTravelProfile>(DEFAULT_TRAVEL_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await storeGet(PROFILE_KEY);
      if (local) {
        try {
          if (!cancelled) setProfile({ ...DEFAULT_TRAVEL_PROFILE, ...JSON.parse(local) });
        } catch { /* ignore invalid legacy profile */ }
      }
      if (supabase && auth?.user) {
        const { data } = await supabase
          .from('user_preferences')
          .select('preferences')
          .eq('user_id', auth.user.id)
          .maybeSingle();
        const remote = data?.preferences;
        if (!cancelled && remote && typeof remote === 'object') {
          const next = { ...DEFAULT_TRAVEL_PROFILE, ...(remote as Partial<UserTravelProfile>) };
          setProfile(next);
          await storeSet(PROFILE_KEY, JSON.stringify(next));
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [auth?.user?.id]);

  const updateProfile = useCallback(async (updates: Partial<UserTravelProfile>) => {
    const next: UserTravelProfile = {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    setProfile(next);
    await storeSet(PROFILE_KEY, JSON.stringify(next));
    if (supabase && auth?.user) {
      await supabase.from('user_preferences').upsert({
        user_id: auth.user.id,
        preferences: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
  }, [auth?.user, profile]);

  const value = useMemo(() => ({ profile, loading, updateProfile }), [loading, profile, updateProfile]);
  return <TravelProfileCtx.Provider value={value}>{children}</TravelProfileCtx.Provider>;
}

type TripRow = {
  id: string;
  name: string;
  destination_slug?: string | null;
  destination_candidate_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  origin?: string | null;
  traveler_count?: number | null;
  glamour_level?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

function rowToLocalTrip(row: TripRow): LocalTrip {
  const payload = row.payload ?? {};
  return migrateLegacyTrip({
    ...(payload as Omit<LocalTrip, 'tripId' | 'name' | 'createdAt'>),
    tripId: row.id,
    name: row.name,
    destinationSlug: row.destination_slug ?? (payload.destinationSlug as string | undefined),
    destinationCandidateId: row.destination_candidate_id ?? (payload.destinationCandidateId as string | undefined),
    startDate: row.start_date?.slice(0, 10) ?? (payload.startDate as string | undefined),
    endDate: row.end_date?.slice(0, 10) ?? (payload.endDate as string | undefined),
    origin: row.origin ?? (payload.origin as string | undefined),
    travelers: row.traveler_count ?? (payload.travelers as number | undefined) ?? 1,
    glamourLevel: row.glamour_level ?? (payload.glamourLevel as string | undefined) ?? 'comfortably_fabulous',
    createdAt: row.created_at,
    localOnly: false,
  });
}

function migrateLegacyTrip(trip: LocalTrip): LocalTrip {
  const preferences = trip.activityPreferencesV2 ?? trip.activityPreferences;
  const normalized: LocalTrip = {
    ...trip,
    activityPreferences: preferences?.map((vote) => ({
      ...vote,
      choice: vote.choice === 'not_interested' ? 'not_for_this_trip' : vote.choice,
    })),
    activityPreferencesV2: preferences?.map((vote) => ({
      ...vote,
      choice: vote.choice === 'not_interested' ? 'not_for_this_trip' : vote.choice,
    })),
  };
  if (normalized.tripPlan || !normalized.itineraryItems?.length) return normalized;
  return {
    ...normalized,
    tripPlan: createLegacyTripPlan(
      normalized.destinationName ?? normalized.name,
      normalized.itineraryItems as unknown as ItineraryItem[],
      normalized.createdAt,
    ),
  };
}

function tripPayload(trip: Omit<LocalTrip, 'tripId' | 'createdAt'> | LocalTrip): Record<string, unknown> {
  const { name: _name, destinationSlug: _destinationSlug, destinationCandidateId: _destinationCandidateId, startDate: _startDate,
    endDate: _endDate, origin: _origin, travelers: _travelers,
    glamourLevel: _glamourLevel, localOnly: _localOnly,
    activityPreferences: preferences, activityPreferencesV2: preferencesV2,
    ...payload } = trip;
  const normalized = preferencesV2 ?? preferences;
  return {
    ...payload,
    ...(normalized ? {
      activityPreferencesV2: normalized,
      activityPreferences: normalized.map((vote) => ({
        ...vote,
        choice: vote.choice === 'not_for_this_trip' || vote.choice === 'not_interested'
          ? 'not_interested'
          : 'interested',
      })),
    } : {}),
  };
}

function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const auth = useContext(AuthCtx);
  const tripClient = featureFlags.supabaseCollaboration ? supabase : null;

  const loadRemoteTrips = useCallback(async () => {
    if (!tripClient || !auth?.user) return;
    const migrationKey = `gayi:trip-migration:${auth.user.id}`;
    const migrated = await storeGet(migrationKey);
    if (migrated !== String(LOCAL_TRIP_MIGRATION_VERSION)) {
      const localRaw = await storeGet(TRIPS_KEY);
      let localTrips: LocalTrip[] = [];
      try { localTrips = localRaw ? JSON.parse(localRaw) : []; } catch { /* ignore */ }
      for (const local of localTrips.filter((item) => item.localOnly || item.tripId.startsWith('trip-'))) {
        const canPreserveId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(local.tripId);
        const { data: row, error } = await tripClient.from('trips').insert({
          ...(canPreserveId ? { id: local.tripId } : {}),
          owner_id: auth.user.id,
          name: local.name,
          destination_slug: local.destinationSlug ?? null,
          destination_candidate_id: local.destinationCandidateId ?? null,
          start_date: local.startDate ?? null,
          end_date: local.endDate ?? null,
          origin: local.origin ?? null,
          traveler_count: local.travelers,
          glamour_level: local.glamourLevel,
          payload: { ...tripPayload(local), migratedFromLocalId: local.tripId, migrationVersion: LOCAL_TRIP_MIGRATION_VERSION },
        }).select('id').single();
        if (error || !row) continue;
        await tripClient.from('trip_members').insert({ trip_id: row.id, user_id: auth.user.id, role: 'owner' });
      }
      await storeSet(migrationKey, String(LOCAL_TRIP_MIGRATION_VERSION));
    }
    const { data, error } = await tripClient
      .from('trips')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (!error && data) {
      const tripIds = (data as TripRow[]).map((row) => row.id);
      const { data: memberRows } = tripIds.length
        ? await tripClient
          .from('trip_members')
          .select('trip_id,user_id,role')
          .in('trip_id', tripIds)
        : { data: [] };
      const remote = (data as TripRow[]).map((row) => {
        const trip = rowToLocalTrip(row);
        const syncedMembers = (memberRows ?? [])
          .filter((member) => member.trip_id === row.id)
          .map((member) => ({
            id: member.user_id,
            displayName: member.user_id === auth.user?.id
              ? auth.user?.displayName ?? 'You'
              : 'Trip member',
            role: member.role === 'viewer' ? 'member' : member.role as TripMember['role'],
          }));
        return {
          ...trip,
          members: syncedMembers.length > 0 ? syncedMembers : trip.members,
        };
      });
      setTrips(remote);
      await storeSet(TRIPS_KEY, JSON.stringify(remote));
    }
  }, [auth?.user]);

  useEffect(() => {
    storeGet(TRIPS_KEY).then((raw) => {
      if (raw) {
        try {
          const stored = (JSON.parse(raw) as LocalTrip[]).map(migrateLegacyTrip);
          setTrips(stored);
          void storeSet(TRIPS_KEY, JSON.stringify(stored));
        } catch { /* ignore */ }
      }
    });
  }, []);

  useEffect(() => {
    if (!tripClient || !auth?.user) return;
    const client = tripClient;
    void loadRemoteTrips();
    const channel = client
      .channel(`gayi-trips-${auth.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        void loadRemoteTrips();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_itinerary_items' }, () => {
        void loadRemoteTrips();
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [auth?.user?.id, loadRemoteTrips]);

  const persist = useCallback(async (updated: LocalTrip[]) => {
    setTrips(updated);
    await storeSet(TRIPS_KEY, JSON.stringify(updated));
  }, []);

  const patchLocalTrip = useCallback((tripId: string, updates: Partial<LocalTrip>) => {
    setTrips((currentTrips) => {
      const updated = currentTrips.map((trip) =>
        trip.tripId === tripId ? { ...trip, ...updates } : trip,
      );
      void storeSet(TRIPS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const createTrip = useCallback(
    async (data: Omit<LocalTrip, 'tripId' | 'createdAt'>) => {
      if (tripClient && auth?.user) {
        const { data: row, error } = await tripClient.from('trips').insert({
          owner_id: auth.user.id,
          name: data.name,
          destination_slug: data.destinationSlug ?? null,
          destination_candidate_id: data.destinationCandidateId ?? null,
          start_date: data.startDate ?? null,
          end_date: data.endDate ?? null,
          origin: data.origin ?? null,
          traveler_count: data.travelers,
          glamour_level: data.glamourLevel,
          payload: tripPayload(data),
        }).select('*').single();
        if (error) throw error;
        await tripClient.from('trip_members').insert({
          trip_id: row.id,
          user_id: auth.user.id,
          role: 'owner',
        });
        const trip = {
          ...rowToLocalTrip(row as TripRow),
          members: [{
            id: auth.user.id,
            displayName: auth.user.displayName ?? 'You',
            role: 'owner' as const,
          }],
        };
        await persist([trip, ...trips]);
        if (featureFlags.proactiveInsightsV1) {
          void loadAssistantInsights({ surface: 'trip', tripId: trip.tripId, trigger: 'trip_changed', force: true }).catch(() => undefined);
        }
        return trip;
      }
      const trip: LocalTrip = { ...data, tripId: generateId(), createdAt: new Date().toISOString(), localOnly: true };
      await persist([trip, ...trips]);
      return trip;
    },
    [auth?.user, trips, persist],
  );

  const updateTrip = useCallback(
    async (tripId: string, updates: Partial<LocalTrip>) => {
      const current = trips.find((trip) => trip.tripId === tripId);
      const next = current ? { ...current, ...updates } : null;
      if (tripClient && auth?.user && next) {
        const authenticatedUserId = auth.user.id;
        const collaborativeKeys = new Set([
          'comments',
          'polls',
          'savedPlaces',
          'itineraryItems',
          'memberPrefs',
          'tripPlan',
          'tripPlanProposals',
          'itineraryFeedback',
        ]);
        const patch = Object.fromEntries(Object.entries(updates).filter(([key]) => collaborativeKeys.has(key)));
        if (Object.keys(patch).length > 0) {
          const { error } = await tripClient.rpc('update_trip_collaboration_payload', { p_trip_id: tripId, p_patch: patch });
          if (error) throw error;
        }
        if (updates.activityPreferences !== undefined) {
          const ownVotes = updates.activityPreferences.filter(
            (vote) => vote.memberId === authenticatedUserId,
          );
          let { error } = await tripClient.rpc('update_trip_activity_preferences_v2', {
            p_trip_id: tripId,
            p_votes: ownVotes,
            p_completed: updates.activityPreferenceSessionComplete ?? false,
          });
          if (error?.code === 'PGRST202') {
            ({ error } = await tripClient.rpc('update_trip_activity_preferences', {
              p_trip_id: tripId,
              p_votes: ownVotes,
            }));
          }
          if (error) throw error;
        }
        if (updates.tripPlan) {
          const { error } = await tripClient.from('trip_plan_versions').upsert({
            trip_id: tripId,
            revision: updates.tripPlan.revision,
            plan_id: updates.tripPlan.planId,
            algorithm_version: updates.tripPlan.algorithmVersion,
            input_hash: updates.tripPlan.inputHash,
            plan: updates.tripPlan,
            created_by: authenticatedUserId,
            is_current: true,
          }, { onConflict: 'trip_id,revision' });
          if (error) throw error;
        }
        if (updates.tripPlanProposals !== undefined) {
          const currentIds = new Set((current?.tripPlanProposals ?? []).map((proposal) => proposal.proposalId));
          const added = updates.tripPlanProposals.filter((proposal) => !currentIds.has(proposal.proposalId));
          if (added.length) {
            const { error } = await tripClient.from('trip_plan_proposals').insert(added.map((proposal) => ({
              trip_id: tripId,
              created_by: authenticatedUserId,
              proposal_kind: 'day_rework',
              action: proposal.action,
              day_index: proposal.day,
              prior_plan_id: proposal.priorPlanId,
              prior_revision: proposal.priorRevision,
              preview_plan: proposal.preview,
              summary: proposal.summary,
              status: proposal.status,
            })));
            if (error) throw error;
          }
        }
        if (updates.itineraryFeedback !== undefined) {
          const ownFeedback = updates.itineraryFeedback.filter(
            (feedback) => feedback.memberId === authenticatedUserId,
          );
          const { error: deleteError } = await tripClient
            .from('trip_item_feedback')
            .delete()
            .eq('trip_id', tripId)
            .eq('user_id', authenticatedUserId);
          if (deleteError) throw deleteError;
          if (ownFeedback.length > 0) {
            const rows = ownFeedback.map((feedback) => ({
              trip_id: tripId,
              plan_id: updates.tripPlan?.planId ?? next.tripPlan?.planId ?? null,
              item_id: feedback.itemId,
              place_id: feedback.placeId,
              user_id: feedback.memberId,
              reaction: feedback.reaction,
              reason: feedback.reason ?? null,
              created_at: feedback.createdAt,
              updated_at: new Date().toISOString(),
            }));
            const { error } = await tripClient
              .from('trip_item_feedback')
              .upsert(rows, { onConflict: 'trip_id,item_id,user_id' });
            if (error) throw error;
          }
        }
        const rpcOnlyKeys = new Set([
          'activityPreferences',
          'activityPreferencesV2',
          'activityPreferenceSessionComplete',
        ]);
        const hasOrganizerUpdates = Object.keys(updates).some((key) =>
          !collaborativeKeys.has(key) && !rpcOnlyKeys.has(key),
        );
        if (hasOrganizerUpdates) {
          const { error } = await tripClient.from('trips').update({
            name: next.name,
            destination_slug: next.destinationSlug ?? null,
            destination_candidate_id: next.destinationCandidateId ?? null,
            start_date: next.startDate ?? null,
            end_date: next.endDate ?? null,
            origin: next.origin ?? null,
            traveler_count: next.travelers,
            glamour_level: next.glamourLevel,
            payload: tripPayload(next),
            updated_at: new Date().toISOString(),
          }).eq('id', tripId);
          if (error) throw error;
        }
      }
      patchLocalTrip(tripId, updates);
      if (auth?.user && featureFlags.proactiveInsightsV1) {
        void loadAssistantInsights({
          surface: 'trip',
          tripId,
          trigger: updates.itineraryFeedback !== undefined ? 'feedback_submitted' : 'trip_changed',
          force: true,
        }).catch(() => undefined);
      }
    },
    [auth?.user, patchLocalTrip, trips],
  );

  const castPollVote = useCallback(async (
    tripId: string,
    pollId: string,
    optionId: string,
  ): Promise<TripPoll[]> => {
    const trip = trips.find((item) => item.tripId === tripId);
    if (!trip || !auth?.user) return trip?.polls ?? [];

    let polls: TripPoll[];
    if (tripClient && !trip.localOnly) {
      const { data, error } = await tripClient.rpc('cast_trip_payload_poll_vote', {
        p_trip_id: tripId,
        p_poll_id: pollId,
        p_option_id: optionId,
      });
      if (error) throw error;
      polls = (data ?? []) as TripPoll[];
    } else {
      polls = (trip.polls ?? []).map((poll) => {
        if (poll.id !== pollId) return poll;
        const togglingOff = poll.options.some((option) =>
          option.id === optionId && option.votes.includes(auth.user!.id),
        );
        const options = poll.options.map((option) => ({
          ...option,
          votes: [
            ...option.votes.filter((memberId) => memberId !== auth.user!.id),
            ...(option.id === optionId && !togglingOff ? [auth.user!.id] : []),
          ],
        }));
        if (!poll.assistantProposal && !poll.planProposalId) {
          return { ...poll, options };
        }
        const memberCount = Math.max(1, trip.members?.length ?? 1);
        const majority = Math.floor(memberCount / 2) + 1;
        const accepts = options[0]?.votes.length ?? 0;
        const dismisses = options[1]?.votes.length ?? 0;
        const voterCount = new Set(options.flatMap((option) => option.votes)).size;
        const resolution = accepts >= majority
          ? 'accepted' as const
          : dismisses >= majority
            ? 'dismissed' as const
            : voterCount >= memberCount && accepts === dismisses
              ? 'tie' as const
              : undefined;
        const { resolution: _oldResolution, ...unresolved } = poll;
        return resolution ? { ...unresolved, options, resolution } : { ...unresolved, options };
      });
    }
    patchLocalTrip(tripId, { polls });
    return polls;
  }, [auth?.user, patchLocalTrip, trips]);

  const deleteTrip = useCallback(
    async (tripId: string) => {
      const target = trips.find((trip) => trip.tripId === tripId);
      if (!target) return;
      const isRemoteTrip = tripClient && auth?.user && !target.localOnly
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tripId);
      if (isRemoteTrip) {
        const { data, error } = await tripClient.rpc('soft_delete_trip', { p_trip_id: tripId });
        if (error) throw error;
        if (data !== true) throw new Error('This trip could not be deleted. It may already have been removed.');
      }
      await persist(trips.filter((t) => t.tripId !== tripId));
    },
    [auth?.user, trips, persist],
  );

  const getTrip = useCallback((tripId: string) => trips.find((t) => t.tripId === tripId), [trips]);

  const value = useMemo(
    () => ({ trips, createTrip, updateTrip, castPollVote, deleteTrip, getTrip }),
    [trips, createTrip, updateTrip, castPollVote, deleteTrip, getTrip],
  );

  return <TripsCtx.Provider value={value}>{children}</TripsCtx.Provider>;
}

// ─── Integrations Provider ────────────────────────────────────────────────────

function IntegrationsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<ProviderOverride[]>([]);

  const setOverride = useCallback((slot: string, pluginId: string, enabled: boolean) => {
    setOverrides((prev) => {
      const filtered = prev.filter((o) => o.slot !== slot);
      return [...filtered, { slot, pluginId, enabled }];
    });
  }, []);

  const clearOverride = useCallback((slot: string) => {
    setOverrides((prev) => prev.filter((o) => o.slot !== slot));
  }, []);

  const value = useMemo(
    () => ({ overrides, setOverride, clearOverride }),
    [overrides, setOverride, clearOverride],
  );

  return <IntegrationsCtx.Provider value={value}>{children}</IntegrationsCtx.Provider>;
}

// ─── Root AppProviders ────────────────────────────────────────────────────────

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AnalyticsProvider>
          <AuthProvider>
            <TravelProfileProvider>
              <DestinationsProvider>
                <SavedDestinationsProvider>
                  <TripsProvider>
                    <IntegrationsProvider>{children}</IntegrationsProvider>
                  </TripsProvider>
                </SavedDestinationsProvider>
              </DestinationsProvider>
            </TravelProfileProvider>
          </AuthProvider>
        </AnalyticsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AppProviders');
  return ctx;
}

export function useTrips(): TripsContext {
  const ctx = useContext(TripsCtx);
  if (!ctx) throw new Error('useTrips must be used within AppProviders');
  return ctx;
}

export function useDestinations(): DestinationsContext {
  const ctx = useContext(DestinationsCtx);
  if (!ctx) throw new Error('useDestinations must be used within AppProviders');
  return ctx;
}

export function useIntegrations(): IntegrationsContext {
  const ctx = useContext(IntegrationsCtx);
  if (!ctx) throw new Error('useIntegrations must be used within AppProviders');
  return ctx;
}

export function useTravelProfile(): TravelProfileContext {
  const ctx = useContext(TravelProfileCtx);
  if (!ctx) throw new Error('useTravelProfile must be used within AppProviders');
  return ctx;
}
