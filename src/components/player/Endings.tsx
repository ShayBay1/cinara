import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { Easing, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import { T } from '@/components/ui';
import { FREE_EPISODES, type Show } from '@/data';
import { useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { canSellHere, showExternalJoinLink, WEB_URL } from '@/lib/billing';
import { dayLabel, dropOf, nextDrop, nextPremieres, SLOT_LABEL } from '@/lib/schedule';
import { colors, fonts, radius } from '@/theme/tokens';
import { coverSource } from '@/data/covers';

/**
 * The three ways an episode can end, each laid out for upright or sideways (from the locked mockups).
 * They sit over the episode's last frame, held, and are drawn in the viewer's frame by the player.
 */
export interface Safe {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const UP_NEXT_SECONDS = 5;

/** Drop progress: "6 of 10 watched this week", ten little bars. */
function DropBars({ show, watched }: { show: Show; watched: number }) {
  const drop = dropOf(watched, show.episodeCount);
  const size = drop.to - drop.from + 1;
  const done = watched - drop.from + 1;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: size }, (_, i) => (
          <View key={i} style={[styles.bar, i < done && { backgroundColor: colors.text }]} />
        ))}
      </View>
      <T style={styles.small}>{`${done} of ${size} watched this week`}</T>
    </View>
  );
}

function Ring({ count, paused }: { count: number; paused: boolean }) {
  const c = 2 * Math.PI * 34;
  const left = paused ? 0 : count / UP_NEXT_SECONDS;
  return (
    <View style={{ width: 76, height: 76 }}>
      <Svg width={76} height={76} viewBox="0 0 76 76">
        <Circle cx={38} cy={38} r={34} stroke="rgba(244,241,234,0.2)" strokeWidth={4} fill="none" />
        <Circle cx={38} cy={38} r={34} stroke={colors.gold} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={[c * left, c]} transform="rotate(-90 38 38)" />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <T style={styles.ringNum} accessibilityLiveRegion="polite">{paused ? '–' : String(count)}</T>
      </View>
    </View>
  );
}

