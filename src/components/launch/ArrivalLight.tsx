import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const LIGHT = require('../../../assets/launch/opening-light.jpg');

/** Seeded so the flicker has the same "personality" every launch, like a particular old lamp. */
function flickerSteps(seed: number, count: number, lo: number, hi: number, ms: [number, number]) {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  return Array.from({ length: count }, () => ({
    v: lo + (hi - lo) * rnd(),
    d: ms[0] + (ms[1] - ms[0]) * rnd(),
  }));
}

/**
 * The opening's last frame (the painted window light), held over the app and let go like a
 * projector lamp warming up: it stutters and flickers hard, then fades out while the picture
 * underneath (the Feed) keeps flickering for a moment. Mounted hidden under the opening from the
 * start so the image is ready at the hand-off.
 */
export function ArrivalLight({ go, onDone }: { go: boolean; onDone: () => void }) {
  const light = useSharedValue(1);
  const dark = useSharedValue(0);

  useEffect(() => {
    if (!go) return;
    // 1) The lamp stutters: about 0.75 s of hard, uneven flicker on the light itself.
    const stutter = flickerSteps(7, 16, 0.35, 1, [28, 62]).map((s) =>
      withTiming(s.v, { duration: s.d, easing: Easing.linear }),
    );
    // 2) Then the light lets go of the picture.
    light.value = withSequence(
      ...stutter,
      withTiming(1, { duration: 50 }),
      withTiming(0, { duration: 1000, easing: Easing.out(Easing.cubic) }, (ok) => {
        if (ok) runOnJS(onDone)();
      }),
    );
    // 3) Shutter flicker on the picture itself (dark frames), during and after the light leaves.
    const shutter = flickerSteps(19, 22, 0, 0.42, [30, 70]).map((s, i) =>
      withTiming(i % 2 ? s.v * 0.3 : s.v, { duration: s.d, easing: Easing.linear }),
    );
    dark.value = withSequence(withTiming(0, { duration: 600 }), ...shutter, withTiming(0, { duration: 160 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  const lightStyle = useAnimatedStyle(() => ({ opacity: light.value }));
  const darkStyle = useAnimatedStyle(() => ({ opacity: dark.value }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, lightStyle]}>
        <Image source={LIGHT} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#050302' }, darkStyle]} />
    </View>
  );
}
