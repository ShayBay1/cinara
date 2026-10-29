import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, View } from 'react-native';
import { TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { blockPerson, notify } from '@/lib/safety';
import { reportSocial } from '@/social/api';
import { deleteReply, highlight, reply, useChannelFeed, useChannelReplies, type ChannelReply } from '@/social/channels';
import { useActor } from '@/social/hooks';
import { Ago, nameOf, s } from '@/social/ui';
import { colors, fonts } from '@/theme/tokens';

/** Replies under one channel message. The actor can highlight one; it shows under the message for everyone. */
export default function ChannelRepliesScreen() {
  const { handle = '', messageId = '' } = useLocalSearchParams<{ handle: string; messageId: string }>();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const actor = useActor(handle);
  const a = actor.data;
  const feed = useChannelFeed(a?.id ?? '');
  const message = feed.data?.find((m) => m.id === messageId);
  const list = useChannelReplies(messageId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const isDemo = messageId.startsWith('demo-');
  const isActor = !!a?.isMe;

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/channel/[handle]', params: { handle } }));

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    if (isDemo) return notify('This is a sample channel. Replies work in real channels.');
    if (!me.data?.id) return router.push('/sign-in');
    setSending(true);
    try {
      await reply(messageId, body);
      setDraft('');
      void list.refetch();
      void feed.refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t reply.');
    } finally {
      setSending(false);
    }
  };

  const menu = (r: ChannelReply) => {
    if (isDemo) return;
    const mine = r.author.id === me.data?.id;
    const run = (fn: () => Promise<unknown>) => () =>
      void fn()
        .then(() => {
          void list.refetch();
          void feed.refetch();
        })
        .catch((e) => notify(e instanceof Error ? e.message : 'Something went wrong.'));
    const choices: Array<{ text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }> = [];
    if (isActor) choices.push({ text: r.highlighted ? 'Remove highlight' : 'Highlight this reply', onPress: run(() => highlight(r.id, !r.highlighted)) });
    if (mine || isActor) choices.push({ text: 'Delete', style: 'destructive', onPress: run(() => deleteReply(r.id)) });
    if (!mine) {
      choices.push({ text: 'Report', onPress: run(async () => {
        await reportSocial('channel_reply', r.id);
        notify('Thanks for telling us. Our team will review it.');
      }) });
      choices.push({ text: `Block ${r.author.handle}`, style: 'destructive', onPress: () => void blockPerson(r.author, () => void list.refetch()) });
    }
    if (Platform.OS === 'web') {
      const first = choices[0];
      if (first && globalThis.confirm?.(`${first.text}?`)) first.onPress?.();
      return;
    }
    Alert.alert(r.author.handle, undefined, [...choices, { text: 'Cancel', style: 'cancel' }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingBottom: keyboard }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <IconButton icon="back" label="Back" onPress={back} />
        <T variant="label">Replies</T>
      </View>
      {list.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList<ChannelReply>
          data={list.data ?? []}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14 }}
          ListHeaderComponent={
            message ? (
              <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, marginBottom: 6, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.gold }}>{a ? nameOf(a) : handle}</T>
                  {a?.verified ? <Verified size={12} /> : null}
                </View>
                <T style={{ fontSize: 14.5, lineHeight: 20 }} numberOfLines={4}>
                  {message.kind === 'poll' ? `Poll: ${message.poll?.question}` : message.body || 'Photo'}
                </T>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <T variant="caption" style={{ paddingVertical: 16 }}>
              No replies yet. Say something; {a ? nameOf(a) : 'the actor'} reads these.
            </T>
          }
          renderItem={({ item }) => (
            <Pressable onLongPress={() => menu(item)} delayLongPress={350} style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar handle={item.author.handle} url={item.author.avatarUrl} size={32} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text }}>{item.author.handle}</T>
                  {item.author.verified ? <Verified size={12} /> : null}
                  <Ago iso={item.createdAt} />
                  {item.highlighted ? (
                    <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 10, color: colors.gold, letterSpacing: 0.8 }}>★ HIGHLIGHTED</T>
                  ) : null}
                </View>
                <T style={{ fontSize: 14.5, lineHeight: 20 }}>{item.body}</T>
              </View>
            </Pressable>
          )}
        />
      )}
      <View style={[s.composer, { paddingBottom: keyboard ? 8 : insets.bottom + 8 }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={a ? `Reply to ${nameOf(a)}…` : 'Reply…'}
          placeholderTextColor={colors.dim}
          multiline
          maxLength={500}
          style={s.input}
          accessibilityLabel="Write a reply"
        />
        <IconButton icon="send" label="Send reply" color={draft.trim() ? colors.gold : colors.dim} onPress={sending ? undefined : () => void send()} />
      </View>
    </View>
  );
}
