import { Image, type ImageSource } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Cover art that drifts slowly, like a held shot, while its card is on screen.
 * Stands in for footage until each show has a clip to play here.
 */
export function KenBurns({
  source,
  color,
  active,
}: {
  source: ImageSource | number | null;
  color: string;
  active: boolean;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduce || !active) {
      cancelAnimation(t);
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(t);
  }, [active, reduce, t]);

  const drift = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.03 + t.value * 0.08 },
      { translateX: -6 * t.value },
      { translateY: -8 * t.value },
    ],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: color, overflow: 'hidden' }]}>
      {source ? (
        <Animated.View style={[StyleSheet.absoluteFill, drift]}>
          <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={200} />
        </Animated.View>
      ) : null}
      {/* The show's colour laid lightly over the art, so each series has its own grade. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: 0.22 }]} />
    </View>
  );
}
