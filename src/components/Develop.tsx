import { useEffect, useRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** The signature transition: sepia to full colour. */
export const DEVELOP_MS = 600;

/**
 * Wraps a picture. While `developed` is false it sits in sepia ("not yet yours": locked, upcoming,
 * unwatched); when it turns true the colour develops in over 600 ms. The sepia is a colour-blend
 * layer, so the picture's light and shade stay and only its hue turns to darkroom brown.
 */
export function Develop({
  developed,
  children,
  style,
}: {
  developed: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const sepia = useRef(new Animated.Value(developed ? 0 : 1)).current;
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      Animated.timing(sepia, {
        toValue: developed ? 0 : 1,
        duration: reduce ? 0 : DEVELOP_MS,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [developed, sepia]);

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: sepia }]}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#8A5A2B', mixBlendMode: 'color' }]}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(40,24,8,0.22)' }]} />
      </Animated.View>
    </View>
  );
}
