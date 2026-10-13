import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

/**
 * The painted opening: the Snippets reel in oil-paint strokes (repainted every frame, like
 * Scott Free's hand-painted logo). The reel turns, the name appears, and the window opens into
 * warm light, to a film-projector stinger; then the light dissolves into the Feed, which has been loading underneath.
 * The drawn-in-code version lives in DrawnIntro.tsx.
 */
const SOURCE = require('../../../assets/launch/snippets-opening-painted.mp4');

/** Longest the intro may hold the app, even if the video stalls. */
const SAFETY_MS = 6000;
/** Dissolve from the painted light into the Feed. */
const FADE_MS = 450;

export function LaunchIntro({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
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
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => onDone());
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
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, backgroundColor: '#08080A' }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Skip intro">
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          pointerEvents="none"
        />
      </Pressable>
    </Animated.View>
  );
}
