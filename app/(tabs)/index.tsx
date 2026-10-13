import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComingSoonCard, ShowCard } from '@/components/feed/FeedCard';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { ErrorState } from '@/components/ui';
import type { ComingSoon, Show } from '@/data';
import { useComingSoon, useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { premiereFor, premiereStage } from '@/lib/premieres';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts } from '@/theme/tokens';

type Item = { kind: 'show'; show: Show } | { kind: 'soon'; soon: ComingSoon };

/**
 * Feed: the screen Snippets opens on. One show per screen, full height; swipe up for the next.
 * Shows you're partway through come first, then the rest, with the next show to arrive slotted in.
 */
export default function FeedScreen() {
  const shows = useShows();
  const coming = useComingSoon();
  const now = useNow(1000);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const progress = useAppStore((s) => s.progress);
  const [active, setActive] = useState(0);

  const items = useMemo<Item[]>(() => {
    const list = [...(shows.data ?? [])].sort((a, b) => {
      const pa = progress[a.id]?.updatedAt ?? 0;
      const pb = progress[b.id]?.updatedAt ?? 0;
      if (pa !== pb) return pb - pa;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.number.localeCompare(b.number);
    });
    const out: Item[] = list.map((show) => ({ kind: 'show', show }));
    if (coming.data?.title) out.splice(Math.min(2, out.length), 0, { kind: 'soon', soon: coming.data });
    return out;
    // Order is fixed per visit: don't reshuffle under the viewer's thumb as progress saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows.data, coming.data]);

  const live = (shows.data ?? [])
    .map((s) => premiereFor(s, now))
    .find((p) => p && ['doors', 'live'].includes(premiereStage(p.at, now)));

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActive(first.index);
  }).current;

  const render = useCallback(
    ({ item, index }: { item: Item; index: number }) =>
      item.kind === 'show' ? (
        <ShowCard show={item.show} active={focused && index === active} now={now} height={height} />
      ) : (
        <ComingSoonCard soon={item.soon} active={focused && index === active} height={height} />
      ),
    [active, focused, height, now],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      {shows.isError ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <ErrorState
            message="We couldn’t load the shows. Check your connection."
            onRetry={() => void shows.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => (it.kind === 'show' ? it.show.id : 'coming-soon')}
          renderItem={render}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          contentInsetAdjustmentBehavior="never"
          bounces={false}
        />
      )}

      {/* Top bar: what's live, where you are, search. */}
      <View style={[styles.top, { top: insets.top + 6 }]} pointerEvents="box-none">
        {live ? (
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={`${live.show.title} is live. Join the premiere`}
            onPress={() => router.push({ pathname: '/live/[showId]', params: { showId: live.show.id } })}
            style={styles.livePill}
            feel="tap"
          >
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </Pressy>
        ) : (
          <View style={styles.leftSlot} />
        )}
        <View style={styles.tabLabel}>
          <Text style={styles.forYou}>For You</Text>
          <View style={styles.underline} />
        </View>
        <Pressy
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => router.push('/search')}
          style={styles.search}
          scaleTo={0.9}
        >
          <Icon name="search" size={22} color={colors.text} />
        </Pressy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  leftSlot: { width: 64 },
  livePill: {
    width: 64,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.live,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.4, color: '#fff' },
  tabLabel: { alignItems: 'center' },
  forYou: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  underline: { width: 28, height: 2, borderRadius: 1, backgroundColor: colors.gold, marginTop: 5 },
  search: { width: 64, alignItems: 'flex-end', justifyContent: 'center', height: 44 },
});
