import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary. Few, meaningful taps: never on every touch.
 * - tap: a press that does something (a light knock).
 * - pick: choosing between options (the selection tick).
 * - success: something you'll be glad of later (a reminder set, a show picked up).
 * - develop: sepia turning to colour (a soft, low knock).
 * - live: the premiere going live (a firm double knock).
 */
const native = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn: () => Promise<void>) => {
  if (native) void fn().catch(() => undefined);
};

export const haptic = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  pick: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  develop: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  live: () =>
    safe(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise((r) => setTimeout(r, 120));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }),
};
