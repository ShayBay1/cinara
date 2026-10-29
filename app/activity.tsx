import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Avatar, Button, IconButton, T } from '@/components/ui';
import { coverSource } from '@/data/covers';
import { useFriendRequests, useMe, useRespondToRequest, useShows } from '@/hooks/queries';
import { markAllRead, nk, useNotifications, type AppNotification } from '@/social/notifications';
import { Empty, timeAgo } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** Notifications that read better as one line ("maya and 12 others liked your post"). */
const GROUPABLE = new Set(['post_like', 'comment_like', 'follow']);

interface Item {
  key: string;
  lead: AppNotification;
  others: AppNotification[];
  unread: boolean;
}

function bucket(iso: string, now: number) {
  const days = (now - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return 'Earlier';
}

/** The Activity tab: likes, comments, mentions, followers, friends, premieres and actors you follow. */
export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMe();
  const list = useNotifications(!!me.data?.id);
  // What was unread when you opened the screen stays under "New" while you're here.
  const [seen] = useState(() => new Set<string>());

  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(() => {
        void markAllRead()
          .then(() => qc.invalidateQueries({ queryKey: nk.unread }))
          .catch(() => undefined);
      }, 1200);
      return () => clearTimeout(id);
    }, [qc]),
  );

  const sections = useMemo(() => {
    const now = Date.now();
    const rows = list.data ?? [];
    for (const n of rows) if (!n.read) seen.add(n.id);
    const items: Array<Item & { section: string }> = [];
    for (const n of rows) {
      const section = seen.has(n.id) ? 'New' : bucket(n.createdAt, now);
      const groupKey = GROUPABLE.has(n.kind) ? `${section}:${n.kind}:${n.postId ?? n.commentId ?? ''}` : null;
      const prev = groupKey ? items.find((i) => i.key === groupKey) : undefined;
      if (prev) {
        if (n.actor && !prev.others.some((o) => o.actor?.id === n.actor?.id) && prev.lead.actor?.id !== n.actor.id) prev.others.push(n);
      } else items.push({ key: groupKey ?? n.id, lead: n, others: [], unread: seen.has(n.id), section });
    }
    const order = ['New', 'Today', 'Yesterday', 'This week', 'This month', 'Earlier'];
    return order
      .map((title) => ({ title, data: items.filter((i) => i.section === title) }))
      .filter((s) => s.data.length);
  }, [list.data, seen]);

  return (
    <View style={[styles.fill, { paddingTop: insets.top + 4 }]}>
      <View style={styles.bar}>
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />
        <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.text, flex: 1 }}>Notifications</T>
        <IconButton icon="settings" label="Notification settings" onPress={() => router.push('/notification-settings')} />
      </View>
      {!me.data?.id ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Empty title="Sign in to see your activity" body="Likes, comments, new followers, friends and premieres show up here." />
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      ) : list.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.key}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl tintColor={colors.gold} refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          renderSectionHeader={({ section }) => (
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 }}>
              {section.title}
            </T>
          )}
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Empty
                title="Nothing yet"
                body="When people like or comment on your posts, send you friend requests, or an actor you follow posts or goes live, you’ll see it here."
              />
            </View>
          }
          renderItem={({ item }) => <Row item={item} />}
        />
      )}
    </View>
  );
}

function names(item: Item) {
  const all = [item.lead, ...item.others].map((n) => n.actor?.handle).filter(Boolean) as string[];
  const first = all[0] ?? 'Someone';
  if (all.length <= 1) return { lead: first, others: '' };
  if (all.length === 2) return { lead: first, others: all[1]! };
  return { lead: first, others: `${all.length - 1} others` };
}

function sentence(n: AppNotification, many: boolean): string {
  const show = n.showTitle ?? 'the show';
  switch (n.kind) {
    case 'post_like':
      return ' liked your post.';
    case 'comment_like':
      return ` liked your comment: ${n.snippet ?? ''}`;
    case 'post_comment':
      return ` commented: ${n.snippet ?? ''}`;
    case 'comment_reply':
      return ` replied to your comment: ${n.snippet ?? ''}`;
    case 'mention':
      return ` mentioned you: ${n.snippet ?? ''}`;
    case 'follow':
      return many ? ' started following you.' : ' started following you.';
    case 'friend_request':
      return ' wants to be friends.';
    case 'friend_accept':
      return ' accepted your friend request.';
    case 'actor_post':
      return n.data.backstage ? ' shared a new Backstage post.' : ` posted: ${n.snippet || 'a new post'}`;
    case 'channel_post':
      return ` posted in their Backstage channel: ${n.snippet ?? ''}`;
    case 'actor_live':
      return n.data.where === 'room' ? ` is in the ${show} fan room right now.` : ` is in the live chat for ${show}. Join them.`;
    case 'show_upcoming':
      return `Episodes ${n.data.from}–${n.data.to} of ${show} premiere tonight at 8/7c.`;
    case 'show_soon':
      return `${show} starts in 15 minutes. The lobby is open.`;
    case 'show_live':
      return `${show} is live: episodes ${n.data.from}–${n.data.to} just dropped.`;
    case 'gift':
      return ` sent you a gift during ${show}.`;
    default:
      return '';
  }
}

