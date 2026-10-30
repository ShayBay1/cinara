import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { socialLive, type DmThread } from '@/social/api';
import { useThreads } from '@/social/hooks';
import { money } from '@/social/studio';
import { Ago, Empty, NeedsLive, nameOf } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

type Filter = 'all' | 'unread' | 'spenders' | 'subscribers';

/** Your conversations. Fans message the actors they subscribe to; actors reply. */
export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const threads = useThreads(!!me.data?.id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));
  const isActor = !!me.data?.isCast;
  const [filter, setFilter] = useState<Filter>('all');
  const all = threads.data ?? [];
  const list = useMemo(() => {
    if (filter === 'unread') return all.filter((t) => t.unread > 0);
    if (filter === 'subscribers') return all.filter((t) => t.subscriber);
    if (filter === 'spenders') return [...all].filter((t) => (t.spentCents ?? 0) > 0).sort((a, b) => (b.spentCents ?? 0) - (a.spentCents ?? 0));
    return all;
  }, [all, filter]);
  const unreadTotal = all.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0);
  const filters: { key: Filter; label: string; badge?: number }[] = isActor
    ? [
        { key: 'all', label: 'All' },
        { key: 'unread', label: 'Unread', badge: unreadTotal },
        { key: 'spenders', label: 'Top spenders' },
        { key: 'subscribers', label: 'Subscribers' },
      ]
    : [
        { key: 'all', label: 'All' },
        { key: 'unread', label: 'Unread', badge: unreadTotal },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 6 }}>
        <IconButton icon="back" label="Back" onPress={back} />
        <T variant="display" style={{ fontSize: 26, lineHeight: 32, textTransform: 'none', flex: 1 }}>
          Messages
        </T>
        {isActor ? (
          <IconButton icon="send" label="New mass message" onPress={() => router.push('/mass-dm')} />
        ) : null}
      </View>
      {socialLive() && all.length ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, flexWrap: 'wrap' }}>
          {filters.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === f.key }}
              style={[chip.base, filter === f.key && chip.on]}
            >
              <T style={[chip.text, filter === f.key && { color: colors.goldInk }]}>{f.label}</T>
              {f.badge ? (
                <View style={chip.badge}>
                  <T style={chip.badgeText}>{f.badge > 99 ? '99+' : String(f.badge)}</T>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {!socialLive() ? (
        <View style={{ paddingHorizontal: 16 }}>
          <NeedsLive />
        </View>
      ) : threads.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList<DmThread>
          data={list}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl tintColor={colors.gold} refreshing={threads.isRefetching} onRefresh={() => void threads.refetch()} />}
          ListEmptyComponent={
            me.data?.isCast ? (
              <Empty title="No messages yet" body="When subscribers message you, their conversations show up here." />
            ) : (
              <Empty
                title="Talk to the cast"
                body="Each actor sells messages on their own Backstage. Open an actor’s page and tap Message to start a conversation with them."
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Conversation with ${item.other.handle}${item.unread ? `, ${item.unread} unread` : ''}`}
              onPress={() => router.push({ pathname: '/messages/[threadId]', params: { threadId: item.id } })}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }, pressed && { opacity: 0.75 }]}
            >
              <View>
                <Avatar handle={item.other.handle} url={item.other.avatarUrl} size={50} />
                {item.asActor && (item.spentCents ?? 0) > 0 ? (
                  <View style={chip.spend} accessibilityLabel={`Spent ${money(item.spentCents!)} on you`}>
                    <T style={chip.spendText}>{money(item.spentCents!)}</T>
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {nameOf(item.other)}
                  </T>
                  {item.other.verified ? <Verified size={13} /> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <T
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      fontFamily: item.unread ? fonts.bodyHeavy : fonts.body,
                      fontSize: 13,
                      color: item.unread ? colors.text : colors.muted,
                    }}
                  >
                    {item.last ?? 'Say hello'}
                  </T>
                  <T variant="caption">·</T>
                  <Ago iso={item.lastMessageAt} />
                </View>
              </View>
              {item.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold }} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const chip = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  on: { backgroundColor: colors.gold, borderColor: colors.gold },
  text: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodyHeavy, fontSize: 10, color: '#fff' },
  spend: {
    position: 'absolute',
    left: -4,
    bottom: -4,
    paddingHorizontal: 5,
    minHeight: 18,
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: 'rgba(21,16,11,0.9)',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  spendText: { fontFamily: fonts.bodyHeavy, fontSize: 10, color: colors.goldLight },
});
