import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Show } from '@/data';

import { dropLabel, nextDrop, nextPremieres, SLOT_LABEL } from './schedule';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type ReminderResult =
  | { ok: true; notificationId: string; at: Date }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-schedule' };

/** Schedules a local notification for the show's next 8/7c premiere. */
export async function scheduleNextPremiere(show: Show, now = new Date()): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
  const drop = nextDrop(show.latestEpisode, show.episodeCount);
  const [at] = drop ? nextPremieres(show.releaseDays, now) : [];
  if (!drop || !at) return { ok: false, reason: 'no-schedule' };

  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { ok: false, reason: 'denied' };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${show.title} is live`,
      body: `${dropLabel(drop)} drop now at ${SLOT_LABEL}. Watch all 10 live with everyone.`,
      data: { url: `/live/${show.id}` },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
  return { ok: true, notificationId, at };
}

export async function cancelReminder(notificationId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
