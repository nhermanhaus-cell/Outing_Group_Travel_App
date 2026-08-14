import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as ExpoLinking from 'expo-linking';
import { usePathname } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
  View,
} from 'react-native';
import {
  ANALYTICS_EVENTS,
  ANALYTICS_SCHEMA_VERSION,
  AnalyticsEventEnvelopeSchema,
  applyPreferenceObservation,
  normalizeAnalyticsRoute,
  sanitizeAnalyticsProperties,
  type AnalyticsEventEnvelope,
  type AnalyticsEventName,
  type AnalyticsEventPropertyMap,
  type AnalyticsPolicy,
  type PreferenceAggregate,
  type PreferenceObservation,
} from '@gayi/shared';
import {
  analyticsNoop,
  analyticsSupabase,
  type AnalyticsRes,
  type PluginHandle,
  type AnalyticsReq,
} from '@gayi/providers';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const QUEUE_KEY = 'outing:analytics:queue:v1';
const SUBJECT_KEY = 'outing:analytics:subject:v1';
const PREFERENCES_KEY = 'outing:preference-signals:v1';
const PERSONALIZATION_ENABLED_KEY = 'outing:personalization-enabled:v1';
const MAX_QUEUE_SIZE = 500;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FLUSH_INTERVAL_MS = 15_000;
const IDLE_AFTER_MS = 2 * 60 * 1000;

const DEFAULT_POLICY: AnalyticsPolicy = {
  semanticAnalyticsEnabled: true,
  personalizationEnabled: true,
  sessionReplayEnabled: false,
  sessionReplaySampleRate: 0.1,
  policyVersion: 'v1-global-default-on',
};

type Track = <N extends AnalyticsEventName>(
  eventName: N,
  properties: AnalyticsEventPropertyMap[N],
) => void;

interface AnalyticsContextValue {
  track: Track;
  flush: () => Promise<void>;
  recordActivity: () => void;
  observePreference: (observation: PreferenceObservation) => void;
  setPersonalizationEnabled: (enabled: boolean) => Promise<void>;
  clearPreferenceSignals: () => Promise<void>;
  resetIdentity: () => Promise<void>;
  startNewSession: () => void;
  setCurrentScreen: (screenName?: string) => void;
  policy: AnalyticsPolicy;
  preferenceSignals: PreferenceAggregate[];
  initialized: boolean;
  queueDepth: number;
}

const AnalyticsCtx = createContext<AnalyticsContextValue | null>(null);

function currentPlatform(): AnalyticsEventEnvelope['platform'] {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return 'unknown';
}

function validQueuedEvents(value: unknown): AnalyticsEventEnvelope[] {
  if (!Array.isArray(value)) return [];
  const cutoff = Date.now() - MAX_EVENT_AGE_MS;
  return value.flatMap((item) => {
    const parsed = AnalyticsEventEnvelopeSchema.safeParse(item);
    if (!parsed.success || new Date(parsed.data.occurredAt).getTime() < cutoff) return [];
    return [parsed.data as AnalyticsEventEnvelope];
  }).slice(-MAX_QUEUE_SIZE);
}

function safeParseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function preferenceKey(value: Pick<PreferenceAggregate, 'subjectType' | 'subjectKey'>): string {
  return `${value.subjectType}:${value.subjectKey}`;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [queueDepth, setQueueDepth] = useState(0);
  const [policy, setPolicy] = useState<AnalyticsPolicy>(DEFAULT_POLICY);
  const [preferenceSignals, setPreferenceSignals] = useState<PreferenceAggregate[]>([]);
  const initializedRef = useRef(false);
  const policyRef = useRef(DEFAULT_POLICY);
  const queueRef = useRef<AnalyticsEventEnvelope[]>([]);
  const subjectIdRef = useRef('');
  const sessionIdRef = useRef(Crypto.randomUUID());
  const screenNameRef = useRef<string | undefined>(undefined);
  const flushingRef = useRef(false);
  const retryAtRef = useRef(0);
  const retryCountRef = useRef(0);
  const preferencesRef = useRef<Record<string, PreferenceAggregate>>({});
  const personalizationOverrideRef = useRef<boolean | null>(null);
  const transportRef = useRef<PluginHandle<AnalyticsReq, AnalyticsRes>>(
    (isSupabaseConfigured ? analyticsSupabase : analyticsNoop).create(),
  );

  const persistQueue = useCallback(async () => {
    setQueueDepth(queueRef.current.length);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queueRef.current));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(QUEUE_KEY),
      AsyncStorage.getItem(SUBJECT_KEY),
      AsyncStorage.getItem(PREFERENCES_KEY),
      AsyncStorage.getItem(PERSONALIZATION_ENABLED_KEY),
    ]).then(async ([storedQueue, storedSubject, storedPreferences, storedPersonalization]) => {
      if (cancelled) return;
      queueRef.current = validQueuedEvents(safeParseJson(storedQueue));
      subjectIdRef.current = storedSubject || Crypto.randomUUID();
      if (!storedSubject) await AsyncStorage.setItem(SUBJECT_KEY, subjectIdRef.current);
      const preferenceValue = safeParseJson(storedPreferences);
      preferencesRef.current =
        preferenceValue && typeof preferenceValue === 'object' && !Array.isArray(preferenceValue)
          ? preferenceValue as Record<string, PreferenceAggregate>
          : {};
      if (storedPersonalization === 'true' || storedPersonalization === 'false') {
        personalizationOverrideRef.current = storedPersonalization === 'true';
        const nextPolicy = { ...policyRef.current, personalizationEnabled: personalizationOverrideRef.current };
        policyRef.current = nextPolicy;
        setPolicy(nextPolicy);
      }
      setPreferenceSignals(Object.values(preferencesRef.current));
      setQueueDepth(queueRef.current.length);
      initializedRef.current = true;
      setInitialized(true);
    }).catch(async () => {
      if (cancelled) return;
      subjectIdRef.current = Crypto.randomUUID();
      queueRef.current = [];
      preferencesRef.current = {};
      await AsyncStorage.setItem(SUBJECT_KEY, subjectIdRef.current).catch(() => undefined);
      initializedRef.current = true;
      setInitialized(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = useCallback(async () => {
    if (
      !initializedRef.current ||
      flushingRef.current ||
      queueRef.current.length === 0 ||
      Date.now() < retryAtRef.current
    ) {
      return;
    }
    if (!policyRef.current.semanticAnalyticsEnabled) {
      queueRef.current = [];
      await persistQueue();
      return;
    }

    flushingRef.current = true;
    const batch = queueRef.current.slice(0, 25);
    try {
      const accessToken = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;
      const response = await transportRef.current.call({
        events: batch,
        ...(accessToken ? { authorization: accessToken } : {}),
      });
      const completed = new Set([
        ...response.acceptedEventIds,
        ...response.rejected.flatMap((item) => item.eventId ? [item.eventId] : []),
      ]);
      queueRef.current = queueRef.current.filter((event) => !completed.has(event.eventId));
      if (response.policy) {
        const nextPolicy = personalizationOverrideRef.current === null
          ? response.policy
          : { ...response.policy, personalizationEnabled: personalizationOverrideRef.current };
        policyRef.current = nextPolicy;
        setPolicy(nextPolicy);
      }
      retryCountRef.current = 0;
      retryAtRef.current = 0;
      await persistQueue();
    } catch {
      retryCountRef.current += 1;
      retryAtRef.current =
        Date.now() + Math.min(5 * 60_000, 5_000 * (2 ** (retryCountRef.current - 1)));
    } finally {
      flushingRef.current = false;
    }
  }, [persistQueue]);

  useEffect(() => {
    if (!initialized) return;
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    void flush();
    return () => clearInterval(timer);
  }, [flush, initialized]);

  const track = useCallback<Track>((eventName, properties) => {
    if (
      !initializedRef.current ||
      !policyRef.current.semanticAnalyticsEnabled ||
      !subjectIdRef.current
    ) return;
    const sanitized = sanitizeAnalyticsProperties(
      eventName,
      properties as Record<string, unknown>,
    );
    const event: AnalyticsEventEnvelope = {
      eventId: Crypto.randomUUID(),
      eventName,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      subjectId: subjectIdRef.current,
      sessionId: sessionIdRef.current,
      ...(screenNameRef.current ? { screenName: screenNameRef.current } : {}),
      platform: currentPlatform(),
      ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
      properties: sanitized,
    };
    const parsed = AnalyticsEventEnvelopeSchema.safeParse(event);
    if (!parsed.success) return;
    queueRef.current = [...queueRef.current, event].slice(-MAX_QUEUE_SIZE);
    void persistQueue();
  }, [persistQueue]);

  const syncPreference = useCallback(async (aggregate: PreferenceAggregate) => {
    if (!supabase || !policyRef.current.personalizationEnabled) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('user_preference_signals').upsert({
      user_id: userId,
      subject_type: aggregate.subjectType,
      subject_key: aggregate.subjectKey,
      score: aggregate.score,
      evidence_weight: aggregate.evidenceWeight,
      confidence: aggregate.confidence,
      last_source: aggregate.lastSource,
      last_observed_at: aggregate.lastObservedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,subject_type,subject_key' });
  }, []);

  useEffect(() => {
    if (!initialized || !supabase) return;
    const client = supabase;
    const hydrate = async (userId?: string) => {
      if (!userId || !policyRef.current.personalizationEnabled) return;
      const { data } = await client
        .from('user_preference_signals')
        .select('subject_type,subject_key,score,evidence_weight,confidence,last_source,last_observed_at')
        .eq('user_id', userId);
      const remote = (data ?? []).flatMap((row) => {
        if (
          typeof row.subject_type !== 'string' ||
          typeof row.subject_key !== 'string' ||
          typeof row.last_source !== 'string' ||
          typeof row.last_observed_at !== 'string'
        ) return [];
        return [{
          subjectType: row.subject_type,
          subjectKey: row.subject_key,
          score: Number(row.score),
          evidenceWeight: Number(row.evidence_weight),
          confidence: Number(row.confidence),
          lastObservedAt: row.last_observed_at,
          lastSource: row.last_source,
        } as PreferenceAggregate];
      });
      for (const aggregate of remote) {
        const key = preferenceKey(aggregate);
        const local = preferencesRef.current[key];
        if (!local || new Date(aggregate.lastObservedAt) > new Date(local.lastObservedAt)) {
          preferencesRef.current[key] = aggregate;
        }
      }
      setPreferenceSignals(Object.values(preferencesRef.current));
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferencesRef.current));
      await Promise.all(Object.values(preferencesRef.current).map(syncPreference));
    };
    void client.auth.getSession().then(({ data }) => hydrate(data.session?.user.id));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      void hydrate(session?.user.id);
    });
    return () => listener.subscription.unsubscribe();
  }, [initialized, syncPreference]);

  const observePreference = useCallback((observation: PreferenceObservation) => {
    if (!policyRef.current.personalizationEnabled) return;
    const key = preferenceKey(observation);
    const next = applyPreferenceObservation(preferencesRef.current[key], observation);
    preferencesRef.current = { ...preferencesRef.current, [key]: next };
    setPreferenceSignals(Object.values(preferencesRef.current));
    void AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferencesRef.current));
    void syncPreference(next);
  }, [syncPreference]);

  const setPersonalizationEnabled = useCallback(async (enabled: boolean) => {
    personalizationOverrideRef.current = enabled;
    const nextPolicy = { ...policyRef.current, personalizationEnabled: enabled };
    policyRef.current = nextPolicy;
    setPolicy(nextPolicy);
    await AsyncStorage.setItem(PERSONALIZATION_ENABLED_KEY, String(enabled));
  }, []);

  const clearPreferenceSignals = useCallback(async () => {
    preferencesRef.current = {};
    setPreferenceSignals([]);
    await AsyncStorage.removeItem(PREFERENCES_KEY);
  }, []);

  const resetIdentity = useCallback(async () => {
    await flush();
    queueRef.current = [];
    setQueueDepth(0);
    subjectIdRef.current = Crypto.randomUUID();
    sessionIdRef.current = Crypto.randomUUID();
    preferencesRef.current = {};
    setPreferenceSignals([]);
    await Promise.all([
      AsyncStorage.setItem(SUBJECT_KEY, subjectIdRef.current),
      AsyncStorage.removeItem(QUEUE_KEY),
      AsyncStorage.removeItem(PREFERENCES_KEY),
    ]);
  }, [flush]);

  const startNewSession = useCallback(() => {
    sessionIdRef.current = Crypto.randomUUID();
  }, []);

  const setCurrentScreen = useCallback((screenName?: string) => {
    screenNameRef.current = screenName;
  }, []);

  const recordActivity = useCallback(() => {
    activityBridge.current?.();
  }, []);

  const value = useMemo<AnalyticsContextValue>(() => ({
    track,
    flush,
    recordActivity,
    observePreference,
    setPersonalizationEnabled,
    clearPreferenceSignals,
    resetIdentity,
    startNewSession,
    setCurrentScreen,
    policy,
    preferenceSignals,
    initialized,
    queueDepth,
  }), [
    track,
    flush,
    recordActivity,
    observePreference,
    setPersonalizationEnabled,
    clearPreferenceSignals,
    resetIdentity,
    startNewSession,
    setCurrentScreen,
    policy,
    preferenceSignals,
    initialized,
    queueDepth,
  ]);

  return (
    <AnalyticsCtx.Provider value={value}>
      {initialized ? children : null}
    </AnalyticsCtx.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsCtx);
  if (!context) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return context;
}

