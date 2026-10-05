import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

import type { Show } from '@/data';
import { cancelReminder, scheduleNextPremiere } from '@/lib/reminders';
import { capitalize, dayLabel, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';

/** Turns a show's premiere reminder on or off, and reports what happened. */
export function useReminder(show: Show | undefined) {
  const notificationId = useAppStore((s) => (show ? s.reminders[show.id] : undefined));
  const setReminder = useAppStore((s) => s.setReminder);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    if (!show || busy) return;
    setBusy(true);
    try {
      if (notificationId) {
        await cancelReminder(notificationId);
        setReminder(show.id, null);
        return;
      }
      const result = await scheduleNextPremiere(show);
      if (result.ok) {
        setReminder(show.id, result.notificationId);
        notify('Reminder set', `${show.title}: ${capitalize(dayLabel(result.at, new Date()))} at ${SLOT_LABEL}.`);
      } else if (result.reason === 'denied') {
        notify('Notifications are off', 'Turn on notifications for Snippets in Settings to get premiere reminders.');
      } else if (result.reason === 'unsupported') {
        notify('Reminders live in the app', 'Get the Snippets app to be reminded before each premiere.');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, notificationId, setReminder, show]);

  return { isOn: Boolean(notificationId), toggle, busy };
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    // Alert.alert is a no-op on web; use the browser's dialog there.
    globalThis.alert?.(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}
