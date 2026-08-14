import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/ui/Text';
import { OutingIcon, type OutingIconName } from '../../components/ui/OutingIcon';
import { useTheme } from '../../src/theme/ThemeProvider';

const SERVICES: Array<{
  icon: OutingIconName;
  title: string;
  description: string;
  detail: string;
  accent: 'coral' | 'pool' | 'plum';
}> = [
  {
    icon: 'route',
    title: 'Maps & places',
    description: 'Routes, neighborhoods, restaurants, and map-ready stops.',
    detail: 'Outing verifies place results before adding them to a recommendation.',
    accent: 'pool',
  },
  {
    icon: 'spark',
    title: 'Events & experiences',
    description: 'Current events and bookable activities that fit the trip.',
    detail: 'Partner results open on the provider’s site. Outing may earn a commission.',
    accent: 'coral',
  },
  {
    icon: 'trips',
    title: 'Stays & fares',
    description: 'Indicative flight windows and stay ideas for selected dates.',
    detail: 'Prices can change. Outing asks you to verify the live offer before booking.',
    accent: 'plum',
  },
  {
    icon: 'ask',
    title: 'Ask Outing',
    description: 'Conversational planning grounded in the same trip services.',
    detail: 'It never books or changes a plan without your review.',
    accent: 'pool',
  },
];

export default function TravelConnectionsScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: colors.textSecondary }}>‹</Text>
        </Pressable>
        <View>
          <Text variant="h2">Travel connections</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>How Outing completes your plan</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + spacing['4xl'] }}
      >
        <View style={{ padding: spacing.lg, borderRadius: radius['2xl'], backgroundColor: colors.plum, gap: spacing.sm }}>
          <Text variant="h2" style={{ color: colors.white }}>One plan, current details.</Text>
          <Text variant="bodyMd" style={{ color: 'rgba(255,255,255,0.78)' }}>
            Outing brings travel services into the planning flow so you can compare ideas without losing the shape of the trip.
          </Text>
        </View>

        {SERVICES.map((service) => {
          const accent = service.accent === 'pool' ? colors.pool : service.accent === 'plum' ? colors.plum : colors.accent;
          const tint = service.accent === 'pool' ? colors.poolLight : service.accent === 'plum' ? colors.plumLight : colors.accentLight;
          return (
            <View key={service.title} style={{ padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
                  <OutingIcon name={service.icon} color={accent} size={23} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3">{service.title}</Text>
                  <Text variant="bodySm" style={{ color: colors.textSecondary }}>{service.description}</Text>
                </View>
              </View>
              <Text variant="caption" style={{ color: colors.textTertiary }}>{service.detail}</Text>
            </View>
          );
        })}

        <View style={{ padding: spacing.base, borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary }}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Your account controls trip access. Provider credentials stay on Outing’s protected server and are never stored in the mobile app.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
