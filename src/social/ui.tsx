import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Avatar, Panel, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import type { UserSummary } from '@/data';
import { canOfferBackstage, WEB_URL } from '@/lib/billing';
import { haptic } from '@/lib/haptics';
import { blockPerson, notify } from '@/lib/safety';
import { colors, fonts, radius } from '@/theme/tokens';

import { reportSocial, type Media, type Post, type SocialKind } from './api';
import { useLikePost } from './hooks';
import { openJoin } from './Join';
import { canUnlockHere, money, openUnlock, REACTIONS, useReactPost, type Reaction } from './studio';

/* ---------- Time ---------- */

export function timeAgo(iso: string, now = Date.now()): string {
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

export function Ago({ iso, style }: { iso: string; style?: object }) {
  const [now, setNow] = useState(() => Date.now());
  const fresh = now - new Date(iso).getTime() < 60_000;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), fresh ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [fresh]);
  return <T style={[s.ago, style]}>{timeAgo(iso, now)}</T>;
}

export const nameOf = (a: { handle: string; displayName?: string | null }) => a.displayName || a.handle;

/* ---------- States ---------- */

export function NeedsLive() {
  return (
    <Panel style={{ padding: 18, gap: 8, marginTop: 16 }}>
      <Icon name="friends" color={colors.muted} />
      <T variant="label">The social side needs the live backend</T>
      <T variant="caption">Add the Supabase keys to .env to see posts, fan rooms and messages.</T>
    </Panel>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Panel style={{ padding: 18, gap: 8, marginTop: 16, alignItems: 'flex-start' }}>
      <T variant="label">{title}</T>
      <T variant="caption" style={{ fontSize: 14 }}>
        {body}
      </T>
    </Panel>
  );
}

/* ---------- Safety ---------- */

const ask = (title: string, body: string, ok: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(Boolean(globalThis.confirm?.(`${title}\n\n${body}`)));
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });

const LABEL: Record<SocialKind, string> = { post: 'post', post_comment: 'comment', room: 'message', dm: 'message', channel_reply: 'reply' };

