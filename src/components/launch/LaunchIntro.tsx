import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

const SOURCE = require('../../../assets/launch/snippets-launch.mp4');

/** Longest the intro may hold the app, even if the video stalls. */
const SAFETY_MS = 9000;
/** Crossfade from the video's last frame to the live Home underneath. */
const FADE_MS = 380;

/**
 * The Snippets launch animation. Plays once over the app on a cold start, then dissolves into
 * the real Home (which has been loading underneath the whole time). The video's last frame is
 * Home itself, so the dissolve should be nearly invisible.
 */
export function LaunchIntro({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const player = useVideoPlayer(SOURCE, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      onReady();
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
        onDone(),
      );
    };
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
  }, [player, opacity, onReady, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, backgroundColor: '#000' }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </Animated.View>
  );
}