interface RouteClock {
  screenName: string;
  startedAt: number;
  lastTickAt: number;
  lastActivityAt: number;
  activeDurationMs: number;
  idleDurationMs: number;
}

function accrueClock(clock: RouteClock, now: number): void {
  const intervalStart = clock.lastTickAt;
  if (now <= intervalStart) return;
  const idleBoundary = clock.lastActivityAt + IDLE_AFTER_MS;
  const activeEnd = Math.min(now, Math.max(intervalStart, idleBoundary));
  clock.activeDurationMs += Math.max(0, activeEnd - intervalStart);
  clock.idleDurationMs += Math.max(0, now - Math.max(intervalStart, idleBoundary));
  clock.lastTickAt = now;
}

export function AnalyticsRouteObserver() {
  const pathname = usePathname();
  const {
    track,
    flush,
    startNewSession,
    setCurrentScreen,
    initialized,
  } = useAnalytics();
  const clockRef = useRef<RouteClock | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const priorPathRef = useRef<string | undefined>(undefined);
  const backgroundedAtRef = useRef<number | null>(null);

  const finishScreen = useCallback((nextScreen: string | undefined, exitReason: string) => {
    const clock = clockRef.current;
    if (!clock) return;
    accrueClock(clock, Date.now());
    track(ANALYTICS_EVENTS.SCREEN_VIEW_ENDED, {
      screenName: clock.screenName,
      ...(nextScreen ? { nextScreen } : {}),
      activeDurationMs: Math.round(clock.activeDurationMs),
      idleDurationMs: Math.round(clock.idleDurationMs),
      exitReason,
    });
    clockRef.current = null;
    setCurrentScreen(undefined);
  }, [setCurrentScreen, track]);

  const startScreen = useCallback((screenName: string, previousScreen?: string) => {
    const now = Date.now();
    clockRef.current = {
      screenName,
      startedAt: now,
      lastTickAt: now,
      lastActivityAt: now,
      activeDurationMs: 0,
      idleDurationMs: 0,
    };
    setCurrentScreen(screenName);
    track(ANALYTICS_EVENTS.SCREEN_VIEW_STARTED, {
      screenName,
      ...(previousScreen ? { previousScreen } : {}),
    });
  }, [setCurrentScreen, track]);

  useEffect(() => {
    if (!initialized) return;
    const normalized = normalizeAnalyticsRoute(pathname);
    const previous = priorPathRef.current;
    if (previous === normalized && clockRef.current) return;
    finishScreen(normalized, 'navigation');
    startScreen(normalized, previous);
    priorPathRef.current = normalized;
  }, [initialized, finishScreen, pathname, startScreen]);

  useEffect(() => {
    if (!initialized) return;
    track(ANALYTICS_EVENTS.APP_SESSION_STARTED, { launchType: 'app_mount' });
    return () => {
      finishScreen(undefined, 'unmount');
      track(ANALYTICS_EVENTS.APP_SESSION_ENDED, { exitReason: 'unmount' });
      void flush();
    };
  }, [initialized, finishScreen, flush, track]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (previousState === 'active' && nextState !== 'active') {
        finishScreen(undefined, 'background');
        backgroundedAtRef.current = Date.now();
        track(ANALYTICS_EVENTS.APP_SESSION_ENDED, { exitReason: 'background' });
        void flush();
      } else if (previousState !== 'active' && nextState === 'active') {
        const inactiveMs = Date.now() - (backgroundedAtRef.current ?? Date.now());
        if (inactiveMs >= 30 * 60_000) startNewSession();
        track(ANALYTICS_EVENTS.APP_SESSION_STARTED, { launchType: 'foreground' });
        startScreen(normalizeAnalyticsRoute(pathname), priorPathRef.current);
      }
    });
    return () => listener.remove();
  }, [finishScreen, flush, pathname, startNewSession, startScreen, track]);

  useEffect(() => {
    const captureUrl = (url: string | null) => {
      if (!url) return;
      try {
        const parsed = ExpoLinking.parse(url);
        track(ANALYTICS_EVENTS.DEEP_LINK_OPENED, {
          route: normalizeAnalyticsRoute(`/${parsed.path ?? ''}`),
        });
      } catch {
        // Ignore malformed external URLs rather than retaining their raw value.
      }
    };
    void Linking.getInitialURL().then(captureUrl);
    const listener = Linking.addEventListener('url', ({ url }) => captureUrl(url));
    return () => listener.remove();
  }, [track]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (appStateRef.current === 'active' && clockRef.current) {
        accrueClock(clockRef.current, Date.now());
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    activityBridge.current = () => {
      const clock = clockRef.current;
      if (!clock || appStateRef.current !== 'active') return;
      const now = Date.now();
      accrueClock(clock, now);
      clock.lastActivityAt = now;
    };
    return () => {
      activityBridge.current = null;
    };
  }, []);

  return null;
}

const activityBridge: { current: (() => void) | null } = { current: null };

export function AnalyticsBoundary({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={() => activityBridge.current?.()}
      onTouchMove={() => activityBridge.current?.()}
    >
      {children}
    </View>
  );
}
