import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/**
 * The painted opening: the Snippets reel in oil-paint strokes (repainted every frame, like
 * Scott Free's hand-painted logo). The reel turns, the name appears, and the window opens into
 * warm light, to a film-projector stinger. ArrivalLight then lets that light go over the Feed.
 * The drawn-in-code version lives in DrawnIntro.tsx.
 */
const SOURCE = require('../../../assets/launch/snippets-opening-painted.mp4');

/** Longest the intro may hold the app, even if the video stalls. */
const SAFETY_MS = 6000;

export function LaunchIntro({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
  const finished = useRef(false);
  const player = useVideoPlayer(SOURCE, (p) => {
    p.loop = false;
    // The projector stinger. Mixes with any music already playing instead of stopping it.
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onReady();
    // No fade here: ArrivalLight shows this same last frame and lets it go slowly over the Feed.
    onDone();
  };

  useEffect(() => {
    const ended = player.addListener('playToEnd', finish);
    const status = player.addListener('statusChange', ({ status: s }) => {
      if (s === 'readyToPlay') onReady();
      if (s === 'error') finish();
    });
    const safety = setTimeout(finish, SAFETY_MS);
    return () => {
      ended.remove();
      status.remove();
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08080A' }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Skip intro">
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          pointerEvents="none"
        />
      </Pressable>
    </View>
  );
}