/** Report / block for other people's things; delete for your own. */
export function socialMenu(
  t: { kind: SocialKind; id: string; author: UserSummary; mine: boolean },
  cb: { onDelete?: () => Promise<unknown>; onChanged?: () => void } = {},
) {
  const label = LABEL[t.kind];
  const report = async () => {
    try {
      await reportSocial(t.kind, t.id);
      notify('Thanks for telling us. Our team will review it.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  };
  const del = async () => {
    if (!(await ask(`Delete your ${label}?`, 'This can’t be undone.', 'Delete'))) return;
    try {
      await cb.onDelete?.();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  };
  if (t.mine) {
    if (cb.onDelete) void del();
    return;
  }
  if (Platform.OS === 'web') {
    void (async () => {
      if (await ask(`Report this ${label}?`, 'Our team will review it.', 'Report')) await report();
      if (await ask(`Block ${t.author.handle} too?`, 'You won’t see their posts, comments or messages.', 'Block'))
        await blockPerson(t.author, cb.onChanged);
    })();
    return;
  }
  Alert.alert(t.author.handle, undefined, [
    { text: `Report ${label}`, onPress: () => void report() },
    { text: `Block ${t.author.handle}`, style: 'destructive', onPress: () => void blockPerson(t.author, cb.onChanged) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/* ---------- Media ---------- */

type Src = string | number | undefined;
// A bundled image is a number on phones and an object on the web; only a string link becomes { uri }.
const source = (u: Src) => (typeof u === 'string' ? (u ? { uri: u } : undefined) : u ?? undefined);

function VideoItem({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  return <VideoView player={player} style={{ width, height, backgroundColor: '#000' }} contentFit="cover" nativeControls />;
}

/** Portrait posts can be up to 4:5 (like Instagram); everything else is square. */
export const mediaHeight = (m: Media | undefined, width: number) =>
  Math.round(width * (m?.width && m?.height ? Math.min(1.25, Math.max(0.8, m.height / m.width)) : 1));

export function MediaCarousel({ media, width, onDoubleTap }: { media: Media[]; width: number; onDoubleTap?: () => void }) {
  const [page, setPage] = useState(0);
  const height = mediaHeight(media[0], width);
  const lastTap = useRef(0);
  const heart = useRef(new Animated.Value(0)).current;
  if (!media.length) return null;
  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      onDoubleTap?.();
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }),
        Animated.delay(350),
        Animated.timing(heart, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    lastTap.current = now;
  };
  return (
    <View style={{ width, height, backgroundColor: colors.surfaceRaised }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={32}
      >
        {media.map((m, i) => (
          <Pressable key={i} onPress={tap} accessibilityLabel="Double-tap to like">
            {!m.url ? (
              <View style={{ width, height }} />
            ) : m.type === 'video' && typeof m.url === 'string' ? (
              <VideoItem url={m.url} width={width} height={height} />
            ) : (
              <Image source={source(m.url)} style={{ width, height }} contentFit="cover" transition={150} />
            )}
          </Pressable>
        ))}
      </ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, s.center, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
      >
        <Icon name="heart" filled color="#fff" size={96} />
      </Animated.View>
      {media.length > 1 ? (
        <>
          <View style={s.counter}>
            <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: '#fff' }}>{`${page + 1}/${media.length}`}</T>
          </View>
          <View style={s.dots}>
            {media.map((_, i) => (
              <View key={i} style={[s.dot, i === page && { backgroundColor: colors.gold }]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** What a fan without Backstage sees: the post, blurred, and one tap into the actor's Backstage. */
function Locked({ post, width, meId }: { post: Post; width: number; meId?: string | null }) {
  const first = post.media[0];
  const paid = post.priceCents != null;
  const unlock = () => {
    if (!meId) return router.push('/sign-in');
    if (canUnlockHere) void openUnlock('post', post.id, `/post/${post.id}`);
    else notify('Unlock it on cinaratv.com, signed in with this account. It opens here right after.');
  };
  const height = first ? mediaHeight(first, width) : Math.round(width * 0.8);
  const kinds = post.media.map((m) => m.type);
  const what = kinds.includes('video') ? 'a video' : kinds.length > 1 ? `${kinds.length} photos` : kinds.length ? 'a photo' : 'a post';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paid ? `Paid post, ${money(post.priceCents!)} to unlock` : `Backstage post. Open ${post.author.handle}'s Backstage`}
      onPress={() =>
        paid ? unlock() : router.push({ pathname: '/actor/[handle]', params: { handle: post.author.handle, tab: 'backstage' } })
      }
      style={{ width, height, backgroundColor: colors.wine, overflow: 'hidden' }}
    >
      {first?.preview ? (
        <Image source={source(first.preview)} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(21,16,11,0.45)' }]} />
      <View style={[StyleSheet.absoluteFill, s.center, { gap: 10, paddingHorizontal: 32 }]}>
        <View style={s.lockBadge}>
          <Icon name="lock" color={colors.goldInk} size={22} />
        </View>
        <T variant="eyebrow" style={{ color: colors.goldLight, fontSize: 12 }}>
          {paid ? 'Exclusive' : 'Backstage'}
        </T>
        <T style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, textAlign: 'center' }}>
          {paid ? `${nameOf(post.author)} shared ${what}. Unlock it to see it.` : `${nameOf(post.author)} shared ${what} for Backstage members`}
        </T>
        {paid ? (
          canUnlockHere ? (
            <Pressable onPress={unlock} accessibilityRole="button" style={s.unlock}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.goldInk }}>{`Unlock · ${money(post.priceCents!)}`}</T>
            </Pressable>
          ) : (
            <T variant="caption" style={{ textAlign: 'center' }}>
              {`${money(post.priceCents!)} to unlock on cinaratv.com`}
            </T>
          )
        ) : canOfferBackstage ? (
          <Pressable onPress={() => openJoin({ handle: post.author.handle })} accessibilityRole="button" style={s.unlock}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.goldInk }}>Unlock every actor · $4.99/mo</T>
          </Pressable>
        ) : (
          <T variant="caption" style={{ textAlign: 'center' }}>
            Tap to see their Backstage
          </T>
        )}
      </View>
    </Pressable>
  );
}

/* ---------- Creators ---------- */

/** A creator's picture with Instagram's story ring (gold when they have Backstage posts). */
export function CreatorRing({ handle, url, size = 62, gold }: { handle: string; url?: string | null; size?: number; gold?: boolean }) {
  return (
    <View style={{ padding: 2.5, borderRadius: size, borderWidth: 2.5, borderColor: gold ? colors.gold : colors.line }}>
      <View style={{ padding: 2, borderRadius: size, backgroundColor: colors.ink }}>
        <Avatar handle={handle} url={url} size={size - 9} />
      </View>
    </View>
  );
}

/* ---------- Post ---------- */

const longAgo = (iso: string) => {
  const t = timeAgo(iso);
  const n = Number.parseInt(t, 10);
  const unit = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' }[t.slice(-1)] ?? '';
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
};

export function PostCard({
  post,
  meId,
  isAdmin,
  onDelete,
  full,
}: {
  post: Post;
  meId?: string | null;
  isAdmin?: boolean;
  onDelete?: (id: string) => Promise<unknown>;
  /** On the post's own page: caption isn't clipped and tapping doesn't navigate. */
  full?: boolean;
}) {
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, 600);
  const like = useLikePost();
  const mine = !!meId && meId === post.author.id;
  const [more, setMore] = useState(false);
  const open = () => {
    if (!full) router.push({ pathname: '/post/[id]', params: { id: post.id } });
  };
  const doLike = (on: boolean) => {
    if (!meId && !post.demo) {
      router.push('/sign-in');
      return;
    }
    if (post.locked || post.likedByMe === on) return;
    haptic.pick();
    like.mutate({ id: post.id, like: on });
  };
  const share = async () => {
    const url = `${WEB_URL}/post/${post.id}`;
    if (Platform.OS === 'web') {
      await globalThis.navigator?.clipboard?.writeText(url).catch(() => undefined);
      notify('Link copied');
    } else await Share.share({ message: url });
  };
  const goActor = () => router.push({ pathname: '/actor/[handle]', params: { handle: post.author.handle } });
  return (
    <View style={{ width, alignSelf: 'center', paddingBottom: 18 }}>
      <View style={s.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${post.author.handle}'s page`} onPress={goActor} style={s.who}>
          <CreatorRing handle={post.author.handle} url={post.author.avatarUrl} size={40} gold={post.visibility === 'subscribers'} />
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text }} numberOfLines={1}>
                {post.author.handle}
              </T>
              {post.author.verified ? <Verified size={14} /> : null}
            </View>
            {post.priceCents != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="lock" size={11} color={colors.goldLight} />
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.goldLight }}>
                  {mine && post.unlocks != null ? `${money(post.priceCents)} · ${post.unlocks} unlocked` : `Exclusive · ${money(post.priceCents)}`}
                </T>
              </View>
            ) : post.visibility === 'subscribers' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="lock" size={11} color={colors.goldLight} />
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.goldLight }}>Backstage</T>
              </View>
            ) : post.demo ? (
              <T variant="caption">Sample post</T>
            ) : null}
          </View>
        </Pressable>
        {meId && !post.demo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            hitSlop={10}
            onPress={() =>
              socialMenu(
                { kind: 'post', id: post.id, author: post.author, mine: mine || !!isAdmin },
                { onDelete: onDelete ? () => onDelete(post.id) : undefined },
              )
            }
            style={{ padding: 6 }}
          >
            <Icon name="more" color={colors.text} size={20} />
          </Pressable>
        ) : null}
      </View>

      {post.locked ? (
        <Locked post={post} width={width} meId={meId} />
      ) : post.media.length ? (
        <MediaCarousel media={post.media} width={width} onDoubleTap={() => doLike(true)} />
      ) : (
        <Pressable onPress={open} disabled={full} style={[s.textPost, { width, minHeight: width * 0.6 }]}>
          <T style={{ fontFamily: fonts.serifItalic, fontSize: 26, lineHeight: 32, color: colors.text, textAlign: 'center' }}>{post.body}</T>
        </Pressable>
      )}

      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={post.likedByMe ? 'Unlike' : 'Like'} onPress={() => doLike(!post.likedByMe)} style={s.act}>
          <Icon name="heart" filled={post.likedByMe} color={post.likedByMe ? colors.live : colors.text} size={26} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Comments" onPress={open} style={s.act}>
          <Icon name="chat" color={colors.text} size={25} />
        </Pressable>
        {post.visibility === 'public' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={share} style={s.act}>
            <Icon name="send" color={colors.text} size={24} />
          </Pressable>
        ) : null}
      </View>

      {!post.locked && !post.demo ? <ReactionBar post={post} meId={meId} /> : null}

      <View style={{ paddingHorizontal: 14, gap: 4 }}>
        {post.likes > 0 ? (
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text }}>
            {`${post.likes.toLocaleString()} ${post.likes === 1 ? 'like' : 'likes'}`}
          </T>
        ) : null}
        {post.body && post.media.length ? (
          <Pressable onPress={() => (full ? undefined : more ? open() : setMore(true))}>
            <T style={s.body} numberOfLines={full || more ? undefined : 2}>
              <T style={[s.body, { fontFamily: fonts.bodyHeavy }]} onPress={goActor}>{`${post.author.handle} `}</T>
              {post.body}
            </T>
          </Pressable>
        ) : null}
        {!full && post.comments > 0 && !post.locked ? (
          <Pressable onPress={open}>
            <T style={{ fontFamily: fonts.body, fontSize: 14, color: colors.muted }}>
              {post.comments === 1 ? 'View 1 comment' : `View all ${post.comments.toLocaleString()} comments`}
            </T>
          </Pressable>
        ) : null}
        <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.dim, letterSpacing: 0.3, marginTop: 2 }}>{longAgo(post.createdAt).toUpperCase()}</T>
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  reactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, marginTop: -2, marginBottom: 6 },
  reactPill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  reactMine: { borderColor: colors.gold, backgroundColor: 'rgba(255,184,0,0.14)' },
  ago: { fontFamily: fonts.body, color: colors.muted, fontSize: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  center: { alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  lockBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  unlock: { backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 4 },
  textPost: { alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.wine },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  castBadge: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.goldInk,
    backgroundColor: colors.gold,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 6 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 6 },
  count: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, minWidth: 8 },
  body: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: colors.text },
  dots: { position: 'absolute', bottom: -16, alignSelf: 'center', flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(243,234,216,0.35)' },
  locked: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.ink,
  },
});

