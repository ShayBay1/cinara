import { useEvent, useEventListener } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, type IconName } from '@/components/Icon';
import { BorderChrome } from '@/components/player/BorderChrome';
import { CaughtUp, JoinWeb, UP_NEXT_SECONDS, UpNext } from '@/components/player/Endings';
import { Scrubber } from '@/components/player/Scrubber';
import { TurnStage } from '@/components/player/TurnStage';
import { Button, ErrorState, T } from '@/components/ui';
import { FREE_EPISODES, type Episode, type Show } from '@/data';
import { useEpisode, useMembership, useShow } from '@/hooks/queries';
import { useTurn, type Turn } from '@/hooks/useTurn';
import { WEB_URL } from '@/lib/billing';
import { CHROME_FADE_MS, CHROME_MS, REFRAME_MS, reframeAt, shotIndex, viewerSize, type Orientation } from '@/lib/turn';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts } from '@/theme/tokens';

export default function WatchScreen() {
  const params = useLocalSearchParams<{ showId: string; episode: string }>();
  const show = useShow(params.showId);
  const membership = useMembership();
  const requested = Math.max(1, Number.parseInt(params.episode ?? '1', 10) || 1);
  const n = show.data ? Math.min(requested, show.data.latestEpisode) : requested;
  const isMember = membership.data?.active ?? false;
  const locked = n > FREE_EPISODES && !isMember;
  const episode = useEpisode(params.showId ?? '', n);

  useEffect(() => {
    if (show.data && membership.isSuccess && locked) {
      router.replace({ pathname: '/join', params: { showId: show.data.id, episode: String(n) } });
    }
  }, [locked, membership.isSuccess, n, show.data]);

  if (show.isError || episode.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message="This episode didn’t load. Check your connection." onRetry={() => void episode.refetch()} />
        <Button kind="outline" label="Close" onPress={() => router.back()} />
      </View>
    );
  }
  if (!show.data || !episode.data || locked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  return <Player key={`${show.data.id}-${n}`} show={show.data} episode={episode.data} isMember={isMember} />;
}

type Overlay = { kind: 'next'; count: number; paused: boolean } | { kind: 'caught-up' } | { kind: 'join' } | null;

/**
 * The episode player. One square picture plays continuously; the phone can turn at any moment.
 *
 * - The picture glides level during a turn and settles to the nearest orientation (see useTurn).
 * - It never zooms during a turn. After it settles, a slow 4-second camera move reframes the shot.
 * - Title and progress bar sit on the screen's border. They show for 3 seconds when the episode opens,
 *   then hide. A tap brings them (and the controls) back for 3 seconds; another tap hides them, with the
 *   same fade. Turning the phone never shows them.
 * - The views are never named on screen.
 */
