import { router } from 'expo-router';

import { useAppStore } from '@/store/useAppStore';

/** Seconds in: less than this and there's nothing to resume. */
const MIN_RESUME_SEC = 5;
/** Within this many seconds of the end counts as finished. */
const END_SLACK_SEC = 10;

/** Where you left off in this episode (seconds), or null if there's nothing to resume. */
export function resumePoint(showId: string, episode: number): number | null {
  const p = useAppStore.getState().progress[showId];
  if (!p || p.episode !== episode || p.positionSec < MIN_RESUME_SEC) return null;
  if (p.durationSec && p.positionSec > p.durationSec - END_SLACK_SEC) return null;
  return p.positionSec;
}

/** Opens the player at the saved spot (the player resumes from the saved position by itself). */
export function resumeEpisode(showId: string, episode: number) {
  router.push({
    pathname: '/watch/[showId]/[episode]',
    params: { showId, episode: String(episode) },
  });
}

/** Clears the saved spot for this episode, then opens the player at the start. */
export function startOver(showId: string, episode: number) {
  const p = useAppStore.getState().progress[showId];
  useAppStore.getState().saveProgress(showId, {
    episode,
    positionSec: 0,
    durationSec: p?.episode === episode ? p.durationSec : undefined,
  });
  router.push({
    pathname: '/watch/[showId]/[episode]',
    params: { showId, episode: String(episode) },
  });
}

/**
 * Play an episode. If you're partway through it, ask first: Resume or Start over.
 * Otherwise it just plays.
 */
export function playEpisode(showId: string, episode: number) {
  if (resumePoint(showId, episode) !== null) {
    router.push({
      pathname: '/resume/[showId]/[episode]',
      params: { showId, episode: String(episode) },
    });
  } else {
    resumeEpisode(showId, episode);
  }
}

/** "12:34" */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
