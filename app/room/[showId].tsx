import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe, useShows } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { notify } from '@/lib/safety';
import { deleteRoomMessage, sendRoomMessage, socialLive, watchRoom, type RoomMessage } from '@/social/api';
import { useLiveRefetch, useRoomMessages } from '@/social/hooks';
import { Ago, NeedsLive, s, socialMenu } from '@/social/ui';
import { colors, fonts } from '@/theme/tokens';

/** A show's fan room: an always-open group chat for everyone who watches it. */
export default function RoomScreen() {
  const { showId = '' } = useLocalSearchParams<{ showId: string }>();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const shows = useShows();
  const show = shows.data?.find((x) => x.id === showId);
  const messages = useRoomMessages(showId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useLiveRefetch((cb) => watchRoom(showId, cb), messages.refetch, socialLive() ? showId : '');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    if (!me.data?.id) {
      router.push('/sign-in');
      return;
    }
    setSending(true);
    try {
      await sendRoomMessage(showId, body);
      setDraft('');
      void messages.refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t send that.');
    } finally {
      setSending(false);
    }
  };

  // Newest at the bottom: the list is inverted, so feed it newest first.
  const data = [...(messages.data ?? [])].reverse();

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingBottom: keyboard }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 6 }}>
        <IconButton icon="back" label="Back" onPress={back} />
        <Pressable
          style={{ flex: 1 }}
          onPress={() => show && router.push({ pathname: '/show/[showId]', params: { showId: show.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${show?.title ?? 'Show'}. Open the show.`}
        >
          <T variant="label" numberOfLines={1}>
            {show?.title ?? 'Fan room'}
          </T>
          <T variant="caption">Fan room · be kind, no spoilers past the latest episode</T>
        </Pressable>
      </View>

      {!socialLive() ? (
        <View style={{ paddingHorizontal: 16 }}>
          <NeedsLive />
        </View>
      ) : messages.isPending ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <FlatList<RoomMessage>
          inverted
          data={data}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }], paddingVertical: 24 }}>
              <T variant="caption" style={{ textAlign: 'center' }}>
                It’s quiet in here. Say hi.
              </T>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() =>
                socialMenu(
                  { kind: 'room', id: item.id, author: item.author, mine: item.author.id === me.data?.id },
                  {
                    onDelete: async () => {
                      await deleteRoomMessage(item.id);
                      void messages.refetch();
                    },
                    onChanged: () => void messages.refetch(),
                  },
                )
              }
              delayLongPress={350}
              style={{ flexDirection: 'row', gap: 10 }}
            >
              <Pressable
                onPress={() =>
                  item.author.isCast && router.push({ pathname: '/actor/[handle]', params: { handle: item.author.handle } })
                }
              >
                <Avatar handle={item.author.handle} url={item.author.avatarUrl} size={32} />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <T
                    style={{
                      fontFamily: fonts.bodyHeavy,
                      fontSize: 13,
                      color: item.author.isCast ? colors.goldLight : item.author.id === me.data?.id ? colors.friend : colors.text,
                    }}
                  >
                    {item.author.handle}
                  </T>
                  {item.author.verified ? <Verified size={13} /> : item.author.isCast ? <T style={s.castBadge}>CAST</T> : null}
                  <Ago iso={item.createdAt} />
                </View>
                <T style={{ fontSize: 14.5, lineHeight: 20 }}>{item.body}</T>
              </View>
            </Pressable>
          )}
        />
      )}

      {socialLive() ? (
        <View style={[s.composer, { paddingBottom: keyboard ? 8 : insets.bottom + 8 }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={me.data?.id ? 'Say something…' : 'Sign in to chat'}
            placeholderTextColor={colors.dim}
            multiline
            maxLength={500}
            onFocus={() => {
              if (!me.data?.id) router.push('/sign-in');
            }}
            accessibilityLabel="Message the fan room"
            style={s.input}
          />
          <IconButton icon="send" label="Send" color={draft.trim() ? colors.gold : colors.dim} onPress={sending ? undefined : send} />
        </View>
      ) : null}
    </View>
  );
}
