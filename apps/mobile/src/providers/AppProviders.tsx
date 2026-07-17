import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../theme/ThemeProvider';
import destinationsCatalog from '../../assets/seed/destinations.json';
import destinationsScoring from '../../assets/seed/destinations.scoring.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthContext {
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signInWithApple: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export interface LocalTrip {
  tripId: string;
  destinationSlug?: string;
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
  comments?: TripComment[];
  polls?: TripPoll[];
}

export interface TripMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: 'owner' | 'member';
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
}

export interface TripsContext {
  trips: LocalTrip[];
  createTrip: (trip: Omit<LocalTrip, 'tripId' | 'createdAt'>) => Promise<LocalTrip>;
  updateTrip: (tripId: string, updates: Partial<LocalTrip>) => Promise<void>;
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

// ─── QueryClient ──────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1 } },
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storeGet('gayi:user').then((raw) => {
      if (raw) {
        try { setUser(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoading(false);
    });
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
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
      const newUser: User = { id: cred.user, email, displayName };
      await storeSet('gayi:user', JSON.stringify(newUser));
      setUser(newUser);
      return {};
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return {};
      // Fallback mock for simulator
      const newUser: User = { id: 'apple-mock', email: 'apple@example.com', displayName: 'Apple User' };
      await storeSet('gayi:user', JSON.stringify(newUser));
      setUser(newUser);
      return {};
    }
  }, []);

  const signOut = useCallback(async () => {
    await storeRemove('gayi:user');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signInWithMagicLink, signInWithApple, signOut }),
    [user, loading, signInWithMagicLink, signInWithApple, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ─── Destinations Provider ────────────────────────────────────────────────────

function DestinationsProvider({ children }: { children: React.ReactNode }) {
  const catalog = destinationsCatalog as CatalogDestination[];
  const scoring = destinationsScoring as ScoringDestination[];

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

function generateId() {
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<LocalTrip[]>([]);

  useEffect(() => {
    storeGet(TRIPS_KEY).then((raw) => {
      if (raw) {
        try { setTrips(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, []);

  const persist = useCallback(async (updated: LocalTrip[]) => {
    setTrips(updated);
    await storeSet(TRIPS_KEY, JSON.stringify(updated));
  }, []);

  const createTrip = useCallback(
    async (data: Omit<LocalTrip, 'tripId' | 'createdAt'>) => {
      const trip: LocalTrip = { ...data, tripId: generateId(), createdAt: new Date().toISOString() };
      await persist([trip, ...trips]);
      return trip;
    },
    [trips, persist],
  );

  const updateTrip = useCallback(
    async (tripId: string, updates: Partial<LocalTrip>) => {
      await persist(trips.map((t) => (t.tripId === tripId ? { ...t, ...updates } : t)));
    },
    [trips, persist],
  );

  const deleteTrip = useCallback(
    async (tripId: string) => {
      await persist(trips.filter((t) => t.tripId !== tripId));
    },
    [trips, persist],
  );

  const getTrip = useCallback((tripId: string) => trips.find((t) => t.tripId === tripId), [trips]);

  const value = useMemo(
    () => ({ trips, createTrip, updateTrip, deleteTrip, getTrip }),
    [trips, createTrip, updateTrip, deleteTrip, getTrip],
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
        <AuthProvider>
          <DestinationsProvider>
            <TripsProvider>
              <IntegrationsProvider>{children}</IntegrationsProvider>
            </TripsProvider>
          </DestinationsProvider>
        </AuthProvider>
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
