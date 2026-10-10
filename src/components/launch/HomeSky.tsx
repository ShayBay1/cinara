import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { homeLogo, useLaunchFrame } from '@/lib/launchFrame';
import { homeSky } from '@/lib/sun';
import { home } from '@/theme/tokens';

const GRAIN = require('../../../assets/home/grain.png');

/**
 * The sky behind Home's first screen. It scrolls with the page, so the glow stays on the logo.
 * - Dunes at Dusk from 3am until sunrise: an indigo-to-ember sky, the logo rising like the sun.
 * - Golden Hour the rest of the day: amber light and rays spreading from the logo (where the launch
 *   film's sunlight ends), sinking into teal-black at the bottom.
 * Warm colours come forward and the cool ones fall back, so the card sits in front of a deep room.
 * Both skies settle into home.deep, so the rest of Home carries on below without a seam.
 */
export function HomeSky({ now }: { now: Date }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const f = useLaunchFrame();
  const logo = homeLogo(f, insets.top);
  const sky = homeSky(now);
  const reduce = useReducedMotion();

  const dawn = useSharedValue(sky === 'dawn' ? 1 : 0);
  useEffect(() => {
    const to = sky === 'dawn' ? 1 : 0;
    dawn.value = reduce ? to : withTiming(to, { duration: 2400 });
  }, [sky, reduce, dawn]);
  const dawnStyle = useAnimatedStyle(() => ({ opacity: dawn.value }));

  return (
    <View pointerEvents="none" style={[styles.fill, { height: H }]}>
      <GoldenHour W={W} H={H} logo={logo} u={f.u} />
      <Animated.View style={[StyleSheet.absoluteFill, dawnStyle]}>
        <Dunes W={W} H={H} logo={logo} u={f.u} />
      </Animated.View>
      <Image
        source={GRAIN}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity: 0.05 }]}
      />
    </View>
  );
}

type SkyProps = {
  W: number;
  H: number;
  logo: ReturnType<typeof homeLogo>;
  u: (v: number) => number;
};

/** Thin wedges of light fanning down and right from the logo. */
const RAYS: [number, number][] = [
  [-10, -4],
  [6, 12],
  [24, 31],
  [44, 49],
  [66, 70],
];

/** Halo rings around the logo: [radius in mock units, opacity]. */
const RINGS: [number, number][] = [
  [56, 0.22],
  [88, 0.13],
  [130, 0.08],
  [188, 0.05],
];

/** The last stars before dawn, on the 390 x 844 board: [x, y, radius, opacity]. */
const STARS: [number, number, number, number][] = [
  [300, 40, 0.9, 0.6],
  [352, 22, 0.7, 0.5],
  [240, 28, 0.6, 0.4],
  [370, 160, 0.7, 0.35],
  [200, 12, 0.6, 0.35],
];

function GoldenHour({ W, H, logo, u }: SkyProps) {
  const { cx, cy } = logo;
  const R = Math.hypot(W, H);
  const rays = useMemo(
    () =>
      RAYS.map(([a, b]) => {
        const p = (deg: number) =>
          `${cx + R * Math.cos((deg * Math.PI) / 180)} ${cy + R * Math.sin((deg * Math.PI) / 180)}`;
        return `M${cx} ${cy} L${p(a)} L${p(b)} Z`;
      }),
    [cx, cy, R],
  );
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="ghSky" cx={cx} cy={cy} r={H * 0.95} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#5C3A12" />
          <Stop offset="0.2" stopColor="#3A2410" />
          <Stop offset="0.45" stopColor="#1E150D" />
          <Stop offset="0.72" stopColor="#0F1416" />
          <Stop offset="1" stopColor={home.deep} />
        </RadialGradient>
        <RadialGradient id="ghRay" cx={cx} cy={cy} r={H * 0.75} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFC85A" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#FFC85A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="ghGlow" cx={cx} cy={cy} r={u(66)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFC85A" stopOpacity={0.55} />
          <Stop offset="0.4" stopColor="#FFAA28" stopOpacity={0.18} />
          <Stop offset="1" stopColor="#FFAA28" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="ghTeal" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0A1C20" stopOpacity={0} />
          <Stop offset="0.6" stopColor="#0A1C20" stopOpacity={0.55} />
          <Stop offset="1" stopColor={home.deep} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#ghSky)" />
      {rays.map((d) => (
        <Path key={d} d={d} fill="url(#ghRay)" />
      ))}
      {RINGS.map(([r, o]) => (
        <Circle
          key={r}
          cx={cx}
          cy={cy}
          r={u(r)}
          fill="none"
          stroke="#FFB800"
          strokeOpacity={o}
          strokeWidth={1}
        />
      ))}
      <Circle cx={cx} cy={cy} r={u(66)} fill="url(#ghGlow)" />
      <Rect y={H * 0.57} width={W} height={H * 0.43} fill="url(#ghTeal)" />
    </Svg>
  );
}

function Dunes({ W, H, logo, u }: SkyProps) {
  const { cx, cy } = logo;
  // Dune shapes are drawn on a 390 x 844 board and stretched to the screen.
  const sx = W / 390;
  const sy = H / 844;
  const d = (path: string) =>
    path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a, b) => `${+a * sx} ${+b * sy}`);
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="dnSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#17123A" />
          <Stop offset="0.18" stopColor="#2A1846" />
          <Stop offset="0.34" stopColor="#5C2440" />
          <Stop offset="0.5" stopColor="#A2421F" />
          <Stop offset="0.6" stopColor="#6B2A14" />
          <Stop offset="0.74" stopColor="#2A140C" />
          <Stop offset="1" stopColor={home.deep} />
        </LinearGradient>
        <RadialGradient id="dnSun" cx={cx} cy={cy} r={u(87)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFD678" stopOpacity={0.75} />
          <Stop offset="0.3" stopColor="#FF9632" stopOpacity={0.32} />
          <Stop offset="0.55" stopColor="#DC5A28" stopOpacity={0.1} />
          <Stop offset="0.72" stopColor="#DC5A28" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="dnFloor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A100A" />
          <Stop offset="1" stopColor={home.deep} />
        </LinearGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#dnSky)" />
      {STARS.map(([x, y, r, o]) => (
        <Circle key={`${x}-${y}`} cx={x * sx} cy={y * sy} r={r} fill="#FFFFFF" opacity={o} />
      ))}
      <Circle cx={cx} cy={cy} r={u(87)} fill="url(#dnSun)" />
      <Path
        d={d('M0 470 C 80 420, 170 440, 240 470 S 350 430, 390 450 L390 844 L0 844Z')}
        fill="#4A2012"
        opacity={0.85}
      />
      <Path
        d={d('M0 560 C 110 510, 200 560, 290 540 S 370 520, 390 530 L390 844 L0 844Z')}
        fill="#2E150C"
      />
      <Path
        d={d('M0 650 C 90 610, 220 660, 300 630 S 380 620, 390 625 L390 844 L0 844Z')}
        fill="url(#dnFloor)"
      />
      <Path
        d={d('M0 470 C 80 420, 170 440, 240 470 S 350 430, 390 450')}
        fill="none"
        stroke="#FFB800"
        strokeOpacity={0.45}
        strokeWidth={1}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0 },
});
