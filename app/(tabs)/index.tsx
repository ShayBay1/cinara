import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { HomeTop } from '@/components/launch/HomeTop';
import { ErrorState, T } from '@/components/ui';
import type { Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useComingSoon, useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { soonestPremiere } from '@/lib/premieres';
import { dropOf } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, home, radius } from '@/theme/tokens';

/**
 * Home. The top (logo, search, tonight's premiere card, Now streaming) is laid out to match the
 * last frame of the launch animation, which dissolves straight into it. Below: where you left
 * off and what's coming.
 */
export default function HomeScreen() {
  const shows = useShows();
  const coming = useComingSoon();
  const now = useNow(1000);
  const insets = useSafeAreaInsets();
  const list = shows.data ?? [];
  const premiere = soonestPremiere(list, now);
  const featured = list.find((s) => s.featured);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: home.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      contentInsetAdjustmentBehavior="never"
      refreshControl={
        <RefreshControl
          tintColor={home.gold}
          refreshing={shows.isRefetching}
          onRefresh={() => void shows.refetch()}
        />
      }
    >
      <HomeTop shows={list} premiere={premiere} featured={featured} now={now} />
      <View style={{ paddingHorizontal: 16 }}>
        {shows.isError ? (
          <ErrorState
            message="We couldn’t load the shows. Check your connection."
            onRetry={() => void shows.refetch()}
          />
        ) : null}
        <ContinueWatching shows={list} />
        {coming.data ? (
          <ComingSoonRow
            title={coming.data.title ?? 'Next on Snippets'}
            arrives={coming.data.arrives}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Where you left off, with this week's drop progress. */
function ContinueWatching({ shows }: { shows: Show[] }) {
  const progress = useAppStore((s) => s.progress);
  const resume = Object.entries(progress)
    .map(([id, p]) => ({ show: shows.find((s) => s.id === id), p }))
    .find((x) => x.show && x.p.episode <= x.show.latestEpisode);
  if (!resume?.show) return null;
  const { show, p } = resume;
  const dur = p.durationSec ?? 0;
  const left = dur > 0 ? Math.max(0, dur - p.positionSec) : 0;
  const frac = dur > 0 ? Math.min(1, p.positionSec / dur) : 0;
  const drop = dropOf(p.episode, show.episodeCount);
  const size = drop.to - drop.from + 1;
  const title = show.episodeTitles[p.episode - 1];
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <View style={styles.section}>
      <T style={styles.h2}>Continue watching</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue ${show.title}, episode ${p.episode}`}
        onPress={() =>
          router.push({
            pathname: '/watch/[showId]/[episode]',
            params: { showId: show.id, episode: String(p.episode) },
          })
        }
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
      >
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={[styles.thumb, { backgroundColor: show.color }]}>
            {coverSource(show) ? (
              <Image
                source={coverSource(show)!}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : null}
            <View style={styles.thumbPlay}>
              <Icon name="play" size={14} color={colors.ink} />
            </View>
            <View style={styles.thumbTrack}>
              <View style={{ width: `${frac * 100}%`, height: 4, backgroundColor: colors.text }} />
            </View>
          </View>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <T style={styles.kicker}>{show.title.toUpperCase()}</T>
            <T
              style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text }}
              numberOfLines={1}
            >{`Ep ${p.episode}${title ? ` · ${title}` : ''}`}</T>
            {left > 0 ? <T style={styles.meta}>{`${fmt(left)} left`}</T> : null}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: size }, (_, i) => {
              const n = drop.from + i;
              return (
                <View
                  key={n}
                  style={[
                    styles.seg,
                    n < p.episode && { backgroundColor: colors.text },
                    n === p.episode && { backgroundColor: 'rgba(244,241,234,0.55)' },
                  ]}
                />
              );
            })}
          </View>
          <T style={styles.meta}>{`Episode ${p.episode} of ${drop.to}`}</T>
        </View>
      </Pressable>
    </View>
  );
}

function ComingSoonRow({ title, arrives }: { title: string; arrives: string }) {
  const notify = useAppStore((s) => s.notifyComingSoon);
  const setNotify = useAppStore((s) => s.setNotifyComingSoon);
  return (
    <View style={styles.section}>
      <T style={styles.h2}>Coming soon</T>
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={styles.soonArt}>
          <T style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>
            s<T style={{ fontFamily: fonts.display, fontSize: 22, color: colors.accent }}>.</T>
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{title}</T>
          <T style={styles.meta}>{arrives}</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: notify }}
          onPress={() => setNotify(!notify)}
          style={[styles.notify, notify && { borderColor: colors.text }]}
        >
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text }}>
            {notify ? 'On' : 'Notify me'}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 26 },
  h2: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.text, marginBottom: 10 },
  meta: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSoft },
  kicker: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.4, color: '#A7A3B3' },
  card: {
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#24242C',
  },
  thumb: {
    width: 132,
    height: 74,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlay: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(244,241,234,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(244,241,234,0.25)',
  },
  seg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#2E2E38' },
  soonArt: {
    width: 56,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notify: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#4A4A55',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
