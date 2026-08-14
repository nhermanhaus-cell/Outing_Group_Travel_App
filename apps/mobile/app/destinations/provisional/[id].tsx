import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useNetInfo } from '@react-native-community/netinfo';
import { ANALYTICS_EVENTS, type DestinationCandidate } from '@gayi/shared';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { DestinationGenerationJourney } from '../../../components/destinations/destination-generation-journey';
import { useAuth } from '../../../src/providers/AppProviders';
import { supabase } from '../../../src/lib/supabase';
import {
  generateDestination,
  loadGeneratedDestination,
} from '../../../src/lib/destination-discovery-api';
import { destinationPlanHref } from '../../../src/lib/tripPlanningFlow';
import { useAnalytics } from '../../../src/analytics/analytics-provider';
import { useTheme } from '../../../src/theme/ThemeProvider';

export default function ProvisionalDestinationScreen() {
  const { id, resumeAction } = useLocalSearchParams<{ id: string; resumeAction?: 'plan' | 'save' }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const network = useNetInfo();
  const online = network.isConnected !== false;
  const { track } = useAnalytics();
  const { colors, spacing, radius } = useTheme();
  const generationStarted = useRef(false);
  const previousStage = useRef<string | null>(null);
  const [sawGeneration, setSawGeneration] = useState(false);
  const [revealReady, setRevealReady] = useState(false);

  const candidate = useQuery({
    queryKey: ['provisional-destination', id],
    queryFn: () => loadGeneratedDestination(id),
    enabled: Boolean(id),
    staleTime: 1_000,
    retry: 1,
    refetchInterval: (query) => {
      const status = query.state.data?.generationStatus;
      return status === 'queued' || status === 'generating' ? 1_500 : false;
    },
  });

  const generation = useMutation({
    mutationFn: (refresh: boolean) => generateDestination(id, refresh),
    onSuccess: (result) => queryClient.setQueryData(['provisional-destination', id], result),
  });

  useEffect(() => {
    const client = supabase;
    if (!client || !id) return;
    const channel = client
      .channel(`destination-generation-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'destination_candidates', filter: `id=eq.${id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['provisional-destination', id] });
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [id, queryClient]);

  useEffect(() => {
    const data = candidate.data;
    if (!data) return;
    if (data.publishedDestinationSlug) {
      router.replace(`/destinations/${data.publishedDestinationSlug}`);
      return;
    }
    if (data.generationStatus !== 'ready') setSawGeneration(true);
    if (data.generationStatus === 'queued' && user && online && !generationStarted.current) {
      generationStarted.current = true;
      generation.mutate(false);
    }
    if (previousStage.current && previousStage.current !== data.generationStage && data.generationStatus === 'generating') {
      void Haptics.selectionAsync();
    }
    if (previousStage.current !== data.generationStage) {
      track(ANALYTICS_EVENTS.DESTINATION_GENERATION_LIFECYCLE, {
        status: data.generationStatus,
        stage: data.generationStage,
        entryPoint: 'destination_generation',
      });
    }
    if (previousStage.current !== 'complete' && data.generationStage === 'complete') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    previousStage.current = data.generationStage;
  }, [candidate.data, generation, online, router, track, user]);

  useEffect(() => {
    if (candidate.data?.generationStatus !== 'ready') {
      setRevealReady(false);
      return;
    }
    if (!sawGeneration) {
      setRevealReady(true);
      return;
    }
    const timer = setTimeout(() => setRevealReady(true), 900);
    return () => clearTimeout(timer);
  }, [candidate.data?.generationStatus, sawGeneration]);

  const saved = useQuery({
    queryKey: ['saved-provisional-destination', user?.id, id],
    queryFn: async () => {
      if (!supabase || !user) return false;
      const { data } = await supabase.from('saved_destinations').select('id').eq('user_id', user.id).eq('destination_candidate_id', id).maybeSingle();
      return Boolean(data);
    },
    enabled: Boolean(supabase && user && id),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!supabase || !user) throw new Error('Sign in to save this destination.');
      if (saved.data) {
        const { error } = await supabase.from('saved_destinations').delete().eq('user_id', user.id).eq('destination_candidate_id', id);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase.from('saved_destinations').insert({ user_id: user.id, destination_slug: null, destination_candidate_id: id, source: 'user' });
      if (error) throw error;
      return true;
    },
    onSuccess: (value) => queryClient.setQueryData(['saved-provisional-destination', user?.id, id], value),
  });

  const openPlan = () => {
    if (!candidate.data) return;
    router.push(destinationPlanHref({
      destinationSlug: candidate.data.slug,
      destinationName: candidate.data.name,
      destinationCandidateId: candidate.data.id,
    }));
  };

  useEffect(() => {
    if (!user || !candidate.data || !resumeAction) return;
    if (resumeAction === 'plan') openPlan();
    if (resumeAction === 'save' && !saved.data && !save.isPending) save.mutate();
    // Resume exactly once after auth; replacement navigation removes the action for planning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.data?.id, resumeAction, user?.id]);

  const requireUser = (action: 'plan' | 'save', callback: () => void) => {
    if (user) callback();
    else router.push({ pathname: '/auth/login', params: { returnTo: `/destinations/provisional/${id}?resumeAction=${action}` } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.base, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back"><Text style={{ fontSize: 22 }}>←</Text></Pressable>
        <Text variant="h2" style={{ flex: 1 }}>Destination research</Text>
      </View>

      {candidate.isLoading ? (
        <View accessibilityLiveRegion="polite" style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.sm }}>
          <Text variant="displaySm">Finding your destination…</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>Confirming the saved city research.</Text>
        </View>
      ) : candidate.error || !candidate.data ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
          <Text variant="displaySm">Research unavailable</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{candidate.error instanceof Error ? candidate.error.message : 'This destination could not be loaded.'}</Text>
          <Button variant="secondary" onPress={() => candidate.refetch()}>Try again</Button>
          <Button variant="ghost" onPress={() => router.push('/discover')}>Back to Discover</Button>
        </View>
      ) : candidate.data.status === 'rejected' ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
          <Text variant="displaySm">This city guide wasn’t published</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>The provisional research did not meet Outing’s quality checks. Browse reviewed destinations or search again later.</Text>
          <Button onPress={() => router.push('/discover')}>Browse destinations</Button>
        </View>
      ) : candidate.data.generationStatus !== 'ready' || !revealReady ? (
        <ScrollView contentContainerStyle={{ paddingTop: spacing.md }}>
          <DestinationGenerationJourney
            candidate={candidate.data}
            retrying={generation.isPending}
            online={online}
            onRetry={() => {
              generationStarted.current = true;
              generation.mutate(true);
            }}
            onKeepBrowsing={() => router.push('/discover')}
          />
        </ScrollView>
      ) : (
        <GeneratedDestinationContent
          candidate={candidate.data}
          bottomInset={insets.bottom}
          saved={Boolean(saved.data)}
          saving={save.isPending}
          onSave={() => requireUser('save', () => save.mutate())}
          onPlan={() => requireUser('plan', openPlan)}
          onAsk={() => router.push({ pathname: '/ask', params: { prompt: `Help me explore ${candidate.data.name}, ${candidate.data.country} using the verified information in its Outing guide.` } })}
        />
      )}
    </View>
  );
}

