import * as Calendar from 'expo-calendar';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import type { Show } from '@/data';

import { dropLabel, nextDrop, nextPremieres, SLOT_LABEL } from './schedule';

/** How long a premiere's calendar event lasts: the ten-episode drop plus the after-chat. */
const PREMIERE_MINUTES = 60;

export type CalendarCardResult = 'saved' | 'canceled' | 'unavailable';

/** The show's next premiere time and drop, or null when nothing is scheduled. */
export function nextPremiere(show: Show, now = new Date()) {
  const drop = nextDrop(show.latestEpisode, show.episodeCount);
  const [at] = drop ? nextPremieres(show.releaseDays, now) : [];
  return drop && at ? { drop, at } : null;
}

/**
 * Opens the phone's own "Add event" card (Apple Calendar on iPhone, the calendar app on Android),
 * filled in with the premiere: title, start time in the viewer's time zone, alerts 15 and 5 minutes
 * before, and a link that opens the live room in Snippets. The viewer just taps Add.
 */
export async function addPremiereToCalendar(
  show: Show,
  now = new Date(),
): Promise<CalendarCardResult> {
  if (Platform.OS === 'web') return 'unavailable';
  const next = nextPremiere(show, now);
  if (!next) return 'unavailable';
  const link = Linking.createURL(`/live/${show.id}`);
  try {
    const result = await Calendar.createEventInAppAsync({
      title: `${show.title} · live premiere`,
      startDate: next.at,
      endDate: new Date(next.at.getTime() + PREMIERE_MINUTES * 60 * 1000),
      location: 'Snippets app',
      url: link,
      notes: `${dropLabel(next.drop)} premiere live at ${SLOT_LABEL}, with the cast in the chat.\n\nOpen the premiere: ${link}`,
      alarms: [{ relativeOffset: -15 }, { relativeOffset: -5 }],
    });
    // iPhone reports what the viewer chose; Android only says the card closed ("done").
    if (result.action === 'canceled' || result.action === 'deleted') return 'canceled';
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
