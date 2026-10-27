import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { api } from '@/data';
import { newSessionId, WatchMeter } from '@/lib/watchMeter';

/** How often watched time is sent. The server credits at most 30 s per tick. */
const TICK_MS = 15_000;

/**
 * Sends watched time for one episode to the server every 15 seconds (and on pause, the end of
 * the episode, leaving the player or backgrounding the app). This is what the Cinara Share pays on.
 * Call `onTime` from the player's time updates and `onPause` whenever playback stops.
 */
export function useWatchTracker(showId: string, episode: number, caughtUp = false) {
  const meter = useMemo(() => new WatchMeter(), []);
  const session = useMemo(() => newSessionId(), []);
  const position = useRef(0);
  // "Watching now" for friends: refreshed with each tick while playing, cleared on leaving.
  const activity = useMemo(
    () => (watchingNow: boolean) =>
      void api.setWatching({ showId, episode, watchingNow, caughtUp }).catch(() => undefined),
    [showId, episode, caughtUp],
  );

  const flush = useMemo(
    () => () => {
      if (meter.pendingSeconds <= 0) return;
      activity(true);
      const { seconds, seq } = meter.take();
      void api
        .recordWatch({ sessionId: session, showId, episode, seq, positionSec: position.current, playingSec: seconds })
        .catch(() => undefined); // never interrupt playback over a stat
    },
    [meter, session, showId, episode, activity],
  );

  useEffect(() => {
    const timer = setInterval(flush, TICK_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        meter.pause();
        flush();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      flush();
      activity(false);
    };
  }, [flush, meter, activity]);

  return useMemo(
    () => ({
      onTime(positionSec: number) {
        position.current = positionSec;
        meter.feed(positionSec, Date.now());
      },
      onPause() {
        meter.pause();
        flush();
      },
    }),
    [meter, flush],
  );
}
