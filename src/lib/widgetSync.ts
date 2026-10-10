import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { Show } from '@/data';
import {
  AFTER_CHAT_MS,
  DOORS_OPEN_MS,
  LIVE_WINDOW_MS,
  premiereStage,
  upcomingPremieres,
} from '@/lib/premieres';
import { capitalize, dayLabel } from '@/lib/schedule';
import type { PremiereActivityProps } from '@/widgets/PremiereActivity';
import type { TonightWidgetProps } from '@/widgets/TonightWidget';

/**
 * Keeps the home-screen widget and the premiere Live Activity in step with the app.
 * Only on iPhone builds that include the widget extension; in Expo Go and on Android it does nothing.
 */
const available = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoWidgets') != null;

/** Live Activities can stay active for up to 8 hours, so only start one inside that window. */
const ACTIVITY_WINDOW_MS = 8 * 60 * 60 * 1000;

function widgets() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  return {
    Tonight: require('@/widgets/TonightWidget')
      .default as import('expo-widgets').Widget<TonightWidgetProps>,
    Premiere: require('@/widgets/PremiereActivity')
      .default as import('expo-widgets').LiveActivityFactory<PremiereActivityProps>,
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

const linkTo = (show: Show) => `snippets://show/${show.id}`;

/** Gives the widget a timeline: one entry now, then one at each moment its text should change. */
export function syncTonightWidget(shows: Show[], now = new Date()) {
  if (!available) return;
  try {
    const { Tonight } = widgets();
    const next = upcomingPremieres(shows, now, 1).slice(0, 3);
    if (!next.length) {
      Tonight.updateSnapshot({ title: '', at: 0, day: '', url: 'snippets://' });
      return;
    }
    const entries: { date: Date; props: TonightWidgetProps }[] = [];
    next.forEach((p, i) => {
      const at = p.at.getTime();
      const props = (when: Date): TonightWidgetProps => ({
        title: p.show.title,
        at,
        day: capitalize(dayLabel(p.at, when)),
        url: linkTo(p.show),
      });
      // Each premiere owns the widget from the end of the previous one's after-chat.
      const prevEnd =
        i === 0 ? now.getTime() : next[i - 1]!.at.getTime() + LIVE_WINDOW_MS + AFTER_CHAT_MS;
      const moments = [prevEnd, startOfDay(p.at), at - DOORS_OPEN_MS, at, at + LIVE_WINDOW_MS];
      for (const m of moments) {
        if (m < prevEnd || m < now.getTime()) continue;
        const when = new Date(m);
        entries.push({ date: when, props: props(when) });
      }
    });
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    Tonight.updateTimeline(entries);
  } catch (e) {
    console.warn('widget sync failed', e);
  }
}

/**
 * The premiere Live Activity for shows with a reminder on: starts once the premiere is within
 * 8 hours, moves through Doors open, Live now and the after-chat, then ends itself.
 */
export async function syncPremiereActivity(shows: Show[], remindedIds: string[], now = new Date()) {
  if (!available) return;
  try {
    const { Premiere } = widgets();
    const running = Premiere.getInstances();
    const reminded = new Set(remindedIds);
    const target = upcomingPremieres(shows, now, 1).find(
      (p) => reminded.has(p.show.id) && p.at.getTime() - now.getTime() < ACTIVITY_WINDOW_MS,
    );
    const stage = target ? premiereStage(target.at, now) : null;
    const done =
      !target ||
      (stage === 'after' && now.getTime() > target.at.getTime() + LIVE_WINDOW_MS + AFTER_CHAT_MS);

    if (done) {
      await Promise.all(running.map((a) => a.end('default')));
      return;
    }
    const props: PremiereActivityProps = {
      title: target.show.title,
      at: target.at.getTime(),
      stage: stage!,
    };
    const endAt = new Date(target.at.getTime() + LIVE_WINDOW_MS + AFTER_CHAT_MS);
    if (running.length) {
      const [first, ...extra] = running;
      await first!.update(props, endAt);
      await Promise.all(extra.map((a) => a.end('immediate')));
    } else {
      Premiere.start(props, `snippets://live/${target.show.id}`, endAt);
    }
  } catch (e) {
    console.warn('live activity sync failed', e);
  }
}

function startOfDay(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.getTime();
}
