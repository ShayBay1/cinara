import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { notify } from '@/lib/safety';
import { addFriend, cancelFriendRequest, openDm, type ActorProfile, type Post } from '@/social/api';
import { BackstageHero } from '@/social/Backstage';
import { canOfferBackstage } from '@/lib/billing';
import { JoinBackstage, MessagesCard, openJoin } from '@/social/Join';
import { sk, useActor, useFollow, usePostsBy } from '@/social/hooks';
import { recordProfileVisit } from '@/social/analytics';
import { getPostNotifications, setPostNotifications } from '@/social/notifications';
import { shareProfile } from '@/social/studio';
import { CreatorRing } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/**
 * An actor's page, Instagram-style: who they are, follow, message, and two grids.
 * Posts is everything public; Backstage is their exclusive posts (blurred until you have the pass).
 */
export default function ActorScreen() {
  const params = useLocalSearchParams<{ handle: string; tab?: string; backstage?: string; subscribed?: string; messages?: string }>();
  const handle = params.handle ?? '';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useMe();
  const qc = useQueryClient();
  const actor = useActor(handle);
  const posts = usePostsBy(actor.data?.id);
  const follow = useFollow(handle);
  const [tab, setTab] = useState<'posts' | 'backstage'>(params.tab === 'backstage' ? 'backstage' : 'posts');
  const [busy, setBusy] = useState(false);
  const slide = useRef(new Animated.Value(params.tab === 'backstage' ? 1 : 0)).current;
  const a = actor.data;
  const justPaid = params.backstage === '1' || params.subscribed === '1' || params.messages === '1';

  useEffect(() => {
    Animated.spring(slide, { toValue: tab === 'backstage' ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [tab, slide]);

  // Back from Stripe: the webhook can take a few seconds, so check again a few times.
  useEffect(() => {
    if (!justPaid) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      void qc.invalidateQueries({ queryKey: ['social'] });
      if (n >= 5) clearInterval(id);
    }, 2500);
    return () => clearInterval(id);
  }, [justPaid, qc]);

  // Counts toward the actor's "Profile visits" (once a day; your own page doesn't count).
  useEffect(() => {
    if (a?.id && !a.demo && !a.isMe && me.data?.id) void recordProfileVisit(a.id).catch(() => undefined);
  }, [a?.id, a?.demo, a?.isMe, me.data?.id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));
  const split = useMemo(() => {
    const all = posts.data ?? [];
    return { open: all.filter((p) => p.visibility === 'public'), premium: all.filter((p) => p.visibility === 'subscribers') };
  }, [posts.data]);

  if (actor.isPending)
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );

  if (!a)
    return (
      <View style={[styles.fill, { paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12 }]}>
        <IconButton icon="back" label="Back" onPress={back} />
        <T variant="label">This page isn’t available.</T>
      </View>
    );

  const signedIn = !!me.data?.id;
  const needSignIn = () => router.push('/sign-in');

  const message = async () => {
    if (a.demo) {
      notify('This is a sample creator. Messages work with real cast members.');
      return;
    }
    if (!signedIn) return needSignIn();
    setBusy(true);
    try {
      const threadId = await openDm(a.id);
      router.push({ pathname: '/messages/[threadId]', params: { threadId } });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t open messages.');
    } finally {
      setBusy(false);
    }
  };

  const tile = Math.floor((Math.min(width, 600) - 4) / 3);
  const name = a.displayName || a.handle;
  const pageW = Math.min(width, 600);
  const underline = slide.interpolate({ inputRange: [0, 1], outputRange: [0, pageW / 2] });

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ paddingTop: a.coverUrl ? 0 : insets.top + 4, paddingBottom: insets.bottom + 40 }}
      refreshControl={
        <RefreshControl
          tintColor={colors.gold}
          refreshing={actor.isRefetching}
          onRefresh={() => {
            void actor.refetch();
            void posts.refetch();
          }}
        />
      }
    >
      {a.coverUrl ? (
        <View style={{ height: 170 + insets.top }}>
          <Image source={{ uri: a.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(21,16,11,0.25)' }]} />
        </View>
      ) : null}
      <View style={[styles.bar, a.coverUrl ? { position: 'absolute', top: insets.top + 4, left: 0, right: 0 } : null]}>
        <IconButton icon="back" label="Back" onPress={back} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.text }}>{a.handle}</T>
          {a.verified ? <Verified size={16} /> : null}
        </View>
        {a.isMe && a.isCast ? (
          <IconButton icon="link" label="Share your page" onPress={() => void shareProfile(a.handle, a.displayName)} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 }}>
          <CreatorRing handle={a.handle} url={a.avatarUrl} size={92} gold={a.premiumPosts > 0} />
          <View style={{ flexDirection: 'row', flex: 1, justifyContent: 'space-around' }}>
            {a.isCast ? (
              <>
                <Stat n={a.posts} label={a.posts === 1 ? 'post' : 'posts'} />
                <Stat n={a.followers} label={a.followers === 1 ? 'follower' : 'followers'} />
                <Stat n={a.premiumPosts} label="backstage" gold />
              </>
            ) : (
              <Stat n={a.friends} label={a.friends === 1 ? 'friend' : 'friends'} />
            )}
          </View>
        </View>

        <View style={{ marginTop: 12, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{name}</T>
            {a.verified ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Verified size={15} />
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.gold }}>Verified actor</T>
              </View>
            ) : a.isCast ? (
              <T style={styles.badge}>CAST</T>
            ) : null}
          </View>
          {a.shows.length ? (
            <T variant="caption" style={{ fontSize: 13 }}>
              {a.shows.map((s) => (s.role ? `${s.role} in ${s.title}` : s.title)).join(' · ')}
            </T>
          ) : null}
          {a.bio ? <T style={{ fontSize: 14.5, lineHeight: 20 }}>{a.bio}</T> : null}
          {a.demo ? (
            <T variant="caption" style={{ color: colors.goldLight }}>
              Sample creator while the app is being tested
            </T>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {a.isMe && !a.isCast ? (
            <Button compact kind="outline" label="Edit profile" onPress={() => router.push('/edit-profile')} style={{ flex: 1 }} />
          ) : !a.isCast ? (
            <FriendButton person={a} onChanged={() => void actor.refetch()} />
          ) : a.isMe ? (
            <>
              <Button compact label="New post" icon="plus" onPress={() => router.push('/post/new')} style={{ flex: 1 }} />
              <Button compact kind="outline" label="Studio" onPress={() => router.push('/studio')} style={{ flex: 1 }} />
              <Button compact kind="outline" label="Edit profile" onPress={() => router.push('/edit-profile')} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <Button
                compact
                kind={a.following ? 'outline' : 'primary'}
                label={a.following ? 'Following' : 'Follow'}
                onPress={() => (signedIn || a.demo ? follow.mutate({ actorId: a.id, on: !a.following }) : needSignIn())}
                style={{ flex: 1 }}
              />
              {a.following && !a.demo && signedIn ? <PostBell actorId={a.id} name={name} /> : null}
              {a.canMessage ? (
                <Button compact kind="outline" icon="send" label="Message" loading={busy} onPress={message} style={{ flex: 1 }} />
              ) : a.dmsOpen && a.verified && canOfferBackstage ? (
                <Button
                  compact
                  kind="outline"
                  icon="send"
                  label="Message"
                  onPress={() => openJoin({ handle: a.handle, mode: 'messages' })}
                  style={{ flex: 1 }}
                />
              ) : null}
              {!a.subscribed && a.verified ? (
                <JoinBackstage handle={a.handle} variant="outline" label="Backstage" style={{ flex: 1, borderColor: colors.gold }} />
              ) : null}
            </>
          )}
        </View>
        {a.verified ? (
          <Pressable
            onPress={() => router.push({ pathname: '/channel/[handle]', params: { handle: a.handle } })}
            accessibilityRole="button"
            accessibilityLabel={`${name}'s Backstage channel`}
            style={styles.channel}
          >
            <Icon name="chat" size={18} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text }}>
                {a.isMe ? 'Your Backstage channel' : `${name}’s channel`}
              </T>
              <T variant="caption">{a.isMe ? 'Post updates, photos and polls for members' : a.subscribed ? 'Updates, photos and polls' : 'For Backstage members'}</T>
            </View>
            <Icon name={a.subscribed || a.isMe ? 'chevron' : 'lock'} size={16} color={a.subscribed || a.isMe ? colors.muted : colors.goldLight} />
          </Pressable>
        ) : null}
        {justPaid && !a.subscribed && !a.canMessage ? (
          <T variant="caption" style={{ marginTop: 10, color: colors.friend }}>
            Thanks! Your purchase is being confirmed. This takes a few seconds.
          </T>
        ) : null}
      </View>

      {a.isCast ? (
      <>
      <View style={[styles.tabs, { width: pageW, alignSelf: 'center' }]}>
        {(['posts', 'backstage'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => {
              haptic.pick();
              setTab(t);
            }}
            style={styles.tab}
          >
            <Icon name={t === 'posts' ? 'reel' : 'lock'} size={20} color={tab === t ? (t === 'backstage' ? colors.gold : colors.text) : colors.dim} />
          </Pressable>
        ))}
        <Animated.View
          style={[styles.underline, { width: pageW / 2, backgroundColor: tab === 'backstage' ? colors.gold : colors.text, transform: [{ translateX: underline }] }]}
        />
      </View>

      {tab === 'backstage' && !a.isMe ? (
        <View style={{ padding: 12, gap: 12 }}>
          {!a.subscribed ? <BackstageHero handle={a.handle} /> : null}
          <MessagesCard actor={a} />
        </View>
      ) : null}

      {posts.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 24 }} />
      ) : (
        <Grid
          posts={tab === 'posts' ? split.open : split.premium}
          tile={tile}
          empty={
            tab === 'posts'
              ? a.isMe
                ? 'Your posts show up here.'
                : 'No posts yet.'
              : a.isMe
                ? 'Post something for Backstage and it lands here.'
                : `${name} hasn’t shared anything Backstage yet.`
          }
        />
      )}
      </>
      ) : (
        <T variant="caption" style={{ textAlign: 'center', paddingVertical: 28, paddingHorizontal: 24 }}>
          {a.isMe ? 'This is your profile. Friends can see what you’re watching.' : a.relation === 'friends' ? `You and ${a.handle} are friends.` : 'Add them as a friend to watch together.'}
        </T>
      )}
    </ScrollView>
  );
}

