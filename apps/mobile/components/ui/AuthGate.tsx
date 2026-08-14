import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { useAuth } from '../../src/providers/AppProviders';

interface AuthGateProps {
  visible: boolean;
  onDismiss: () => void;
  reason?: string;
}

export function AuthGate({ visible, onDismiss, reason = 'Sign in to continue' }: AuthGateProps) {
  const { colors, spacing, radius, shadows } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  if (user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onDismiss} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            padding: spacing['2xl'],
            gap: spacing.lg,
            ...shadows.lg,
          }}
        >
          <Text variant="h2" style={{ textAlign: 'center' }}>Create an account</Text>
          <Text variant="bodyMd" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {reason}
          </Text>
          <Button
            fullWidth
            onPress={() => {
              onDismiss();
              router.push('/auth/login');
            }}
          >
            Sign in / Create account
          </Button>
          <Button variant="ghost" fullWidth onPress={onDismiss}>
            Browse without account
          </Button>
        </View>
      </View>
    </Modal>
  );
}
