import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const LIGHT = require('../../../assets/launch/opening-light.jpg');

/**
 * The opening's last frame (the painted window light), held over the app and then let go slowly,
 * with a projector-lamp flicker. It is mounted (hidden under the opening) from the start, so the
 * image is already decoded when the hand-off happens, so the Feed develops out of the light instead of cutting in.
 */
export function ArrivalLight({ go, onDone }: { go: boolean; onDone: () => void }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (!go) return;
    o.value = withSequence(
      withTiming(0.86, { duration: 70 }),
      withTiming(1, { duration: 60 }),
      withTiming(0.9, { duration: 50 }),
      withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) }, (ok) => {
        if (ok) runOnJS(onDone)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image source={LIGHT} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}
