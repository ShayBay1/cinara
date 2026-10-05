import type { VideoPlayer } from 'expo-video';
import { VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { panRoom, stageSide } from '@/lib/turn';

/**
 * The picture: one square stream, drawn as wide as the screen's diagonal and turned to stay level.
 * Because the square always covers the screen, a turn never zooms and the edges never show.
 * panX / panY / zoom come from the reframe track (the slow 4-second camera move after a settle).
 */
export function TurnStage({
  player,
  width,
  height,
  angle,
  fade,
  panX,
  panY,
  zoom,
}: {
  player: VideoPlayer;
  width: number;
  height: number;
  angle: SharedValue<number>;
  fade: SharedValue<number>;
  /** Crop center offset, as a share of the picture's side. */
  panX: SharedValue<number>;
  panY: SharedValue<number>;
  zoom: SharedValue<number>;
}) {
  const side = stageSide(width, height);

  const style = useAnimatedStyle(() => {
    const z = Math.max(1, zoom.value);
    const drawn = side * z;
    // Pan the picture the opposite way to move the crop toward (x, y). Mid-turn the room to pan
    // shrinks, so the pan eases toward center rather than letting an edge show.
    const px = -panX.value * drawn;
    const py = -panY.value * drawn;
    const f = panRoom(width, height, angle.value, drawn, px, py);
    return {
      opacity: fade.value,
      transform: [{ rotate: `${angle.value}deg` }, { translateX: px * f }, { translateY: py * f }, { scale: z }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stage,
        { width: side, height: side, left: (width - side) / 2, top: (height - side) / 2 },
        style,
      ]}
    >
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', backgroundColor: '#000' },
});
