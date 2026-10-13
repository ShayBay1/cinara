import { Anton_400Regular } from '@expo-google-fonts/anton';
import { Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { ArrivalLight } from '@/components/launch/ArrivalLight';
import { LaunchIntro } from '@/components/launch/LaunchIntro';
import { useLaunch } from '@/store/launch';

import { lockUpright } from '@/lib/orientationLock';
import { colors } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();
lockUpright();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }),
  );
  const [fontsLoaded, fontError] = useFonts({
    Anton_400Regular,
    Cinzel_700Bold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  // The opening (the reel's window opens onto the Feed) plays on every cold start; the native splash
  // shows the same reel, and stays up until the opening's first frame is ready.
  const [introReady, setIntroReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const onIntroReady = useCallback(() => setIntroReady(true), []);
  const phase = useLaunch((s) => s.phase);
  const setPhase = useLaunch((s) => s.setPhase);
  const onIntroDone = useCallback(() => {
    setIntroDone(true);
    setPhase('arriving');
  }, [setPhase]);
  const onArrived = useCallback(() => setPhase('done'), [setPhase]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && (introReady || introDone)) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, introReady, introDone]);

  useNotificationDeepLinks();

  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.ink },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="show/[showId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="watch/[showId]/[episode]"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="live/[showId]"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="comments/[showId]/[episode]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="join" options={{ presentation: 'modal' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
          <Stack.Screen name="search" options={{ animation: 'fade' }} />
          <Stack.Screen name="cast/[showId]/[index]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="resume/[showId]/[episode]"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
        </Stack>
      </QueryClientProvider>
      {phase !== 'done' ? <ArrivalLight go={phase === 'arriving'} onDone={onArrived} /> : null}
      {introDone ? null : <LaunchIntro onReady={onIntroReady} onDone={onIntroDone} />}
    </View>
  );
}

/** Opens the live premiere when someone taps a premiere reminder. */
function useNotificationDeepLinks() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
