import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getSupabase } from '@/data';

import type { Author, Media, Relation } from './api';

/**
 * The Activity tab (Instagram/TikTok notifications) and notification settings.
 * The server creates every notification (supabase/notifications.sql) and pushes it to the phone;
 * this file lists them, keeps the badge counts live, and saves what each person wants to hear about.
 */

export type NotificationKind =
  | 'post_like'
  | 'comment_like'
  | 'post_comment'
  | 'comment_reply'
  | 'mention'
  | 'follow'
  | 'friend_request'
  | 'friend_accept'
  | 'actor_post'
  | 'channel_post'
  | 'actor_live'
  | 'show_upcoming'
  | 'show_soon'
  | 'show_live'
  | 'gift';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  createdAt: string;
  read: boolean;
  actor: Author | null;
  postId: string | null;
  commentId: string | null;
  showId: string | null;
  episode: number | null;
  snippet: string | null;
  data: Record<string, unknown>;
  /** Server-written text: { title, body, url } (the same words as the push). */
  url: string;
  showTitle: string | null;
  showCover: string | null;
  postMedia: (Media & { locked?: boolean }) | null;
  relation: Relation | null;
}

/** Notification settings, Instagram-style. Everything is on until turned off. */
export const PREFS = [
  { key: 'likes', label: 'Likes', hint: 'On your posts and comments' },
  { key: 'comments', label: 'Comments and replies', hint: 'On your posts, and replies to your comments' },
  { key: 'mentions', label: 'Mentions', hint: 'When someone @mentions you' },
  { key: 'follows', label: 'New followers', hint: 'For creators' },
  { key: 'friends', label: 'Friend requests', hint: 'Requests and accepted requests' },
  { key: 'actor_posts', label: 'Posts from actors you follow', hint: 'New posts and Backstage channel updates' },
  { key: 'live', label: 'Actors live now', hint: 'When an actor you follow is in a live chat or fan room' },
  { key: 'premieres', label: 'Premieres', hint: 'Shows you follow, or that star actors you follow: tonight, in 15 minutes, live now' },
  { key: 'messages', label: 'Messages', hint: 'Direct messages' },
  { key: 'gifts', label: 'Gifts', hint: 'For creators: gifts during premieres' },
] as const;
export type PrefKey = (typeof PREFS)[number]['key'] | 'pause_all';

type Row = Record<string, unknown>;
const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('Notifications need the live backend.');
  return c;
};
const live = () => getSupabase() !== null;

const toAuthor = (r: Row | null): Author | null =>
  r
    ? {
        id: String(r.id),
        handle: String(r.handle),
        avatarUrl: (r.avatar_url as string | null) ?? null,
        isCast: Boolean(r.is_cast),
        verified: Boolean(r.verified),
        displayName: (r.display_name as string | null) ?? null,
      }
    : null;

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await sb().rpc('list_notifications', { p_before: null });
  if (error) throw new Error(error.message);
  const rows = (data as Row[]) ?? [];
  const list = rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as NotificationKind,
    createdAt: r.created_at as string,
    read: Boolean(r.read),
    actor: toAuthor(r.actor as Row | null),
    postId: (r.post_id as string | null) ?? null,
    commentId: (r.comment_id as string | null) ?? null,
    showId: (r.show_id as string | null) ?? null,
    episode: (r.episode as number | null) ?? null,
    snippet: (r.snippet as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    url: ((r.text as Row | null)?.url as string) ?? '/social',
    showTitle: (r.show_title as string | null) ?? null,
    showCover: (r.show_cover as string | null) ?? null,
    postMedia: (r.post_media as AppNotification['postMedia']) ?? null,
    relation: (r.relation as Relation | null) ?? null,
  }));
  // Sign the post thumbnails in one go.
  const paths = [...new Set(list.map((n) => n.postMedia?.path).filter((p): p is string => !!p))];
  if (paths.length) {
    const { data: signed } = await sb().storage.from('post-media').createSignedUrls(paths, 3600);
    const by = new Map((signed ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    for (const n of list) if (n.postMedia?.path) n.postMedia = { ...n.postMedia, url: by.get(n.postMedia.path) ?? undefined };
  }
  return list;
}

export async function unreadCount(): Promise<number> {
  const { data, error } = await sb().rpc('unread_notification_count');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function markAllRead() {
  await sb().rpc('mark_notifications_read');
}

export async function getPrefs(): Promise<Partial<Record<PrefKey, boolean>>> {
  const { data, error } = await sb().rpc('get_notification_prefs');
  if (error) throw new Error(error.message);
  return (data as Partial<Record<PrefKey, boolean>>) ?? {};
}

export async function setPref(key: PrefKey, on: boolean) {
  const { error } = await sb().rpc('set_notification_pref', { p_key: key, p_on: on });
  if (error) throw new Error(error.message);
}

/** The bell on an actor's page. */
export async function setPostNotifications(actorId: string, on: boolean) {
  const { error } = await sb().rpc('set_post_notifications', { p_actor: actorId, p_on: on });
  if (error) throw new Error(error.message);
}

export async function getPostNotifications(actorId: string): Promise<boolean | null> {
  const { data, error } = await sb().rpc('get_post_notifications', { p_actor: actorId });
  if (error) throw new Error(error.message);
  return (data as boolean | null) ?? null;
}

export const nk = {
  list: ['social', 'notifications'] as const,
  unread: ['social', 'notifications-unread'] as const,
  prefs: ['social', 'notification-prefs'] as const,
};

export const useNotifications = (enabled = true) =>
  useQuery({ queryKey: nk.list, queryFn: listNotifications, enabled: live() && enabled, staleTime: 10_000 });
export const useUnreadNotifications = (enabled = true) =>
  useQuery({ queryKey: nk.unread, queryFn: unreadCount, enabled: live() && enabled, refetchInterval: 60_000 });
export const useNotificationPrefs = (enabled = true) =>
  useQuery({ queryKey: nk.prefs, queryFn: getPrefs, enabled: live() && enabled });

/**
 * Keeps the badges live: a new notification (or message) refreshes the counts at once,
 * and the app icon shows the total unread (notifications + messages), like Instagram.
 */
export function useNotificationBadges(userId?: string | null, unreadMessages = 0) {
  const qc = useQueryClient();
  const unread = useUnreadNotifications(!!userId);
  useEffect(() => {
    const c = getSupabase();
    if (!c || !userId) return;
    const ch = c
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void qc.invalidateQueries({ queryKey: nk.unread });
        void qc.invalidateQueries({ queryKey: nk.list });
        void qc.invalidateQueries({ queryKey: ['social', 'unread'] });
      })
      .subscribe();
    return () => {
      void c.removeChannel(ch);
    };
  }, [userId, qc]);
  const total = (unread.data ?? 0) + unreadMessages;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.setBadgeCountAsync(total).catch(() => undefined);
  }, [total]);
  return { notifications: unread.data ?? 0, total };
}
