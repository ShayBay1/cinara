import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/data';

import type { Media } from './api';
import { demoCreatorStats, demoMyActivity } from './demo';

/**
 * Analytics: an Instagram-style dashboard for creators, and TikTok-style
 * "Your activity" for everyone. The numbers are worked out on the server
 * (creator_analytics / my_activity in supabase/notifications.sql).
 */

type Row = Record<string, unknown>;
const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('Analytics need the live backend.');
  return c;
};
const live = () => getSupabase() !== null;
const n = (v: unknown) => Number(v ?? 0) || 0;

export interface TopPost {
  id: string;
  body: string;
  media: Media | null;
  visibility: string;
  createdAt: string;
  reached: number;
  likes: number;
  comments: number;
}

export interface CreatorStats {
  days: number;
  followers: number;
  newFollowers: number;
  newFollowersPrev: number;
  profileVisits: number;
  profileVisitsPrev: number;
  reached: number;
  reachedPrev: number;
  impressions: number;
  likes: number;
  likesPrev: number;
  comments: number;
  backstageFans: number;
  backstageViews: number;
  messageFans: number;
  earnedCents: number;
  daily: { day: string; followers: number; reached: number; visits: number }[];
  topPosts: TopPost[];
}

export interface MyActivity {
  days: number;
  watchSeconds: number;
  daily: { day: string; seconds: number }[];
  topShows: { showId: string; title: string; seconds: number }[];
  comments: number;
  likes: number;
  friends: number;
  following: number;
}

export async function creatorAnalytics(days: number): Promise<CreatorStats> {
  if (!live()) return demoCreatorStats(days);
  const { data, error } = await sb().rpc('creator_analytics', { p_days: days });
  if (error) throw new Error(error.message);
  const r = (data as Row) ?? {};
  const top: TopPost[] = ((r.top_posts as Row[]) ?? []).map((p) => ({
    id: String(p.id),
    body: String(p.body ?? ''),
    media: (p.media as Media | null) ?? null,
    visibility: String(p.visibility ?? 'public'),
    createdAt: String(p.created_at),
    reached: n(p.reached),
    likes: n(p.likes),
    comments: n(p.comments),
  }));
  const paths = [...new Set(top.map((p) => p.media?.path).filter((x): x is string => !!x))];
  if (paths.length) {
    const { data: signed } = await sb().storage.from('post-media').createSignedUrls(paths, 3600);
    const by = new Map((signed ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    for (const p of top) if (p.media?.path) p.media = { ...p.media, url: by.get(p.media.path) ?? undefined };
  }
  return {
    days: n(r.days),
    followers: n(r.followers),
    newFollowers: n(r.new_followers),
    newFollowersPrev: n(r.new_followers_prev),
    profileVisits: n(r.profile_visits),
    profileVisitsPrev: n(r.profile_visits_prev),
    reached: n(r.reached),
    reachedPrev: n(r.reached_prev),
    impressions: n(r.impressions),
    likes: n(r.likes),
    likesPrev: n(r.likes_prev),
    comments: n(r.comments),
    backstageFans: n(r.backstage_fans),
    backstageViews: n(r.backstage_views),
    messageFans: n(r.message_fans),
    earnedCents: n(r.earned_cents),
    daily: ((r.daily as Row[]) ?? []).map((d) => ({ day: String(d.day), followers: n(d.followers), reached: n(d.reached), visits: n(d.visits) })),
    topPosts: top,
  };
}

export async function myActivity(days: number): Promise<MyActivity> {
  if (!live()) return demoMyActivity(days);
  const { data, error } = await sb().rpc('my_activity', { p_days: days });
  if (error) throw new Error(error.message);
  const r = (data as Row) ?? {};
  return {
    days: n(r.days),
    watchSeconds: n(r.watch_seconds),
    daily: ((r.daily as Row[]) ?? []).map((d) => ({ day: String(d.day), seconds: n(d.seconds) })),
    topShows: ((r.top_shows as Row[]) ?? []).map((s) => ({ showId: String(s.show_id), title: String(s.title), seconds: n(s.seconds) })),
    comments: n(r.comments),
    likes: n(r.likes),
    friends: n(r.friends),
    following: n(r.following),
  };
}

/** Counts a visit to someone's profile (once a day per visitor; your own visits don't count). */
export async function recordProfileVisit(profileId: string) {
  if (!live()) return;
  await sb().rpc('record_profile_visit', { p_profile: profileId });
}

/** Counts posts that were on screen, for "Accounts reached". */
export async function recordImpressions(postIds: string[]) {
  if (!live() || !postIds.length) return;
  await sb().rpc('record_impressions', { p_posts: postIds });
}

export const useCreatorAnalytics = (days: number, enabled = true) =>
  useQuery({ queryKey: ['social', 'analytics', days], queryFn: () => creatorAnalytics(days), enabled, staleTime: 60_000 });
export const useMyActivity = (days: number, enabled = true) =>
  useQuery({ queryKey: ['social', 'my-activity', days], queryFn: () => myActivity(days), enabled, staleTime: 60_000 });

/** "+12%" against the period before; null when there's nothing to compare with. */
export function change(now: number, before: number): string | null {
  if (!before) return now ? 'New' : null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

export const compact = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : v >= 10_000
      ? `${Math.round(v / 1000)}K`
      : v >= 1000
        ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`
        : String(v);

export const hoursLabel = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};
