import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { ANALYTICS_EVENTS, bucketCount, type DestinationIdentity } from '@gayi/shared';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/providers/AppProviders';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import {
  claimUnknownDestination,
  lookupUnknownDestinations,
} from '../../src/lib/destination-discovery-api';

type Props = {
  query: string;
  enabled: boolean;
  returnPath: '/discover' | '/trips/new';
};

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function UnknownDestinationResults({ query, enabled, returnPath }: Props) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { track } = useAnalytics();
  const network = useNetInfo();
  const params = useLocalSearchParams<{ resumePlaceId?: string; resumeQuery?: string }>();
  const normalized = useDebouncedValue(query.trim(), 450);
  const online = network.isConnected !== false;
  const trackedResultKey = useRef('');

  const matches = useQuery({
    queryKey: ['destination-discovery', 'lookup', normalized.toLowerCase()],
    queryFn: () => lookupUnknownDestinations(normalized),
    enabled: enabled && online && normalized.length >= 2,
    staleTime: 15 * 60_000,
    retry: 1,
  });

  const claim = useMutation({
    mutationFn: ({ placeId, originalQuery }: { placeId: string; originalQuery: string }) =>
      claimUnknownDestination(placeId, originalQuery),
    onMutate: () => track(ANALYTICS_EVENTS.DESTINATION_GENERATION_LIFECYCLE, { status: 'requested', entryPoint: returnPath === '/discover' ? 'discover' : 'trip_creation' }),
    onSuccess: (candidate) => router.push(`/destinations/provisional/${candidate.id}`),
    onError: () => track(ANALYTICS_EVENTS.DESTINATION_GENERATION_LIFECYCLE, { status: 'claim_failed', entryPoint: returnPath === '/discover' ? 'discover' : 'trip_creation', errorCategory: 'request_failed' }),
  });

  useEffect(() => {
    if (!matches.data) return;
    const key = `${normalized.toLowerCase()}:${matches.data.length}`;
    if (trackedResultKey.current === key) return;
    trackedResultKey.current = key;
    track(ANALYTICS_EVENTS.DESTINATION_GENERATION_LIFECYCLE, {
      status: 'external_results_shown',
      entryPoint: returnPath === '/discover' ? 'discover' : 'trip_creation',
      resultCountBucket: bucketCount(matches.data.length),
    });
  }, [matches.data, normalized, returnPath, track]);

  const resumeKey = useMemo(
    () => user && params.resumePlaceId && params.resumeQuery
      ? `${user.id}:${params.resumePlaceId}:${params.resumeQuery}`
      : '',
    [params.resumePlaceId, params.resumeQuery, user],
  );
  const [handledResumeKey, setHandledResumeKey] = useState('');
  useEffect(() => {
    if (!resumeKey || resumeKey === handledResumeKey || claim.isPending) return;
    setHandledResumeKey(resumeKey);
    claim.mutate({ placeId: params.resumePlaceId!, originalQuery: params.resumeQuery! });
  }, [claim, handledResumeKey, params.resumePlaceId, params.resumeQuery, resumeKey]);

  if (!enabled || normalized.length < 2) return null;

  const choose = (match: DestinationIdentity) => {
    if (match.existingCandidateId) {
      router.push(`/destinations/provisional/${match.existingCandidateId}`);
      return;
    }
    if (!user) {
      const returnTo = `${returnPath}?resumePlaceId=${encodeURIComponent(match.canonicalPlaceId)}&resumeQuery=${encodeURIComponent(normalized)}`;
      router.push({ pathname: '/auth/login', params: { returnTo } });
      return;
    }
    claim.mutate({ placeId: match.canonicalPlaceId, originalQuery: normalized });
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text variant="h3">Search beyond Outing</Text>
        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
          Confirm the city and Outing will build a reusable guide for it.
        </Text>
      </View>

      {!online ? (
        <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary }}>
          <Text variant="bodySm">Connect to the internet to search for a new city.</Text>
        </View>
      ) : matches.isLoading || claim.isPending ? (
        <View accessibilityLiveRegion="polite" style={{ padding: spacing.lg, alignItems: 'center', gap: spacing.sm }}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="bodySm" style={{ color: colors.textSecondary }}>
            {claim.isPending ? 'Setting up the destination…' : 'Checking cities…'}
          </Text>
        </View>
      ) : matches.error || claim.error ? (
        <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentLight, gap: spacing.sm }}>
          <Text variant="bodySm" style={{ color: colors.error }}>
            {(claim.error ?? matches.error) instanceof Error ? (claim.error ?? matches.error)!.message : 'Destination search is unavailable.'}
          </Text>
          <Button size="sm" variant="secondary" onPress={() => matches.refetch()}>Try again</Button>
        </View>
      ) : matches.data?.length ? (
        matches.data.map((match) => (
          <Pressable
            key={match.canonicalPlaceId}
            accessibilityRole="button"
            accessibilityLabel={`${match.name}, ${match.country}`}
            onPress={() => choose(match)}
            style={{
              padding: spacing.md,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.cardBackground,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="labelLg">{match.name}</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>{match.country}</Text>
              <Text variant="labelSm" style={{ color: colors.accent }}>
                {match.existingCandidateId ? 'Generated overview available' : 'Generate an Outing overview'}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontSize: 20 }}>→</Text>
          </Pressable>
        ))
      ) : (
        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
          We couldn’t confirm that as a city. Try adding the country or region.
        </Text>
      )}
    </View>
  );
}
