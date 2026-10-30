import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { haptic } from '@/lib/haptics';
import { notify } from '@/lib/safety';
import { socialLive, type NewMedia } from '@/social/api';
import { BackstageHero } from '@/social/Backstage';
import {
  ck,
  deleteChannelMessage,
  EMOJIS,
  markChannelRead,
  pin,
  postToChannel,
  useChannelActions,
  useChannelFeed,
  watchChannel,
  type ChannelMessage,
  type Emoji,
} from '@/social/channels';
import { useActor, useLiveRefetch } from '@/social/hooks';
import { CreatorRing, nameOf, s as ss, timeAgo } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** An actor's Backstage channel: their updates, photos and polls. Members react, vote and reply. */
export default function ChannelScreen() {
  const { handle = '' } = useLocalSearchParams<{ handle: string }>();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const qc = useQueryClient();
  const actor = useActor(handle);
  const a = actor.data;
  const actorId = a?.id ?? '';
  const feed = useChannelFeed(actorId);
  const actions = useChannelActions(actorId);
  const [picker, setPicker] = useState<string | null>(null);
  const isMine = !!a?.isMe;
  const isDemo = actorId.startsWith('demo-');

  useLiveRefetch((cb) => watchChannel(actorId, cb), feed.refetch, socialLive() && actorId && !isDemo ? actorId : '');

  // Opening the channel clears unread and counts as a view (that's how the actor gets paid).
  useEffect(() => {
    if (!actorId || isDemo || !feed.data || isMine) return;
    void markChannelRead(actorId)
      .then(() => qc.invalidateQueries({ queryKey: ck.list }))
      .catch(() => undefined);
  }, [actorId, isDemo, feed.data?.length, isMine, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/social', params: { tab: 'backstage' } }));
  const list = useMemo(() => [...(feed.data ?? [])].reverse(), [feed.data]);
  const pinned = feed.data?.find((m) => m.pinned);

  const options = (m: ChannelMessage) => {
    if (!isMine || m.demo) return;
    const del = async () => {
      try {
        await deleteChannelMessage(m.id);
        void feed.refetch();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Couldn’t delete.');
      }
    };
    const doPin = async () => {
      try {
        await pin(m.id, !m.pinned);
        void feed.refetch();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Couldn’t pin.');
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(m.pinned ? 'Unpin this message?' : 'Pin this message to the top?')) void doPin();
      else if (globalThis.confirm?.('Delete this message?')) void del();
      return;
    }
    Alert.alert('Your message', undefined, [
      { text: m.pinned ? 'Unpin' : 'Pin to top', onPress: () => void doPin() },
      { text: 'Delete', style: 'destructive', onPress: () => void del() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <IconButton icon="back" label="Back" onPress={back} />
      {a ? (
        <Pressable
          onPress={() => router.push({ pathname: '/actor/[handle]', params: { handle: a.handle } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={`${nameOf(a)}'s page`}
        >
          <CreatorRing handle={a.handle} url={a.avatarUrl} size={40} gold />
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                {nameOf(a)}
              </T>
              {a.verified ? <Verified size={13} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="lock" size={10} color={colors.goldLight} />
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.goldLight }}>Backstage channel</T>
            </View>
          </View>
        </Pressable>
      ) : (
        <T variant="label">Channel</T>
      )}
    </View>
  );

  if (actor.isPending || (feed.isPending && !!actorId && !isDemo))
    return (
      <View style={styles.fill}>
        {header}
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      </View>
    );

  if (!a)
    return (
      <View style={styles.fill}>
        {header}
        <T variant="caption" style={{ padding: 16 }}>
          This channel isn’t available.
        </T>
      </View>
    );

  // Not a member: a peek behind the curtain, then the pass.
  if (feed.data === null || (!feed.data && !isMine))
    return (
      <View style={styles.fill}>
        {header}
        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 8, opacity: 0.55 }}>
            {['Fitting for the next episode. Don’t tell anyone.', 'Poll: should they get back together?', 'Just wrapped. I’m a mess 😭'].map((t) => (
              <View key={t} style={[styles.bubble, { alignSelf: 'flex-start' }]}>
                <T style={{ color: 'transparent', textShadowColor: colors.text, textShadowRadius: 12 }}>{t}</T>
              </View>
            ))}
          </View>
          <T style={{ fontFamily: fonts.serif, fontSize: 24, lineHeight: 29, color: colors.text }}>
            {`${nameOf(a)}’s channel is for Backstage members.`}
          </T>
          <BackstageHero handle={a.handle} />
        </View>
      </View>
    );

  return (
    <View style={[styles.fill, { paddingBottom: keyboard }]}>
      {header}
      {pinned ? (
        <View style={styles.pinned}>
          <Icon name="ticket" size={14} color={colors.gold} />
          <T numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text }}>
            {pinned.kind === 'poll' ? `Poll: ${pinned.poll?.question}` : pinned.body || 'Pinned photo'}
          </T>
        </View>
      ) : null}
      <FlatList<ChannelMessage>
        inverted
        data={list}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, gap: 18, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ transform: [{ scaleY: -1 }], padding: 24, gap: 6 }}>
            <T variant="label" style={{ textAlign: 'center' }}>
              {isMine ? 'Your Backstage channel' : 'Nothing here yet'}
            </T>
            <T variant="caption" style={{ textAlign: 'center' }}>
              {isMine
                ? 'Post updates, photos and polls only Backstage members see. Every member who opens your channel counts toward your share.'
                : `${nameOf(a)} hasn’t posted in their channel yet.`}
            </T>
          </View>
        }
        renderItem={({ item }) => (
          <Message
            m={item}
            actorHandle={a.handle}
            actorAvatar={a.avatarUrl}
            picking={picker === item.id}
            onLongPress={() => {
              haptic.pick();
              if (isMine && !item.demo) options(item);
              else setPicker(picker === item.id ? null : item.id);
            }}
            onReact={(e) => {
              setPicker(null);
              if (!me.data?.id && !item.demo) return router.push('/sign-in');
              actions.react(item, e);
            }}
            onVote={(i) => (me.data?.id || item.demo ? actions.vote(item, i) : router.push('/sign-in'))}
          />
        )}
      />
      {isMine && !isDemo ? <Composer bottom={keyboard ? 8 : insets.bottom + 8} onPosted={() => void feed.refetch()} /> : null}
    </View>
  );
}

