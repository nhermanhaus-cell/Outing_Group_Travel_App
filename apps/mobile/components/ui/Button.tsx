import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  textStyle,
  children,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();

  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.md,
    opacity: isDisabled ? 0.5 : 1,
    ...(fullWidth && { width: '100%' }),
    ...(size === 'sm' && { paddingVertical: spacing.xs, paddingHorizontal: spacing.md }),
    ...(size === 'md' && { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg }),
    ...(size === 'lg' && { paddingVertical: spacing.md, paddingHorizontal: spacing['2xl'] }),
    ...(variant === 'primary' && { backgroundColor: colors.accent }),
    ...(variant === 'secondary' && {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    }),
    ...(variant === 'ghost' && { backgroundColor: 'transparent' }),
    ...(variant === 'danger' && { backgroundColor: colors.error }),
  };

  const labelVariant =
    size === 'sm' ? 'labelMd' : size === 'lg' ? 'labelLg' : 'labelLg';

  const labelColor =
    variant === 'primary' || variant === 'danger'
      ? colors.textOnAccent
      : variant === 'ghost'
      ? colors.accent
      : colors.textPrimary;

  return (
    <Pressable
      style={({ pressed }) => [containerStyle, { opacity: pressed && !isDisabled ? 0.8 : isDisabled ? 0.5 : 1 }, style]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <Text variant={labelVariant} style={[{ color: labelColor }, textStyle]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
