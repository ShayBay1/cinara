import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { socialLive, type DmThread } from '@/social/api';
import { useThreads } from '@/social/hooks';
import { Ago, Empty, NeedsLive, nameOf } from '@/social/ui';
import { colors, fonts } from '@/theme/tokens';

/** Your conversations. Fans message the actors they subscribe to; actors reply. */
export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const threads = useThreads(!!me.data?.id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 6 }}>
        <IconButton icon="back" label="Back" onPress={back} />
        <T variant="display" style={{ fontSize: 26, lineHeight: 32, textTransform: 'none' }}>
          Messages
        </T>
      </View>
      {!socialLive() ? (
        <View style={{ paddingHorizontal: 16 }}>
          <NeedsLive />
        </View>
      ) : threads.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList<DmThread>
          data={threads.data ?? []}
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
              <Avatar handle={item.other.handle} url={item.other.avatarUrl} size={50} />
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
