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
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { ConnectionBanner, useConnection } from '@/components/ConnectionBanner';
import { LaunchIntro } from '@/components/launch/LaunchIntro';
import { useLaunch } from '@/store/launch';

import { useMe } from '@/hooks/queries';
import { lockUpright } from '@/lib/orientationLock';
import { useScreenProtection } from '@/lib/screenProtection';
import { pullProgress, registerForPush, startProgressSync } from '@/lib/sync';
import { useTimeManagement } from '@/store/wellbeing';
import { colors } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();
lockUpright();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
        queryCache: new QueryCache({
          // Network-looking failures show the app-wide banner; any success clears it.
          onError: (e) => {
            if (/network|fetch|timed? ?out|offline|failed to fetch/i.test(e instanceof Error ? e.message : String(e)))
              useConnection.getState().setDown(true);
          },
          onSuccess: () => {
            if (useConnection.getState().down) useConnection.getState().setDown(false);
          },
        }),
      }),
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
  // The admin pages (web, /admin) skip the opening.
  const [introDone, setIntroDone] = useState(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'),
  );
  const onIntroReady = useCallback(() => setIntroReady(true), []);
  const setPhase = useLaunch((s) => s.setPhase);
  // The window opens onto the Feed (its entrance starts), clears the screen, then the sound ends.
  const onIntroOpen = useCallback(() => setPhase('arriving'), [setPhase]);
  const onIntroRevealed = useCallback(() => setPhase('done'), [setPhase]);
  const onIntroDone = useCallback(() => setIntroDone(true), []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && (introReady || introDone)) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, introReady, introDone]);

  useNotificationDeepLinks();
  useScreenProtection();

  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <QueryClientProvider client={queryClient}>
        <AccountSync />
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
          <Stack.Screen name="earnings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="actor/[handle]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="post/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="post/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="room/[showId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="messages/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="messages/[threadId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="creator" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="backstage" options={{ presentation: 'modal' }} />
          <Stack.Screen name="people" options={{ animation: 'fade' }} />
          <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notification-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="time-management" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="your-activity" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="analytics" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="channel/[handle]/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="channel/[handle]/[messageId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="admin" />
          <Stack.Screen
            name="resume/[showId]/[episode]"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
        </Stack>
        <ConnectionBanner />
      </QueryClientProvider>
      {introDone ? null : (
        <LaunchIntro
          onReady={onIntroReady}
          onOpen={onIntroOpen}
          onRevealed={onIntroRevealed}
          onFinished={onIntroDone}
        />
      )}
    </View>
  );
}

/** Starts progress sync and pulls the account's progress whenever someone signs in. */
function AccountSync() {
  const me = useMe();
  useEffect(() => {
    startProgressSync();
  }, []);
  useEffect(() => {
    if (me.data?.id) void pullProgress();
    // Signed in: this phone gets pushes for likes, comments, follows, messages and premieres.
    if (me.data?.id) void registerForPush();
  }, [me.data?.id]);
  useTimeManagement();
  return null;
}

/** Opens the live premiere when someone taps a premiere reminder. */
function useNotificationDeepLinks() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const raw = response?.notification.request.content.data?.url;
      // Server pushes may send cinara://live/... ; local reminders send /live/...
      const url = typeof raw === 'string' ? raw.replace(/^cinara:\/\//, '/') : null;
      if (url && url.startsWith('/')) router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
