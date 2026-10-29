import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Develop } from '@/components/Develop';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { BrowseHeader, BrowseHero, PremieringRow, TopRow } from '@/components/home/BrowseTop';
import { GhostRow } from '@/components/Skeleton';
import { Avatar, ErrorState, T } from '@/components/ui';
import type { Friend, Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useComingSoon, useFriends, useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { dropOf } from '@/lib/schedule';
import { playEpisode } from '@/lib/play';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, home, radius } from '@/theme/tokens';

const openShow = (id: string) =>
  router.push({ pathname: '/show/[showId]', params: { showId: id } });

/**
 * Home: browse everything. The featured show as a poster up top, then rows: where you left off,
 * what drops this week, the top shows, what friends are watching, tropes, and what's coming.
 * (The app opens on Feed; this is the second tab.)
 */
export default function HomeScreen() {
  const shows = useShows();
  const coming = useComingSoon();
  const now = useNow(1000);
  const insets = useSafeAreaInsets();
  const list = shows.data ?? [];
  const hero = list.find((s) => s.featured) ?? list[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            tintColor={home.gold}
            refreshing={shows.isRefetching}
            onRefresh={() => void shows.refetch()}
          />
        }
      >
        {hero ? <BrowseHero show={hero} now={now} /> : <View style={{ height: insets.top + 120 }} />}
        <View style={{ paddingHorizontal: 16 }}>
          {shows.isError ? (
            <ErrorState
              message="We couldn’t load the shows. Check your connection."
              onRetry={() => void shows.refetch()}
            />
          ) : null}
          {shows.isPending ? (
            <>
              <GhostRow width={176} height={99} />
              <GhostRow width={150} height={40} />
            </>
          ) : null}
          <ContinueWatching shows={list} />
        </View>
        <PremieringRow shows={list} now={now} />
        <TopRow shows={list} />
        <View style={{ paddingHorizontal: 16 }}>
          <FriendsWatching shows={list} />
          <Tropes shows={list} />
          {coming.data ? (
            <ComingSoonRow
              title={coming.data.title ?? 'Next on Cinara'}
              teaser={coming.data.teaser}
              arrives={coming.data.arrives}
            />
          ) : null}
        </View>
      </ScrollView>
      <BrowseHeader />
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <T style={styles.h2}>{children}</T>;
}

/** Everything you're partway through, most recent first, with a gold progress line. */
function ContinueWatching({ shows }: { shows: Show[] }) {
  const progress = useAppStore((s) => s.progress);
  const items = Object.entries(progress)
    .map(([id, p]) => ({ show: shows.find((s) => s.id === id), p }))
    .filter(
      (x): x is { show: Show; p: (typeof x)['p'] } =>
        !!x.show && x.p.episode <= x.show.latestEpisode,
    )
    .sort((a, b) => (b.p.updatedAt ?? 0) - (a.p.updatedAt ?? 0));
  if (!items.length) return null;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <View style={styles.section}>
      <Label>Continue watching</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {items.map(({ show, p }) => {
          const dur = p.durationSec ?? 0;
          const left = dur > 0 ? Math.max(0, dur - p.positionSec) : 0;
          const frac = dur > 0 ? Math.min(1, p.positionSec / dur) : 0;
          const title = show.episodeTitles[p.episode - 1];
          const drop = dropOf(p.episode, show.episodeCount);
          return (
            <Pressy
              key={show.id}
              accessibilityRole="button"
              accessibilityLabel={`Continue ${show.title}, episode ${p.episode}${left > 0 ? `, ${fmt(left)} left` : ''}`}
              onPress={() => playEpisode(show.id, p.episode)}
              style={{ width: 176, gap: 6 }}
            >
              <View style={[styles.thumb, { backgroundColor: show.color }]}>
                {coverSource(show) ? (
                  <Image
                    source={coverSource(show)!}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                ) : null}
                <View style={styles.thumbPlay}>
                  <Icon name="play" size={14} color={colors.ink} filled />
                </View>
                <View style={styles.thumbTrack}>
                  <View
                    style={{ width: `${frac * 100}%`, height: 3, backgroundColor: colors.gold }}
                  />
                </View>
              </View>
              <T style={styles.kicker} numberOfLines={1}>
                {show.title}
              </T>
              <T
                style={styles.epLine}
                numberOfLines={1}
              >{`Ep ${p.episode}${title ? ` · ${title}` : ''}`}</T>
              <T style={styles.meta}>
                {left > 0
                  ? `${fmt(left)} left · ${drop.to - p.episode} more this drop`
                  : `Episode ${p.episode} of ${drop.to}`}
              </T>
            </Pressy>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Friends' faces on what they're watching: the social layer as a reason to open the app. */
function FriendsWatching({ shows }: { shows: Show[] }) {
  const friends = useFriends();
  const active = (friends.data ?? []).filter(
    (f): f is Friend & { watching: NonNullable<Friend['watching']> } =>
      !!f.watching && !f.watching.caughtUp,
  );
  if (!active.length) return null;
  return (
    <View style={styles.section}>
      <Label>Your friends are watching</Label>
      <View style={styles.card}>
        {active.slice(0, 4).map((f, i) => {
          const show = shows.find((s) => s.id === f.watching.showId);
          if (!show) return null;
          return (
            <Pressy
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`${f.handle} is ${f.watching.watchingNow ? 'watching' : 'on'} ${show.title}, episode ${f.watching.episode}. Watch with them.`}
              onPress={() => playEpisode(show.id, f.watching.episode)}
              style={[styles.friendRow, i > 0 && styles.rule]}
            >
              <Avatar
                handle={f.handle}
                url={f.avatarUrl}
                size={40}
                online={f.watching.watchingNow}
              />
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text }}>
                  {f.handle}
                </T>
                <T
                  style={[styles.meta, f.watching.watchingNow && { color: colors.friend }]}
                  numberOfLines={1}
                >
                  {`${f.watching.watchingNow ? 'Watching now' : 'Watching'} · ${show.title} · Ep ${f.watching.episode}`}
                </T>
              </View>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.gold }}>
                Watch with them
              </T>
            </Pressy>
          );
        })}
      </View>
    </View>
  );
}

