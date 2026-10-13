import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { haptic } from '@/lib/haptics';
import { colors, fonts } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Same black as the native splash, so the hand-off is invisible. */
const BLACK = '#08080A';
/** Reel size on screen (the drawing is 64 units wide). */
const REEL = 132;
const K = REEL / 64;
/** The reel's centre window, in screen points at rest. */
const WINDOW = 14 * K;
const RING_R = 28;
const RING_C = 2 * Math.PI * RING_R;

/** Timeline, in ms. */
const T_RING = 900; // outer ring draws on while the wheel turns
const T_NAME = 450; // "Snippets." fades up (starts with the ring)
const T_HOLD = 1050; // when the window starts to open
const T_OPEN = 850; // window grows past the screen edges

/**
 * The opening: the Snippets reel turns on black, its ring draws on, the name appears, then the
 * reel's centre window opens up and becomes the screen, revealing the Feed (already loaded and
 * playing underneath). About 2.3 seconds. Tap anywhere to skip.
 */
export function LaunchIntro({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const ring = useSharedValue(0);
  const spin = useSharedValue(0);
  const name = useSharedValue(0);
  const open = useSharedValue(0);
  const fade = useSharedValue(1);
  const done = useRef(false);

  const cx = width / 2;
  const cy = height / 2;
  // Big enough that the window's edges clear the screen's corners.
  const maxScale = (Math.hypot(width, height) / WINDOW) * 1.15;

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    // First frame is up: let the native splash go.
    onReady();
    if (reduce) {
      fade.value = withDelay(500, withTiming(0, { duration: 350 }, (ok) => ok && runOnJS(finish)()));
      return;
    }
    ring.value = withTiming(1, { duration: T_RING, easing: Easing.out(Easing.cubic) });
    spin.value = withTiming(1, { duration: T_HOLD + T_OPEN, easing: Easing.out(Easing.quad) });
    name.value = withDelay(200, withTiming(1, { duration: T_NAME }));
    open.value = withDelay(
      T_HOLD,
      withTiming(1, { duration: T_OPEN, easing: Easing.in(Easing.cubic) }, (ok) => ok && runOnJS(finish)()),
    );
    const tick = setTimeout(() => haptic.pick(), T_HOLD + 120);
    return () => clearTimeout(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (done.current) return;
    open.value = withTiming(1, { duration: 280, easing: Easing.in(Easing.quad) }, (ok) => ok && runOnJS(finish)());
  };

  const scaleOf = (o: number) => {
    'worklet';
    return interpolate(o, [0, 1], [1, maxScale]);
  };

  // The reel and its window zoom together, so you fly through the window.
  const group = useAnimatedStyle(() => ({
    transform: [{ scale: scaleOf(open.value) }],
    opacity: interpolate(open.value, [0.55, 1], [1, 0], 'clamp'),
  }));
  const wheel = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 300}deg` }],
  }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - ring.value) }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: name.value * interpolate(open.value, [0, 0.25], [1, 0], 'clamp'),
    transform: [{ translateY: (1 - name.value) * 10 }],
  }));

  // Four black panels frame a hole the size of the (growing) window; the app shows through it.
  const half = () => {
    'worklet';
    return (WINDOW / 2) * scaleOf(open.value);
  };
  const top = useAnimatedStyle(() => ({ height: Math.max(0, cy - half()) }));
  const bottom = useAnimatedStyle(() => ({ top: cy + half() }));
  const left = useAnimatedStyle(() => ({
    top: cy - half(),
    height: half() * 2,
    width: Math.max(0, cx - half()),
  }));
  const right = useAnimatedStyle(() => ({
    top: cy - half(),
    height: half() * 2,
    left: cx + half(),
  }));
  // Before the window opens, its inside is black too.
  const plug = useAnimatedStyle(() => ({ opacity: open.value > 0.001 ? 0 : 1 }));
  const whole = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, whole]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel="Skip intro">
        <Animated.View style={[styles.panel, { top: 0 }, top]} />
        <Animated.View style={[styles.panel, { bottom: 0 }, bottom]} />
        <Animated.View style={[styles.side, { left: 0 }, left]} />
        <Animated.View style={[styles.side, { right: 0 }, right]} />
        <Animated.View
          style={[
            styles.plug,
            { left: cx - WINDOW / 2, top: cy - WINDOW / 2, width: WINDOW, height: WINDOW },
            plug,
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[styles.reel, { left: cx - REEL / 2, top: cy - REEL / 2 }, group]}
        >
          <Svg width={REEL} height={REEL} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
            <Circle cx={32} cy={32} r={RING_R} fill="none" stroke={colors.line} strokeWidth={1.2} />
            <AnimatedCircle
              cx={32}
              cy={32}
              r={RING_R}
              fill="none"
              stroke={colors.gold}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeDasharray={`${RING_C} ${RING_C}`}
              animatedProps={ringProps}
              transform="rotate(-90 32 32)"
            />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, wheel]}>
            <Svg width={REEL} height={REEL} viewBox="0 0 64 64">
              <Circle cx={32} cy={32} r={24} fill="none" stroke={colors.gold} strokeWidth={0.8} />
              <Path d="M8 25H25M39 25H56M8 39H25M39 39H56" stroke={colors.gold} strokeWidth={0.9} />
            </Svg>
          </Animated.View>
          <Svg width={REEL} height={REEL} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
            <Rect x={25} y={25} width={14} height={14} fill="none" stroke={colors.goldLight} strokeWidth={0.9} />
          </Svg>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[styles.nameWrap, { top: cy + REEL / 2 + 22 }, nameStyle]}
        >
          <Text style={styles.name}>Snippets.</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', left: 0, right: 0, backgroundColor: BLACK },
  side: { position: 'absolute', backgroundColor: BLACK },
  plug: { position: 'absolute', backgroundColor: BLACK },
  reel: { position: 'absolute', width: REEL, height: REEL },
  nameWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  name: { fontFamily: fonts.serifItalic, fontSize: 40, color: colors.goldLight, letterSpacing: 0.5 },
});

// Kept so the old launch film can be restored if wanted (assets/launch/snippets-launch.mp4).
export const LEGACY_LAUNCH_FILM = 'assets/launch/snippets-launch.mp4';
void View;
