import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../components/ui/Text';

export default function NotFoundScreen() {
  const { colors, spacing } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <Text variant="displaySm" style={{ color: colors.textTertiary }}>404</Text>
        <Text variant="h3">This screen doesn't exist.</Text>
        <Link href="/" style={{ marginTop: spacing.md }}>
          <Text variant="labelLg" style={{ color: colors.accent }}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}
