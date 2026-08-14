import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/providers/AppProviders';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';

export default function LoginScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithMagicLink, signInWithApple, signInWithGoogle } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const handleMagicLink = async () => {
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await signInWithMagicLink(email.trim().toLowerCase(), returnTo);
      if (res.error) { setError(res.error); } else { setSent(true); }
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await signInWithApple();
      if (res.cancelled) return;
      if (res.error) { setError(res.error); } else { router.replace((returnTo as never) || '/'); }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await signInWithGoogle();
      if (res.cancelled) return;
      if (res.error) { setError(res.error); } else { router.replace((returnTo as never) || '/'); }
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
          <Text variant="displayMd" style={{ textAlign: 'center' }}>Outing</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Sign in to save trips and sync across devices.
          </Text>
        </View>

        {/* Magic link form */}
        {sent ? <View style={{ gap: spacing.md, alignItems: 'center' }}><Text variant="h2">Check your email</Text><Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>Open the secure Outing link on this device to finish signing in.</Text><Button variant="ghost" onPress={() => setSent(false)}>Use another email</Button></View> : <View style={{ gap: spacing.md }}>
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
        </View>}

        {appleAvailable ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text variant="caption" style={{ color: colors.textTertiary }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
          <View pointerEvents={loading ? 'none' : 'auto'} style={{ opacity: loading ? 0.55 : 1 }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.md}
              style={{ width: '100%', height: 52 }}
              onPress={handleApple}
            />
          </View>
        </> : null}

        <Button
          size="lg"
          variant="secondary"
          fullWidth
          loading={loading}
          onPress={handleGoogle}
        >
          Continue with Google
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
