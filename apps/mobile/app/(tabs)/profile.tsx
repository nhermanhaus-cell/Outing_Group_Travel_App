import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';

interface RowLinkProps {
  label: string;
  subtitle?: string;
  onPress: () => void;
}

function RowLink({ label, subtitle, onPress }: RowLinkProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.base,
        backgroundColor: colors.cardBackground,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: radius.lg,
        opacity: pressed ? 0.8 : 1,
        gap: spacing.sm,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMd">{label}</Text>
        {subtitle ? (
          <Text variant="caption" style={{ color: colors.textTertiary }}>{subtitle}</Text>
        ) : null}
      </View>
      <Text style={{ color: colors.textTertiary, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { colors, spacing } = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.base,
        paddingHorizontal: spacing.base,
        paddingBottom: insets.bottom + spacing['4xl'],
        gap: spacing.xl,
      }}
    >
      <Text variant="h1">Profile</Text>

      {/* Account status */}
      <View
        style={{
          padding: spacing.lg,
          backgroundColor: colors.backgroundSecondary,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          gap: spacing.md,
        }}
      >
        {user ? (
          <>
            <View style={{ gap: spacing.xs }}>
              <Text variant="h3">{user.displayName ?? user.email}</Text>
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{user.email}</Text>
            </View>
            <Button variant="secondary" size="sm" onPress={signOut}>Sign out</Button>
          </>
        ) : (
          <>
            <Text variant="h3">Not signed in</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Sign in to sync trips and access all features.
            </Text>
            <Button onPress={() => router.push('/auth/login')}>Sign in</Button>
          </>
        )}
      </View>

      {/* Links */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="labelMd" style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
          Account
        </Text>
        <RowLink
          label="Integrations"
          subtitle="Manage provider plug-ins"
          onPress={() => router.push('/settings/integrations')}
        />
        <RowLink
          label="Settings"
          subtitle="Privacy, notifications"
          onPress={() => router.push('/settings')}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="labelMd" style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
          About
        </Text>
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
          <Text variant="labelMd">Outing MVP</Text>
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            Destination data is editorial sample data. Not live.
          </Text>
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            v0.1.0 · editorial_demo
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
