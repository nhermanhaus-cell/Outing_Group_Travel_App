import React, { useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computePulse } from '@gayi/domain';
import type { PulseInputs } from '@gayi/domain';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDestinations } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PulseMeter } from '../../components/ui/PulseMeter';
import { DataSourceBadge } from '../../components/ui/DataSourceBadge';
import { lgbtqVibeLabel, lgbtqVibeVariant } from '../../src/lib/lgbtqVibe';
import travelAdvisories from '../../assets/public/travel-advisories.json';
import experiencesSeed from '../../assets/seed/experiences.json';

type TabKey = 'overview' | 'lgbtq' | 'places' | 'events';
type DestinationExperience = (typeof experiencesSeed)[number] & {
  affiliateUrl?: string;
};

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <Text
      variant="labelSm"
      style={{ color: colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm }}
    >
      {children}
    </Text>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
      <Text variant="bodyMd" style={{ color: colors.textSecondary, flex: 1 }}>{label}</Text>
      <Text variant="labelMd" style={{ color: accent ? colors.accent : colors.textPrimary, textAlign: 'right', flex: 1 }}>{value}</Text>
    </View>
  );
}

export default function DestinationDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { getBySlug } = useDestinations();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const destination = useMemo(() => getBySlug(slug ?? ''), [slug, getBySlug]);

  const pulse = useMemo(() => {
    if (!destination?.communityPulseComponents) return null;
    const c = destination.communityPulseComponents;
    const inputs: PulseInputs = {
      eventCount30d: c.upcomingEvents30d ?? 0,
      venueDensityPer100k: c.venueDensity ?? 0,
      reviewCount: c.recentReviews ?? 0,
      activeContributors30d: c.activeContributors ?? 0,
      publicTripsCount: c.publicTrips ?? 0,
      aggregateCheckins30d: c.aggregateCheckins ?? 0,
      responseRate: c.questionResponseRate ?? 0,
      verifiedVenueCount: Math.round((c.venueDensity ?? 0) * 0.4),
      prideEventThisYear: (destination.events ?? []).some((e: { category: string }) => e.category === 'pride'),
    };
    return computePulse(inputs);
  }, [destination]);

  const advisoryLinks = useMemo(() => {
    if (!destination) return [] as Array<{ title: string; url: string }>;
    const entries = (travelAdvisories as {
      entries: Array<{ countryCode: string; issuer: string; links: Array<{ title: string; url: string }> }>;
    }).entries;
    const match = entries.find((e) => e.countryCode === destination.countryCode);
    return match?.links ?? [];
  }, [destination]);

  const destinationExperiences = useMemo<DestinationExperience[]>(
    () =>
      destination
        ? (experiencesSeed as DestinationExperience[])
            .filter((experience) => experience.destinationSlug === destination.slug)
            .slice(0, 3)
        : [],
    [destination],
  );

  if (!destination) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="h3" style={{ color: colors.textTertiary }}>Destination not found</Text>
        <Button variant="ghost" onPress={() => router.back()}>Go back</Button>
      </View>
    );
  }

  const lgbtq = destination.lgbtqContext;
  const legal = lgbtq?.legalEqualityScore ?? 0;
  const opinion = lgbtq?.publicOpinionScore ?? 0;
  const legalVariant = lgbtqVibeVariant(legal);

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'lgbtq', label: 'LGBTQ+' },
    { key: 'places', label: 'Places' },
    { key: 'events', label: 'Events' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Hero */}
        <View style={{ position: 'relative' }}>
          {destination.heroImageUrl ? (
            <Image source={{ uri: destination.heroImageUrl }} style={{ width: '100%', height: 380 }} resizeMode="cover" />
          ) : (
            <View style={{ width: '100%', height: 380, backgroundColor: colors.backgroundTertiary }} />
          )}
          <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.base, right: spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()} style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.full, padding: spacing.sm }}>
              <Text style={{ color: colors.white, fontSize: 16 }}>←</Text>
            </Pressable>
            <DataSourceBadge label={destination.sourceLabel ?? 'editorial_demo'} />
          </View>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,13,10,0.55)', paddingHorizontal: spacing['2xl'], paddingVertical: spacing.xl }}>
            <Badge label={lgbtqVibeLabel(legal)} variant={legalVariant} style={{ marginBottom: spacing.sm }} />
            <Text variant="displayMd" style={{ color: colors.white }}>{destination.name}</Text>
            <Text variant="bodyLg" style={{ color: 'rgba(255,255,255,0.8)' }}>{destination.country}</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{ flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === tab.key ? colors.accent : 'transparent' }}
            >
              <Text variant="labelMd" style={{ color: activeTab === tab.key ? colors.accent : colors.textSecondary }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: spacing.base }}>
          {/* ─── Overview ─── */}
          {activeTab === 'overview' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>About</SectionTitle>
              <Text variant="bodyLg" style={{ color: colors.textSecondary, lineHeight: 26 }}>
                {destination.editorialSummary}
              </Text>

              <SectionTitle>Community Pulse</SectionTitle>
              {pulse ? (
                <Card elevated padded>
                  <PulseMeter pulse={pulse} />
                </Card>
              ) : null}

              <SectionTitle>Best months</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {(destination.bestMonths ?? []).map((m: number) => (
                  <Badge key={m} label={MONTH_NAMES[m]} variant="info" />
                ))}
              </View>

              <SectionTitle>Budget</SectionTitle>
              {destination.priceBands && (
                <View style={{ gap: spacing.xs }}>
                  <InfoRow label="Budget / day" value={`$${destination.priceBands.shoestring?.perPersonPerDayUsd?.low}–${destination.priceBands.shoestring?.perPersonPerDayUsd?.high}`} />
                  <InfoRow label="Mid / day" value={`$${destination.priceBands.mid?.perPersonPerDayUsd?.low}–${destination.priceBands.mid?.perPersonPerDayUsd?.high}`} />
                  <InfoRow label="Luxury / day" value={`$${destination.priceBands.luxury?.perPersonPerDayUsd?.low}–${destination.priceBands.luxury?.perPersonPerDayUsd?.high}`} />
                </View>
              )}

              <SectionTitle>Interests</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {(destination.interests ?? []).map((i: string) => (
                  <Badge key={i} label={i.replace('_', ' ')} variant="default" />
                ))}
              </View>

              {destinationExperiences.length > 0 && (
                <>
                  <SectionTitle>Things to do</SectionTitle>
                  {destinationExperiences.map((experience) => (
                    <Card key={experience.id} elevated padded style={{ marginBottom: spacing.sm }}>
                      <View style={{ gap: spacing.xs }}>
                        <Text variant="h4">{experience.title}</Text>
                        <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                          {experience.summary}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          {experience.tags?.slice(0, 4).map((tag) => (
                            <Badge key={tag} label={tag} variant="default" />
                          ))}
                        </View>
                        {typeof experience.affiliateUrl === 'string' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() => {
                              const affiliateUrl = experience.affiliateUrl;
                              if (affiliateUrl) {
                                Linking.openURL(affiliateUrl);
                              }
                            }}
                          >
                            Open experience
                          </Button>
                        ) : null}
                      </View>
                    </Card>
                  ))}
                </>
              )}

              {destination.neighborhoods?.length > 0 && (
                <>
                  <SectionTitle>Neighborhoods</SectionTitle>
                  {destination.neighborhoods.map((n: { id: string; name: string; summary: string; vibeTags: string[] }) => (
                    <View key={n.id} style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
                      <Text variant="h4">{n.name}</Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{n.summary}</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                        {(n.vibeTags ?? []).map((t: string) => (
                          <Badge key={t} label={t} variant="default" />
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {(destination.sources?.length ?? 0) > 0 && (
                <>
                  <SectionTitle>Sources</SectionTitle>
                  <Text variant="bodySm" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                    Attribution for editorial further reading and public datasets. Gay-i never claims a destination is universally safe.
                  </Text>
                  {(destination.sources as Array<{ type: string; label: string; url: string }>).map((s, i) => (
                    <View
                      key={`${s.type}-${i}`}
                      style={{
                        paddingVertical: spacing.sm,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.borderSubtle,
                        gap: spacing.xxs,
                      }}
                    >
                      <Text variant="labelMd">{s.label}</Text>
                      <Text variant="caption" style={{ color: colors.textTertiary }}>{s.type.replace('_', ' ')}</Text>
                      <Text variant="caption" style={{ color: colors.accent }}>{s.url}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ─── LGBTQ+ ─── */}
          {activeTab === 'lgbtq' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>Legal & Social Context</SectionTitle>
              <View style={{ gap: spacing.xs }}>
                <InfoRow label="Legal equality" value={`${legal}/100`} accent />
                <InfoRow label="Public opinion" value={`${opinion}/100`} accent />
                <InfoRow label="Criminalization" value={lgbtq?.criminalizationStatus ?? '—'} />
                <InfoRow label="Same-sex recognition" value={lgbtq?.sameSexRecognition ? 'Yes' : 'No'} />
                <InfoRow label="Anti-discrimination" value={lgbtq?.antiDiscrimination ? 'Yes' : 'No'} />
              </View>

              {lgbtq?.localVariation && (
                <>
                  <SectionTitle>Local variation</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{lgbtq.localVariation}</Text>
                </>
              )}

              {lgbtq?.genderRecognitionNotes && (
                <>
                  <SectionTitle>Gender recognition</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{lgbtq.genderRecognitionNotes}</Text>
                </>
              )}

              {lgbtq?.humanRightsSummary && (
                <>
                  <SectionTitle>Human rights summary</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                    {lgbtq.humanRightsSummary}
                  </Text>
                </>
              )}

              {lgbtq?.advocacyNotes && (
                <>
                  <SectionTitle>Advocacy notes</SectionTitle>
                  <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                    {lgbtq.advocacyNotes}
                  </Text>
                </>
              )}

              {lgbtq?.recentRelevantEvents?.length > 0 && (
                <>
                  <SectionTitle>Recent relevant events</SectionTitle>
                  {lgbtq.recentRelevantEvents.map(
                    (
                      event: {
                        title: string;
                        date?: string;
                        summary?: string;
                        sourceUrl?: string;
                      },
                      index: number,
                    ) => (
                      <Card key={`${event.title}-${index}`} elevated padded style={{ marginBottom: spacing.sm }}>
                        <View style={{ gap: spacing.xs }}>
                          <Text variant="h4">{event.title}</Text>
                          {event.date ? (
                            <Text variant="caption" style={{ color: colors.textTertiary }}>
                              {event.date}
                            </Text>
                          ) : null}
                          {event.summary ? (
                            <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                              {event.summary}
                            </Text>
                          ) : null}
                          {event.sourceUrl ? (
                            <Text variant="caption" style={{ color: colors.accent }}>
                              {event.sourceUrl}
                            </Text>
                          ) : null}
                        </View>
                      </Card>
                    ),
                  )}
                </>
              )}

              {lgbtq?.neighborhoodNotes?.length > 0 && (
                <>
                  <SectionTitle>Traveler notes</SectionTitle>
                  {lgbtq.neighborhoodNotes.map((note: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs }}>
                      <Text style={{ color: colors.accent }}>◦</Text>
                      <Text variant="bodyMd" style={{ flex: 1, color: colors.textSecondary }}>{note}</Text>
                    </View>
                  ))}
                </>
              )}

              {lgbtq?.emergencyResources?.length > 0 && (
                <>
                  <SectionTitle>Resources</SectionTitle>
                  {lgbtq.emergencyResources.map((r: { name: string; url: string }, i: number) => (
                    <Text key={i} variant="bodyMd" style={{ color: colors.accent }}>
                      {r.name} ({r.url})
                    </Text>
                  ))}
                </>
              )}

              {advisoryLinks.length > 0 && (
                <>
                  <SectionTitle>Official advisories</SectionTitle>
                  <Text variant="bodySm" style={{ color: colors.textTertiary, marginBottom: spacing.sm }}>
                    Government links only — not a Gay-i safety rating.
                  </Text>
                  {advisoryLinks.map((link) => (
                    <Text key={link.url} variant="bodyMd" style={{ color: colors.accent, marginBottom: spacing.xs }}>
                      {link.title}
                      {'\n'}
                      <Text variant="caption" style={{ color: colors.textTertiary }}>{link.url}</Text>
                    </Text>
                  ))}
                </>
              )}

              {lgbtq?.lastReviewedAt && (
                <Text variant="caption" style={{ color: colors.textTertiary, marginTop: spacing.md }}>
                  Reviewed: {lgbtq.lastReviewedAt} · {lgbtq.dataLabel ?? 'editorial_demo'}
                </Text>
              )}

              <View style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.warningLight ?? colors.backgroundSecondary, borderRadius: radius.md }}>
                <Text variant="bodySm" style={{ color: colors.textSecondary }}>
                  Context is sample data only. Always verify with current local sources before travel.
                </Text>
              </View>
            </View>
          )}

          {/* ─── Places ─── */}
          {activeTab === 'places' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>Places</SectionTitle>
              {(destination.places ?? []).length === 0 ? (
                <Text variant="bodyMd" style={{ color: colors.textTertiary }}>No places listed.</Text>
              ) : (
                (destination.places ?? []).map((p: { id: string; name: string; category: string; summary: string; lgbtqRelevance?: string; estimatedCostUsd?: number }) => (
                  <Card key={p.id} elevated padded style={{ marginBottom: spacing.sm }}>
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text variant="h4" style={{ flex: 1 }}>{p.name}</Text>
                        <Badge label={p.category} variant="default" />
                      </View>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{p.summary}</Text>
                      {p.lgbtqRelevance ? (
                        <Text variant="caption" style={{ color: colors.accent }}>✦ {p.lgbtqRelevance}</Text>
                      ) : null}
                      {p.estimatedCostUsd ? (
                        <Text variant="caption" style={{ color: colors.textTertiary }}>~${p.estimatedCostUsd}/person</Text>
                      ) : null}
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          {/* ─── Events ─── */}
          {activeTab === 'events' && (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle>Upcoming events</SectionTitle>
              {(destination.events ?? []).length === 0 ? (
                <Text variant="bodyMd" style={{ color: colors.textTertiary }}>No events listed.</Text>
              ) : (
                (destination.events ?? []).map((e: { id: string; title: string; startDate: string; endDate: string; category: string; summary: string; estimatedCostUsd?: number }) => (
                  <Card key={e.id} elevated padded style={{ marginBottom: spacing.sm }}>
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text variant="h4" style={{ flex: 1 }}>{e.title}</Text>
                        <Badge label={e.category} variant={e.category === 'pride' ? 'accent' : 'default'} />
                      </View>
                      <Text variant="caption" style={{ color: colors.textSecondary }}>
                        {e.startDate}{e.endDate !== e.startDate ? ` – ${e.endDate}` : ''}
                      </Text>
                      <Text variant="bodySm" style={{ color: colors.textSecondary }}>{e.summary}</Text>
                    </View>
                  </Card>
                ))
              )}
              <Text variant="caption" style={{ color: colors.textTertiary, marginTop: spacing.md }}>
                Sample calendar data. Verify dates before travel.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* CTA Footer */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button
          fullWidth
          onPress={() =>
            router.push({
              pathname: '/trips/new',
              params: { destinationSlug: destination.slug, destinationName: destination.name },
            })
          }
        >
          Plan a trip to {destination.name}
        </Button>
      </View>
    </View>
  );
}
