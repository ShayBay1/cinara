import { useId } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * A vertical shade laid over cover art so white type stays readable.
 * `stops` are [offset 0..1, opacity 0..1] pairs from top to bottom.
 */
export function Fade({
  stops,
  color = '#000',
  style,
}: {
  stops: [number, number][];
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `fade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width="100%" height="100%" style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([o, a]) => (
            <Stop key={o} offset={o} stopColor={color} stopOpacity={a} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
