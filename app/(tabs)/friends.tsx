import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Share, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Avatar, Button, IconButton, Panel, SectionHeader, SwitchRow, T } from '@/components/ui';
import { api } from '@/data';
import {
  useFriendRequests,
  useFriends,
  useMe,
  useRespondToRequest,
  useShows,
} from '@/hooks/queries';
import { WEB_URL } from '@/lib/billing';
import { playEpisode } from '@/lib/play';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

export default function FriendsScreen() {
  const friends = useFriends();
  const requests = useFriendRequests();
  const shows = useShows();
  const me = useMe();
  const respond = useRespondToRequest();
  const shareActivity = useAppStore((s) => s.shareActivity);
  const setShareActivity = useAppStore((s) => s.setShareActivity);
  const friendsFirst = useAppStore((s) => s.friendsFirst);
  const setFriendsFirst = useAppStore((s) => s.setFriendsFirst);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);

  const showTitle = (id?: string) => shows.data?.find((s) => s.id === id)?.title ?? '';
  const inviteUrl = `${WEB_URL}/invite/${me.data?.handle ?? 'you'}`;

  const addFriend = async () => {
    const handle = query.trim().replace(/^@/, '');
    if (!handle) return;
    setSending(true);
    try {
      await api.sendFriendRequest(handle);
      setQuery('');
      say('Request sent', `We sent a friend request to ${handle}.`);
    } catch (e) {
      say(
        'Couldn’t send request',
        e instanceof Error ? e.message : 'Check the username and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const invite = async () => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(inviteUrl);
      say('Invite link copied', inviteUrl);
    } else {
      await Share.share({ message: `Watch with me on Cinara: ${inviteUrl}` });
    }
  };

  return (
    <Screen
      title={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -10 }}>
          <IconButton
            icon="back"
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/social'))}
          />
          <T variant="display" style={{ fontSize: 30, lineHeight: 34, textTransform: 'none' }}>
            Friends
          </T>
        </View>
      }
      subtitle="Watch together, even apart."
      refreshing={friends.isRefetching}
      onRefresh={() => {
        void friends.refetch();
        void requests.refetch();
      }}
    >
      <View style={{ paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find by username"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={addFriend}
            accessibilityLabel="Find friends by username"
            style={styles.input}
          />
          <Button
            compact
            kind="outline"
            label="Add"
            loading={sending}
            disabled={!query.trim()}
            onPress={addFriend}
            style={{ minHeight: 46, borderRadius: radius.md }}
          />
        </View>
        <Panel style={styles.invite}>
          <View style={{ flex: 1 }}>
            <T variant="label">Invite friends to Cinara</T>
            <T variant="caption" style={{ color: '#BDB4A6' }}>
              They land on Episode 1 and you're friends automatically.
            </T>
          </View>
          <Button
            compact
            kind="outline"
            label={Platform.OS === 'web' ? 'Copy link' : 'Invite'}
            onPress={invite}
            style={{ borderColor: '#5A4E36' }}
          />
        </Panel>
      </View>

      {requests.data && requests.data.length > 0 ? (
        <View style={{ paddingTop: 28 }}>
          <SectionHeader title={`Friend requests · ${requests.data.length}`} />
          <Panel>
            {requests.data.map((r, i) => (
              <View key={r.id} style={[styles.row, i > 0 && styles.divider]}>
                <Avatar handle={r.from.handle} url={r.from.avatarUrl} size={42} />
                <View style={{ flex: 1 }}>
                  <T variant="label">{r.from.handle}</T>
                  <T variant="caption">{r.note}</T>
                </View>
                <Button
                  compact
                  label="Accept"
                  onPress={() => respond.mutate({ id: r.id, accept: true })}
                />
                <IconButton
                  icon="close"
                  label={`Decline ${r.from.handle}`}
                  size={38}
                  style={{ borderWidth: 1, borderColor: '#3A2E20' }}
                  onPress={() => respond.mutate({ id: r.id, accept: false })}
                />
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      <View style={{ paddingTop: 28 }}>
        <SectionHeader
          title="Your friends"
          action={<T variant="caption">{`${friends.data?.length ?? 0} friends`}</T>}
        />
        {friends.data && friends.data.length === 0 ? (
          <Panel style={{ padding: 18, gap: 10, alignItems: 'flex-start' }}>
            <Icon name="friends" color={colors.muted} />
            <T variant="label">No friends here yet</T>
            <T variant="caption" style={{ fontSize: 14 }}>
              Invite a friend. You both start at Episode 1, and you’ll see each other in the
              premiere lobby.
            </T>
            <Button
              compact
              label={Platform.OS === 'web' ? 'Copy invite link' : 'Invite a friend'}
              onPress={invite}
            />
          </Panel>
        ) : null}
        <Panel style={friends.data && friends.data.length === 0 ? { display: 'none' } : undefined}>
          {(friends.data ?? []).map((f, i) => {
            const live = shareActivity && !!f.watching?.watchingNow;
            const status = !shareActivity
              ? 'Activity hidden'
              : f.watching
                ? `${f.watching.watchingNow ? 'Watching' : f.watching.caughtUp ? 'Caught up on' : 'On'} ${showTitle(f.watching.showId)} · Ep ${f.watching.episode}`
                : 'New friend';
            return (
              <View key={f.id} style={[styles.row, i > 0 && styles.divider]}>
                <Avatar handle={f.handle} url={f.avatarUrl} size={42} online={live} />
                <View style={{ flex: 1 }}>
                  <T variant="label">{f.handle}</T>
                  <T variant="caption" style={live ? { color: colors.friend } : undefined}>
                    {status}
                  </T>
                </View>
                {f.watching ? (
                  <Button
                    compact
                    kind="outline"
                    label={live ? 'Join in' : 'Watch with them'}
                    accessibilityHint={`Opens ${showTitle(f.watching.showId)}, episode ${f.watching.episode}`}
                    onPress={() => playEpisode(f.watching!.showId, f.watching!.episode)}
                  />
                ) : null}
              </View>
            );
          })}
        </Panel>
      </View>

      <Panel style={{ marginTop: 28, paddingHorizontal: 14 }}>
        <SwitchRow
          label="Share what I’m watching"
          hint="Friends see your show and episode."
          value={shareActivity}
          onChange={(v) => {
            setShareActivity(v);
            void api.setActivitySharing(v);
          }}
        />
        <View style={styles.divider} />
        <SwitchRow
          label="Show friends’ comments first"
          hint="Adds a Friends tab to every episode."
          value={friendsFirst}
          onChange={setFriendsFirst}
        />
      </Panel>
    </Screen>
  );
}

function say(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#3A2E20',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.goldInk,
    borderColor: '#4A4436',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
});