function Player({ show, episode, isMember }: { show: Show; episode: Episode; isMember: boolean }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const smoothRotation = useAppStore((s) => s.followTurn);
  const turn = useTurn(smoothRotation);
  const saveProgress = useAppStore((s) => s.saveProgress);
  const savedPosition = useAppStore((s) => (s.progress[show.id]?.episode === episode.number ? s.progress[show.id]?.positionSec : 0));
  const [time, setTime] = useState(0);
  const [loved, setLoved] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const lastSaved = useRef(0);

  // On the web the window itself is the frame: wide windows get the sideways layout, nothing rotates.
  const orientation: Orientation = web ? 0 : turn.orientation;
  const sideways = web ? W > H : orientation !== 0;
  const view = web ? { width: W, height: H } : viewerSize(W, H, orientation);

  const player = useVideoPlayer(episode.videoUrl, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.loop = false;
    if (savedPosition && savedPosition > 5) p.currentTime = savedPosition;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const duration = player.duration > 0 ? player.duration : episode.durationSec;

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setTime(currentTime);
    if (Math.abs(currentTime - lastSaved.current) >= 5) {
      lastSaved.current = currentTime;
      saveProgress(show.id, { episode: episode.number, positionSec: currentTime, durationSec: duration });
    }
  });

  // ---------- Reframe: the slow camera move ----------
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const zoom = useSharedValue(1);
  const shot = shotIndex(episode.reframe, sideways, time);
  const placed = useRef(false);

  // A cut is a cut: the framing jumps with the edit (never mid-turn).
  useEffect(() => {
    if (turn.turning) return;
    const k = reframeAt(episode.reframe, sideways, time);
    panX.value = k.x;
    panY.value = k.y;
    zoom.value = k.z;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  // A turn freezes the camera. Once it settles, the camera eases to the new view's framing over 4 seconds.
  useEffect(() => {
    if (turn.turning) {
      cancelAnimation(panX);
      cancelAnimation(panY);
      cancelAnimation(zoom);
      return;
    }
    const k = reframeAt(episode.reframe, sideways, time);
    if (!placed.current) {
      placed.current = true;
      panX.value = k.x;
      panY.value = k.y;
      zoom.value = k.z;
      return;
    }
    const move = { duration: REFRAME_MS, easing: Easing.inOut(Easing.cubic) };
    panX.value = withTiming(k.x, move);
    panY.value = withTiming(k.y, move);
    zoom.value = withTiming(k.z, move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.turning, sideways]);

  // ---------- Title, bar and controls: 3 seconds on open, then a tap toggles them ----------
  const [chromeOn, setChromeOn] = useState(true);
  const [kick, setKick] = useState(0);
  const poke = useCallback(() => setKick((n) => n + 1), []);
  useEffect(() => {
    if (!chromeOn || !isPlaying) return;
    const id = setTimeout(() => setChromeOn(false), CHROME_MS);
    return () => clearTimeout(id);
  }, [chromeOn, isPlaying, kick]);

  // At the end of the free episodes the bar stays up, so you can always drag back into the episode.
  const barPinned = overlay?.kind === 'join';
  const chrome = useDerivedValue<number>(() => withTiming(chromeOn || barPinned ? 1 : 0, { duration: CHROME_FADE_MS }), [chromeOn, barPinned]);
  // Controls also step aside while the phone turns, and come back once it settles.
  const steady = useDerivedValue(() => withTiming(turn.settled.value, { duration: turn.settled.value ? 220 : 120 }));
  const controlsStyle = useAnimatedStyle(() => ({ opacity: chrome.value * steady.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: steady.value }));
  const backStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const controlsLive = chromeOn && !turn.turning && !overlay;

  // ---------- Episode flow ----------
  const isLatest = episode.number >= show.latestEpisode;
  const nextNeedsMembership = episode.number + 1 > FREE_EPISODES && !isMember;

  const goNext = useCallback(() => {
    if (isLatest) {
      setOverlay({ kind: 'caught-up' });
      return;
    }
    if (nextNeedsMembership) {
      player.pause();
      setOverlay({ kind: 'join' });
      return;
    }
    saveProgress(show.id, { episode: episode.number + 1, positionSec: 0 });
    router.setParams({ episode: String(episode.number + 1) });
  }, [episode.number, isLatest, nextNeedsMembership, player, saveProgress, show.id]);

  useEventListener(player, 'playToEnd', () => {
    saveProgress(show.id, { episode: episode.number, positionSec: duration, durationSec: duration });
    if (isLatest || nextNeedsMembership) goNext();
    else setOverlay({ kind: 'next', count: UP_NEXT_SECONDS, paused: false });
  });

  // "Up next" countdown, then roll into the next episode.
  useEffect(() => {
    if (overlay?.kind !== 'next' || overlay.paused) return;
    if (overlay.count <= 0) {
      goNext();
      return;
    }
    const id = setTimeout(() => setOverlay({ ...overlay, count: overlay.count - 1 }), 1000);
    return () => clearTimeout(id);
  }, [overlay, goNext]);

  const togglePlay = () => {
    poke();
    if (player.playing) player.pause();
    else player.play();
  };
  const skip = (by: number) => {
    poke();
    player.currentTime = Math.max(0, Math.min(duration, player.currentTime + by));
  };
  const rewatchEnd = () => {
    setOverlay(null);
    player.currentTime = Math.max(0, duration - 60);
    player.play();
  };
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);
  const fraction = scrubFrac ?? (duration > 0 ? time / duration : 0);
  const seekTo = (t: number) => {
    poke();
    player.currentTime = Math.max(0, Math.min(duration, t));
  };
  const endScrub = (f: number | null) => {
    setScrubFrac(f);
    if (f === null && overlay?.kind === 'join' && player.currentTime < duration - 0.5) {
      // Dragged back into the episode: drop the sign-up card and keep watching.
      setOverlay(null);
      player.play();
    }
  };

  // Border distances: clear the notch and home indicator on the phone's physical edges.
  const pads = useMemo(
    () => ({ top: Math.max(12, insets.top), right: Math.max(12, insets.right), bottom: Math.max(12, insets.bottom), left: Math.max(12, insets.left) }),
    [insets.bottom, insets.left, insets.right, insets.top],
  );
  // Safe area as the viewer sees it, for controls laid out in the viewer's frame.
  // Where the progress bar runs, in the viewer's frame (matches BorderChrome's border at rest).
  const edge = web
    ? { bottom: insets.bottom + 12, left: 12, right: 12 }
    : orientation === 0
      ? { bottom: pads.bottom, left: pads.left, right: pads.right }
      : orientation === 90
        ? { bottom: pads.left, left: pads.top, right: pads.bottom }
        : { bottom: pads.right, left: pads.bottom, right: pads.top };
  const scrubOn = ((chromeOn && !overlay) || barPinned) && !turn.turning;
  const safe = web
    ? { top: insets.top + 8, bottom: insets.bottom + 8, left: 16, right: 16 }
    : orientation === 0
      ? { top: pads.top, bottom: pads.bottom, left: 12, right: 12 }
      : orientation === 90
        ? { top: 14, bottom: 14, left: pads.top, right: pads.bottom }
        : { top: 14, bottom: 14, left: pads.bottom, right: pads.top };

  const dropStart = Math.floor((episode.number - 1) / 10) * 10 + 1;
  const dropEnd = Math.min(dropStart + 9, show.episodeCount);
  const free = episode.number <= FREE_EPISODES;

  const share = () => {
    poke();
    void Share.share({ message: `${show.title}, Episode ${episode.number}: ${WEB_URL}/watch/${show.id}/${episode.number}` });
  };
  const openComments = () => {
    player.pause();
    router.push({ pathname: '/comments/[showId]/[episode]', params: { showId: show.id, episode: String(episode.number), t: String(Math.floor(time)) } });
  };

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      <TurnStage player={player} width={W} height={H} angle={turn.angle} fade={turn.fade} panX={panX} panY={panY} zoom={zoom} />

      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={chromeOn ? 'Hide controls' : 'Show controls'}
        onPress={() => setChromeOn((on) => !on)}
      />

      {__DEV__ ? <TurnReadout turn={turn} w={W} h={H} top={insets.top} /> : null}

      <BorderChrome
        width={W}
        height={H}
        pads={web ? { top: insets.top + 12, right: 12, bottom: insets.bottom + 12, left: 12 } : pads}
        angle={turn.angle}
        visible={chrome}
        title={barPinned ? '' : `${show.title} · Ep ${episode.number}`}
        progress={fraction}
        scrubbing={scrubFrac !== null}
      />

      {/* Everything below is laid out in the viewer's frame: upright, or turned to match the phone. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.viewer,
          { width: view.width, height: view.height, left: (W - view.width) / 2, top: (H - view.height) / 2 },
          { transform: [{ rotate: `${orientation}deg` }] },
        ]}
      >
        <Animated.View pointerEvents={controlsLive ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, controlsStyle, overlay ? { display: 'none' } : null]}>

          <View style={styles.transport} pointerEvents="box-none">
            <RoundButton icon="back10" label="Back 10 seconds" size={52} onPress={() => skip(-10)} glyph="10" />
            <RoundButton icon={isPlaying ? 'pause' : 'play'} label={isPlaying ? 'Pause' : 'Play'} size={68} onPress={togglePlay} />
            <RoundButton
              icon="forward10"
              label="Forward 10 seconds"
              size={52}
              onPress={() => skip(10)}
              // Testing only: hold to jump to 5 seconds before the end, to see the ending screens.
              onLongPress={__DEV__ ? () => { player.currentTime = Math.max(0, duration - 5); } : undefined}
              glyph="10"
            />
          </View>

          {sideways ? (
            <View style={[styles.topRow, { top: safe.top - 15, right: safe.right - 8 }]}>
              <RoundButton icon="heart" label="Love" active={loved} onPress={() => { poke(); setLoved((v) => !v); }} />
              <RoundButton icon="chat" label="Comments" onPress={openComments} />
              <RoundButton icon="share" label="Share this episode" onPress={share} />
            </View>
          ) : (
            <View style={[styles.rail, { right: safe.right - 11, bottom: safe.bottom + 110 }]}>
              <RailButton icon="heart" label="Love" active={loved} onPress={() => { poke(); setLoved((v) => !v); }} />
              <RailButton icon="chat" label="Comments" onPress={openComments} />
              <RailButton icon="share" label="Share" onPress={share} />
            </View>
          )}

          <View style={[styles.bottom, { left: safe.left + 4, right: safe.right + 4, bottom: safe.bottom + 22 }]}>
            <View style={{ flex: 1, gap: 6, maxWidth: sideways ? 280 : undefined }}>
              <View style={styles.segments}>
                {Array.from({ length: dropEnd - dropStart + 1 }, (_, i) => (
                  <View key={i} style={[styles.segment, dropStart + i <= episode.number && { backgroundColor: colors.gold }]} />
                ))}
              </View>
              <T variant="caption" style={styles.dropLabel}>{`Episode ${episode.number} of ${dropEnd}${free ? ' · free' : ''}`}</T>
            </View>
            {sideways ? (
              <Pressable accessibilityRole="button" onPress={goNext} style={styles.nextPill}>
                <T variant="label" style={{ fontSize: 13 }}>{isLatest ? 'Latest episode' : 'Next episode'}</T>
                <Icon name="play" size={14} />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={isLatest ? 'You’re on the latest episode' : 'Next episode'} onPress={goNext} style={styles.nextSquare}>
                <Icon name="next" size={18} />
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* The back button shows with the title on every tap, even if the phone is moving, so you can always leave. */}
        <Animated.View pointerEvents={chromeOn && !overlay ? 'box-none' : 'none'} style={[styles.backSlot, { top: safe.top - 15, left: safe.left - 8 }, backStyle, overlay ? { display: 'none' } : null]}>
          <RoundButton icon="back" label="Close player" onPress={() => router.back()} />
        </Animated.View>

        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, overlayStyle]}>
          {overlay?.kind === 'next' ? (
            <UpNext
              show={show}
              episode={episode.number}
              count={overlay.count}
              paused={overlay.paused}
              sideways={sideways}
              safe={safe}
              onPlay={goNext}
              onStay={() => setOverlay({ ...overlay, paused: !overlay.paused })}
            />
          ) : null}
          {overlay?.kind === 'caught-up' ? <CaughtUp show={show} episode={episode.number} sideways={sideways} safe={safe} onRewatch={rewatchEnd} /> : null}
          {overlay?.kind === 'join' ? <JoinWeb show={show} nextEpisode={episode.number + 1} sideways={sideways} safe={safe} /> : null}
        </Animated.View>

        {scrubOn ? (
          <Scrubber
            left={edge.left + 16}
            width={view.width - edge.left - edge.right - 32}
            bottom={edge.bottom}
            duration={duration}
            time={time}
            onScrub={endScrub}
            onSeek={seekTo}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Dev-only numbers for testing the turn on a real phone (hidden in release builds). */
function TurnReadout({ turn, w, h, top }: { turn: Turn; w: number; h: number; top: number }) {
  const [txt, setTxt] = useState('');
  useAnimatedReaction(
    () => `tilt ${Math.round(turn.roll.value)}° · picture ${Math.round(turn.angle.value)}° · rest ${turn.rest.value} · system ${turn.systemTurn.value}`,
    (now, prev) => {
      if (now !== prev) scheduleOnRN(setTxt, now);
    },
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: top + 52, left: 0, right: 0, alignItems: 'center' }}>
      <T style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#7CFFB2', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
        {`${txt} · screen ${Math.round(w)}×${Math.round(h)}`}
      </T>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  size = 44,
  active,
  glyph,
  onLongPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  size?: number;
  active?: boolean;
  glyph?: string;
}) {
  const big = size > 44;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 },
        big && { backgroundColor: 'rgba(8,8,10,0.45)' },
      ]}
    >
      <Icon name={icon} size={big ? Math.round(size * 0.44) : 22} color={active ? colors.accent : colors.text} filled={active} />
      {glyph ? <T style={styles.glyph}>{glyph}</T> : null}
    </Pressable>
  );
}

function RailButton({ icon, label, onPress, active }: { icon: 'heart' | 'chat' | 'share'; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress} style={{ width: 66, alignItems: 'center', gap: 2 }}>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={active ? colors.accent : colors.text} filled={active} />
      </View>
      <T variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: 11, letterSpacing: 0 }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  viewer: { position: 'absolute' },
  backSlot: { position: 'absolute' },
  topRow: { position: 'absolute', flexDirection: 'row', gap: 4 },
  transport: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 48 },
  rail: { position: 'absolute', gap: 8 },
  bottom: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10 },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#33333D' },
  dropLabel: { color: 'rgba(244,241,234,0.85)', fontFamily: fonts.bodyBold },
  glyph: { position: 'absolute', fontFamily: fonts.bodyHeavy, fontSize: 8, top: '47%' },
  nextPill: { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(244,241,234,0.35)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextSquare: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,241,234,0.35)', alignItems: 'center', justifyContent: 'center' },
});