function Message({
  m,
  actorHandle,
  actorAvatar,
  picking,
  onLongPress,
  onReact,
  onVote,
}: {
  m: ChannelMessage;
  actorHandle: string;
  actorAvatar: string | null;
  picking: boolean;
  onLongPress: () => void;
  onReact: (e: Emoji) => void;
  onVote: (i: number) => void;
}) {
  const { width } = useWindowDimensions();
  const bubbleW = Math.min(width - 72, 420);
  const reactions = (Object.entries(m.reactions) as Array<[Emoji, number]>).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const openReplies = () => router.push({ pathname: '/channel/[handle]/[messageId]', params: { handle: actorHandle, messageId: m.id } });
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <CreatorRing handle={actorHandle} url={actorAvatar} size={30} gold />
      <View style={{ gap: 6, maxWidth: bubbleW }}>
        <Pressable onLongPress={onLongPress} delayLongPress={300} style={styles.bubble}>
          {m.pinned ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Icon name="ticket" size={11} color={colors.gold} />
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 10, letterSpacing: 1, color: colors.gold }}>PINNED</T>
            </View>
          ) : null}
          {m.media.length ? <Photos media={m.media} width={bubbleW - 24} /> : null}
          {m.kind === 'poll' && m.poll ? <PollCard poll={m.poll} onVote={onVote} /> : null}
          {m.body ? <T style={{ fontSize: 15.5, lineHeight: 22, marginTop: m.media.length ? 8 : 0 }}>{m.body}</T> : null}
          <T style={{ fontFamily: fonts.body, fontSize: 10.5, color: colors.dim, marginTop: 6, alignSelf: 'flex-end' }}>{timeAgo(m.createdAt)}</T>
        </Pressable>

        {picking ? (
          <View style={styles.picker}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => onReact(e)} hitSlop={4} style={[styles.pick, m.mine.includes(e) && { backgroundColor: colors.wine }]}>
                <T style={{ fontSize: 24 }}>{e}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {reactions.map(([e, n]) => (
            <Pressable
              key={e}
              onPress={() => onReact(e)}
              accessibilityRole="button"
              accessibilityLabel={`${e} ${n}`}
              style={[styles.chip, m.mine.includes(e) && { borderColor: colors.gold, backgroundColor: '#3A2A0E' }]}
            >
              <T style={{ fontSize: 13 }}>{e}</T>
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text }}>{n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n}</T>
            </Pressable>
          ))}
          <Pressable onPress={onLongPress} hitSlop={6} style={[styles.chip, { paddingHorizontal: 8 }]} accessibilityLabel="React">
            <T style={{ fontSize: 13, color: colors.muted }}>＋</T>
          </Pressable>
        </View>

        {m.highlight ? (
          <Pressable onPress={openReplies} style={styles.highlight}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 11, color: colors.gold, letterSpacing: 0.6 }}>{`★ ${actorHandle.toUpperCase()} HIGHLIGHTED`}</T>
            <T style={{ fontSize: 13.5 }} numberOfLines={2}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13.5 }}>{`${m.highlight.author.handle} `}</T>
              {m.highlight.body}
            </T>
          </Pressable>
        ) : null}
        <Pressable onPress={openReplies} hitSlop={6} accessibilityRole="button">
          <T style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted }}>
            {m.replies ? `${m.replies.toLocaleString()} ${m.replies === 1 ? 'reply' : 'replies'}` : 'Reply'}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

