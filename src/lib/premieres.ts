import type { Show } from '@/data/types';

import { type Drop, nextDrop, nextPremieres } from './schedule';

/** A show's next premiere: which episodes drop, and when (8 PM Eastern on its drop night). */
export interface Premiere {
  show: Show;
  drop: Drop;
  at: Date;
}

/** How long a premiere counts as "live now" after it starts (a drop of ten short episodes). */
export const LIVE_WINDOW_MS = 45 * 60 * 1000;
/** The lobby opens this long before 8/7c. */
export const DOORS_OPEN_MS = 15 * 60 * 1000;
/** The cast stays in the after-chat this long once the episodes end. */
export const AFTER_CHAT_MS = 15 * 60 * 1000;

/**
 * Where tonight is: counting down, doors open (the lobby), live, or the after-chat.
 * Every screen reads this one clock so Home, Schedule, the show page and the Live tab agree.
 */
export type PremiereStage = 'countdown' | 'doors' | 'live' | 'after';

export function premiereStage(at: Date, now: Date): PremiereStage {
  const left = at.getTime() - now.getTime();
  if (left > DOORS_OPEN_MS) return 'countdown';
  if (left > 0) return 'doors';
  if (-left < LIVE_WINDOW_MS) return 'live';
  return 'after';
}

/**
 * The show's current or next premiere. A premiere stays "current" through its live window and the
 * after-chat, so at 8:00:01 it reads Live now instead of jumping to next week.
 */
export function premiereFor(show: Show, now: Date): Premiere | null {
  const drop = nextDrop(show.latestEpisode, show.episodeCount);
  if (!drop) return null;
  const [at] = nextPremieres(
    show.releaseDays,
    new Date(now.getTime() - LIVE_WINDOW_MS - AFTER_CHAT_MS),
  );
  return at ? { show, drop, at } : null;
}

/** The soonest premiere across every show (the one home features and the Live tab opens). */
export function soonestPremiere(shows: Show[], now: Date): Premiere | null {
  return (
    shows
      .map((s) => premiereFor(s, now))
      .filter((p): p is Premiere => p !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
  );
}

/** Upcoming premieres for the schedule: this week and next, soonest first. */
export function upcomingPremieres(shows: Show[], now: Date, weeks = 2): Premiere[] {
  const out: Premiere[] = [];
  for (const show of shows) {
    const first = nextDrop(show.latestEpisode, show.episodeCount);
    if (!first) continue;
    const dates = nextPremieres(
      show.releaseDays,
      new Date(now.getTime() - LIVE_WINDOW_MS - AFTER_CHAT_MS),
      weeks * Math.max(1, show.releaseDays.length),
    );
    let from = first.from;
    for (const at of dates) {
      if (from > show.episodeCount) break;
      out.push({
        show,
        drop: { number: Math.ceil(from / 10), from, to: Math.min(show.episodeCount, from + 9) },
        at,
      });
      from += 10;
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Hours, minutes, seconds until a moment (zero-padded), or days when it's more than a day away. */
export function countdownParts(ms: number): { days: number; h: string; m: string; s: string } {
  const t = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(t / 86_400);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    days,
    h: pad(Math.floor((t % 86_400) / 3600)),
    m: pad(Math.floor((t % 3600) / 60)),
    s: pad(t % 60),
  };
}

const DAY_PLURAL = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];
/** "Mondays", or "Mondays & Thursdays". */
export function dropNights(show: Show): string {
  return [...show.releaseDays]
    .sort((a, b) => a - b)
    .map((d) => DAY_PLURAL[d] ?? '')
    .join(' & ');
}

/** "Monday", or "Monday & Thursday". */
export function dropNight(show: Show): string {
  return dropNights(show).replace(/s( |$)/g, '$1');
}
