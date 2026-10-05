import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Avatar, Button, IconButton, T } from '@/components/ui';
import { api, type Comment, type CommentSort } from '@/data';
import { useComments, useLikeComment, usePostComment } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function CommentsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ showId: string; episode: string; t?: string }>();
  const showId = params.showId ?? '';
  const episode = Number.parseInt(params.episode ?? '1', 10) || 1;
  const atSec = params.t ? Number(params.t) : null;
  const friendsFirst = useAppStore((s) => s.friendsFirst);
  const [sort, setSort] = useState<CommentSort>('top');
  const [draft, setDraft] = useState('');
  const [pin, setPin] = useState(atSec !== null);
  const comments = useComments(showId, episode, sort);
  const post = usePostComment(showId, episode);
  const like = useLikeComment(showId, episode);

  const tabs: { key: CommentSort; label: string }[] = [
    { key: 'top', label: 'Top' },
    { key: 'newest', label: 'Newest' },
    ...(friendsFirst ? [{ key: 'friends' as const, label: 'Friends' }] : []),
  ];

  const submit = () => {
    const body = draft.trim();
    if (!body || post.isPending) return;
    post.mutate(
      { body, atSec: pin ? atSec : null },
      {
        onSuccess: () => {
          setDraft('');
          setSort('newest');
        },
      },
    );
  };

  const report = (c: Comment) => {
    const send = () => void api.reportComment(c.id, 'user_report');
    if (Platform.OS === 'web') {
      send();
      globalThis.alert?.('Thanks. Our team will review this comment.');
      return;
    }
    Alert.alert('Report comment?', 'Our team will review it. You can also block this person from their profile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: send },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View>
          <T variant="title" style={{ fontSize: 17 }}>Comments</T>
          <T variant="caption">{`Episode ${episode} only, so no spoilers`}</T>
        </View>
        <IconButton icon="close" label="Close comments" onPress={() => router.back()} />
      </View>
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Button
            key={t.key}
            compact
            kind={sort === t.key ? 'primary' : 'outline'}
            label={t.label}
            accessibilityState={{ selected: sort === t.key }}
            onPress={() => setSort(t.key)}
          />
        ))}
      </View>

      {comments.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={comments.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 18 }}
          ListEmptyComponent={<T variant="caption">{sort === 'friends' ? 'None of your friends have commented yet.' : 'Be the first to comment.'}</T>}
          renderItem={({ item: c }) => (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar handle={c.author.handle} url={c.author.avatarUrl} size={38} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <T variant="label" style={{ fontSize: 13 }}>{c.author.handle}</T>
                  {c.author.isCast ? <Badge label="CAST" gold /> : null}
                  {c.isFriend ? <Badge label="FRIEND" /> : null}
                  <T variant="caption">{timeAgo(c.createdAt)}</T>
                </View>
                <T style={{ fontSize: 14, color: '#E5E1EA' }}>
                  {c.atSec != null ? <T style={styles.stamp}>{`${fmt(c.atSec)}  `}</T> : null}
                  {c.body}
                </T>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={c.likedByMe ? 'Unlike' : 'Like'}
                    accessibilityState={{ selected: c.likedByMe }}
                    onPress={() => like.mutate({ id: c.id, liked: !c.likedByMe })}
                    style={styles.act}
                  >
                    <Icon name="heart" size={16} color={c.likedByMe ? colors.accent : colors.muted} filled={c.likedByMe} />
                    <T variant="caption">{String(c.likes + (like.variables?.id === c.id && like.isPending ? (like.variables.liked ? 1 : -1) : 0))}</T>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setDraft(`@${c.author.handle} `)} style={styles.act}>
                    <T variant="caption">Reply</T>
                  </Pressable>
                  <IconButton icon="more" label="Report or block" size={36} color={colors.dim} onPress={() => report(c)} />
                </View>
              </View>
            </View>
          )}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        {atSec !== null ? (
          <Button
            compact
            kind="outline"
            label={pin ? `Pinned to ${fmt(atSec)} · tap to remove` : `Pin to ${fmt(atSec)}`}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => setPin((v) => !v)}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Say something about Episode ${episode}…`}
            placeholderTextColor={colors.dim}
            maxLength={400}
            accessibilityLabel="Add a comment"
            returnKeyType="send"
            onSubmitEditing={submit}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            disabled={!draft.trim() || post.isPending}
            onPress={submit}
            style={[styles.send, { backgroundColor: draft.trim() ? colors.gold : '#4A4436' }]}
          >
            {post.isPending ? <ActivityIndicator color={colors.ink} /> : <Icon name="send" size={18} color={colors.ink} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Badge({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <View style={gold ? styles.badgeGold : styles.badgeFriend}>
      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 9, letterSpacing: 1.1, color: gold ? colors.ink : '#BFD8FF' }}>{label}</T>
    </View>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  stamp: { fontFamily: fonts.bodyHeavy, color: colors.gold, fontSize: 13 },
  act: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 },
  composer: { borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  input: { flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3A44', backgroundColor: '#0C0C10', paddingHorizontal: 16, color: colors.text, fontFamily: fonts.body, fontSize: 14 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badgeGold: { backgroundColor: colors.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeFriend: { borderWidth: 1, borderColor: '#4A6A99', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
});