/** Fans connect as friends (actors are followed instead). */
function FriendButton({ person, onChanged }: { person: ActorProfile; onChanged: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const r = person.relation;
  if (r === 'friends')
    return <Button compact kind="outline" icon="check" label="Friends" disabled style={{ flex: 1, opacity: 1 }} />;
  const go = async () => {
    setBusy(true);
    try {
      if (r === 'requested') await cancelFriendRequest(person.id);
      else await addFriend(person.handle);
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
      void qc.invalidateQueries({ queryKey: ['friends'] });
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      compact
      kind={r === 'requested' ? 'outline' : 'primary'}
      label={r === 'requested' ? 'Requested' : r === 'incoming' ? 'Accept friend request' : 'Add friend'}
      loading={busy}
      onPress={() => void go()}
      style={{ flex: 1 }}
    />
  );
}

function Stat({ n, label, gold }: { n: number; label: string; gold?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 17, color: gold ? colors.gold : colors.text }}>{n.toLocaleString()}</T>
      <T style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textSoft }}>{label}</T>
    </View>
  );
}

function Grid({ posts, tile, empty }: { posts: Post[]; tile: number; empty: string }) {
  if (!posts.length)
    return (
      <T variant="caption" style={{ textAlign: 'center', paddingVertical: 32, paddingHorizontal: 24 }}>
        {empty}
      </T>
    );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignSelf: 'center', width: tile * 3 + 4 }}>
      {posts.map((p) => (
        <Tile key={p.id} post={p} size={tile} />
      ))}
    </View>
  );
}

