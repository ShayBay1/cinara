import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * No screenshots or screen recordings of Cinara, anywhere in the app, ever.
 *  - iPhone/iPad (iOS 13+) and Android: screenshots and recordings come out blank.
 *  - iPhone: the app is fully blurred in the app switcher and when interrupted (calls, Control Center).
 *  - Android: FLAG_SECURE also blanks the recent-apps preview.
 * Re-applied whenever the app comes back to the foreground. Browsers can't block screenshots,
 * so the web build can't be protected this way.
 */
async function protect() {
  if (Platform.OS === 'web') return;
  try {
    await ScreenCapture.preventScreenCaptureAsync('cinara');
    if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(1);
  } catch (e) {
    console.warn('Screen protection unavailable', e);
  }
}

export function useScreenProtection() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void protect();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void protect();
    });
    return () => sub.remove();
  }, []);
}
