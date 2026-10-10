import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };
/** The Pressable itself scales, so layout styles (flex, margins, absolute positions) apply as usual. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A press that feels physical: the card sinks a little on touch and springs back on release.
 * `feel` adds a haptic when the press fires. Respects Reduce Motion.
 */
export function Pressy({
  children,
  style,
  scaleTo = 0.965,
  feel,
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  feel?: keyof typeof haptic;
}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      style={[style, anim]}
      onPressIn={(e) => {
        if (!reduce) scale.value = withSpring(scaleTo, SPRING);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feel) haptic[feel]();
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
