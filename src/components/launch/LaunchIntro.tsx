import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * The painted opening, built to introduce the Feed:
 *  1. Video (0 to 1.05 s): the oil-paint reel turns, its ring draws on, the name comes and goes.
 *     (cinara-opening-painted.mp4: the original painted render with the name repainted as Cinara.)
 *  2. The reel's window opens for real: painted stills of the reel, with the window cut out, zoom
 *     past the edges of the screen, and through the window you see the actual Feed (its first show
 *     already settling in). The stills swap every two frames so the paint keeps boiling.
 *  3. The projector flickers over the picture as it arrives.
 * The video keeps playing invisibly to the end so the stinger (clatter, rush, warm chord) finishes.
 */
const VIDEO = require('../../../assets/launch/cinara-opening-painted.mp4');
const WINDOWS = [
  require('../../../assets/launch/window-0.webp'),
  require('../../../assets/launch/window-1.webp'),
  require('../../../assets/launch/window-2.webp'),
];
/** When the window starts to open, from the first frame of the video. */
const OPEN_AT_MS = 1050;
const ZOOM_MS = 850;
/** Painting size, and the window's inner half-width in it (pixels). */
const ART_W = 1080;
const ART_H = 2340;
const HOLE_HALF = 38.9;
const BLACK = '#08080A';

function flicker(seed: number, count: number, lo: number, hi: number, ms: [number, number]) {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  return Array.from({ length: count }, (_, i) =>
    withTiming((i % 2 ? 0.3 : 1) * (lo + (hi - lo) * rnd()), {
      duration: ms[0] + (ms[1] - ms[0]) * rnd(),
      easing: Easing.linear,
    }),
  );
}

export function LaunchIntro({
  onReady,
  onOpen,
  onRevealed,
  onFinished,
}: {
  onReady: () => void;
  /** The window starts opening: the Feed should begin its entrance now. */
  onOpen: () => void;
  /** The window has cleared the screen: the app is fully visible (the sound may still be ringing). */
  onRevealed: () => void;
  /** Everything is over: unmount. */
  onFinished: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [boil, setBoil] = useState(0);
  const z = useSharedValue(0);
  const dark = useSharedValue(0);
  const opened = useRef(false);
  const finished = useRef(false);
  const revealedRef = useRef(false);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = false;
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  // Same "cover" fit as the video, so the stills land exactly on its last frame.
  const cover = Math.max(width / ART_W, height / ART_H);
  const maxScale = (Math.hypot(width, height) / 2 / (HOLE_HALF * cover)) * 1.12;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onFinished();
  };
  const reveal = () => {
    revealedRef.current = true;
    setRevealed(true);
    onRevealed();
  };

  const openWindow = (fast = false) => {
    if (opened.current) return;
    opened.current = true;
    setOpen(true);
    onOpen();
    z.value = withTiming(
      1,
      { duration: fast ? 380 : ZOOM_MS, easing: Easing.in(Easing.cubic) },
      (ok) => ok && runOnJS(reveal)(),
    );
    // The projector shutter flickers over the picture as it arrives.
    dark.value = withDelay(
      fast ? 150 : 420,
      withSequence(...flicker(19, 24, 0.12, 0.5, [28, 66]), withTiming(0, { duration: 180 })),
    );
  };

  useEffect(() => {
    // The window opens 1.05 s into the video. Three cues can start that clock, whichever comes first,
    // so a missed event can never leave the reel frozen: the video reporting that it's playing, the
    // video's own clock passing the mark, or (if the video is already playing when we start listening)
    // right away. If the video never starts at all, the window still opens on time.
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    const startClock = (alreadyMs = 0) => {
      if (openTimer || opened.current) return;
      openTimer = setTimeout(() => openWindow(), Math.max(0, OPEN_AT_MS - alreadyMs));
    };
    player.timeUpdateEventInterval = 0.05;
    const playing = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        onReady();
        startClock(player.currentTime * 1000);
      }
    });
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime > 0) startClock(currentTime * 1000);
      if (currentTime * 1000 >= OPEN_AT_MS) openWindow();
    });
    const status = player.addListener('statusChange', ({ status: s }) => {
      if (s === 'readyToPlay') onReady();
      if (s === 'error') {
        onReady();
        openWindow(true);
      }
    });
    if (player.playing) {
      onReady();
      startClock(player.currentTime * 1000);
    }
    // The video ending only closes the intro once the window has fully opened; until then the
    // window's own animation decides (so the zoom is never cut off).
    const ended = player.addListener('playToEnd', () => {
      if (revealedRef.current) finish();
    });
    // If the video never starts, open anyway (at full speed), and never hold the app longer than this.
    const noStart = setTimeout(() => {
      onReady();
      openWindow();
    }, OPEN_AT_MS + 600);
    const safety = setTimeout(finish, 6000);
    return () => {
      playing.remove();
      time.remove();
      status.remove();
      ended.remove();
      clearTimeout(noStart);
      clearTimeout(safety);
      if (openTimer) clearTimeout(openTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Keep the paint boiling while the window opens (a new painting every two frames).
  useEffect(() => {
    if (!open || revealed) return;
    const id = setInterval(() => setBoil((b) => (b + 1) % WINDOWS.length), 66);
    return () => clearInterval(id);
  }, [open, revealed]);

  // Once the window has cleared, finish when the sound does.
  useEffect(() => {
    if (revealed) {
      const id = setTimeout(finish, 1200);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const zoom = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (maxScale - 1) * z.value }],
  }));
  const darkStyle = useAnimatedStyle(() => ({ opacity: dark.value }));

  return (
    <View
      style={[StyleSheet.absoluteFill, !open ? { backgroundColor: BLACK } : null]}
      pointerEvents={revealed ? 'none' : 'auto'}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={() => openWindow(true)} accessibilityLabel="Skip intro">
        {/* The video is hidden (not stopped) once the window opens, so its sound plays on. */}
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, { opacity: open ? 0 : 1 }]}
          contentFit="cover"
          nativeControls={false}
          pointerEvents="none"
        />
        {revealed ? null : (
          <Animated.View style={[StyleSheet.absoluteFill, zoom]} pointerEvents="none">
            {WINDOWS.map((src, i) => (
              <Image
                key={i}
                source={src}
                style={[StyleSheet.absoluteFill, { opacity: open && boil === i ? 1 : 0 }]}
                contentFit="cover"
              />
            ))}
          </Animated.View>
        )}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#050302' }, darkStyle]} pointerEvents="none" />
      </Pressable>
    </View>
  );
}
