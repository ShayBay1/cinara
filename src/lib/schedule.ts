/**
 * Premiere schedule math. New episodes arrive in drops of 10, one drop each
 * release day at 8 PM Eastern ("8/7c"). All functions take `now` so they are
 * pure and testable, and they work in any device time zone.
 */

export const PREMIERE_TZ = 'America/New_York';
export const PREMIERE_HOUR = 20;
export const SLOT_LABEL = '8/7c';

/** Episodes released together at each premiere. A 60-episode season is 6 drops. */
export const DROP_SIZE = 10;

export interface Drop {
  /** 1-based drop number within the season. */
  number: number;
  from: number;
  to: number;
}

/** The drop an episode belongs to (episodes 1-10 = drop 1, 11-20 = drop 2...). */
export function dropOf(episode: number, episodeCount = Number.MAX_SAFE_INTEGER): Drop {
  const number = Math.max(1, Math.ceil(episode / DROP_SIZE));
  const from = (number - 1) * DROP_SIZE + 1;
  return { number, from, to: Math.min(episodeCount, from + DROP_SIZE - 1) };
}

/** The next unreleased drop, or null when the season is complete. */
export function nextDrop(latestEpisode: number, episodeCount: number): Drop | null {
  if (latestEpisode >= episodeCount) return null;
  const drop = dropOf(latestEpisode + 1, episodeCount);
  // Normally drops start on a boundary; if one was cut short, pick up where it left off.
  return { ...drop, from: latestEpisode + 1 };
}

/** "Eps 21–30", or "Ep 60" for a one-episode drop. */
export function dropLabel(drop: Drop): string {
  return drop.from === drop.to ? `Ep ${drop.from}` : `Eps ${drop.from}–${drop.to}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PREMIERE_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
});

/** Wall-clock parts of an instant in Eastern Time. */
export function easternParts(date: Date): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: SHORT.indexOf((out.weekday ?? 'Sun') as (typeof SHORT)[number]),
  };
}

/** The UTC instant for a wall-clock time in Eastern Time (handles daylight saving). */
export function easternToInstant(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Offset = how far Eastern wall time is from UTC at that moment.
  const offsetAt = (ms: number) => {
    const p = easternParts(new Date(ms));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  let instant = guess - offsetAt(guess);
  // Re-check once in case the guess straddled a daylight-saving change.
  instant = guess - offsetAt(instant);
  return new Date(instant);
}

/** The next `count` premiere instants for a show, strictly after `now`. */
export function nextPremieres(releaseDays: readonly number[], now: Date, count = 1): Date[] {
  if (releaseDays.length === 0 || count <= 0) return [];
  const today = easternParts(now);
  const out: Date[] = [];
  for (let offset = 0; out.length < count && offset < 400; offset++) {
    // Walk calendar days in Eastern Time using a noon anchor to avoid DST edges.
    const anchor = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth() + 1;
    const d = anchor.getUTCDate();
    if (!releaseDays.includes(anchor.getUTCDay())) continue;
    const premiere = easternToInstant(y, m, d, PREMIERE_HOUR);
    if (premiere.getTime() > now.getTime()) out.push(premiere);
  }
  return out;
}

/** "tonight", "tomorrow" or a weekday name, judged on the Eastern calendar. */
export function dayLabel(target: Date, now: Date): string {
  const a = easternParts(now);
  const b = easternParts(target);
  const days = Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
  if (days === 0) return 'tonight';
  if (days === 1) return 'tomorrow';
  return WEEKDAYS[b.weekday] ?? '';
}

/** Countdown text: "04:12:33", or "2d 04:12:33" when more than a day away. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d > 0 ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "Mon · Wed · Fri", or "Every Monday" for a show with one drop night. */
export function releaseDaysLabel(releaseDays: readonly number[]): string {
  if (releaseDays.length === 1) return `Every ${WEEKDAYS[releaseDays[0] ?? 0]}`;
  return [...releaseDays].sort((x, y) => x - y).map((d) => SHORT[d] ?? '').join(' · ');
}

/** "10/2" for a premiere date, on the Eastern calendar. */
export function shortDate(date: Date): string {
  const p = easternParts(date);
  return `${p.month}/${p.day}`;
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
