import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Avatar, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { haptic } from '@/lib/haptics';
import { notify } from '@/lib/safety';
import { sendDm, socialLive, watchThread, type DmMedia, type DmMessage, type NewMedia } from '@/social/api';
import { Attachments, PriceChips, Tool, type Attachment } from '@/social/Composer';
import { sk, useLiveRefetch, useThread, useThreads } from '@/social/hooks';
import { pickMedia, uploadMedia, type StoredMedia } from '@/social/media';
import { canUnlockHere, money, openUnlock, vaultAsMedia, vaultPick, type VaultItem } from '@/social/studio';
import { NeedsLive, nameOf, s, socialMenu, timeAgo } from '@/social/ui';
import { clock, useVoiceRecorder, VoicePlayer } from '@/social/Voice';
import { colors, fonts, radius } from '@/theme/tokens';

type Pending =
  | { key: string; kind: 'new'; item: NewMedia }
  | { key: string; kind: 'vault'; item: VaultItem }
  | { key: string; kind: 'voice'; uri: string; durationMs: number };

/** One conversation between a fan and an actor: text, photos, videos, voice notes, paid and disappearing messages. */
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
  const [pending, setPending] = useState<Pending[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [ghost, setGhost] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const asActor = !!thread?.asActor;
  const voice = useVoiceRecorder((note) => setPending((p) => [...p, { key: `v${Date.now()}`, kind: 'voice', ...note }]));

  useLiveRefetch((cb) => watchThread(threadId, cb), messages.refetch, socialLive() ? threadId : '');

  // Opening the thread marks it read on the server; refresh the badges.
  useEffect(() => {
    if (!messages.dataUpdatedAt) return;
    void qc.invalidateQueries({ queryKey: sk.unread });
    void qc.invalidateQueries({ queryKey: sk.threads });
  }, [messages.dataUpdatedAt, qc]);

  // Back from the vault with a selection.
  useFocusEffect(
    useCallback(() => {
      const picked = vaultPick.take(`dm:${threadId}`);
      if (picked?.length) setPending((p) => [...p, ...picked.map((v) => ({ key: `vault${v.id}`, kind: 'vault' as const, item: v }))].slice(0, 6));
    }, [threadId]),
  );

  // A disappearing message vanishes on screen when its minute is up.
  useEffect(() => {
    const live = (messages.data ?? []).some((m) => m.ghost && m.openedAt && !m.expired);
    if (!live) return;
    const id = setInterval(() => void messages.refetch(), 15_000);
    return () => clearInterval(id);
  }, [messages.data, messages]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/messages'));

  const addPhotos = async () => {
    try {
      const items = await pickMedia({ limit: Math.max(1, 6 - pending.length), onSkip: notify });
      setPending((p) => [...p, ...items.map((item, i) => ({ key: `n${Date.now()}${i}`, kind: 'new' as const, item }))].slice(0, 6));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t add that.');
    }
  };

  const hasVisual = pending.some((p) => p.kind !== 'voice');
  const send = async () => {
    const body = draft.trim();
    if (!body && !pending.length) return;
    if (price && !hasVisual) {
      notify('Add a photo or video for fans to unlock.');
      return;
    }
    setSending(true);
    try {
      const uploads: StoredMedia[] = [];
      const fresh = pending.filter((p): p is Extract<Pending, { kind: 'new' }> => p.kind === 'new').map((p) => p.item);
      if (fresh.length) uploads.push(...(await uploadMedia(fresh, 'dm-media')));
      for (const p of pending) {
        if (p.kind === 'voice') uploads.push(...(await uploadMedia([{ uri: p.uri, type: 'audio', mimeType: 'audio/m4a', durationMs: p.durationMs }], 'dm-media')));
      }
      const fromVault = vaultAsMedia(pending.filter((p): p is Extract<Pending, { kind: 'vault' }> => p.kind === 'vault').map((p) => p.item));
      await sendDm(threadId, body, { media: [...fromVault, ...uploads], priceCents: asActor ? price : null, ghost: asActor && ghost });
      setDraft('');
      setPending([]);
      setPrice(null);
      setGhost(false);
      setShowPrice(false);
      haptic.pick();
      void messages.refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t send that.');
    } finally {
      setSending(false);
    }
  };

  const other = thread?.other;
  const data = [...(messages.data ?? [])].reverse();
  const attachments: Attachment[] = pending.map((p) =>
    p.kind === 'voice'
      ? { key: p.key, type: 'audio', label: clock(p.durationMs) }
      : p.kind === 'vault'
        ? { key: p.key, type: p.item.type, uri: p.item.url }
        : { key: p.key, type: p.item.type, uri: p.item.uri },
  );
  const canSend = !!draft.trim() || pending.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingBottom: keyboard }}>
      <View style={[st.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="back" label="Back" onPress={back} />
        {other ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/actor/[handle]', params: { handle: other.handle } })}
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
              <T variant="caption">
                {`@${other.handle}`}
                {asActor && (thread?.spentCents ?? 0) > 0 ? <T style={st.spent}>{`  ·  ${money(thread!.spentCents!)} lifetime`}</T> : null}
                {asActor && thread?.subscriber ? '  ·  subscriber' : ''}
              </T>
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
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Bubble
              m={item}
              mine={item.senderId === me.data?.id}
              threadId={threadId}
              onReport={() => (other ? socialMenu({ kind: 'dm', id: item.id, author: other, mine: false }, { onChanged: back }) : undefined)}
            />
          )}
        />
      )}

      {socialLive() && !messages.isError ? (
        <View style={[st.composer, { paddingBottom: keyboard ? 8 : insets.bottom + 8 }]}>
          <Attachments items={attachments} onRemove={(k) => setPending((p) => p.filter((x) => x.key !== k))} />
          {asActor && showPrice ? (
            <View style={{ gap: 6 }}>
              <T variant="caption">Fans pay once to unlock the photos and videos. You keep 80%.</T>
              <PriceChips value={price} onChange={setPrice} />
            </View>
          ) : null}
          {asActor && (price || ghost) ? (
            <T style={st.mode}>
              {[price ? `Locked · ${money(price)} to unlock` : null, ghost ? 'Disappears a minute after it’s opened' : null].filter(Boolean).join('  ·  ')}
            </T>
          ) : null}
          {voice.recording ? (
            <View style={st.recRow}>
              <View style={st.recDot} />
              <T style={{ fontFamily: fonts.bodyBold, color: colors.text, flex: 1 }}>{`Recording ${clock(voice.ms)}`}</T>
              <Pressable onPress={() => void voice.stop(false)} accessibilityRole="button" style={st.recBtn}>
                <T style={{ fontFamily: fonts.bodyBold, color: colors.muted }}>Cancel</T>
              </Pressable>
              <Pressable onPress={() => void voice.stop(true)} accessibilityRole="button" style={[st.recBtn, { backgroundColor: colors.gold }]}>
                <T style={{ fontFamily: fonts.bodyHeavy, color: colors.goldInk }}>Done</T>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
              <Tool icon="image" label="Add photos or videos" onPress={() => void addPhotos()} />
              {asActor ? (
                <Tool
                  icon="vault"
                  label="From your vault"
                  onPress={() => router.push({ pathname: '/vault', params: { pick: `dm:${threadId}` } })}
                />
              ) : null}
              <Tool icon="mic" label="Record a voice message" onPress={() => void voice.start()} />
              {asActor ? <Tool icon="dollar" label="Set a price" on={!!price || showPrice} onPress={() => setShowPrice((v) => !v)} /> : null}
              {asActor ? <Tool icon="ghost" label="Disappearing message" on={ghost} onPress={() => setGhost((g) => !g)} /> : null}
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={ghost ? 'Send a disappearing message…' : 'Message…'}
                placeholderTextColor={colors.dim}
                multiline
                maxLength={1000}
                accessibilityLabel="Write a message"
                style={[s.input, { flex: 1 }]}
              />
              {sending ? (
                <ActivityIndicator color={colors.gold} style={{ width: 44 }} />
              ) : (
                <IconButton icon="send" label="Send" color={canSend ? colors.gold : colors.dim} onPress={canSend ? send : undefined} />
              )}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Bubble({ m, mine, threadId, onReport }: { m: DmMessage; mine: boolean; threadId: string; onReport: () => void }) {
  if (m.expired) {
    return (
      <View style={[st.ghostGone, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
        <Icon name="ghost" size={14} color={colors.muted} />
        <T variant="caption">{mine ? 'Your disappearing message was opened' : 'This message disappeared'}</T>
      </View>
    );
  }
  const visual = m.media.filter((x) => x.type !== 'audio');
  const audio = m.media.filter((x) => x.type === 'audio');
  const ink = mine ? colors.goldInk : colors.text;
  const unlock = () => {
    if (canUnlockHere) void openUnlock('dm', m.id, `/messages/${threadId}`);
    else notify('Unlock it on cinaratv.com, signed in with this account. It opens here right after.');
  };
  return (
    <Pressable onLongPress={!mine ? onReport : undefined} delayLongPress={350} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 4 }}>
      {visual.length ? (
        m.locked ? (
          <Pressable onPress={unlock} accessibilityRole="button" accessibilityLabel={`Locked. ${money(m.priceCents ?? 0)} to unlock`} style={st.lockedTile}>
            {visual[0]?.preview ? <Image source={{ uri: visual[0].preview }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} /> : null}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(21,16,11,0.5)' }]} />
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
              <View style={st.lockBadge}>
                <Icon name="lock" size={18} color={colors.goldInk} />
              </View>
              <T style={{ fontFamily: fonts.bodyBold, color: colors.text, fontSize: 13 }}>
                {visual.length > 1 ? `${visual.length} photos and videos` : visual[0]?.type === 'video' ? 'A video' : 'A photo'}
              </T>
              <View style={st.unlockBtn}>
                <T style={{ fontFamily: fonts.bodyHeavy, color: colors.goldInk, fontSize: 13 }}>
                  {canUnlockHere ? `Unlock · ${money(m.priceCents ?? 0)}` : `${money(m.priceCents ?? 0)} on cinaratv.com`}
                </T>
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={{ gap: 4 }}>
            {visual.map((x, i) => (
              <MediaTile key={x.path ?? i} media={x} />
            ))}
          </View>
        )
      ) : null}
      {m.body || audio.length ? (
        <View
          style={[
            st.bubble,
            {
              backgroundColor: mine ? colors.gold : colors.surfaceRaised,
              borderBottomRightRadius: mine ? 6 : radius.lg,
              borderBottomLeftRadius: mine ? radius.lg : 6,
            },
          ]}
        >
          {audio.map((x, i) => (
            <VoicePlayer key={x.path ?? i} url={x.url} durationMs={x.duration_ms} mine={mine} />
          ))}
          {m.body ? <T style={{ fontSize: 15, lineHeight: 20, color: ink }}>{m.body}</T> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 6, alignSelf: mine ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
        {m.ghost ? <Icon name="ghost" size={11} color={colors.muted} /> : null}
        {m.priceCents && mine ? (
          <T style={[st.meta, { color: m.sold ? colors.online : colors.goldLight }]}>{m.sold ? `Unlocked · ${money(m.priceCents)}` : `Locked · ${money(m.priceCents)}`}</T>
        ) : null}
        {m.mass && mine ? <T style={st.meta}>Mass message</T> : null}
        <T style={st.meta}>{timeAgo(m.createdAt)}</T>
      </View>
    </Pressable>
  );
}

function MediaTile({ media }: { media: DmMedia }) {
  const w = 230;
  const h = media.width && media.height ? Math.min(320, Math.round((w * media.height) / media.width)) : 260;
  if (media.type === 'video') return <VideoTile url={media.url} width={w} height={h} />;
  return (
    <View style={{ width: w, height: h, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
      {media.url ? <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
    </View>
  );
}

function VideoTile({ url, width, height }: { url?: string; width: number; height: number }) {
  const player = useVideoPlayer(url ? { uri: url } : null, (p) => {
    p.loop = false;
  });
  return (
    <View style={{ width, height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls />
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  spent: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.online },
  composer: { borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 8, paddingTop: 6, gap: 6, backgroundColor: colors.ink },
  mode: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.goldLight, paddingHorizontal: 6 },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9, gap: 6 },
  meta: { fontFamily: fonts.body, fontSize: 10, color: colors.dim },
  lockedTile: { width: 230, height: 280, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.wine },
  lockBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  unlockBtn: { minHeight: 34, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.gold, justifyContent: 'center' },
  ghostGone: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 8 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
  recBtn: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center' },
});
