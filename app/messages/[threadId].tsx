import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { notify } from '@/lib/safety';
import { sendDm, socialLive, watchThread, type DmMessage } from '@/social/api';
import { sk, useLiveRefetch, useThread, useThreads } from '@/social/hooks';
import { NeedsLive, nameOf, s, socialMenu, timeAgo } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** One conversation between a subscriber and an actor. */
export default function ThreadScreen() {
  const { threadId = '' } = useLocalSearchParams<{ threadId: string }>();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const qc = useQueryClient();
  const threads = useThreads(!!me.data?.id);
  const thread = threads.data?.find((t) => t.id === threadId);
  const messages = useThread(threadId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useLiveRefetch((cb) => watchThread(threadId, cb), messages.refetch, socialLive() ? threadId : '');

  // Opening the thread marks it read on the server; refresh the badges.
  useEffect(() => {
    if (!messages.dataUpdatedAt) return;
    void qc.invalidateQueries({ queryKey: sk.unread });
    void qc.invalidateQueries({ queryKey: sk.threads });
  }, [messages.dataUpdatedAt, qc]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/messages'));

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendDm(threadId, body);
      setDraft('');
      void messages.refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t send that.');
    } finally {
      setSending(false);
    }
  };

  const other = thread?.other;
  const data = [...(messages.data ?? [])].reverse();

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingBottom: keyboard }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: insets.top + 4, paddingHorizontal: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <IconButton icon="back" label="Back" onPress={back} />
        {other ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => other.isCast && router.push({ pathname: '/actor/[handle]', params: { handle: other.handle } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          >
            <Avatar handle={other.handle} url={other.avatarUrl} size={34} />
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {nameOf(other)}
                </T>
                {other.verified ? <Verified size={13} /> : null}
              </View>
              <T variant="caption">@{other.handle}</T>
            </View>
          </Pressable>
        ) : (
          <T variant="label">Messages</T>
        )}
      </View>

      {!socialLive() ? (
        <View style={{ paddingHorizontal: 16 }}>
          <NeedsLive />
        </View>
      ) : messages.isPending ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : messages.isError ? (
        <T variant="caption" style={{ padding: 16 }}>
          {messages.error instanceof Error ? messages.error.message : 'Couldn’t open this conversation.'}
        </T>
      ) : (
        <FlatList<DmMessage>
          inverted
          data={data}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 6, flexGrow: 1 }}
          renderItem={({ item }) => {
            const mine = item.senderId === me.data?.id;
            return (
              <Pressable
                onLongPress={() =>
                  !mine && other
                    ? socialMenu({ kind: 'dm', id: item.id, author: other, mine: false }, { onChanged: back })
                    : undefined
                }
                delayLongPress={350}
                style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}
              >
                <View
                  style={{
                    backgroundColor: mine ? colors.gold : colors.surfaceRaised,
                    borderRadius: radius.lg,
                    borderBottomRightRadius: mine ? 6 : radius.lg,
                    borderBottomLeftRadius: mine ? radius.lg : 6,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <T style={{ fontSize: 15, lineHeight: 20, color: mine ? colors.goldInk : colors.text }}>{item.body}</T>
                </View>
                <T style={{ fontFamily: fonts.body, fontSize: 10, color: colors.dim, marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                  {timeAgo(item.createdAt)}
                </T>
              </Pressable>
            );
          }}
        />
      )}

      {socialLive() && !messages.isError ? (
        <View style={[s.composer, { paddingBottom: keyboard ? 8 : insets.bottom + 8 }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.dim}
            multiline
            maxLength={1000}
            accessibilityLabel="Write a message"
            style={s.input}
          />
          <IconButton icon="send" label="Send" color={draft.trim() ? colors.gold : colors.dim} onPress={sending ? undefined : send} />
        </View>
      ) : null}
    </View>
  );
}