function Row({ item }: { item: Item }) {
  const n = item.lead;
  const shows = useShows();
  const show = n.showId ? shows.data?.find((s) => s.id === n.showId) : undefined;
  const isShow = n.kind === 'show_upcoming' || n.kind === 'show_soon' || n.kind === 'show_live';
  const who = names(item);
  const text = sentence(n, item.others.length > 0);
  const open = () => router.push(n.url as never);

  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.row, item.unread && styles.unread, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      {isShow ? (
        <View style={[styles.showArt, { backgroundColor: show?.color ?? colors.wine }]}>
          {show && coverSource(show) ? (
            <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : n.showCover ? (
            <Image source={{ uri: n.showCover }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          {n.kind === 'show_live' ? <View style={styles.liveDot} /> : null}
        </View>
      ) : item.others.length ? (
        <View style={{ width: 48, height: 48 }}>
          <View style={{ position: 'absolute', top: 0, left: 0 }}>
            <Avatar handle={item.others[0]!.actor?.handle ?? '?'} url={item.others[0]!.actor?.avatarUrl} size={34} />
          </View>
          <View style={{ position: 'absolute', bottom: 0, right: 0, borderRadius: 19, borderWidth: 2, borderColor: colors.ink }}>
            <Avatar handle={n.actor?.handle ?? '?'} url={n.actor?.avatarUrl} size={34} />
          </View>
        </View>
      ) : (
        <View>
          <Avatar handle={n.actor?.handle ?? '?'} url={n.actor?.avatarUrl} size={48} />
          {n.kind === 'actor_live' ? <View style={styles.liveRing} /> : null}
        </View>
      )}

      <View style={{ flex: 1 }}>
        <T style={styles.text} numberOfLines={3}>
          {isShow ? null : <T style={[styles.text, { fontFamily: fonts.bodyHeavy }]}>{who.lead}</T>}
          {!isShow && who.others ? <T style={styles.text}> and </T> : null}
          {!isShow && who.others ? <T style={[styles.text, { fontFamily: fonts.bodyHeavy }]}>{who.others}</T> : null}
          <T style={styles.text}>{text}</T>
          <T style={styles.time}>{`  ${timeAgo(n.createdAt)}`}</T>
        </T>
      </View>

      <Trailing item={item} />
    </Pressable>
  );
}

function Trailing({ item }: { item: Item }) {
  const n = item.lead;
  const requests = useFriendRequests();
  const respond = useRespondToRequest();
  const [done, setDone] = useState<null | 'accepted' | 'declined'>(null);

  if (n.kind === 'friend_request') {
    const req = requests.data?.find((r) => r.from.id === n.actor?.id);
    if (done === 'accepted' || n.relation === 'friends') return <T style={styles.tag}>Friends</T>;
    if (done === 'declined' || !req) return null;
    return (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Button compact label="Confirm" onPress={() => { respond.mutate({ id: req.id, accept: true }); setDone('accepted'); }} />
        <Button compact kind="outline" label="Delete" onPress={() => { respond.mutate({ id: req.id, accept: false }); setDone('declined'); }} />
      </View>
    );
  }
  if (n.kind === 'actor_live' || n.kind === 'show_soon' || n.kind === 'show_live')
    return <Button compact kind={n.kind === 'show_live' ? 'live' : 'primary'} label="Join" onPress={() => router.push(n.url as never)} />;
  const m = n.postMedia;
  if (n.postId) {
    const src = m?.locked ? m?.preview : m?.url;
    return (
      <View style={styles.thumb}>
        {src ? <Image source={{ uri: String(src) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={m?.locked ? 20 : 0} /> : null}
        {m?.locked ? <Icon name="lock" size={14} color={colors.goldLight} /> : !src ? <Icon name="chat" size={16} color={colors.muted} /> : null}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  unread: { backgroundColor: 'rgba(255,184,0,0.06)' },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.text },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.dim },
  thumb: { width: 46, height: 46, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  showArt: { width: 48, height: 48, borderRadius: radius.sm, overflow: 'hidden' },
  liveDot: { position: 'absolute', right: 4, top: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live, borderWidth: 1.5, borderColor: '#fff' },
  liveRing: { position: 'absolute', inset: -3, borderRadius: 30, borderWidth: 2, borderColor: colors.live },
  tag: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.friend },
});
