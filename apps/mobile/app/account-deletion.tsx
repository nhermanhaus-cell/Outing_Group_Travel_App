import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Text } from '../components/ui/Text';
import { useAuth } from '../src/providers/AppProviders';
import { useTheme } from '../src/theme/ThemeProvider';

export default function AccountDeletionScreen() {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading, deleteAccount } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [appleManualRevokeRequired, setAppleManualRevokeRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmation !== 'DELETE' || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteAccount();
    if (result.cancelled) {
      setDeleting(false);
      return;
    }
    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    setAppleManualRevokeRequired(result.appleManualRevokeRequired === true);
    setDeleted(true);
    setDeleting(false);
  };

  if (deleted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background }}>
        <View style={{ gap: spacing.md, alignItems: 'center' }}>
          <Text variant="displaySm" style={{ textAlign: 'center' }}>Your account is deleted</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Your Outing account and associated data have been permanently removed. You can still browse as a guest.
          </Text>
          {appleManualRevokeRequired ? (
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                One final Apple step: in your Apple Account, open Sign-In &amp; Security → Sign in with Apple → Outing, then choose Stop Using Sign in with Apple.
              </Text>
              <Button
                variant="secondary"
                onPress={() => void Linking.openURL('https://account.apple.com')}
              >
                Open Apple Account
              </Button>
            </View>
          ) : null}
          <Button size="lg" onPress={() => router.replace('/welcome')}>Return to Outing</Button>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xl,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing['4xl'],
          gap: spacing.xl,
          maxWidth: 680,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: spacing.sm }}>
          <Text variant="displaySm">Delete your Outing account</Text>
          <Text variant="bodyLg" style={{ color: colors.textSecondary }}>
            This is permanent. Outing cannot restore your account after deletion.
          </Text>
        </View>

        <View
          style={{
            gap: spacing.sm,
            padding: spacing.lg,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.backgroundSecondary,
          }}
        >
          <Text variant="h3">What will be removed</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            Your profile, preferences, saved destinations, Ask Outing conversations, private visit history, inspiration imports, notification tokens, analytics identifiers, and trips you own.
          </Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            If you joined someone else&apos;s trip, your membership, votes, comments, and preference responses are removed while their trip remains available.
          </Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
            Trips you organize are deleted for every member. Ask members to copy anything they need first.
          </Text>
        </View>

        {loading ? (
          <Text variant="bodyMd" style={{ color: colors.textSecondary }}>Checking your account…</Text>
        ) : !user ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Verify your identity</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Sign in with the Outing account you want to delete. This page works on the web; you do not need to reinstall the app.
            </Text>
            <Button
              size="lg"
              onPress={() => router.push({ pathname: '/auth/login', params: { returnTo: '/account-deletion' } })}
            >
              Sign in to continue
            </Button>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Text variant="h3">Confirm deletion</Text>
            <Text variant="bodyMd" style={{ color: colors.textSecondary }}>
              Signed in as {user.email}. Type DELETE to permanently delete this account.
            </Text>
            <TextInput
              accessibilityLabel="Type DELETE to confirm account deletion"
              value={confirmation}
              onChangeText={(value) => setConfirmation(value.toUpperCase())}
              placeholder="Type DELETE"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: error ? colors.error : colors.border,
                backgroundColor: colors.backgroundSecondary,
                color: colors.textPrimary,
                fontSize: 16,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
              }}
            />
            {error ? <Text variant="bodyMd" style={{ color: colors.error }}>{error}</Text> : null}
            {user.providers?.includes('apple') && Platform.OS === 'ios' ? (
              <View
                pointerEvents={confirmation === 'DELETE' && !deleting ? 'auto' : 'none'}
                style={{ opacity: confirmation === 'DELETE' && !deleting ? 1 : 0.45 }}
              >
                <Text variant="caption" style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
                  Continue with Apple to verify your identity and finish deletion.
                </Text>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.md}
                  style={{ width: '100%', height: 52 }}
                  onPress={() => void handleDelete()}
                />
              </View>
            ) : (
              <Button
                variant="danger"
                size="lg"
                fullWidth
                loading={deleting}
                disabled={confirmation !== 'DELETE'}
                accessibilityHint="Permanently deletes your Outing account and associated data"
                onPress={() => void handleDelete()}
              >
                Delete account permanently
              </Button>
            )}
          </View>
        )}

        <Button variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/welcome')}>
          Cancel
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
