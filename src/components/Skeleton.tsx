import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius } from '@/theme/tokens';

import { Reel } from './Reel';

/** One ghost block that breathes while content loads. Never a blank gap. */
export function Ghost({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.9,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0.45,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);
  return (
    <Animated.View
      style={[
        { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, opacity: pulse },
        style,
      ]}
    />
  );
}

/** A row of ghost posters with a section label, for horizontal rows. */
export function GhostRow({
  width = 150,
  height = 96,
  count = 3,
}: {
  width?: number;
  height?: number;
  count?: number;
}) {
  return (
    <View
      style={{ gap: 10, paddingTop: 26 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ghost style={{ width: 140, height: 12 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {Array.from({ length: count }, (_, i) => (
          <Ghost key={i} style={{ width, height, borderRadius: 10 }} />
        ))}
      </View>
    </View>
  );
}

/** The reel spinning over a ghost card: the app's loading state for a whole card. */
export function GhostCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ghost
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 }}
      />
      <Reel size={56} spinning label="Loading" />
    </View>
  );
}