function GeneratedDestinationContent({ candidate, bottomInset, saved, saving, onSave, onPlan, onAsk }: {
  candidate: DestinationCandidate;
  bottomInset: number;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onPlan: () => void;
  onAsk: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const payload = (candidate.payload ?? {}) as Partial<NonNullable<DestinationCandidate['payload']>>;
  const neighborhoods = Array.isArray(payload.neighborhoods) ? payload.neighborhoods as Array<{ name: string; summary: string }> : [];
  const places = Array.isArray(payload.places) ? payload.places as Array<{ id: string; name: string; category: string; rating?: number; address?: string; imageUrl?: string; sourceUrl?: string }> : [];
  const events = Array.isArray(payload.events) ? payload.events as Array<{ id: string; name: string; startDate?: string; venueName?: string; imageUrl?: string; sourceUrl?: string }> : [];
  const experiences = Array.isArray(payload.experiences) ? payload.experiences as Array<{ id: string; title: string; summary?: string; imageUrl?: string; priceFrom?: number; currency?: string; sourceUrl?: string }> : [];
  const practical = payload.practical && typeof payload.practical === 'object' ? payload.practical as { gettingAround?: string; typicalStay?: string; costContext?: string } : {};
  const summary = typeof payload.editorialSummary === 'string' ? payload.editorialSummary : candidate.summary;
  const heroImageUrl = typeof payload.heroImageUrl === 'string' ? payload.heroImageUrl : undefined;
  const heroImageAttribution = typeof payload.heroImageAttribution === 'string' ? payload.heroImageAttribution : undefined;
  const heroImageSourceUrl = typeof payload.heroImageSourceUrl === 'string' ? payload.heroImageSourceUrl : undefined;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + spacing['4xl'], gap: spacing.xl }}>
      <View style={{ minHeight: heroImageUrl ? 390 : 270, backgroundColor: colors.plumLight, justifyContent: 'flex-end', overflow: 'hidden' }}>
        {heroImageUrl ? <Image source={{ uri: heroImageUrl }} contentFit="cover" style={{ position: 'absolute', inset: 0 }} /> : null}
        {heroImageUrl ? <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,13,10,0.42)' }} /> : null}
        {heroImageAttribution ? <Pressable disabled={!heroImageSourceUrl} onPress={() => heroImageSourceUrl && void Linking.openURL(heroImageSourceUrl)} style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: 'rgba(15,13,10,0.62)' }}><Text variant="caption" style={{ color: colors.white }}>{heroImageAttribution}{heroImageSourceUrl ? ' ↗' : ''}</Text></Pressable> : null}
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <Text variant="labelSm" style={{ color: heroImageUrl ? colors.white : colors.accent, textTransform: 'uppercase', letterSpacing: 1.1 }}>Generated overview · review pending</Text>
          <Text variant="displayMd" style={{ color: heroImageUrl ? colors.white : colors.textPrimary }}>{candidate.name}</Text>
          <Text variant="h3" style={{ color: heroImageUrl ? colors.white : colors.textSecondary }}>{candidate.country}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
        <Text variant="bodyLg">{summary}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button style={{ flex: 1 }} onPress={onPlan}>Plan a trip</Button>
          <Button style={{ flex: 1 }} variant="secondary" loading={saving} onPress={onSave}>{saved ? 'Saved' : 'Save'}</Button>
        </View>
        <Button variant="ghost" onPress={onAsk}>Ask Outing about {candidate.name}</Button>
      </View>

      <VerificationNotice />

      {neighborhoods.length ? <Section title="Neighborhoods to know">
        {neighborhoods.map((item) => <InfoCard key={item.name} title={item.name} body={item.summary} />)}
      </Section> : null}

      {places.length ? <Section title="Places worth exploring">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
          {places.map((place) => <MediaCard key={place.id} title={place.name} eyebrow={place.category.replace(/_/g, ' ')} imageUrl={place.imageUrl} detail={[place.rating ? `${place.rating.toFixed(1)} ★` : '', place.address ?? ''].filter(Boolean).join(' · ')} onPress={place.sourceUrl ? () => void Linking.openURL(place.sourceUrl!) : undefined} />)}
        </ScrollView>
      </Section> : null}

      {experiences.length ? <Section title="Experiences">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
          {experiences.map((experience) => <MediaCard key={experience.id} title={experience.title} eyebrow="Bookable experience" imageUrl={experience.imageUrl} detail={experience.priceFrom ? `From ${new Intl.NumberFormat(undefined, { style: 'currency', currency: experience.currency ?? 'USD', maximumFractionDigits: 0 }).format(experience.priceFrom)}` : experience.summary} onPress={experience.sourceUrl ? () => void Linking.openURL(experience.sourceUrl!) : undefined} />)}
        </ScrollView>
        <Text variant="caption" style={{ color: colors.textTertiary }}>Bookable options are ranked for relevance; availability and pricing can change.</Text>
      </Section> : null}

      {events.length ? <Section title="What’s happening">
        {events.map((event) => <Pressable key={event.id} disabled={!event.sourceUrl} onPress={() => event.sourceUrl && void Linking.openURL(event.sourceUrl)} style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border, gap: spacing.xs }}><Text variant="labelLg">{event.name}</Text><Text variant="bodySm" style={{ color: colors.textSecondary }}>{[event.startDate, event.venueName].filter(Boolean).join(' · ')}</Text></Pressable>)}
      </Section> : null}

      <Section title="Practical first look">
        <InfoCard title="Getting around" body={practical.gettingAround ?? 'Transportation guidance is not yet verified.'} />
        <InfoCard title="How long to stay" body={practical.typicalStay ?? 'Trip-length guidance is not yet verified.'} />
        <InfoCard title="Typical costs" body={practical.costContext ?? 'Cost guidance is not yet verified.'} />
      </Section>

      {candidate.sources.length ? <Section title="Sources checked">
        {candidate.sources.map((source) => <Pressable key={source.id} disabled={!source.url} onPress={() => source.url && void Linking.openURL(source.url)}><Text variant="bodyMd" style={{ color: source.url ? colors.pool : colors.textPrimary }}>{source.label}{source.url ? ' ↗' : ''}</Text><Text variant="caption" style={{ color: colors.textTertiary }}>Retrieved {new Date(source.retrievedAt).toLocaleDateString()}</Text></Pressable>)}
      </Section> : null}
    </ScrollView>
  );
}

