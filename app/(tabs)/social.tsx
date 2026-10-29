import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, ErrorState, IconButton, T } from '@/components/ui';
import { useFriendRequests, useMe } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { deletePost, type Post } from '@/social/api';
import { BackstageFeed } from '@/social/Backstage';
import { JoinBackstage } from '@/social/Join';
import { useActors, useFeed, useRecordViews, useUnreadDms } from '@/social/hooks';
import { CreatorRing, Empty, PostCard } from '@/social/ui';
import { colors, fonts } from '@/theme/tokens';

type Tab = 'following' | 'all' | 'backstage';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'following', label: 'Following' },
  { key: 'all', label: 'For you' },
  { key: 'backstage', label: 'Backstage' },
];

/** The social side: actors post, fans follow and comment, Backstage holds the exclusive posts. */
export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ tab?: string }>();
  const me = useMe();
  const signedIn = !!me.data?.id;
  const unread = useUnreadDms(signedIn);
  const requests = useFriendRequests();
  const pager = useRef<{ scrollTo: (o: { x: number; animated?: boolean }) => void } | null>(null);
  const x = useRef(new Animated.Value(width)).current;
  const [index, setIndex] = useState(1);

  const go = (i: number, animated = true) => {
    pager.current?.scrollTo({ x: i * width, animated });
    setIndex(i);
  };
  // Opening /social?tab=backstage (from a locked post, a link, or checkout) lands on Backstage.
  useEffect(() => {
    const i = TABS.findIndex((t) => t.key === params.tab);
    setTimeout(() => go(i >= 0 ? i : 1, false), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab, width]);

  const tabW = (width - 32) / TABS.length;
  const underline = x.interpolate({ inputRange: [0, width * (TABS.length - 1)], outputRange: [0, tabW * (TABS.length - 1)], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <T style={{ fontFamily: fonts.display, fontSize: 24, letterSpacing: 1, color: colors.goldLight }}>Social</T>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <JoinBackstage variant="pill" style={{ marginRight: 4 }} />
          {me.data?.isCast ? <IconButton icon="plus" label="New post" onPress={() => router.push('/post/new')} /> : null}
          <View>
            <IconButton icon="friends" label="Friends" onPress={() => router.push('/friends')} />
            {(requests.data?.length ?? 0) > 0 ? <View style={styles.dot} /> : null}
          </View>
          <View>
            <IconButton
              icon="send"
              label={unread.data ? `Messages, ${unread.data} unread` : 'Messages'}
              onPress={() => router.push(signedIn ? '/messages' : '/sign-in')}
            />
            {unread.data ? (
              <View style={styles.badge}>
                <T style={styles.badgeText}>{unread.data > 9 ? '9+' : unread.data}</T>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t, i) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: index === i }}
            onPress={() => {
              haptic.pick();
              go(i);
            }}
            style={[styles.tab, { width: tabW }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {t.key === 'backstage' ? <Icon name="lock" size={13} color={index === i ? colors.gold : colors.muted} /> : null}
              <T style={[styles.tabText, { color: index === i ? (t.key === 'backstage' ? colors.gold : colors.text) : colors.muted }]}>
                {t.label}
              </T>
            </View>
          </Pressable>
        ))}
        <Animated.View
          style={[styles.underline, { width: tabW, backgroundColor: index === 2 ? colors.gold : colors.text, transform: [{ translateX: underline }] }]}
        />
      </View>

      <Animated.ScrollView
        ref={pager as never}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: width, y: 0 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) haptic.pick();
          setIndex(i);
        }}
        style={{ flex: 1 }}
      >
        <View style={{ width }}>
          <Feed scope="following" bottom={insets.bottom} onBrowse={() => go(1)} />
        </View>
        <View style={{ width }}>
          <Feed scope="all" bottom={insets.bottom} onBrowse={() => go(2)} />
        </View>
        <View style={{ width }}>
          <BackstageFeed bottom={insets.bottom} back="/social?tab=backstage" />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

/** Instagram's story row: every creator, gold ring when they have Backstage posts. */
function Stories() {
  const me = useMe();
  const actors = useActors();
  if (!actors.data?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 14, paddingVertical: 12 }}>
      {me.data?.isCast ? (
        <Pressable accessibilityRole="button" accessibilityLabel="New post" onPress={() => router.push('/post/new')} style={styles.story}>
          <View>
            <CreatorRing handle={me.data.handle} url={me.data.avatarUrl} size={68} />
            <View style={styles.plus}>
              <Icon name="plus" size={14} color={colors.goldInk} />
            </View>
          </View>
          <T numberOfLines={1} style={styles.storyName}>
            Your post
          </T>
        </Pressable>
      ) : null}
      {actors.data.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`${a.displayName || a.handle}. Open their page.`}
          onPress={() => router.push({ pathname: '/actor/[handle]', params: { handle: a.handle } })}
          style={styles.story}
        >
          <CreatorRing handle={a.handle} url={a.avatarUrl} size={68} gold={a.premiumPosts > 0} />
          <T numberOfLines={1} style={styles.storyName}>
            {a.handle}
          </T>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Feed({ scope, bottom, onBrowse }: { scope: 'all' | 'following'; bottom: number; onBrowse: () => void }) {
  const me = useMe();
  const feed = useFeed(scope);
  const record = useRecordViews(me.data?.id);
  const onViewable = useMemo(
    () => ({ viewableItems }: { viewableItems: Array<{ item: unknown }> }) => record(viewableItems.map((v) => v.item as Post)),
    [record],
  );

  if (feed.isPending)
    return (
      <View style={{ padding: 40 }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  if (feed.isError && !feed.data?.length) return <ErrorState message="Couldn’t load posts." onRetry={() => void feed.refetch()} />;

  return (
    <FlatList<Post>
      data={feed.data ?? []}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={<Stories />}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 800 }}
      contentContainerStyle={{ paddingBottom: bottom + 120 }}
      initialNumToRender={4}
      windowSize={7}
      renderItem={({ item }) => (
        <PostCard
          post={item}
          meId={me.data?.id}
          onDelete={async (id) => {
            await deletePost(id);
            void feed.refetch();
          }}
        />
      )}
      refreshControl={<RefreshControl tintColor={colors.gold} refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
      ListEmptyComponent={
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {scope === 'following' ? (
            <>
              <Empty title="Follow the cast" body="Tap a face above and follow them. Their posts show up here." />
              {me.data?.id ? null : <Button label="Sign in" onPress={() => router.push('/sign-in')} />}
              <Button kind="outline" label="See what everyone’s posting" onPress={onBrowse} />
            </>
          ) : (
            <Empty title="No posts yet" body="When the cast posts, it shows up here." />
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 2 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { alignItems: 'center', justifyContent: 'center', height: 40 },
  tabText: { fontFamily: fonts.bodyHeavy, fontSize: 14 },
  underline: { position: 'absolute', left: 0, bottom: -1, height: 2, borderRadius: 1 },
  story: { width: 76, alignItems: 'center', gap: 5 },
  storyName: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSoft, maxWidth: 76 },
  plus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bodyHeavy, fontSize: 10, color: '#fff' },
});
