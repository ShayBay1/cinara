import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { notify } from '@/lib/safety';
import { addPostComment, deletePost, deletePostComment, socialLive, type PostComment } from '@/social/api';
import { sk, usePost, usePostComments, useRecordViews } from '@/social/hooks';
import { Ago, NeedsLive, PostCard, s, socialMenu } from '@/social/ui';
import { colors, fonts } from '@/theme/tokens';

/** One post with its comments. Fans comment and reply in threads; only the cast posts. */
export default function PostScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const qc = useQueryClient();
  const post = usePost(id);
  const comments = usePostComments(id, !!post.data && !post.data.locked);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ rootId: string; handle: string } | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const record = useRecordViews(me.data?.id);
  const p = post.data;
  useEffect(() => {
    if (p) record([p]);
  }, [p, record]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));

  /** Top-level comments, each followed by its replies. */
  const rows = useMemo(() => {
    const list = comments.data ?? [];
    const kids = new Map<string, PostComment[]>();
    for (const c of list) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c]);
    return list.filter((c) => !c.parentId).flatMap((c) => [c, ...(kids.get(c.id) ?? [])]);
  }, [comments.data]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    if (p?.demo) {
      notify('This is a sample post. Comments work on real posts.');
      return;
    }
    if (!me.data?.id) {
      router.push('/sign-in');
      return;
    }
    setSending(true);
    try {
      await addPostComment(id, body, replyTo?.rootId);
      setDraft('');
      setReplyTo(null);
      await Promise.all([comments.refetch(), qc.invalidateQueries({ queryKey: sk.post(id) })]);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t post that. Try again.');
    } finally {
      setSending(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, marginLeft: -10 }}>
      <IconButton icon="back" label="Back" onPress={back} />
      <T variant="label">Post</T>
    </View>
  );

  if (!socialLive() && !id.startsWith('demo-'))
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingHorizontal: 16 }}>
        {header}
        <NeedsLive />
      </View>
    );

  if (post.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingBottom: keyboard }}>
      <FlatList<PostComment>
        data={p && !p.locked ? rows : []}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20 }}
        ListHeaderComponent={
          <View>
            <View style={{ paddingHorizontal: 16 }}>{header}</View>
            {p ? (
              <PostCard
                post={p}
                meId={me.data?.id}
                full
                onDelete={async (pid) => {
                  await deletePost(pid);
                  void qc.invalidateQueries({ queryKey: ['social'] });
                  back();
                }}
              />
            ) : (
              <T variant="caption" style={{ paddingVertical: 24, paddingHorizontal: 16 }}>
                This post was removed.
              </T>
            )}
            {p && !p.locked ? <View style={{ height: 1, backgroundColor: colors.line, marginBottom: 8 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          p && !p.locked && !comments.isPending ? (
            <T variant="caption" style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
              No comments yet. Start the conversation.
            </T>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() =>
              socialMenu(
                { kind: 'post_comment', id: item.id, author: item.author, mine: item.author.id === me.data?.id },
                {
                  onDelete: async () => {
                    await deletePostComment(item.id);
                    void comments.refetch();
                  },
                  onChanged: () => void comments.refetch(),
                },
              )
            }
            delayLongPress={350}
            style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 16, marginLeft: item.parentId ? 44 : 0 }}
          >
            <Avatar handle={item.author.handle} url={item.author.avatarUrl} size={item.parentId ? 26 : 32} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text }}>{item.author.handle}</T>
                {item.author.verified ? <Verified size={13} /> : item.author.isCast ? <T style={s.castBadge}>CAST</T> : null}
                <Ago iso={item.createdAt} />
              </View>
              <T style={{ fontSize: 14, lineHeight: 19 }}>{item.body}</T>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setReplyTo({ rootId: item.parentId ?? item.id, handle: item.author.handle });
                  setDraft((d) => (d.startsWith(`@${item.author.handle} `) ? d : `@${item.author.handle} `));
                  input.current?.focus();
                }}
              >
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted }}>Reply</T>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
      {p && !p.locked ? (
        <View style={[s.composer, { paddingBottom: keyboard ? 8 : insets.bottom + 8 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            {replyTo ? (
              <Pressable onPress={() => setReplyTo(null)} hitSlop={6}>
                <T variant="caption">Replying to @{replyTo.handle} · Cancel</T>
              </Pressable>
            ) : null}
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              placeholder={me.data?.id ? 'Add a comment…' : 'Sign in to comment'}
              placeholderTextColor={colors.dim}
              multiline
              maxLength={500}
              onFocus={() => {
                if (!me.data?.id) router.push('/sign-in');
              }}
              accessibilityLabel="Write a comment"
              style={s.input}
            />
          </View>
          <IconButton
            icon="send"
            label="Post comment"
            color={draft.trim() ? colors.gold : colors.dim}
            onPress={sending ? undefined : send}
          />
        </View>
      ) : null}
    </View>
  );
}
