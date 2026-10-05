import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { colors, fonts } from '@/theme/tokens';

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * Touch-and-drag seeking along the progress bar on the screen's bottom edge. The bar itself is drawn by
 * BorderChrome; this is the invisible touch strip over it, plus the time bubble while dragging.
 * Drag anywhere along it: the picture follows your finger, and it seeks when you let go.
 */
export function Scrubber({
  left,
  width,
  bottom,
  duration,
  time,
  onScrub,
  onSeek,
}: {
  /** Where the bar starts and how long it is, in the viewer's frame. */
  left: number;
  width: number;
  /** Distance from the viewer's bottom edge to the bar. */
  bottom: number;
  duration: number;
  time: number;
  /** While dragging: the fraction under the finger (null when the drag ends). */
  onScrub: (fraction: number | null) => void;
  /** Seek to a time, in seconds. */
  onSeek: (seconds: number) => void;
}) {
  const [frac, setFrac] = useState<number | null>(null);
  const start = useRef(0);
  const lastSeek = useRef(0);
  const live = useRef({ width, duration, onScrub, onSeek });
  live.current = { width, duration, onScrub, onSeek };

  const update = (f: number, final: boolean) => {
    const { width: w, duration: d, onScrub: scrub, onSeek: seek } = live.current;
    const x = Math.max(0, Math.min(1, f));
    void w;
    const now = Date.now();
    if (final || now - lastSeek.current > 120) {
      lastSeek.current = now;
      seek(x * d);
    }
    setFrac(final ? null : x);
    scrub(final ? null : x);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        void Haptics.selectionAsync();
        start.current = e.nativeEvent.locationX;
        update(start.current / live.current.width, false);
      },
      onPanResponderMove: (_e, g) => update((start.current + g.dx) / live.current.width, false),
      onPanResponderRelease: (_e, g) => update((start.current + g.dx) / live.current.width, true),
      onPanResponderTerminate: (_e, g) => update((start.current + g.dx) / live.current.width, true),
    }),
  ).current;

  const shown = frac ?? (duration > 0 ? time / duration : 0);

  return (
    <>
      {frac !== null ? (
        <View pointerEvents="none" style={[styles.bubble, { left: left + frac * width - 34, bottom: bottom + 22 }]}>
          <T style={styles.bubbleText}>{fmt(shown * duration)}</T>
        </View>
      ) : null}
      <View
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown * duration), text: `${fmt(shown * duration)} of ${fmt(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onSeek(Math.max(0, Math.min(duration, time + (e.nativeEvent.actionName === 'increment' ? 10 : -10))))}
        style={[styles.strip, { left, width, bottom: bottom - 20 }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', height: 40 },
  bubble: { position: 'absolute', width: 68, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,8,10,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(244,241,234,0.3)' },
  bubbleText: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
});
