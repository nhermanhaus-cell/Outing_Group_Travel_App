import React from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { Typography } from '../../src/theme/tokens';

interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: keyof Typography;
  color?: string;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export function Text({
  variant = 'bodyMd',
  color,
  style,
  children,
  ...rest
}: TextProps) {
  const { colors, typography } = useTheme();
  const variantStyle = typography[variant];

  return (
    <RNText
      style={[variantStyle, { color: color ?? colors.textPrimary }, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
