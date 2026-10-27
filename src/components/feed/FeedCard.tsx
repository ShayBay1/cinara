import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Glass } from '@/components/Glass';
import { Icon, type IconName } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { Avatar } from '@/components/ui';
import type { ComingSoon, Show } from '@/data';
import { COMING_SOON_COVER, coverSource } from '@/data/covers';
import { useReminder } from '@/hooks/useReminder';
import { haptic } from '@/lib/haptics';
import { playEpisode } from '@/lib/play';
import { countdownParts, premiereFor, premiereStage } from '@/lib/premieres';
import { capitalize, dayLabel, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts } from '@/theme/tokens';

import { Fade } from './Fade';
import { KenBurns } from './KenBurns';

/** Space kept clear at the bottom for the floating tab bar. */
export const FEED_BOTTOM = 112;
/** Show a premiere countdown on a card when the next drop is this close. */
const COUNTDOWN_WITHIN_MS = 3 * 24 * 3600 * 1000;

const SHADE: [number, number][] = [
  [0, 0.5],
  [0.16, 0],
  [0.48, 0],
  [0.78, 0.6],
  [1, 0.92],
];

/** One full-screen show in the Feed: its art, where you are in it, and what to do next. */
export function ShowCard({
  show,
  active,
  now,
  height,
  entrance,
}: {
  show: Show;
  active: boolean;
  now: Date;
  height: number;
  /** 0..1 on the very first card after the opening: the art settles, then the words and buttons arrive. */
  entrance?: SharedValue<number>;
}) {
  const { art, words, rail } = useEntrance(entrance);
  const progress = useAppStore((s) => s.progress[show.id]);
  const reminder = useReminder(show);
  const [liked, setLiked] = useState(false);

  const premiere = premiereFor(show, now);
  const stage = premiere ? premiereStage(premiere.at, now) : null;
  const left = premiere ? premiere.at.getTime() - now.getTime() : Infinity;
  const isLive = stage === 'live' || stage === 'doors';
  const showCountdown = stage === 'countdown' && left < COUNTDOWN_WITHIN_MS;

  const resumeEp = progress && progress.episode <= show.latestEpisode ? progress.episode : null;
  const ep = resumeEp ?? 1;
  const epTitle = show.episodeTitles[ep - 1];
  const frac =
    resumeEp && progress?.durationSec ? Math.min(1, progress.positionSec / progress.durationSec) : 0;
  const lead = show.cast[0];

  const share = () => {
    haptic.tap();
    void Share.share({ message: `${show.title} on Cinara: ${show.tagline}` });
  };

  return (
    <View style={{ height, backgroundColor: colors.ink }}>
      <Animated.View style={[StyleSheet.absoluteFill, art]}>
        <KenBurns source={coverSource(show)} color={show.color} active={active} />
      </Animated.View>
      <Fade stops={SHADE} />

      <Animated.View style={[styles.info, words]} pointerEvents="box-none">
        {isLive ? (
          <View style={[styles.badge, { backgroundColor: colors.live }]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>LIVE NOW · NEW EPISODES</Text>
          </View>
        ) : showCountdown && premiere ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              NEW EPISODES {dayLabel(premiere.at, now).toUpperCase()} · {SLOT_LABEL}
            </Text>
          </View>
        ) : null}
        <Text style={styles.eyebrow}>
          No. {show.number} · {show.genre}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {show.title}
        </Text>
        <Text style={styles.ep} numberOfLines={1}>
          Episode {ep}
          {epTitle ? ` · ${epTitle}` : ''}
        </Text>
        <Text style={styles.tag} numberOfLines={2}>
          {show.tagline}
        </Text>

        {showCountdown && premiere ? <Countdown ms={left} /> : null}

        <View style={styles.ctas}>
          {isLive ? (
            <Pill
              label="Join the premiere"
              live
              onPress={() => router.push({ pathname: '/live/[showId]', params: { showId: show.id } })}
            />
          ) : (
            <Pill
              label={resumeEp ? 'Keep watching' : 'Watch from Ep 1'}
              onPress={() => playEpisode(show.id, ep)}
            />
          )}
          <Pill
            label="Episodes"
            ghost
            onPress={() => router.push({ pathname: '/show/[showId]', params: { showId: show.id } })}
          />
        </View>
      </Animated.View>

      <Animated.View style={[styles.rail, rail]}>
        <Pressy
          accessibilityRole="button"
          accessibilityLabel={`Open ${show.title}`}
          onPress={() => router.push({ pathname: '/show/[showId]', params: { showId: show.id } })}
          style={styles.avaRing}
        >
          <Avatar handle={lead?.role ?? show.title} size={42} />
        </Pressy>
        <RailButton
          icon="heart"
          label={liked ? 'Liked' : 'Like'}
          on={liked}
          onPress={() => {
            setLiked((v) => !v);
            haptic.pick();
          }}
        />
        <RailButton
          icon="chat"
          label="Comments"
          onPress={() =>
            router.push({
              pathname: '/comments/[showId]/[episode]',
              params: { showId: show.id, episode: String(ep) },
            })
          }
        />
        <RailButton
          icon="bell"
          label={reminder.isOn ? 'Reminded' : 'Remind'}
          on={reminder.isOn}
          onPress={() => void reminder.toggle()}
        />
        <RailButton icon="share" label="Share" onPress={share} />
      </Animated.View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${frac * 100}%` }]} />
      </View>
    </View>
  );
}

/** Entrance styles for the first card (no-ops when there's no entrance). */
function useEntrance(e?: SharedValue<number>) {
  const art = useAnimatedStyle(() => {
    const v = e ? e.value : 1;
    return { transform: [{ scale: interpolate(v, [0, 1], [1.08, 1]) }] };
  });
  const words = useAnimatedStyle(() => {
    const v = e ? e.value : 1;
    return {
      opacity: interpolate(v, [0.4, 0.8], [0, 1], 'clamp'),
      transform: [{ translateY: interpolate(v, [0.4, 0.85], [18, 0], 'clamp') }],
    };
  });
  const rail = useAnimatedStyle(() => {
    const v = e ? e.value : 1;
    return {
      opacity: interpolate(v, [0.6, 0.95], [0, 1], 'clamp'),
      transform: [{ translateX: interpolate(v, [0.6, 1], [26, 0], 'clamp') }],
    };
  });
  return { art, words, rail };
}

/** The show that's coming next, in the same full-screen frame. */
export function ComingSoonCard({
  soon,
  active,
  height,
}: {
  soon: ComingSoon;
  active: boolean;
  height: number;
}) {
  const share = () => {
    haptic.tap();
    void Share.share({ message: `${soon.title ?? 'A new show'} is coming to Cinara.` });
  };
  return (
    <View style={{ height, backgroundColor: colors.ink }}>
      <KenBurns source={soon.coverUrl ? { uri: soon.coverUrl } : COMING_SOON_COVER} color="#2A2418" active={active} />
      <Fade stops={SHADE} />
      <View style={styles.info} pointerEvents="box-none">
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON{soon.arrives ? ` · ${soon.arrives.toUpperCase()}` : ''}</Text>
        </View>
        <Text style={styles.eyebrow}>Next on Cinara</Text>
        <Text style={styles.title} numberOfLines={2}>
          {soon.title ?? 'A new show'}
        </Text>
        {soon.starring ? <Text style={styles.ep}>{soon.starring}</Text> : null}
        {soon.teaser ? (
          <Text style={styles.tag} numberOfLines={3}>
            {soon.teaser}
          </Text>
        ) : null}
      </View>
      <View style={styles.rail}>
        <RailButton icon="share" label="Share" onPress={share} />
      </View>
    </View>
  );
}

function Countdown({ ms }: { ms: number }) {
  const c = countdownParts(ms);
  const cells = c.days > 0 ? [[c.days, 'DAY'], [c.h, 'HRS'], [c.m, 'MIN']] : [[c.h, 'HRS'], [c.m, 'MIN'], [c.s, 'SEC']];
  return (
    <View style={styles.count}>
      {cells.map(([n, l]) => (
        <View key={String(l)} style={styles.cell}>
          <Glass radius={12} style={StyleSheet.absoluteFill} />
          <Text style={styles.cellNum}>{n}</Text>
          <Text style={styles.cellLabel}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

function Pill({
  label,
  onPress,
  ghost,
  live,
}: {
  label: string;
  onPress: () => void;
  ghost?: boolean;
  live?: boolean;
}) {
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={label}
      feel="tap"
      onPress={onPress}
      style={[
        styles.pill,
        ghost ? null : { backgroundColor: live ? colors.live : colors.gold },
      ]}
    >
      {ghost ? <Glass radius={999} style={StyleSheet.absoluteFill} /> : null}
      {ghost ? null : <Icon name="play" size={14} color={live ? '#fff' : colors.goldInk} />}
      <Text style={[styles.pillText, { color: ghost || live ? colors.text : colors.goldInk }]}>
        {capitalize(label)}
      </Text>
    </Pressy>
  );
}

function RailButton({
  icon,
  label,
  on,
  onPress,
}: {
  icon: IconName;
  label: string;
  on?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressy accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.railBtn} scaleTo={0.88}>
      <Icon name={icon} size={30} color={on ? colors.gold : colors.text} />
      <Text style={styles.railLabel}>{label}</Text>
    </Pressy>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  info: { position: 'absolute', left: 16, right: 84, bottom: FEED_BOTTOM },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 10,
  },
  badgeText: { fontFamily: fonts.bodyHeavy, fontSize: 10, letterSpacing: 1.4, color: colors.goldInk },
  eyebrow: {
    fontFamily: fonts.engraved,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.goldLight,
    textTransform: 'uppercase',
    marginBottom: 6,
    ...shadow,
  },
  title: { fontFamily: fonts.serifItalic, fontSize: 38, lineHeight: 40, color: colors.text, marginBottom: 6, ...shadow },
  ep: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSoft, marginBottom: 6, ...shadow },
  tag: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSoft, marginBottom: 14, ...shadow },
  ctas: { flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pillText: { fontFamily: fonts.bodyHeavy, fontSize: 14 },
  count: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  cell: { minWidth: 58, paddingVertical: 7, borderRadius: 12, alignItems: 'center', overflow: 'hidden' },
  cellNum: { fontFamily: fonts.serifItalic, fontSize: 26, lineHeight: 28, color: colors.text },
  cellLabel: { fontFamily: fonts.engraved, fontSize: 8, letterSpacing: 1.5, color: colors.muted },
  rail: { position: 'absolute', right: 8, bottom: FEED_BOTTOM + 6, alignItems: 'center', gap: 16 },
  avaRing: { borderWidth: 2, borderColor: colors.text, borderRadius: 25, padding: 1, marginBottom: 4 },
  railBtn: { alignItems: 'center', gap: 3, minWidth: 56 },
  railLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text, ...shadow },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FEED_BOTTOM - 14,
    height: 2,
    backgroundColor: 'rgba(243,234,216,0.18)',
  },
  trackFill: { height: 2, backgroundColor: colors.gold },
});
