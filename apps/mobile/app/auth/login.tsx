import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';

export default function LoginScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithMagicLink, signInWithApple } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMagicLink = async () => {
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await signInWithMagicLink(email.trim().toLowerCase());
      if (res.error) { setError(res.error); } else { setSent(true); router.back(); }
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await signInWithApple();
      if (res.error) { setError(res.error); } else { router.back(); }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Close button */}
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, alignItems: 'flex-end' }}>
        <Pressable onPress={() => router.back()} style={{ padding: spacing.sm }}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          flex: 1,
          paddingHorizontal: spacing['2xl'],
          paddingBottom: insets.bottom + spacing['4xl'],
          justifyContent: 'center',
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Text variant="displayMd" style={{ textAlign: 'center' }}>Gay-i</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Sign in to save trips and sync across devices.
          </Text>
        </View>

        {/* Magic link form */}
        <View style={{ gap: spacing.md }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              backgroundColor: colors.backgroundSecondary,
              borderWidth: 1,
              borderColor: error ? colors.error ?? '#B83232' : colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              color: colors.textPrimary,
              fontSize: 16,
            }}
          />
          {error ? <Text variant="caption" style={{ color: colors.error ?? '#B83232' }}>{error}</Text> : null}
          <Button size="lg" fullWidth loading={loading} onPress={handleMagicLink}>
            Continue with email
          </Button>
        </View>

        {/* Divider */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text variant="caption" style={{ color: colors.textTertiary }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        {/* Apple sign in */}
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleApple}
        >
          Sign in with Apple
        </Button>

        {/* Browse without account */}
        <Button variant="ghost" fullWidth onPress={() => router.back()}>
          Browse without account
        </Button>

        <Text variant="caption" style={{ color: colors.textTertiary, textAlign: 'center' }}>
          By continuing you agree to our Terms & Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
