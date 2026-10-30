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
 *  4. The window bursts through right on the swell of the music; then a warm projector glow fades off
 *     the Feed while the chord rings out, so the picture and the sound finish together.
 * The video keeps playing invisibly to the end so the stinger (clatter, rush, warm chord) finishes.
 * (cinara-opening-v2.mp4: the same picture, with the chord given a natural 2-second ring-out; the
 * original file faded the chord out after 0.25 s, which sounded cut off.)
 */
const VIDEO = require('../../../assets/launch/cinara-opening-v2.mp4');
const WINDOWS = [
  require('../../../assets/launch/window-0.webp'),
  require('../../../assets/launch/window-1.webp'),
  require('../../../assets/launch/window-2.webp'),
];
/** When the window starts to open, from the first frame of the video. */
const OPEN_AT_MS = 1050;
/**
 * When the window clears the screen, by the video's own clock: the top of the swell (the sound is
 * loudest from 1.90 to 2.00 s). The zoom is timed to land here from wherever the video actually is
 * when it starts, so a slow start or a busy launch can't push the picture ahead of (or behind) the music.
 */
const REVEAL_AT_MS = 1950;
/** The zoom never runs shorter or longer than this, whatever the video clock says. */
const ZOOM_MIN_MS = 450;
const ZOOM_MAX_MS = 1100;
/** If the video hasn't really started by now, open without it (muted, so late sound can't play out of sync). */
const NO_START_MS = 2500;
/** After that, the chord rings out for about this long; the warm glow fades with it. */
const RING_OUT_MS = 1900;
/** The whole sound, start to end. The intro never outlives it (or this, if the video stalls). */
const SOUND_MS = 4430;
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
  const glow = useSharedValue(0);
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
    // The projector's warm light lingers on the Feed and fades as the chord rings out.
    glow.value = withSequence(
      withTiming(0.32, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: RING_OUT_MS, easing: Easing.out(Easing.cubic) }),
    );
  };

  /** atMs: where the video's clock is right now, so the zoom lands on the swell. */
  const openWindow = (fast = false, atMs = OPEN_AT_MS) => {
    if (opened.current) return;
    opened.current = true;
    setOpen(true);
    onOpen();
    const zoomMs = fast ? 380 : Math.min(ZOOM_MAX_MS, Math.max(ZOOM_MIN_MS, REVEAL_AT_MS - atMs));
    z.value = withTiming(
      1,
      { duration: zoomMs, easing: Easing.in(Easing.cubic) },
      (ok) => ok && runOnJS(reveal)(),
    );
    // The projector shutter flickers over the picture as it arrives.
    dark.value = withDelay(
      fast ? 150 : Math.round(zoomMs * 0.42),
      withSequence(...flicker(19, 24, 0.12, 0.5, [28, 66]), withTiming(0, { duration: 180 })),
    );
  };

  useEffect(() => {
    // Everything follows the video's own clock (what you hear), never a JS timer started "about when"
    // the video began: on a cold launch the video can report playing a few hundred ms before its sound
    // actually starts, and timers fire late while the app is busy loading, which put the picture ahead
    // of the music. The window opens when the video's clock passes 1.05 s.
    player.timeUpdateEventInterval = 1 / 30;
    const playing = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) onReady();
    });
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      const ms = currentTime * 1000;
      if (ms >= OPEN_AT_MS) openWindow(false, ms);
    });
    const status = player.addListener('statusChange', ({ status: s }) => {
      if (s === 'readyToPlay') onReady();
      if (s === 'error') {
        onReady();
        player.muted = true;
        openWindow(true);
      }
    });
    if (player.playing) onReady();
    // The video ending only closes the intro once the window has fully opened; until then the
    // window's own animation decides (so the zoom is never cut off).
    const ended = player.addListener('playToEnd', () => {
      if (revealedRef.current) finish();
    });
    // If the video hasn't really started (its clock barely moved), open anyway, quickly and muted,
    // so the app never waits on it and its sound can't arrive late and out of step.
    const noStart = setTimeout(() => {
      if (opened.current) return;
      onReady();
      if (player.currentTime * 1000 >= OPEN_AT_MS * 0.6) return openWindow(false, player.currentTime * 1000);
      player.muted = true;
      openWindow(true);
    }, NO_START_MS);
    const safety = setTimeout(finish, SOUND_MS + 2500);
    return () => {
      playing.remove();
      time.remove();
      status.remove();
      ended.remove();
      clearTimeout(noStart);
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Keep the paint boiling while the window opens (a new painting every two frames).
  useEffect(() => {
    if (!open || revealed) return;
    const id = setInterval(() => setBoil((b) => (b + 1) % WINDOWS.length), 66);
    return () => clearInterval(id);
  }, [open, revealed]);

  // Once the window has cleared, finish when the sound does (the video's end event usually comes
  // first; this is the fallback). Unmounting stops the sound, so never earlier than the ring-out.
  useEffect(() => {
    if (revealed) {
      const id = setTimeout(finish, RING_OUT_MS + 700);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const zoom = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (maxScale - 1) * z.value }],
  }));
  const darkStyle = useAnimatedStyle(() => ({ opacity: dark.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

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
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFC24A' }, glowStyle]} pointerEvents="none" />
      </Pressable>
    </View>
  );
}
