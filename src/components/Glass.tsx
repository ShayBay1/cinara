import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/theme/tokens';

/** Real Liquid Glass is available: iOS 26+, built for it, and the API exists on this OS build. */
const LIQUID =
  Platform.OS === 'ios' &&
  (() => {
    try {
      return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
      return false;
    }
  })();

/** Darkroom warmth laid into the glass, so it reads as amber, not grey. */
const TINT = 'rgba(40,28,14,0.35)';

/** Follows the phone's Reduce Transparency setting. */
function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * Glass for things that float over content: the tab bar, the search pill, buttons over key art,
 * sheets and toasts. Never for content itself.
 * - iOS 26+: Apple's Liquid Glass (GlassView), tinted darkroom amber.
 * - Android and older iPhones: frosted blur with the same tint.
 * - Reduce Transparency on: solid darkroom surface.
 */
export function Glass({
  children,
  style,
  radius = 0,
  interactive = false,
  border = true,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** iOS 26: the glass reacts to touch (for buttons). */
  interactive?: boolean;
  /** A hairline rim of light, like the edge of a lens. */
  border?: boolean;
}) {
  const reduce = useReduceTransparency();
  const rim = border
    ? { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(243,234,216,0.22)' }
    : null;
  const shape = { borderRadius: radius, overflow: 'hidden' as const };

  if (reduce) {
    return <View style={[shape, { backgroundColor: colors.surface }, rim, style]}>{children}</View>;
  }
  if (LIQUID) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={TINT}
        isInteractive={interactive}
        style={[shape, rim, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[shape, rim, style]}>
      <BlurView
        intensity={Platform.OS === 'android' ? 60 : 40}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: Platform.OS === 'web' ? 'rgba(30,23,16,0.72)' : 'rgba(30,23,16,0.45)',
          },
        ]}
      />
      {children}
    </View>
  );
}