function VerificationNotice() {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ marginHorizontal: spacing.base, padding: spacing.base, borderRadius: radius.xl, backgroundColor: colors.warningLight, gap: spacing.sm }}><Text variant="labelMd">A useful first look, still being reviewed</Text><Text variant="bodySm" style={{ color: colors.textSecondary }}>Places, events, and experiences come from current providers. Seasonality, costs, accessibility, legal, LGBTQ+, health, and safety guidance remain unverified unless a section says otherwise.</Text></View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return <View style={{ paddingHorizontal: spacing.base, gap: spacing.sm }}><Text variant="h2">{title}</Text>{children}</View>;
}

function InfoCard({ title, body }: { title: string; body: string }) {
  const { colors, spacing, radius } = useTheme();
  return <View style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border, gap: spacing.xs }}><Text variant="labelLg">{title}</Text><Text variant="bodySm" style={{ color: colors.textSecondary }}>{body}</Text></View>;
}

function MediaCard({ title, eyebrow, detail, imageUrl, onPress }: { title: string; eyebrow: string; detail?: string; imageUrl?: string; onPress?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return <Pressable disabled={!onPress} onPress={onPress} style={{ width: 250, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border }}>{imageUrl ? <Image source={{ uri: imageUrl }} contentFit="cover" style={{ height: 145, width: '100%' }} /> : <View style={{ height: 92, backgroundColor: colors.plumLight }} />}<View style={{ padding: spacing.md, gap: spacing.xs }}><Text variant="labelSm" style={{ color: colors.accent, textTransform: 'uppercase' }}>{eyebrow}</Text><Text variant="h3">{title}</Text>{detail ? <Text variant="caption" numberOfLines={3} style={{ color: colors.textSecondary }}>{detail}</Text> : null}</View></Pressable>;
}
