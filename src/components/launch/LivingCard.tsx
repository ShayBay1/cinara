import MaskedViewBase from '@react-native-masked-view/masked-view';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

// The library's class typings predate React 19's JSX types; same component, typed for JSX.
const MaskedView = MaskedViewBase as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>;
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { useTilt } from '@/hooks/useTilt';

/** How far the card leans, at most (degrees). Small on purpose: it should feel alive, not wobbly. */
const LEAN = 4;

/**
 * The premiere card, alive in your hand. It leans a few degrees as you move the phone, a soft glass
 * reflection slides across the poster, and a gold-foil glint runs around the frame, like light
 * catching a real foil-stamped card. Holding still brings it back to rest exactly where the
 * launch film lands, so the hand-off from the intro is untouched.
 */
export function LivingCard({
  children,
  style,
  width,
  height,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  width: number;
  height: number;
}) {
  const tilt = useTilt();

  const lean = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${tilt.y.value * LEAN}deg` },
      { rotateY: `${-tilt.x.value * LEAN}deg` },
    ],
  }));

  // The reflection and the foil glint travel diagonally with the tilt.
  const travel = useAnimatedStyle(() => {
    const t = (tilt.x.value - tilt.y.value) / 2;
    return {
      transform: [
        { translateX: interpolate(t, [-1, 1], [-width * 1.1, width * 1.1]) },
        { rotate: '-24deg' },
      ],
      opacity: interpolate(
        Math.abs(tilt.x.value) + Math.abs(tilt.y.value),
        [0, 0.15, 1],
        [0, 0.6, 1],
      ),
    };
  });

  const band = { left: -width * 0.5, top: -height * 0.5, width: width * 0.9, height: height * 2 };

  return (
    <Animated.View style={[style, { width, height }, lean]}>
      {children}

      {/* Glass reflection across the poster */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Animated.View
          style={[
            styles.band,
            band,
            {
              experimental_backgroundImage:
                'linear-gradient(90deg, rgba(255,240,210,0) 0%, rgba(255,240,210,0.10) 45%, rgba(255,250,235,0.16) 50%, rgba(255,240,210,0.10) 55%, rgba(255,240,210,0) 100%)',
            },
            travel,
          ]}
        />
      </View>

      {/* Gold-foil glint on the frame */}
      <MaskedView
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        maskElement={<View style={[StyleSheet.absoluteFill, styles.frame]} />}
      >
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
          <Animated.View
            style={[
              styles.band,
              band,
              {
                experimental_backgroundImage:
                  'linear-gradient(90deg, rgba(255,210,90,0) 0%, rgba(255,226,140,0.9) 40%, #FFF6DA 50%, rgba(255,226,140,0.9) 60%, rgba(255,210,90,0) 100%)',
              },
              travel,
            ]}
          />
        </View>
      </MaskedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute' },
  frame: { borderWidth: 1.6, borderColor: '#000' },
});
