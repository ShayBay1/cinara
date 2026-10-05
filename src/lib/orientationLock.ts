import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

/**
 * The app always stays upright. The phone's own rotation would snap the whole screen around (and fight
 * the player's smooth turn), so we lock it here, at startup, on phones and tablets. Only the player and
 * live premieres turn, and they do it themselves with the motion sensor.
 */
export function lockUpright() {
  if (Platform.OS === 'web') return;
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
}

