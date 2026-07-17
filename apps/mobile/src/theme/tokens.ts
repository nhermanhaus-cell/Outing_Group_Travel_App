// Gay-i design tokens — editorial travel aesthetic
// Warm charcoal/ink, soft parchment, coral accent

export const palette = {
  // Ink / charcoal
  ink900: '#0F0D0A',
  ink800: '#1A1611',
  ink700: '#2C2620',
  ink600: '#3D352C',
  ink500: '#5C5047',
  ink400: '#7D7169',
  ink300: '#A09690',
  ink200: '#C4BCB6',
  ink100: '#E2DDD9',
  ink50: '#F5F2EF',

  // Parchment / warm white
  parchment50: '#FDFAF6',
  parchment100: '#F7F2EB',
  parchment200: '#EDE4D6',
  parchment300: '#DCCFBC',

  // Coral accent
  coral600: '#B84A32',
  coral500: '#D9553A',
  coral400: '#E8694F',
  coral300: '#F0876F',
  coral200: '#F5B0A0',
  coral100: '#FAD8D0',
  coral50: '#FEF1EE',

  // Semantic
  success: '#3A7D5C',
  successLight: '#D1EAE0',
  warning: '#B87D2A',
  warningLight: '#F5E4C2',
  error: '#B83232',
  errorLight: '#F5D0D0',
  info: '#2A6B8C',
  infoLight: '#C2DCF0',

  // Pure
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ThemeColors = {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  textOnAccent: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  cardBackground: string;
  cardBorder: string;
  skeletonBase: string;
  skeletonHighlight: string;
  overlay: string;
  error: string;
  warning: string;
  warningLight: string;
  coral300: string;
  ink700: string;
  white: string;
};

export const lightColors: ThemeColors = {
  background: palette.parchment50,
  backgroundSecondary: palette.parchment100,
  backgroundTertiary: palette.parchment200,
  surface: palette.white,
  surfaceElevated: palette.white,
  border: palette.parchment300,
  borderSubtle: palette.parchment200,

  textPrimary: palette.ink800,
  textSecondary: palette.ink500,
  textTertiary: palette.ink300,
  textInverse: palette.white,
  textOnAccent: palette.white,

  accent: palette.coral500,
  accentLight: palette.coral50,
  accentMuted: palette.coral200,

  tabBar: palette.white,
  tabBarBorder: palette.parchment300,
  tabBarActive: palette.coral500,
  tabBarInactive: palette.ink300,

  cardBackground: palette.white,
  cardBorder: palette.parchment200,

  skeletonBase: palette.parchment200,
  skeletonHighlight: palette.parchment100,

  overlay: 'rgba(15,13,10,0.5)',

  error: palette.error,
  warning: palette.warning,
  warningLight: palette.warningLight,

  coral300: palette.coral300,
  ink700: palette.ink700,
  white: palette.white,
};

export const darkColors: ThemeColors = {
  background: palette.ink900,
  backgroundSecondary: palette.ink800,
  backgroundTertiary: palette.ink700,
  surface: palette.ink800,
  surfaceElevated: palette.ink700,
  border: palette.ink600,
  borderSubtle: palette.ink700,

  textPrimary: palette.parchment100,
  textSecondary: palette.ink200,
  textTertiary: palette.ink400,
  textInverse: palette.ink900,
  textOnAccent: palette.white,

  accent: palette.coral400,
  accentLight: palette.ink700,
  accentMuted: palette.coral600,

  tabBar: palette.ink800,
  tabBarBorder: palette.ink600,
  tabBarActive: palette.coral400,
  tabBarInactive: palette.ink400,

  cardBackground: palette.ink800,
  cardBorder: palette.ink600,

  skeletonBase: palette.ink700,
  skeletonHighlight: palette.ink600,

  overlay: 'rgba(0,0,0,0.7)',

  error: palette.error,
  warning: palette.warning,
  warningLight: palette.warningLight,

  coral300: palette.coral300,
  ink700: palette.ink700,
  white: palette.white,
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
  '6xl': 80,
} as const;

export const radius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

export const typography = {
  // Display — editorial hero
  displayLg: { fontSize: 40, lineHeight: 46, fontWeight: '800' as const, letterSpacing: -1 },
  displayMd: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.8 },
  displaySm: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.5 },

  // Headings
  h1: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.1 },
  h4: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },

  // Body
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMd: { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  bodySm: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const },

  // Label / UI
  labelLg: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0.1 },
  labelMd: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.2 },
  labelSm: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.4 },

  // Caption
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '400' as const, letterSpacing: 0.2 },
  captionBold: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const, letterSpacing: 0.3 },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export type ColorScheme = 'light' | 'dark';
export type Colors = typeof lightColors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Typography = typeof typography;
