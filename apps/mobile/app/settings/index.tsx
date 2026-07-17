import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';

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

function RowToggle({ label, subtitle, value }: { label: string; subtitle?: string; value: boolean }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
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
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

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
        <Section title="Privacy">
          <RowToggle label="Anonymous analytics" subtitle="Help improve Gay-i" value={false} />
          <RowToggle label="Share trip activity" subtitle="Show trips on community map" value={false} />
        </Section>

        <Section title="Notifications">
          <RowToggle label="Trip reminders" subtitle="Upcoming departure alerts" value={true} />
          <RowToggle label="Pride event alerts" subtitle="Events near saved destinations" value={false} />
        </Section>

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
            <Text variant="labelMd">Data source</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              All destination data is sample editorial content. No live data is currently loaded.
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => router.push('/settings/integrations')}
            >
              Manage integrations
            </Button>
          </View>
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
                  To request account deletion, contact support. All local trip data will be removed from this device when you sign out.
                </Text>
              </View>
              <Button variant="danger" onPress={signOut}>Sign out</Button>
            </>
          ) : (
            <Button onPress={() => router.push('/auth/login')}>Sign in</Button>
          )}
        </Section>
      </ScrollView>
    </View>
  );
}
