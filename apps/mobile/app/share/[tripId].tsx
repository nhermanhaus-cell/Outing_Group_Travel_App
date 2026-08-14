import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useTrips } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useAnalytics } from '../../src/analytics/analytics-provider';

function inviteLinkFor(tripId: string): string {
  return `gayi://trips/${tripId}/invite`;
}

export default function ShareScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { getTrip } = useTrips();
  const { track } = useAnalytics();

  const [copied, setCopied] = useState<string | null>(null);

  const trip = getTrip(tripId ?? '');
  const inviteLink = trip ? inviteLinkFor(trip.tripId) : '';

  const dateRange = trip?.startDate && trip?.endDate
    ? `${trip.startDate} – ${trip.endDate}`
    : trip?.startDate ?? 'TBD';

  const shareText = trip
    ? `✈ Join me on a trip to ${trip.destinationName ?? 'somewhere amazing'}!\n📅 ${dateRange}\n👥 ${trip.travelers} travelers\n\nPlanned with Outing — LGBTQ+ travel made for us.\n${inviteLink}`
    : '';

  const partifulTitle = trip ? `${trip.name}${trip.destinationName ? ` – ${trip.destinationName}` : ''}` : '';
  const partifulCopy = trip
    ? `Join us for a trip to ${trip.destinationName ?? 'somewhere fabulous'}! ${dateRange}.\n${inviteLink}`
    : '';

  const copyToClipboard = async (text: string, key: string) => {
    try {
      const { default: Clipboard } = await import('expo-clipboard');
      await Clipboard.setStringAsync(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (!trip) return;
    try {
      await Share.share({
        message: shareText,
        title: trip.name ?? 'Outing Trip',
        url: inviteLink,
      });
      track(ANALYTICS_EVENTS.TRIP_SHARED, { channel: 'native_share' });
    } catch {
      await copyToClipboard(shareText, 'native');
      track(ANALYTICS_EVENTS.TRIP_SHARED, { channel: 'clipboard_fallback' });
    }
  };

  const handleWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
      }
      track(ANALYTICS_EVENTS.TRIP_SHARED, { channel: 'whatsapp' });
    } catch {
      await copyToClipboard(shareText, 'wa');
      track(ANALYTICS_EVENTS.TRIP_SHARED, { channel: 'whatsapp_clipboard_fallback' });
    }
  };

  const handlePartiful = async () => {
    try {
      await Linking.openURL('https://partiful.com/create');
      track(ANALYTICS_EVENTS.TRIP_SHARED, { channel: 'partiful' });
    } catch {
      await copyToClipboard(`${partifulTitle}\n${partifulCopy}\n${dateRange}`, 'pall');
      track(ANALYTICS_EVENTS.TRIP_SHARED, { channel: 'partiful_clipboard_fallback' });
    }
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="h3" style={{ color: colors.textTertiary }}>Trip not found</Text>
        <Button variant="ghost" onPress={() => router.back()}>Back</Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>✕</Text>
        </Pressable>
        <Text variant="h3">Share trip</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.base, gap: spacing.xl, paddingBottom: insets.bottom + spacing['4xl'] }}>
        <Card>
          <Text variant="h3">{trip.name}</Text>
          {trip.destinationName ? <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{trip.destinationName}</Text> : null}
          {trip.startDate ? <Text variant="caption" style={{ color: colors.textTertiary }}>{dateRange}</Text> : null}
        </Card>

        <View style={{ gap: spacing.md }}>
          <Text variant="h3">Share message</Text>
          <View
            style={{
              backgroundColor: colors.backgroundSecondary,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
            }}
          >
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{shareText}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button style={{ flex: 1 }} variant="secondary" onPress={() => copyToClipboard(shareText, 'text')}>
              {copied === 'text' ? '✓ Copied!' : 'Copy text'}
            </Button>
            <Button style={{ flex: 1 }} onPress={handleNativeShare}>
              Share ↑
            </Button>
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h3">WhatsApp</Text>
          <Card>
            <Text variant="bodyMd" style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
              Open WhatsApp with this trip invite pre-filled.
            </Text>
            <Button onPress={handleWhatsApp}>
              Open WhatsApp
            </Button>
            <Button
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={() => copyToClipboard(shareText, 'wa')}
            >
              {copied === 'wa' ? '✓ Copied for WhatsApp!' : 'Copy for WhatsApp'}
            </Button>
          </Card>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h3">Partiful</Text>
          <Card style={{ gap: spacing.md }}>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Use these fields when creating your Partiful event, then open Partiful to create it.
            </Text>

            <View style={{ gap: spacing.xs }}>
              <Text variant="labelMd" style={{ color: colors.textSecondary }}>Title</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="bodyMd" style={{ flex: 1, color: colors.textPrimary }}>{partifulTitle}</Text>
                <Pressable onPress={() => copyToClipboard(partifulTitle, 'ptitle')}>
                  <Text variant="labelSm" style={{ color: colors.accent }}>
                    {copied === 'ptitle' ? 'Copied!' : 'Copy'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text variant="labelMd" style={{ color: colors.textSecondary }}>Description</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <Text variant="bodyMd" style={{ flex: 1, color: colors.textPrimary }}>{partifulCopy}</Text>
                <Pressable onPress={() => copyToClipboard(partifulCopy, 'pcopy')}>
                  <Text variant="labelSm" style={{ color: colors.accent }}>
                    {copied === 'pcopy' ? 'Copied!' : 'Copy'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {trip.startDate ? (
              <View style={{ gap: spacing.xs }}>
                <Text variant="labelMd" style={{ color: colors.textSecondary }}>Dates</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="bodyMd" style={{ flex: 1, color: colors.textPrimary }}>{dateRange}</Text>
                  <Pressable onPress={() => copyToClipboard(dateRange, 'pdates')}>
                    <Text variant="labelSm" style={{ color: colors.accent }}>
                      {copied === 'pdates' ? 'Copied!' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Button
              variant="secondary"
              onPress={() => copyToClipboard(`${partifulTitle}\n${partifulCopy}\n${dateRange}`, 'pall')}
            >
              {copied === 'pall' ? '✓ All copied!' : 'Copy all fields'}
            </Button>

            <Button onPress={handlePartiful}>
              Open Partiful →
            </Button>
          </Card>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h3">Invite link</Text>
          <Card>
            <Text variant="bodyMd" style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
              Share this deep link so friends can join your trip.
            </Text>
            <Text variant="labelMd" style={{ color: colors.textPrimary, marginBottom: spacing.md }}>
              {inviteLink}
            </Text>
            <Button
              variant="secondary"
              onPress={() => copyToClipboard(inviteLink, 'invite')}
            >
              {copied === 'invite' ? '✓ Copied!' : 'Copy invite link'}
            </Button>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
