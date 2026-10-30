import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { canOfferBackstage, formatPrice } from '@/lib/billing';
import { colors, fonts, radius } from '@/theme/tokens';

import { deletePost, PASS_PRICES, type ActorCard, type Post } from './api';
import { useActors, useFeed, useFollow, useMyPass, useRecordViews } from './hooks';
import { useChannels } from './channels';
import { openJoin } from './Join';
import { Ago, CreatorRing, Empty, nameOf, PostCard } from './ui';

const PERKS = [
  'Every actor’s exclusive posts, photos and videos',
  'Deleted scenes, table reads and set life',
  'Your money goes to the actors you actually watch',
];

/** The Backstage pass: what it is, who's in it, and the latest exclusive posts. */
export function BackstageHero({ handle }: { back?: string; handle?: string }) {
  const pass = useMyPass();
  const p = pass.data;
  return (
    <View style={styles.hero}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="ticket" color={colors.goldInk} size={18} />
        <T variant="eyebrow" style={{ color: colors.goldInk, fontSize: 12 }}>
          Backstage
        </T>
        {p?.active ? (
          <View style={styles.youre}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 10, color: colors.gold, letterSpacing: 1 }}>
              YOU’RE IN
            </T>
          </View>
        ) : null}
      </View>
      <T style={{ fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.goldInk }}>
        {p?.active ? 'Everything is unlocked.' : 'One pass. Every actor.'}
      </T>
      {!p?.active ? (
        <View style={{ gap: 4 }}>
          {PERKS.map((x) => (
            <View key={x} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="check" size={14} color={colors.goldInk} />
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.goldInk, flexShrink: 1 }}>{x}</T>
            </View>
          ))}
        </View>
      ) : null}
      {canOfferBackstage ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          {!p?.active ? (
            <Button
              label={`Join Backstage · ${formatPrice(PASS_PRICES.creators)}/mo`}
              kind="dark"
              onPress={() => openJoin({ handle })}
            />
          ) : null}
        </View>
      ) : !p?.active ? (
        <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.goldInk }}>Backstage members see every post on this page.</T>
      ) : null}
    </View>
  );
}

/** A creator in the Backstage list: who they are, what they've shared, and a peek at it. */
function CreatorRow({ c, peek }: { c: ActorCard; peek: Post[] }) {
  const me = useMe();
  const follow = useFollow(c.handle);
  const open = () => router.push({ pathname: '/actor/[handle]', params: { handle: c.handle, tab: 'backstage' } });
  const roles = c.roles.map((r) => (r.role ? `${r.role} · ${r.title}` : r.title)).join('  ·  ');
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${nameOf(c)}. Open their Backstage.`} style={styles.creator}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CreatorRing handle={c.handle} url={c.avatarUrl} size={58} gold={c.premiumPosts > 0} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {nameOf(c)}
            </T>
            {c.verified ? <Verified size={14} /> : null}
          </View>
          {roles ? (
            <T variant="caption" numberOfLines={1}>
              {roles}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="lock" size={11} color={colors.goldLight} />
            <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.goldLight }}>
              {`${c.premiumPosts} Backstage ${c.premiumPosts === 1 ? 'post' : 'posts'}`}
            </T>
            {c.dmsOpen ? <T variant="caption">{'  ·  Takes messages'}</T> : null}
          </View>
        </View>
        <Button
          compact
          kind={c.following ? 'outline' : 'primary'}
          label={c.following ? 'Following' : 'Follow'}
          onPress={() => (me.data?.id || c.demo ? follow.mutate({ actorId: c.id, on: !c.following }) : router.push('/sign-in'))}
        />
      </View>
      {peek.length ? (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
          {peek.slice(0, 3).map((p) => {
            const m = p.media[0];
            const src = p.locked ? m?.preview : m?.url;
            return (
              <View key={p.id} style={styles.peek}>
                {src ? (
                  <Image
                    source={typeof src === 'string' ? { uri: src } : src}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    blurRadius={p.locked ? 30 : 0}
                  />
                ) : null}
                {p.locked ? (
                  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(21,16,11,0.35)' }]}>
                    <Icon name="lock" size={16} color={colors.goldLight} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Instagram-inbox style list of every verified actor's channel, newest activity first. */
function Channels() {
  const channels = useChannels();
  const list = channels.data ?? [];
  if (!list.length) return null;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 }}>
        <T variant="eyebrow" style={{ color: colors.text }}>
          Channels
        </T>
        <T variant="caption">Updates, photos and polls from the cast</T>
      </View>
      {list.map((c) => (
        <Pressable
          key={c.actor.id}
          onPress={() => router.push({ pathname: '/channel/[handle]', params: { handle: c.actor.handle } })}
          accessibilityRole="button"
          accessibilityLabel={`${nameOf(c.actor)}'s channel${c.unread ? `, ${c.unread} new` : ''}`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }, pressed && { opacity: 0.75 }]}
        >
          <CreatorRing handle={c.actor.handle} url={c.actor.avatarUrl} size={54} gold={c.unread > 0 || !c.open} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                {nameOf(c.actor)}
              </T>
              {c.actor.verified ? <Verified size={13} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {!c.open ? <Icon name="lock" size={11} color={colors.goldLight} /> : null}
              <T
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontFamily: c.unread ? fonts.bodyHeavy : fonts.body,
                  fontSize: 13,
                  color: !c.open ? colors.goldLight : c.unread ? colors.text : colors.muted,
                }}
              >
                {!c.open ? `${c.messages} ${c.messages === 1 ? 'message' : 'messages'} for Backstage members` : (c.last ?? 'No messages yet')}
              </T>
              {c.lastAt ? <Ago iso={c.lastAt} /> : null}
            </View>
          </View>
          {c.unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold }} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The Backstage page: the pass, the creators in it, then the latest exclusive posts. */