/** Emoji reactions under a post, like the counts subscription apps show (❤️ stays the like). */
function ReactionBar({ post, meId }: { post: Post; meId?: string | null }) {
  const react = useReactPost();
  const [open, setOpen] = useState(false);
  // Optimistic: what you tapped shows at once; the server's counts replace it when it answers.
  const [mine, setMine] = useState<string[]>(post.myReactions ?? []);
  const [counts, setCounts] = useState<Record<string, number>>(post.reactions ?? {});
  useEffect(() => {
    setMine(post.myReactions ?? []);
    setCounts(post.reactions ?? {});
  }, [post.myReactions, post.reactions]);
  const toggle = (e: Reaction) => {
    if (!meId) return router.push('/sign-in');
    const on = !mine.includes(e);
    haptic.pick();
    setMine((m) => (on ? [...m, e] : m.filter((x) => x !== e)));
    setCounts((c) => ({ ...c, [e]: Math.max(0, (c[e] ?? 0) + (on ? 1 : -1)) }));
    setOpen(false);
    react.mutate({ postId: post.id, emoji: e, on });
  };
  const shown = REACTIONS.filter((e) => (counts[e] ?? 0) > 0);
  return (
    <View style={s.reactRow}>
      {shown.map((e) => (
        <Pressable
          key={e}
          onPress={() => toggle(e)}
          accessibilityRole="button"
          accessibilityLabel={`${e} ${counts[e]}${mine.includes(e) ? ', yours' : ''}`}
          style={[s.reactPill, mine.includes(e) && s.reactMine]}
        >
          <T style={{ fontSize: 14 }}>{e}</T>
          <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text }}>{String(counts[e])}</T>
        </Pressable>
      ))}
      {open ? (
        REACTIONS.filter((e) => !shown.includes(e)).map((e) => (
          <Pressable key={e} onPress={() => toggle(e)} accessibilityRole="button" accessibilityLabel={`React ${e}`} style={s.reactPill}>
            <T style={{ fontSize: 16 }}>{e}</T>
          </Pressable>
        ))
      ) : (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Add a reaction" style={s.reactPill}>
          <T style={{ fontSize: 13, color: colors.muted }}>☺︎＋</T>
        </Pressable>
      )}
    </View>
  );
}
