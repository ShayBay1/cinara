import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Avatar, Button, IconButton, T } from '@/components/ui';
import { api, type Comment, type CommentSort } from '@/data';
import { useComments, useLikeComment, useMe, usePostComment, useReplies } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { notify, openSafetyMenu } from '@/lib/safety';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';


export default function CommentsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ showId: string; episode: string; t?: string }>();
  const showId = params.showId ?? '';
  const episode = Number.parseInt(params.episode ?? '1', 10) || 1;
  const friendsFirst = useAppStore((s) => s.friendsFirst);
  const [sort, setSort] = useState<CommentSort>('top');
  const [draft, setDraft] = useState('');
  /** The thread a reply goes into (always the top comment) and who it's addressed to. */
  const [replyTo, setReplyTo] = useState<{ rootId: string; handle: string } | null>(null);
  /** Threads that are open. */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const qc = useQueryClient();
  const comments = useComments(showId, episode, sort);
  const post = usePostComment(showId, episode);
  const like = useLikeComment(showId, episode);
  const me = useMe();
  const signedIn = Boolean(me.data);
  const keyboard = useKeyboardHeight();

  const tabs: { key: CommentSort; label: string }[] = [
    { key: 'top', label: 'Top' },
    { key: 'newest', label: 'Newest' },
    ...(friendsFirst ? [{ key: 'friends' as const, label: 'Friends' }] : []),
  ];

  const startReply = (rootId: string, c: Comment) => {
    if (!signedIn) {
      router.push('/sign-in');
      return;
    }
    setReplyTo({ rootId, handle: c.author.handle });
    setOpen((o) => ({ ...o, [rootId]: true }));
    // Replying inside a thread to someone other than the top commenter: tag them.
    setDraft(c.id !== rootId ? `@${c.author.handle} ` : '');
    setTimeout(() => input.current?.focus(), 50);
  };

  const submit = () => {
    const body = draft.trim();
    if (!body || post.isPending) return;
    if (!signedIn) {
      router.push('/sign-in');
      return;
    }
    const parentId = replyTo?.rootId ?? null;
    post.mutate(
      { body, atSec: null, parentId },
      {
        onSuccess: () => {
          setDraft('');
          if (parentId) {
            setOpen((o) => ({ ...o, [parentId]: true }));
            setReplyTo(null);
          } else {
            setSort('newest');
          }
        },
        onError: (e) => notify(e instanceof Error ? e.message : 'Your comment didn’t post. Try again.'),
      },
    );
  };

  const menu = (c: Comment) =>
    openSafetyMenu(
      { kind: 'comment', id: c.id, author: c.author, mine: c.author.id === me.data?.id },
      {
        onChanged: () => {
          void comments.refetch();
          void qc.invalidateQueries({ queryKey: ['replies'] });
        },
        onDelete: async () => {
          await api.deleteComment(c.id);
          await comments.refetch();
          await qc.invalidateQueries({ queryKey: ['replies'] });
        },
      },
    );

  const onLike = (c: Comment) => like.mutate({ id: c.id, liked: !c.likedByMe });
  const pendingLike = (c: Comment) =>
    like.variables?.id === c.id && like.isPending ? (like.variables.liked ? 1 : -1) : 0;

  return (
    // The whole sheet lifts by the keyboard's height, so the typing bar always sits right above it.
    <View style={[styles.fill, { paddingBottom: keyboard }]}>
      <View style={styles.header}>
        <View>
          <T variant="title" style={{ fontSize: 17 }}>
            Comments
          </T>
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

      {!signedIn && !me.isPending ? (
        <View style={{ padding: 16, gap: 10 }}>
          <T variant="caption">Sign in to read and join the conversation.</T>
          <Button compact label="Sign in" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/sign-in')} />
        </View>
      ) : comments.isError ? (
        <View style={{ padding: 16, gap: 10 }}>
          <T variant="caption">Comments didn’t load. Check your connection.</T>
          <Button compact kind="outline" label="Try again" style={{ alignSelf: 'flex-start' }} onPress={() => void comments.refetch()} />
        </View>
      ) : comments.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={comments.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 18 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <T variant="caption">
              {sort === 'friends'
                ? 'None of your friends have commented yet.'
                : 'Be the first to comment.'}
            </T>
          }
          renderItem={({ item: c }) => (
            <Thread
              comment={c}
              open={!!open[c.id]}
              onToggle={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
              meId={me.data?.id}
              onReply={startReply}
              onLike={onLike}
              pendingLike={pendingLike}
              onMenu={menu}
            />
          )}
        />
      )}

      <View style={[styles.composer, { paddingBottom: keyboard > 0 ? 10 : insets.bottom + 10 }]}>
        {replyTo ? (
          <View style={styles.replying}>
            <T variant="caption" style={{ flex: 1 }}>{`Replying to @${replyTo.handle}`}</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
              onPress={() => {
                setReplyTo(null);
                setDraft('');
              }}
              hitSlop={10}
            >
              <Icon name="close" size={16} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTo ? `Reply to @${replyTo.handle}…` : `Say something about Episode ${episode}…`}
            placeholderTextColor={colors.dim}
            maxLength={400}
            accessibilityLabel={replyTo ? 'Write a reply' : 'Add a comment'}
            returnKeyType="send"
            onSubmitEditing={submit}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={replyTo ? 'Post reply' : 'Post comment'}
            disabled={!draft.trim() || post.isPending}
            onPress={submit}
            style={[styles.send, { backgroundColor: draft.trim() ? colors.gold : '#4A4436' }]}
          >
            {post.isPending ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Icon name="send" size={18} color={colors.ink} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type RowActions = {
  meId?: string;
  onLike: (c: Comment) => void;
  pendingLike: (c: Comment) => number;
  onMenu: (c: Comment) => void;
};

/** A top comment with its replies tucked underneath. */
function Thread({
  comment,
  open,
  onToggle,
  onReply,
  ...actions
}: RowActions & {
  comment: Comment;
  open: boolean;
  onToggle: () => void;
  onReply: (rootId: string, c: Comment) => void;
}) {
  const replies = useReplies(comment.id, open);
  const count = Math.max(comment.replyCount ?? 0, replies.data?.length ?? 0);
  return (
    <View style={{ gap: 10 }}>
      <CommentRow c={comment} size={38} onReply={() => onReply(comment.id, comment)} {...actions} />
      {count > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onToggle}
          style={styles.threadToggle}
          hitSlop={6}
        >
          <View style={styles.threadLine} />
          <T variant="caption" style={{ color: colors.textSoft, fontFamily: fonts.bodyBold }}>
            {open ? 'Hide replies' : `View ${count} ${count === 1 ? 'reply' : 'replies'}`}
          </T>
        </Pressable>
      ) : null}
      {open ? (
        <View style={styles.replies}>
          {replies.isPending ? <ActivityIndicator color={colors.gold} /> : null}
          {(replies.data ?? []).map((r) => (
            <CommentRow key={r.id} c={r} size={28} onReply={() => onReply(comment.id, r)} {...actions} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CommentRow({ c, size, onReply, meId, onLike, pendingLike, onMenu }: RowActions & { c: Comment; size: number; onReply: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Avatar handle={c.author.handle} url={c.author.avatarUrl} size={size} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <T variant="label" style={{ fontSize: 13 }}>
            {c.author.handle}
          </T>
          {c.author.isCast ? <Badge label="CAST" gold /> : null}
          {c.isFriend ? <Badge label="FRIEND" /> : null}
          <Ago iso={c.createdAt} />
        </View>
        <T style={{ fontSize: 14, color: '#E5E1EA' }}>
          {c.body}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={c.likedByMe ? 'Unlike' : 'Like'}
            accessibilityState={{ selected: c.likedByMe }}
            onPress={() => onLike(c)}
            style={styles.act}
          >
            <Icon name="heart" size={16} color={c.likedByMe ? colors.accent : colors.muted} filled={c.likedByMe} />
            <T variant="caption">{String(c.likes + pendingLike(c))}</T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${c.author.handle}`} onPress={onReply} style={styles.act}>
            <T variant="caption">Reply</T>
          </Pressable>
          <IconButton
            icon="more"
            label={c.author.id === meId ? 'Delete comment' : 'Report or block'}
            size={36}
            color={colors.dim}
            onPress={() => onMenu(c)}
          />
        </View>
      </View>
    </View>
  );
}

function Badge({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <View style={gold ? styles.badgeGold : styles.badgeFriend}>
      <T
        style={{
          fontFamily: fonts.bodyHeavy,
          fontSize: 9,
          letterSpacing: 1.1,
          color: gold ? colors.ink : '#8FE3CB',
        }}
      >
        {label}
      </T>
    </View>
  );
}

/** Instagram-style age: 5s, 12m, 3h, 2d, 6w, then years. */
function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${Math.max(1, s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 52) return `${w}w`;
  return `${Math.floor(d / 365)}y`;
}

/** The age next to a name. Ticks every second for the first minute, then every half minute. */
function Ago({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  const fresh = now - new Date(iso).getTime() < 60_000;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), fresh ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [fresh]);
  return <T style={styles.ago}>{timeAgo(iso, now)}</T>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  act: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#3A2E20',
    backgroundColor: '#110D09',
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  ago: { fontFamily: fonts.body, fontSize: 11.5, color: colors.dim, letterSpacing: 0.2 },
  replying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#1D1712',
  },
  threadToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 48, minHeight: 28 },
  threadLine: { width: 24, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.line },
  replies: { marginLeft: 48, gap: 14 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badgeGold: {
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeFriend: {
    borderWidth: 1,
    borderColor: '#4A6A99',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
});