/** Tropes are how vertical-drama fans browse: one tap searches for the trope. */
function Tropes({ shows }: { shows: Show[] }) {
  const tropes = [...new Set(shows.map((s) => s.genre).filter(Boolean))];
  if (!tropes.length) return null;
  return (
    <View style={styles.section}>
      <Label>Browse by trope</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {tropes.map((t) => (
          <Pressy
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`Shows with the trope ${t}`}
            onPress={() => router.push({ pathname: '/search', params: { q: t } })}
            style={styles.chip}
          >
            <T style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text }}>{t}</T>
          </Pressy>
        ))}
      </ScrollView>
    </View>
  );
}

/** What's next on Cinara: in sepia until it arrives. */
function ComingSoonRow({
  title,
  teaser,
  arrives,
}: {
  title: string;
  teaser: string;
  arrives: string;
}) {
  const notify = useAppStore((s) => s.notifyComingSoon);
  const setNotify = useAppStore((s) => s.setNotifyComingSoon);
  return (
    <View style={styles.section}>
      <Label>Coming soon</Label>
      <View
        style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }]}
      >
        <Develop developed={false} style={styles.soonArt}>
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.wine, alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <Icon name="reel" size={30} color={colors.goldLight} />
          </View>
        </Develop>
        <View style={{ flex: 1, gap: 3 }}>
          <T style={{ fontFamily: fonts.engraved, fontSize: 14, color: colors.goldLight }}>
            {title}
          </T>
          <T
            style={{
              fontFamily: fonts.serifItalic,
              fontSize: 14,
              lineHeight: 18,
              color: colors.textSoft,
            }}
            numberOfLines={2}
          >
            {teaser}
          </T>
          <T style={styles.meta}>{arrives}</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            notify
              ? `We'll tell you when ${title} arrives. Tap to turn off.`
              : `Tell me when ${title} arrives`
          }
          accessibilityState={{ selected: notify }}
          onPress={() => setNotify(!notify)}
          style={[
            styles.notify,
            notify && { borderColor: colors.gold, backgroundColor: 'rgba(255,184,0,0.12)' },
          ]}
        >
          <Icon
            name={notify ? 'check' : 'bell'}
            size={18}
            color={notify ? colors.gold : colors.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 26 },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
    marginBottom: 10,
  },
  meta: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  kicker: {
    fontFamily: fonts.engraved,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.goldLight,
  },
  epLine: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 64,
  },
  thumb: {
    width: 176,
    height: 99,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(243,234,216,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(243,234,216,0.25)',
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonArt: { width: 56, height: 76, borderRadius: 8 },
  notify: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
