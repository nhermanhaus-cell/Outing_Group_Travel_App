import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth, useTrips } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { GlamourSelector } from '../../components/ui/GlamourSelector';
import { AuthGate } from '../../components/ui/AuthGate';
import type { ActivityPace, GlamourLevel } from '@gayi/shared';

export default function NewTripScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { createTrip } = useTrips();
  const params = useLocalSearchParams<{
    destinationSlug?: string;
    destinationName?: string;
    lodgingAddress?: string;
    activityPace?: ActivityPace;
  }>();

  const [gateVisible, setGateVisible] = useState(!user);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: params.destinationName ? `${params.destinationName} trip` : '',
    destinationSlug: params.destinationSlug ?? '',
    destinationName: params.destinationName ?? '',
    startDate: '',
    endDate: '',
    origin: '',
    travelers: 2,
    glamourLevel: 'comfortably_fabulous' as GlamourLevel,
    budget: '',
    lodgingAddress: params.lodgingAddress ?? '',
    activityPace:
      params.activityPace === 'packed' ||
      params.activityPace === 'balanced' ||
      params.activityPace === 'downtime'
        ? params.activityPace
        : undefined,
  });

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleCreate = async () => {
    if (!user) { setGateVisible(true); return; }
    setLoading(true);
    try {
      const trip = await createTrip({
        name: form.name || 'Untitled trip',
        destinationSlug: form.destinationSlug || undefined,
        destinationName: form.destinationName || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        origin: form.origin || undefined,
        travelers: form.travelers,
        glamourLevel: form.glamourLevel,
        budget: form.budget ? parseInt(form.budget, 10) : undefined,
        lodgingAddress: form.lodgingAddress || undefined,
        activityPace: form.activityPace,
        members: [{ id: user.id, displayName: user.displayName ?? user.email, role: 'owner' }],
      });
      router.replace(`/trips/${trip.tripId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
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
          <Text variant="h3">New trip</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: insets.bottom + 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Trip name">
            <StyledInput
              value={form.name}
              onChangeText={(v) => set('name', v)}
              placeholder="e.g. Summer in Barcelona"
            />
          </Field>

          <Field label="Destination" optional>
            <StyledInput
              value={form.destinationName}
              onChangeText={(v) => set('destinationName', v)}
              placeholder="e.g. Barcelona"
            />
          </Field>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Start date" optional>
                <StyledInput
                  value={form.startDate}
                  onChangeText={(v) => set('startDate', v)}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="End date" optional>
                <StyledInput
                  value={form.endDate}
                  onChangeText={(v) => set('endDate', v)}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </View>
          </View>

          <Field label="Flying from" optional>
            <StyledInput
              value={form.origin}
              onChangeText={(v) => set('origin', v.toUpperCase())}
              placeholder="Airport code, e.g. LHR"
              autoCapitalize="characters"
            />
          </Field>

          <Field label="Travelers">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Pressable
                onPress={() => set('travelers', Math.max(1, form.travelers - 1))}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text variant="h2">–</Text>
              </Pressable>
              <Text variant="displaySm" style={{ minWidth: 32, textAlign: 'center' }}>{form.travelers}</Text>
              <Pressable
                onPress={() => set('travelers', Math.min(50, form.travelers + 1))}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text variant="h2">+</Text>
              </Pressable>
            </View>
          </Field>

          <Field label="Glamour level">
            <GlamourSelector
              value={form.glamourLevel}
              onChange={(v) => set('glamourLevel', v)}
            />
          </Field>

          <Field label="Total budget (USD)" optional>
            <StyledInput
              value={form.budget}
              onChangeText={(v) => set('budget', v)}
              placeholder="e.g. 5000"
              keyboardType="numeric"
            />
          </Field>

          <Button size="lg" fullWidth loading={loading} onPress={handleCreate}>
            Create trip
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <AuthGate
        visible={gateVisible && !user}
        onDismiss={() => { setGateVisible(false); router.back(); }}
        reason="Sign in to create and save trips."
      />
    </>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'baseline' }}>
        <Text variant="labelMd" style={{ color: colors.textSecondary }}>{label}</Text>
        {optional ? <Text variant="caption" style={{ color: colors.textTertiary }}>(optional)</Text> : null}
      </View>
      {children}
    </View>
  );
}

function StyledInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors, spacing, radius } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      style={{
        backgroundColor: colors.backgroundSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        color: colors.textPrimary,
        fontSize: 15,
      }}
      {...props}
    />
  );
}
