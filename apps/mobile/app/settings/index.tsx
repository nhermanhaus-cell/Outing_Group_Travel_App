import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { useAnalytics } from '../../src/analytics/analytics-provider';
import { supabase } from '../../src/lib/supabase';
import {
  resetAssistantPersonalization,
  setAssistantPersonalizationEnabled,
} from '../../src/lib/assistant-api';
import type { NotificationPreferences } from '@gayi/shared';
import { defaultNotificationPreferences, loadNotificationPreferences, saveNotificationPreferences } from '../../src/lib/notifications';
import { featureFlags } from '../../src/lib/featureFlags';
import * as Haptics from 'expo-haptics';
import { useDisplayPreferences } from '../../src/lib/display-preferences';
import { DISPLAY_CURRENCIES } from '../../src/lib/display-format';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="labelSm" style={{ color: colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowToggle({ label, subtitle, value, onPress }: { label: string; subtitle?: string; value: boolean; onPress?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !onPress }}
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.base,
        backgroundColor: colors.cardBackground,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        gap: spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMd">{label}</Text>
        {subtitle ? <Text variant="caption" style={{ color: colors.textTertiary }}>{subtitle}</Text> : null}
      </View>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: value ? colors.accent : colors.border,
          justifyContent: 'center',
          paddingHorizontal: 3,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.white,
            alignSelf: value ? 'flex-end' : 'flex-start',
          }}
        />
      </View>
    </Pressable>
  );
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ padding: spacing.base, borderRadius: radius.lg, backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.cardBorder, gap: spacing.sm, borderCurve: 'continuous' }}>
      <Text variant="labelMd">{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
                onChange(option.value);
              }}
              style={{ minHeight: 40, minWidth: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.accent : colors.backgroundSecondary }}
            >
              <Text variant="labelSm" style={{ color: selected ? colors.textOnAccent : colors.textSecondary }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const {
    colors,
    spacing,
    radius,
    colorSchemePreference,
    setColorSchemePreference,
  } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const {
    policy,
    preferenceSignals,
    setPersonalizationEnabled,
    clearPreferenceSignals,
  } = useAnalytics();
  const [personalizationSaving, setPersonalizationSaving] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences());
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [displayPreferences, setDisplayPreferences] = useDisplayPreferences();

  useEffect(() => { void loadNotificationPreferences().then(setNotificationPreferences); }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    void supabase.from('user_privacy_settings')
      .select('personalization_enabled')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (typeof data?.personalization_enabled === 'boolean') {
          void setPersonalizationEnabled(data.personalization_enabled);
        }
      });
  }, [setPersonalizationEnabled, user]);

  const togglePersonalization = async () => {
    const next = !policy.personalizationEnabled;
    setPersonalizationSaving(true);
    try {
      await setPersonalizationEnabled(next);
      if (user) await setAssistantPersonalizationEnabled(next);
    } catch (caught) {
      await setPersonalizationEnabled(!next);
      Alert.alert('Could not update personalization', caught instanceof Error ? caught.message : 'Try again shortly.');
    } finally {
      setPersonalizationSaving(false);
    }
  };

  const resetLearnedPreferences = () => Alert.alert(
    'Reset what Outing learned?',
    'This clears inferred preferences from saves, views, likes, dismissals, and accepted recommendations. Your questionnaire answers stay intact.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          void Promise.all([
            clearPreferenceSignals(),
            user ? resetAssistantPersonalization() : Promise.resolve(),
          ]).catch((caught) => Alert.alert('Could not reset preferences', caught instanceof Error ? caught.message : 'Try again shortly.'));
        },
      },
    ],
  );

  const updateNotifications = async (updates: Partial<NotificationPreferences>) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    const next = { ...notificationPreferences, ...updates };
    setNotificationSaving(true);
    try {
      await saveNotificationPreferences(next);
      setNotificationPreferences(next);
    } catch (caught) {
      Alert.alert('Could not update notifications', caught instanceof Error ? caught.message : 'Try again shortly.');
    } finally { setNotificationSaving(false); }
  };

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
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>←</Text>
        </Pressable>
        <Text variant="h2">Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.xl,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
      >
        <Section title="Appearance">
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(['system', 'light', 'dark'] as const).map((preference) => {
              const selected = colorSchemePreference === preference;
              return (
                <Pressable
                  key={preference}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setColorSchemePreference(preference)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? colors.accentLight : colors.surface,
                  }}
                >
                  <Text variant="labelMd" style={{ color: selected ? colors.accent : colors.textPrimary }}>
                    {preference === 'system' ? 'Device' : preference === 'light' ? 'Light' : 'Dark'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Travel display">
          <ChoiceRow
            label="Itinerary time"
            value={displayPreferences.timeFormat}
            options={[{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]}
            onChange={(timeFormat) => setDisplayPreferences({ timeFormat })}
          />
          <ChoiceRow
            label="Temperature"
            value={displayPreferences.temperatureUnit}
            options={[{ value: 'fahrenheit', label: '°F' }, { value: 'celsius', label: '°C' }]}
            onChange={(temperatureUnit) => setDisplayPreferences({ temperatureUnit })}
          />
          <ChoiceRow
            label="Display currency"
            value={displayPreferences.currency}
            options={DISPLAY_CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
            onChange={(currency) => setDisplayPreferences({ currency })}
          />
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            Destination costs are stored in USD. Other currencies are approximate display conversions; provider checkout pages show their own final currency.
          </Text>
        </Section>

        <Section title="Privacy">
          <RowToggle
            label="Learn from my activity"
            subtitle={personalizationSaving
              ? 'Saving your preference…'
              : `Use saves and feedback to improve recommendations${preferenceSignals.length ? ` · ${preferenceSignals.length} learned signals` : ''}`}
            value={policy.personalizationEnabled}
            onPress={personalizationSaving ? undefined : () => void togglePersonalization()}
          />
          <Button size="sm" variant="secondary" onPress={resetLearnedPreferences}>Reset learned preferences</Button>
          <RowToggle label="Share trip activity" subtitle="Show trips on community map" value={false} />
        </Section>

        {featureFlags.outingFullExperienceV1 ? <Section title="Notifications">
          <RowToggle
            label="Active-trip reminders"
            subtitle="Leave-by and itinerary reminders · separate from discovery"
            value={notificationPreferences.activeTripRemindersEnabled}
            onPress={notificationSaving ? undefined : () => void updateNotifications({ activeTripRemindersEnabled: !notificationPreferences.activeTripRemindersEnabled })}
          />
          <RowToggle
            label="Weekly discovery"
            subtitle="One personalized digest · Wednesday at 6 p.m. · quiet hours 9 p.m.–8 a.m."
            value={notificationPreferences.discoveryDigestEnabled}
            onPress={notificationSaving ? undefined : () => void updateNotifications({ discoveryDigestEnabled: !notificationPreferences.discoveryDigestEnabled })}
          />
        </Section> : null}

        <Section title="Data">
          <View
            style={{
              padding: spacing.base,
              backgroundColor: colors.backgroundSecondary,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              gap: spacing.xs,
            }}
          >
            <Text variant="labelMd">Travel data</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Outing combines reviewed destination context with current results for places, events, routes, fares, stays, and experiences when available.
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => router.push('/settings/integrations')}
            >
              See travel connections
            </Button>
          </View>
          {featureFlags.outingFullExperienceV1 ? <Button size="sm" variant="secondary" onPress={() => router.push('/settings/visit-history' as Href)}>Private visit history</Button> : null}
        </Section>

        <Section title="Account">
          {user ? (
            <>
              <View
                style={{
                  padding: spacing.base,
                  backgroundColor: colors.backgroundSecondary,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: spacing.xs,
                }}
              >
                <Text variant="labelMd">Account deletion</Text>
                <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
                  Permanently delete your account, trips you organize, preferences, saved places, conversations, and private activity. Outing will show everything affected before you confirm.
                </Text>
                <Button
                  size="sm"
                  variant="danger"
                  onPress={() => router.push('/account-deletion' as Href)}
                >
                  Delete account
                </Button>
              </View>
              <Button variant="secondary" onPress={signOut}>Sign out</Button>
            </>
          ) : (
            <Button onPress={() => router.push('/auth/login')}>Sign in</Button>
          )}
        </Section>
      </ScrollView>
    </View>
  );
}
