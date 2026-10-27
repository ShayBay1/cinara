import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * The Cinara reel: the one object that does many jobs. It is the loader (spinning), the countdown
 * (its outer ring empties as 8/7c gets closer) and the progress ring. Same drawing as the mark:
 * a wheel, four lines and the centre window.
 */
export function Reel({
  size = 64,
  progress,
  spinning = false,
  color = colors.gold,
  track = colors.line,
  label,
}: {
  size?: number;
  /** 0..1: how much of the outer ring is drawn. Omit for a plain reel. */
  progress?: number;
  spinning?: boolean;
  color?: string;
  track?: string;
  /** Screen-reader text; omit when the reel is decoration. */
  label?: string;
}) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.timing(turn, {
          toValue: 1,
          duration: 2250,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [spinning, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = 28;
  const circ = 2 * Math.PI * r;
  const p = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));

  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute' }}>
        <Circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          stroke={p === undefined ? color : track}
          strokeWidth={2.4}
        />
        {p !== undefined ? (
          <Circle
            cx={32}
            cy={32}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - p)}
            transform="rotate(-90 32 32)"
          />
        ) : null}
      </Svg>
      <Animated.View
        style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}
      >
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle cx={32} cy={32} r={24} fill="none" stroke={color} strokeWidth={0.9} />
          <Path d="M8 25H25M39 25H56M8 39H25M39 39H56" stroke={color} strokeWidth={1.1} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute' }}>
        <Rect x={25} y={25} width={14} height={14} fill="none" stroke={color} strokeWidth={1.4} />
      </Svg>
    </View>
  );
}
