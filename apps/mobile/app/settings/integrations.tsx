import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';
import { Badge } from '../../components/ui/Badge';
import { useIntegrations } from '../../src/providers/AppProviders';
import { getApiKeyStatus } from '../../src/lib/apiKeys';

const PROVIDER_SLOTS = [
  {
    slot: 'destination-data',
    label: 'Destination Data',
    description: 'Source for destination catalog, scores, and LGBTQ+ context.',
    options: [
      { id: 'gayi-sample', label: 'Outing Sample (built-in)', active: true },
      { id: 'supabase', label: 'Supabase (env)', active: false },
    ],
  },
  {
    slot: 'auth',
    label: 'Auth Provider',
    description: 'Authentication backend.',
    options: [
      { id: 'mock', label: 'Mock auth (local)', active: true },
      { id: 'supabase-auth', label: 'Supabase Auth', active: false },
    ],
  },
  {
    slot: 'analytics',
    label: 'Analytics',
    description: 'Optional usage analytics.',
    options: [
      { id: 'none', label: 'None', active: true },
    ],
  },
];

export default function IntegrationsScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { overrides, setOverride, clearOverride } = useIntegrations();
  const apiKeys = getApiKeyStatus();

  const getActive = (slot: string, defaultId: string) => {
    const override = overrides.find((o) => o.slot === slot);
    return override?.pluginId ?? defaultId;
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
        <Text variant="h2">Integrations</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.xl,
          paddingBottom: insets.bottom + spacing['4xl'],
        }}
      >
        <View
          style={{
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.base,
            gap: spacing.sm,
          }}
        >
          <Text variant="labelLg">API keys (runtime)</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            The restricted native Maps SDK key loads through Expo. Places, Routes, Photos, and Viator are served by authenticated Supabase Edge Functions.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Badge
              label={apiKeys.maps ? 'Google Maps keyed' : 'Google Maps missing'}
              variant={apiKeys.maps ? 'success' : 'warning'}
            />
            <Badge
              label={apiKeys.places ? 'Places proxy connected' : 'Places proxy offline'}
              variant={apiKeys.places ? 'success' : 'warning'}
            />
            <Badge
              label={apiKeys.viator ? 'Viator proxy connected' : 'Viator proxy offline'}
              variant={apiKeys.viator ? 'success' : 'warning'}
            />
          </View>
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            App vars: GOOGLE_MAPS_API_KEY plus EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Provider secrets stay server-side.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.base,
            gap: spacing.xs,
          }}
        >
          <Text variant="labelLg">Supabase</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your `.env` to enable live data.
          </Text>
          <Badge label="Offline / Sample mode" variant="warning" />
        </View>

        {PROVIDER_SLOTS.map((slot) => {
          const activeId = getActive(slot.slot, slot.options.find((o) => o.active)?.id ?? '');
          return (
            <View key={slot.slot} style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <Text variant="h3">{slot.label}</Text>
                <Text variant="bodyMd" style={{ color: colors.textSecondary }}>{slot.description}</Text>
              </View>

              <View style={{ gap: spacing.sm }}>
                {slot.options.map((opt) => {
                  const isActive = activeId === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => {
                        if (opt.id === slot.options.find((o) => o.active)?.id) {
                          clearOverride(slot.slot);
                        } else {
                          setOverride(slot.slot, opt.id, true);
                        }
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: spacing.base,
                        borderRadius: radius.lg,
                        borderWidth: 1.5,
                        borderColor: isActive ? colors.accent : colors.border,
                        backgroundColor: isActive ? colors.accentLight : colors.cardBackground,
                      }}
                    >
                      <Text variant="labelLg" style={{ color: isActive ? colors.accent : colors.textPrimary }}>
                        {opt.label}
                      </Text>
                      {isActive ? (
                        <Badge label="Active" variant="accent" />
                      ) : (
                        <Badge label="Inactive" variant="default" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
