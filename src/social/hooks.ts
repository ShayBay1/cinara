import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';

import * as social from './api';
import type { ActorCard, ActorProfile, Pass, Post } from './api';
import { DEMO_CREATORS, demoComments, demoPosts, demoProfile, isDemoId, showDemo } from './demo';

export const sk = {
  feed: (scope: Scope) => ['social', 'feed', scope] as const,
  posts: (authorId: string) => ['social', 'posts', authorId] as const,
  post: (id: string) => ['social', 'post', id] as const,
  comments: (id: string) => ['social', 'comments', id] as const,
  actor: (handle: string) => ['social', 'actor', handle.toLowerCase()] as const,
  actors: ['social', 'actors'] as const,
  pass: ['social', 'pass'] as const,
  rooms: ['social', 'rooms'] as const,
  room: (showId: string) => ['social', 'room', showId] as const,
  threads: ['social', 'threads'] as const,
  thread: (id: string) => ['social', 'thread', id] as const,
  unread: ['social', 'unread'] as const,
  stats: ['social', 'stats'] as const,
};
export type Scope = 'all' | 'following' | 'premium';

const live = social.socialLive();
const NO_PASS: Pass = { active: false, tier: null, dmAccess: false, renewsOn: null };

/** Likes and follows on sample posts stay on this phone (they never reach the server). */
const useDemo = create<{ likes: Record<string, boolean>; follows: Record<string, boolean>; toggleLike: (id: string) => void; setFollow: (id: string, on: boolean) => void }>(
  (set) => ({
    likes: {},
    follows: {},
    toggleLike: (id) => set((st) => ({ likes: { ...st.likes, [id]: !st.likes[id] } })),
    setFollow: (id, on) => set((st) => ({ follows: { ...st.follows, [id]: on } })),
  }),
);

function withDemoState(p: Post, likes: Record<string, boolean>): Post {
  if (!p.demo || !likes[p.id]) return p;
  return { ...p, likedByMe: true, likes: p.likes + 1 };
}

export const useMyPass = () =>
  useQuery({ queryKey: sk.pass, queryFn: social.myPass, enabled: live, staleTime: 30_000, placeholderData: NO_PASS });

