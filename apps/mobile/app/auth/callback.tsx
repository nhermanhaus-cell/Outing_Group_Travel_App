import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../components/ui/Text';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; access_token?: string; refresh_token?: string; returnTo?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [message, setMessage] = useState('Signing you in…');
  useEffect(() => {
    void (async () => {
      if (!supabase) { setMessage('Supabase is not configured.'); return; }
      const result = params.code
        ? await supabase.auth.exchangeCodeForSession(params.code)
        : params.access_token && params.refresh_token
          ? await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token })
          : { error: new Error('Missing sign-in token') };
      if (result.error) { setMessage(result.error.message); return; }
      router.replace((params.returnTo as never) || '/');
    })();
  }, [params.access_token, params.code, params.refresh_token, params.returnTo, router]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><Text variant="bodyLg">{message}</Text></View>;
}