/** Up next: a 5-second countdown over the held last frame. Stay pauses it; tap again to resume. */
export function UpNext({
  show,
  episode,
  count,
  paused,
  sideways,
  safe,
  onPlay,
  onStay,
}: {
  show: Show;
  episode: number;
  count: number;
  paused: boolean;
  sideways: boolean;
  safe: Safe;
  onPlay: () => void;
  onStay: () => void;
}) {
  const next = episode + 1;
  const title = show.episodeTitles[next - 1];
  const play = (
    <Pressable accessibilityRole="button" onPress={onPlay} style={({ pressed }) => [styles.playNow, sideways && { height: 46, paddingHorizontal: 20 }, pressed && { opacity: 0.85 }]}>
      <Icon name="play" size={16} color={colors.ink} />
      <T style={styles.playText}>Play now</T>
    </Pressable>
  );
  const stay = (
    <Pressable accessibilityRole="button" onPress={onStay} style={styles.stay}>
      <T style={styles.stayText}>{sideways ? (paused ? 'Resume' : 'Stay') : paused ? 'Countdown paused · tap to resume' : 'Stay on this episode'}</T>
    </Pressable>
  );

  if (sideways) {
    return (
      <View style={[styles.fade, styles.fadeWide]} pointerEvents="box-none">
        <View style={[styles.wideRow, { left: safe.left + 4, right: safe.right + 4, bottom: safe.bottom + 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 }}>
            <Ring count={count} paused={paused} />
            <View style={{ gap: 3, flexShrink: 1 }}>
              <T style={styles.eyebrow}>UP NEXT</T>
              <T style={[styles.epTitle, { fontSize: 24 }]} numberOfLines={1}>{`Ep ${next}${title ? ` · ${title}` : ''}`}</T>
              <T style={styles.small}>{`${episode - dropOf(episode, show.episodeCount).from + 1} of ${dropOf(episode, show.episodeCount).to - dropOf(episode, show.episodeCount).from + 1} watched this week`}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {play}
            {stay}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fade} pointerEvents="box-none">
      <View style={[styles.column, { left: 20, right: 20, bottom: safe.bottom + 14 }]}>
        <T style={styles.eyebrow}>UP NEXT</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Ring count={count} paused={paused} />
          <View style={{ gap: 4, flexShrink: 1 }}>
            <T style={styles.epTitle}>{`Ep ${next}${title ? ` · ${title}` : ''}`}</T>
            <T style={styles.serif} numberOfLines={2}>{show.tagline}</T>
          </View>
        </View>
        <DropBars show={show} watched={episode} />
        {play}
        {stay}
      </View>
    </View>
  );
}

/** Caught up: the next drop's countdown, a reminder, and something to watch while you wait. */
export function CaughtUp({ show, episode, sideways, safe, onRewatch }: { show: Show; episode: number; sideways: boolean; safe: Safe; onRewatch: () => void }) {
  const now = useNow(1000);
  const reminder = useReminder(show);
  const shows = useShows();
  const drop = nextDrop(show.latestEpisode, show.episodeCount);
  const [next] = drop ? nextPremieres(show.releaseDays, now) : [];
  const other = (shows.data ?? []).find((s) => s.id !== show.id);

  const left = next ? Math.max(0, next.getTime() - now.getTime()) : 0;
  const days = Math.floor(left / 86_400_000);
  const hrs = Math.floor((left % 86_400_000) / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);

  const main = (
    <View style={{ gap: 12, alignItems: 'center', flex: sideways ? 1.2 : undefined }}>
      <T style={styles.eyebrow}>{drop ? 'YOU’RE CAUGHT UP' : 'SEASON COMPLETE'}</T>
      <T style={[styles.serifBig, sideways && { fontSize: 28, lineHeight: 30 }]}>
        {drop && next ? `Episodes ${drop.from}–${drop.to} premiere ${dayLabel(next, now)} at ${SLOT_LABEL}.` : 'That was the season finale.'}
      </T>
      {drop && next ? (
        <>
          <T style={[styles.small, { textAlign: 'center' }]}>Watch live with the cast in the chat, or any time after.</T>
          <View style={{ flexDirection: 'row', gap: 10 }} accessibilityLabel={`${days} days, ${hrs} hours, ${mins} minutes`}>
            {[
              [String(days), 'DAYS'],
              [String(hrs).padStart(2, '0'), 'HRS'],
              [String(mins).padStart(2, '0'), 'MIN'],
            ].map(([n, l]) => (
              <View key={l} style={styles.unit}>
                <T style={styles.unitNum}>{n}</T>
                <T style={styles.unitLabel}>{l}</T>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: reminder.isOn }}
            onPress={reminder.toggle}
            disabled={reminder.busy}
            style={[styles.remind, reminder.isOn && styles.remindOn]}
          >
            <Icon name={reminder.isOn ? 'check' : 'bell'} size={18} color={reminder.isOn ? colors.text : colors.ink} />
            <T style={[styles.playText, reminder.isOn && { color: colors.text }]}>{reminder.isOn ? `We’ll remind you at ${SLOT_LABEL}` : 'Remind me'}</T>
          </Pressable>
        </>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onRewatch} style={styles.stay}>
        <T style={styles.stayText}>{`Rewatch Ep ${episode}’s last minute`}</T>
      </Pressable>
    </View>
  );

  const wait = other ? (
    <View style={{ gap: 10, flex: sideways ? 1 : undefined }}>
      <T style={styles.small}>While you wait</T>
      <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/watch/[showId]/[episode]', params: { showId: other.id, episode: '1' } })} style={styles.card}>
        <View style={[styles.poster, { backgroundColor: other.color, overflow: 'hidden' }]}>
          {coverSource(other) ? <Image source={coverSource(other)!} style={StyleSheet.absoluteFill} contentFit="cover" /> : <T style={{ fontFamily: fonts.display, fontSize: 20 }}>{other.title.charAt(0)}</T>}
        </View>
        <View style={{ flexShrink: 1 }}>
          <T variant="label" style={{ fontSize: 15 }}>{other.title}</T>
          <T style={styles.small}>{`Episodes 1–${FREE_EPISODES} free`}</T>
        </View>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={[styles.solid, { paddingTop: safe.top + (sideways ? 8 : 56), paddingBottom: safe.bottom + 16, paddingLeft: safe.left + 8, paddingRight: safe.right + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to the show" onPress={() => router.back()} style={[styles.back, { top: safe.top - 4, left: safe.left - 4 }]}>
        <Icon name="back" />
      </Pressable>
      <View style={sideways ? { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 28, paddingLeft: 40 } : { flex: 1, justifyContent: 'space-between', gap: 24 }}>
        <View style={{ flex: sideways ? 1.2 : undefined, justifyContent: 'center', flexGrow: sideways ? 1.2 : 1 }}>{main}</View>
        {wait}
      </View>
    </View>
  );
}

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

/**
 * Free episodes done. The episode ends on its cliffhanger and the picture freezes on that exact frame,
 * only slightly blurred, so the moment stays in the viewer's face while they decide. (The free episodes
 * are cut to land on a strong final frame for this.) Over it, a title card
 * (show name, next episode, how far you've come), and one button. Continue turns into Sign up and
 * Sign in with a soft spring. Everything arrives in a short, staggered fade.
 * - Sign up: the website version opens checkout; the apps open the website (when allowed) or create
 *   a free account, since nothing is sold in the apps.
 * - Sign in: members sign in and the next episode starts right here.
 */
export function JoinWeb({ show, nextEpisode, sideways, safe }: { show: Show; nextEpisode: number; sideways: boolean; safe: Safe }) {
  const [open, setOpen] = useState(false);
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSpring(open ? 1 : 0, { damping: 20, stiffness: 170, mass: 0.9 });
  }, [open, t]);

  // A slight blur eases in over the frozen final frame. Just enough for the text to read; the moment stays visible.
  const blur = useSharedValue(0);
  useEffect(() => {
    blur.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [blur]);
  const blurProps = useAnimatedProps(() => ({ intensity: 14 * blur.value }));

  const continueStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ scale: 1 - 0.06 * t.value }] }));
  const first = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * 14 }, { scale: 0.96 + 0.04 * t.value }] }));
  const second = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (t.value - 0.15) / 0.85));
    return { opacity: k, transform: [{ translateY: (1 - k) * 18 }, { scale: 0.96 + 0.04 * k }] };
  });

  const signUp = () => {
    if (canSellHere) router.replace({ pathname: '/join', params: { showId: show.id, episode: String(nextEpisode) } });
    else if (showExternalJoinLink) void WebBrowser.openBrowserAsync(`${WEB_URL}/join?show=${show.id}&episode=${nextEpisode}`);
    else router.push('/sign-in');
  };

  const watched = nextEpisode - 1;
  const nextTitle = show.episodeTitles[nextEpisode - 1];
  const enter = (i: number) => FadeInDown.delay(120 + i * 90).duration(620).easing(Easing.out(Easing.cubic));

  const titleCard = (
    <View style={{ gap: 10, alignItems: sideways ? 'flex-start' : 'center', flexShrink: 1 }}>
      <Animated.View entering={enter(0)}>
        <T style={styles.brandEyebrow}>A SNIPPETS ORIGINAL</T>
      </Animated.View>
      <Animated.View entering={enter(1)}>
        <T style={[styles.showTitle, sideways && { fontSize: 38, lineHeight: 46, textAlign: 'left' }]} numberOfLines={2}>
          {show.title}
        </T>
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <T style={[styles.nextLine, sideways && { textAlign: 'left' }]}>{`Episode ${nextEpisode}${nextTitle ? ` · ${nextTitle}` : ''}`}</T>
      </Animated.View>
      <Animated.View entering={enter(3)} style={{ width: sideways ? 260 : 240, gap: 8, marginTop: 6 }}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${Math.min(100, (watched / show.episodeCount) * 100)}%` }]} />
        </View>
        <T style={[styles.trackLabel, !sideways && { textAlign: 'center' }]}>{`${watched} of ${show.episodeCount} watched`}</T>
      </Animated.View>
    </View>
  );

  const actions = (
    <Animated.View entering={enter(4)} style={{ width: sideways ? 300 : 320, alignItems: 'center', gap: 14 }}>
      <View style={{ alignSelf: 'stretch', height: 120 }}>
        <Animated.View pointerEvents={open ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, continueStyle]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOpen(true);
            }}
            style={({ pressed }) => [styles.pill, styles.pillSolid, pressed && styles.pressedPill]}
          >
            <T style={styles.pillSolidText}>Continue</T>
          </Pressable>
        </Animated.View>
        <View pointerEvents={open ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, { gap: 12 }]}>
          <Animated.View style={first}>
            <Pressable accessibilityRole="button" onPress={signUp} style={({ pressed }) => [styles.pill, styles.pillSolid, pressed && styles.pressedPill]}>
              <T style={styles.pillSolidText}>Sign up</T>
            </Pressable>
          </Animated.View>
          <Animated.View style={second}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={({ pressed }) => [styles.pill, styles.pillGlass, pressed && styles.pressedPill]}>
              <T style={styles.pillGlassText}>Sign in</T>
            </Pressable>
          </Animated.View>
        </View>
      </View>
      <T style={styles.finePrint}>Members watch every episode the night it premieres.</T>
    </Animated.View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedBlur animatedProps={blurProps} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.quiet, sideways && styles.quietWide]} pointerEvents="none" />
      <Pressable accessibilityRole="button" accessibilityLabel="Back to the show" onPress={() => router.back()} style={[styles.back, { top: safe.top - 4, left: safe.left - 4 }]}>
        <Icon name="back" />
      </Pressable>
      {sideways ? (
        <View style={[styles.quietRow, { left: safe.left + 36, right: safe.right + 28, bottom: safe.bottom + 40 }]} pointerEvents="box-none">
          {titleCard}
          {actions}
        </View>
      ) : (
        <View style={[styles.quietColumn, { bottom: safe.bottom + 44 }]} pointerEvents="box-none">
          {titleCard}
          {actions}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quiet: { ...StyleSheet.absoluteFill, experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.4) 100%)' },
  quietWide: { experimental_backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.25) 100%)' },
  quietColumn: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 34 },
  quietRow: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 },
  brandEyebrow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6, fontFamily: fonts.bodyHeavy, fontSize: 10, letterSpacing: 3.2, color: colors.gold },
  showTitle: { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 12, fontFamily: fonts.display, fontSize: 46, lineHeight: 56, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.text, textAlign: 'center' },
  nextLine: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8, fontFamily: fonts.serifItalic, fontSize: 21, lineHeight: 26, color: '#EDE6DE', textAlign: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(244,241,234,0.18)', overflow: 'hidden' },
  trackFill: { height: 3, borderRadius: 2, backgroundColor: colors.gold },
  trackLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: 'rgba(244,241,234,0.6)' },
  finePrint: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(244,241,234,0.55)', textAlign: 'center' },
  pill: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  pillSolid: { backgroundColor: colors.text },
  pillSolidText: { fontFamily: fonts.bodyHeavy, fontSize: 16, letterSpacing: 0.2, color: colors.ink },
  pillGlass: { backgroundColor: 'rgba(244,241,234,0.12)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(244,241,234,0.45)' },
  pillGlassText: { fontFamily: fonts.bodyHeavy, fontSize: 16, letterSpacing: 0.2, color: colors.text },
  pressedPill: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  fade: { ...StyleSheet.absoluteFill, experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.88) 75%)' },
  fadeWide: { experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 85%)' },
  solid: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,8,10,0.95)' },
  column: { position: 'absolute', gap: 14 },
  wideRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  eyebrow: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 2, color: colors.gold },
  epTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, textTransform: 'uppercase', color: colors.text },
  serif: { fontFamily: fonts.serifItalic, fontSize: 18, lineHeight: 22, color: '#F1E6E2' },
  serifBig: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 36, color: colors.text, textAlign: 'center' },
  small: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#E3DFE8' },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#33333D' },
  ringNum: { fontFamily: fonts.display, fontSize: 32, lineHeight: 76, textAlign: 'center', color: colors.text },
  playNow: { height: 54, borderRadius: 16, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  playText: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  stay: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  stayText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSoft },
  unit: { width: 74, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  unitNum: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, color: colors.text, fontVariant: ['tabular-nums'] },
  unitLabel: { fontFamily: fonts.bodyHeavy, fontSize: 10, letterSpacing: 1.6, color: colors.muted },
  remind: { height: 50, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', gap: 8 },
  remindOn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.gold },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  poster: { width: 44, height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
});
