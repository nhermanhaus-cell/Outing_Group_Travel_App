import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  darkColors,
  lightColors,
  palette,
  radius,
  shadows,
  spacing,
  typography,
  type Colors,
} from './tokens';

interface Theme {
  colors: Colors;
  palette: typeof palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
  isDark: boolean;
  colorSchemePreference: 'system' | 'light' | 'dark';
  setColorSchemePreference: (preference: 'system' | 'light' | 'dark') => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [colorSchemePreference, setPreference] = useState<'system' | 'light' | 'dark'>('system');
  const isDark = colorSchemePreference === 'system'
    ? scheme === 'dark'
    : colorSchemePreference === 'dark';

  useEffect(() => {
    void AsyncStorage.getItem('outing:appearance').then((value) => {
      if (value === 'system' || value === 'light' || value === 'dark') setPreference(value);
    });
  }, []);

  const setColorSchemePreference = (preference: 'system' | 'light' | 'dark') => {
    setPreference(preference);
    void AsyncStorage.setItem('outing:appearance', preference);
  };

  const theme = useMemo<Theme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      palette,
      spacing,
      radius,
      typography,
      shadows,
      isDark,
      colorSchemePreference,
      setColorSchemePreference,
    }),
    [colorSchemePreference, isDark],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