export function BackstageFeed({ bottom, back = '/social' }: { bottom: number; back?: string }) {
  const me = useMe();
  const actors = useActors();
  const feed = useFeed('premium');
  const record = useRecordViews(me.data?.id);
  const byAuthor = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of feed.data ?? []) m.set(p.author.id, [...(m.get(p.author.id) ?? []), p]);
    return m;
  }, [feed.data]);
  const creators = useMemo(
    () => [...(actors.data ?? [])].sort((a, b) => b.premiumPosts - a.premiumPosts || b.followers - a.followers),
    [actors.data],
  );
  const onViewable = useMemo(
    () => ({ viewableItems }: { viewableItems: Array<{ item: unknown }> }) => record(viewableItems.map((v) => v.item as Post)),
    [record],
  );

  return (
    <FlatList<Post>
      data={feed.data ?? []}
      keyExtractor={(p) => p.id}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 800 }}
      contentContainerStyle={{ paddingBottom: bottom + 120 }}
      refreshControl={
        <RefreshControl
          tintColor={colors.gold}
          refreshing={feed.isRefetching}
          onRefresh={() => {
            void feed.refetch();
            void actors.refetch();
          }}
        />
      }
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
          <BackstageHero back={back} />
          <Channels />
          <T variant="eyebrow" style={{ color: colors.text, marginTop: 10 }}>
            Creators
          </T>
          {actors.isPending ? <ActivityIndicator color={colors.gold} /> : null}
          {creators.map((c) => (
            <CreatorRow key={c.id} c={c} peek={byAuthor.get(c.id) ?? []} />
          ))}
          <T variant="eyebrow" style={{ color: colors.text, marginTop: 14, marginBottom: 4 }}>
            Latest from Backstage
          </T>
        </View>
      }
      ListEmptyComponent={
        feed.isPending ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 20 }} />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <Empty title="Nothing Backstage yet" body="When actors share something exclusive, it shows up here first." />
          </View>
        )
      }
      renderItem={({ item }) => (
        <PostCard
          post={item}
          meId={me.data?.id}
          onDelete={async (id) => {
            await deletePost(id);
            void feed.refetch();
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.gold, borderRadius: radius.xl, padding: 18, gap: 10 },
  youre: { backgroundColor: colors.goldInk, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 'auto' },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(26,19,8,0.35)',
  },
  creator: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  peek: { flex: 1, aspectRatio: 0.8, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.wine },
});
