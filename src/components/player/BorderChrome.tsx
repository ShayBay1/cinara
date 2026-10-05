import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Path, Text as SvgText, TextPath } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { borderLayout, perimeter, type Pads } from '@/lib/turn';
import { colors, fonts } from '@/theme/tokens';

/**
 * The show title and progress bar, drawn along the screen's own border. Upright, the title runs along
 * the top-left and the bar along the bottom. As the phone turns they slide around the corners so they
 * stay in the same spot for the viewer, upright the whole way. They never bounce, rotate or shrink.
 */
/** Room for the back button before the title starts. */
const TITLE_INSET = 50;

export function BorderChrome({
  width,
  height,
  pads,
  angle,
  visible,
  title,
  progress,
  scrubbing = false,
}: {
  width: number;
  height: number;
  /** Border distance from each physical screen edge. */
  pads: Pads;
  angle: SharedValue<number>;
  /** 0..1 fade for the title and bar. */
  visible: Readonly<SharedValue<number>> | DerivedValue<number>;
  title: string;
  /** 0..1 */
  progress: number;
  /** Thicker bar while someone is dragging along it. */
  scrubbing?: boolean;
}) {
  const g = useMemo(() => perimeter(width, height, pads), [width, height, pads]);
  const [a, setA] = useState(0);

  // Only re-lay the border while it's on screen; the picture itself never waits on this.
  useAnimatedReaction(
    () => (visible.value > 0.01 ? Math.round(angle.value * 2) / 2 : null),
    (now, prev) => {
      if (now !== null && now !== prev) scheduleOnRN(setA, now);
    },
  );

  const { titleStart, barFrom, barTo } = borderLayout(g, a, TITLE_INSET);
  const len = Math.max(0, barTo - barFrom);
  const fill = Math.max(0, Math.min(1, progress)) * len;
  const fadeStyle = useAnimatedStyle(() => ({ opacity: visible.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fadeStyle]}>
      <Svg width={width} height={height} viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}>
        <Path id="snip-border" d={g.d2} fill="none" stroke="none" />
        <SvgText
          fill={colors.text}
          fontFamily={fonts.bodyHeavy}
          fontSize={11}
          letterSpacing={2}
          dy={12}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={0.6}
        >
          <TextPath href="#snip-border" startOffset={titleStart}>
            {title.toUpperCase()}
          </TextPath>
        </SvgText>
        <Path
          d={g.d}
          fill="none"
          stroke="rgba(244,241,234,0.28)"
          strokeWidth={scrubbing ? 6 : 3}
          strokeLinecap="round"
          strokeDasharray={[len, g.total]}
          strokeDashoffset={-barFrom}
        />
        <Path
          d={g.d}
          fill="none"
          stroke={colors.text}
          strokeWidth={scrubbing ? 6 : 3}
          strokeLinecap="round"
          strokeDasharray={[fill, g.total]}
          strokeDashoffset={-(barTo - fill)}
        />
      </Svg>
    </Animated.View>
  );
}
