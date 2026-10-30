import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Button, T } from '@/components/ui';
import { api } from '@/data';
import { finishFromUrl } from '@/lib/auth';
import { colors } from '@/theme/tokens';

/** Where Google sign-in lands (web redirect, or a cold-started deep link). */
export default function AuthCallback() {
  const qc = useQueryClient();
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const href = Platform.OS === 'web' ? window.location.href : url;
        // The in-app sheet usually finishes sign-in itself; only finish here if needed.
        if (!(await api.currentUser()) && href && /[?#&](code|access_token|error_description)=/.test(href)) await finishFromUrl(href);
        await qc.invalidateQueries();
        const me = await api.currentUser();
        if (!alive) return;
        if (me && /^user[0-9a-f]{8}$/.test(me.handle)) router.replace({ pathname: '/settings', params: { pick: '1' } });
        else router.replace('/');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Sign-in didn’t finish.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, qc]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      {error ? (
        <>
          <T style={{ textAlign: 'center' }}>{error}</T>
          <Button label="Try again" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <ActivityIndicator color={colors.gold} />
      )}
    </View>
  );
}