function Photos({ media, width }: { media: ChannelMessage['media']; width: number }) {
  const one = media.length === 1;
  const w = one ? width : (width - 4) / 2;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {media.slice(0, 4).map((m, i) => (
        <Image
          key={i}
          source={typeof m.url === 'string' ? (m.url ? { uri: m.url } : undefined) : m.url}
          style={{ width: w, height: one ? Math.round(w * 1.2) : w, borderRadius: radius.sm, backgroundColor: colors.surface }}
          contentFit="cover"
          transition={150}
        />
      ))}
    </View>
  );
}

function PollCard({ poll, onVote }: { poll: NonNullable<ChannelMessage['poll']>; onVote: (i: number) => void }) {
  const total = poll.counts.reduce((x, y) => x + y, 0);
  const voted = poll.myVote !== null;
  return (
    <View style={{ gap: 8, minWidth: 220 }}>
      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15.5, lineHeight: 21, color: colors.text }}>{poll.question}</T>
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((poll.counts[i]! / total) * 100) : 0;
        return (
          <Pressable key={i} onPress={() => onVote(i)} style={styles.option} accessibilityRole="button" accessibilityLabel={`Vote ${o}`}>
            {voted ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { width: `${pct}%`, backgroundColor: poll.myVote === i ? 'rgba(255,184,0,0.35)' : 'rgba(243,234,216,0.1)', borderRadius: radius.sm },
                ]}
              />
            ) : null}
            <T style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text }}>{o}</T>
            {voted ? <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: poll.myVote === i ? colors.gold : colors.muted }}>{`${pct}%`}</T> : null}
          </Pressable>
        );
      })}
      <T variant="caption">{`${total.toLocaleString()} ${total === 1 ? 'vote' : 'votes'}${voted ? '' : ' · tap to vote'}`}</T>
    </View>
  );
}

/** The actor's composer: a message, photos, or a poll. Members only react and reply. */
function Composer({ bottom, onPosted }: { bottom: number; onPosted: () => void }) {
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<NewMedia[]>([]);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const addPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.9 });
    if (r.canceled) return;
    const out: NewMedia[] = [];
    for (const a of r.assets) {
      const ctx = ImageManipulator.manipulate(a.uri);
      if (Math.max(a.width, a.height) > 1440) ctx.resize(a.width >= a.height ? { width: 1440 } : { height: 1440 });
      const img = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      out.push({ uri: img.uri, type: 'image', mimeType: 'image/jpeg', width: img.width, height: img.height });
    }
    setPhotos((p) => [...p, ...out].slice(0, 4));
    setPoll(null);
  };

  const send = async () => {
    const options = (poll ?? []).map((o) => o.trim()).filter(Boolean);
    if (poll && (!body.trim() || options.length < 2)) {
      notify('Write the question and at least two answers.');
      return;
    }
    if (!poll && !body.trim() && !photos.length) return;
    setSending(true);
    try {
      await postToChannel(
        poll
          ? { kind: 'poll', body: '', poll: { question: body.trim(), options } }
          : photos.length
            ? { kind: 'photo', body, photos }
            : { kind: 'text', body },
      );
      setBody('');
      setPhotos([]);
      setPoll(null);
      onPosted();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t post.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[ss.composer, { paddingBottom: bottom, flexDirection: 'column', alignItems: 'stretch' }]}>
      {photos.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {photos.map((p, i) => (
            <Pressable key={p.uri} onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))} accessibilityLabel="Remove photo">
              <Image source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {poll ? (
        <View style={{ gap: 6 }}>
          {poll.map((o, i) => (
            <TextInput
              key={i}
              value={o}
              onChangeText={(t) => setPoll((p) => p!.map((x, j) => (j === i ? t : x)))}
              placeholder={`Answer ${i + 1}`}
              placeholderTextColor={colors.dim}
              maxLength={60}
              style={[ss.input, { minHeight: 38, paddingTop: 8, paddingBottom: 8 }]}
            />
          ))}
          {poll.length < 4 ? (
            <Pressable onPress={() => setPoll((p) => [...p!, ''])}>
              <T variant="caption">+ Add an answer</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <IconButton icon="camera" label="Add photos" color={colors.muted} onPress={() => void addPhotos()} />
        <IconButton
          icon="check"
          label={poll ? 'Cancel poll' : 'Make a poll'}
          color={poll ? colors.gold : colors.muted}
          onPress={() => {
            setPoll(poll ? null : ['', '']);
            setPhotos([]);
            input.current?.focus();
          }}
        />
        <TextInput
          ref={input}
          value={body}
          onChangeText={setBody}
          placeholder={poll ? 'Ask a question…' : 'Message your Backstage…'}
          placeholderTextColor={colors.dim}
          multiline
          maxLength={2000}
          style={ss.input}
        />
        <IconButton icon="send" label="Post" color={body.trim() || photos.length ? colors.gold : colors.dim} onPress={sending ? undefined : () => void send()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  bubble: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  picker: {
    flexDirection: 'row',
    gap: 2,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  pick: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  highlight: { borderLeftWidth: 2, borderLeftColor: colors.gold, paddingLeft: 10, gap: 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
});