function Tile({ post, size }: { post: Post; size: number }) {
  const first = post.media[0];
  const src = post.locked ? first?.preview : first?.url;
  const height = Math.round(size * 1.25);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.locked ? 'Backstage post' : 'Open post'}
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
      style={{ width: size, height, backgroundColor: post.locked ? colors.wine : colors.surface, overflow: 'hidden' }}
    >
      {src && first?.type !== 'video' ? (
        <Image
          source={typeof src === 'string' ? { uri: src } : src}
          style={{ width: size, height }}
          contentFit="cover"
          transition={120}
          blurRadius={post.locked ? 28 : 0}
        />
      ) : first?.type === 'video' && !post.locked ? (
        <View style={[styles.center, { backgroundColor: '#000' }]}>
          <Icon name="play" color={colors.text} filled size={24} />
        </View>
      ) : !first ? (
        <View style={{ flex: 1, padding: 8, justifyContent: 'center' }}>
          <T numberOfLines={5} style={{ fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 18, color: colors.textSoft }}>
            {post.body ?? ''}
          </T>
        </View>
      ) : null}
      {post.locked ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(21,16,11,0.3)' }]}>
          <Icon name="lock" color={colors.goldLight} size={22} />
        </View>
      ) : null}
      {post.media.length > 1 && !post.locked ? (
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <Icon name="reel" color={colors.text} size={14} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginTop: 18, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 44 },
  underline: { position: 'absolute', left: 0, bottom: -1, height: 2 },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  badge: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.goldInk,
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});

/** The bell next to Following: get a notification whenever this actor posts (Instagram's post notifications). */
function PostBell({ actorId, name }: { actorId: string; name: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void getPostNotifications(actorId)
      .then((v) => alive && setOn(v ?? true))
      .catch(() => alive && setOn(true));
    return () => {
      alive = false;
    };
  }, [actorId]);
  const toggle = () => {
    const next = !on;
    setOn(next);
    void setPostNotifications(actorId, next).catch(() => setOn(!next));
    notify(next ? `You’ll be notified when ${name} posts.` : `Post notifications from ${name} are off.`);
  };
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!on }}
      accessibilityLabel={`Post notifications from ${name}`}
      style={({ pressed }) => [bell.btn, on && bell.on, pressed && { opacity: 0.6 }]}
    >
      <Icon name="bell" size={18} color={on ? colors.goldInk : colors.text} />
    </Pressable>
  );
}

const bell = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.gold, borderColor: colors.gold },
});