/** Real posts first by time, with sample posts mixed in while testing. */
export function useFeed(scope: Scope) {
  const pass = useMyPass();
  const likes = useDemo((st) => st.likes);
  const follows = useDemo((st) => st.follows);
  const q = useQuery({ queryKey: sk.feed(scope), queryFn: () => social.feed(scope), enabled: live, staleTime: 20_000 });
  const data = useMemo(() => {
    const real = q.data ?? [];
    if (live && q.isPending) return undefined;
    if (!showDemo(real.length)) return real;
    const followed = Object.keys(follows).filter((k) => follows[k]);
    const demo = demoPosts(!!pass.data?.active, scope, followed).map((p) => withDemoState(p, likes));
    return [...real, ...demo].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [q.data, q.isPending, pass.data?.active, scope, likes, follows]);
  return { ...q, data, isPending: live ? q.isPending : false, refetch: q.refetch };
}

export function usePostsBy(authorId?: string) {
  const pass = useMyPass();
  const likes = useDemo((st) => st.likes);
  const q = useQuery({ queryKey: sk.posts(authorId ?? ''), queryFn: () => social.postsBy(authorId!), enabled: live && !!authorId && !isDemoId(authorId) });
  const data = useMemo(() => {
    if (authorId && isDemoId(authorId))
      return demoPosts(!!pass.data?.active).filter((p) => p.author.id === authorId).map((p) => withDemoState(p, likes));
    return q.data;
  }, [authorId, q.data, pass.data?.active, likes]);
  return { ...q, data, isPending: authorId && isDemoId(authorId) ? false : q.isPending };
}

export function usePost(id: string) {
  const pass = useMyPass();
  const likes = useDemo((st) => st.likes);
  const q = useQuery({ queryKey: sk.post(id), queryFn: () => social.getPost(id), enabled: live && !!id && !isDemoId(id) });
  const data = useMemo(() => {
    if (isDemoId(id)) {
      const p = demoPosts(!!pass.data?.active).find((x) => x.id === id);
      return p ? withDemoState(p, likes) : null;
    }
    return q.data;
  }, [id, q.data, pass.data?.active, likes]);
  return { ...q, data, isPending: isDemoId(id) ? false : q.isPending };
}

export function usePostComments(id: string, enabled = true) {
  const q = useQuery({ queryKey: sk.comments(id), queryFn: () => social.postComments(id), enabled: live && !!id && enabled && !isDemoId(id) });
  const data = useMemo(() => (isDemoId(id) ? demoComments(id) : q.data), [id, q.data]);
  return { ...q, data, isPending: isDemoId(id) ? false : q.isPending };
}

export function useActor(handle: string) {
  const pass = useMyPass();
  const follows = useDemo((st) => st.follows);
  const q = useQuery({ queryKey: sk.actor(handle), queryFn: () => social.actorProfile(handle), enabled: live && !!handle });
  const data = useMemo((): ActorProfile | null | undefined => {
    if (q.data) return q.data;
    if (live && q.isPending) return undefined;
    const d = demoProfile(handle, !!pass.data?.active, !!pass.data?.dmAccess);
    if (!d) return q.data ?? null;
    const on = follows[d.id];
    return on === undefined ? d : { ...d, following: on, followers: d.followers + (on ? 1 : 0) };
  }, [q.data, q.isPending, handle, pass.data?.active, pass.data?.dmAccess, follows]);
  return { ...q, data, isPending: live ? q.isPending && !data : false };
}

export function useActors() {
  const follows = useDemo((st) => st.follows);
  const q = useQuery({ queryKey: sk.actors, queryFn: social.listActors, enabled: live, staleTime: 60_000 });
  const data = useMemo((): ActorCard[] | undefined => {
    const real = q.data ?? [];
    if (live && q.isPending) return undefined;
    if (!showDemo(real.length)) return real;
    return [...real, ...DEMO_CREATORS.map((c) => (follows[c.id] === undefined ? c : { ...c, following: !!follows[c.id] }))];
  }, [q.data, q.isPending, follows]);
  return { ...q, data, isPending: live ? q.isPending : false };
}

export const useRooms = () => useQuery({ queryKey: sk.rooms, queryFn: social.rooms, enabled: live, staleTime: 30_000 });
export const useRoomMessages = (showId: string) =>
  useQuery({ queryKey: sk.room(showId), queryFn: () => social.roomMessages(showId), enabled: live && !!showId });
export const useThreads = (enabled = true) =>
  useQuery({ queryKey: sk.threads, queryFn: social.dmThreads, enabled: live && enabled });
export const useThread = (id: string) =>
  useQuery({ queryKey: sk.thread(id), queryFn: () => social.dmMessages(id), enabled: live && !!id });
export const useUnreadDms = (enabled = true) =>
  useQuery({ queryKey: sk.unread, queryFn: social.unreadDms, enabled: live && enabled, refetchInterval: 60_000 });
export const useCreatorStats = (enabled = true) =>
  useQuery({ queryKey: sk.stats, queryFn: social.creatorStats, enabled: live && enabled });

/** Updates one post everywhere it's cached (feeds, profile grids, the post page). */
function patchPost(qc: QueryClient, id: string, fn: (p: Post) => Post) {
  qc.setQueriesData<Post[]>({ queryKey: ['social', 'feed'] }, (list) => list?.map((p) => (p.id === id ? fn(p) : p)));
  qc.setQueriesData<Post[]>({ queryKey: ['social', 'posts'] }, (list) => list?.map((p) => (p.id === id ? fn(p) : p)));
  qc.setQueryData<Post | null>(sk.post(id), (p) => (p ? fn(p) : p));
}

export function useLikePost() {
  const qc = useQueryClient();
  const toggleDemo = useDemo((st) => st.toggleLike);
  const m = useMutation({
    mutationFn: ({ id, like }: { id: string; like: boolean }) => social.likePost(id, like),
    onMutate: ({ id, like }) =>
      patchPost(qc, id, (p) => ({ ...p, likedByMe: like, likes: Math.max(0, p.likes + (like ? 1 : -1)) })),
    onError: (_e, { id, like }) =>
      patchPost(qc, id, (p) => ({ ...p, likedByMe: !like, likes: Math.max(0, p.likes + (like ? -1 : 1)) })),
  });
  return {
    ...m,
    mutate: (v: { id: string; like: boolean }) => (isDemoId(v.id) ? toggleDemo(v.id) : m.mutate(v)),
  };
}

export function useFollow(handle: string) {
  const qc = useQueryClient();
  const setDemo = useDemo((st) => st.setFollow);
  const m = useMutation({
    mutationFn: ({ actorId, on }: { actorId: string; on: boolean }) => social.follow(actorId, on),
    onMutate: ({ on }) =>
      qc.setQueryData<social.ActorProfile | null>(sk.actor(handle), (a) =>
        a ? { ...a, following: on, followers: Math.max(0, a.followers + (on ? 1 : -1)) } : a,
      ),
    onError: (_e, { on }) =>
      qc.setQueryData<social.ActorProfile | null>(sk.actor(handle), (a) =>
        a ? { ...a, following: !on, followers: Math.max(0, a.followers + (on ? -1 : 1)) } : a,
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: sk.actors });
      void qc.invalidateQueries({ queryKey: sk.feed('following') });
    },
  });
  return {
    ...m,
    mutate: (v: { actorId: string; on: boolean }) => (isDemoId(v.actorId) ? setDemo(v.actorId, v.on) : m.mutate(v)),
  };
}

/**
 * Counts exclusive posts a Backstage member actually saw (on screen), in batches.
 * This is what each fan's money is split by, so only open, real posts by someone else count.
 */
export function useRecordViews(meId?: string | null) {
  const pass = useMyPass();
  const seen = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return useCallback(
    (posts: Post[]) => {
      if (!live || !pass.data?.active) return;
      for (const p of posts) {
        if (p.demo || p.locked || p.visibility !== 'subscribers' || p.author.id === meId || seen.current.has(p.id)) continue;
        seen.current.add(p.id);
        queue.current.push(p.id);
      }
      if (!queue.current.length || timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const ids = queue.current.splice(0, 50);
        void social.recordViews(ids).catch(() => ids.forEach((i) => seen.current.delete(i)));
      }, 1500);
    },
    [pass.data?.active, meId],
  );
}

/**
 * Realtime pings arrive per message; refetch at most once a second so a busy room
 * doesn't hammer the database.
 */
export function useLiveRefetch(subscribe: (cb: () => void) => () => void, refetch: () => unknown, key: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(refetch);
  latest.current = refetch;
  useEffect(() => {
    if (!key) return;
    const off = subscribe(() => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        void latest.current();
      }, 1000);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
