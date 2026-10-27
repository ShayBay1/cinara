import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type CommentSort, type Episode } from '@/data';

/** Server data hooks. Screens use these instead of calling the API directly. */
export const keys = {
  me: ['me'] as const,
  membership: ['membership'] as const,
  shows: ['shows'] as const,
  comingSoon: ['coming-soon'] as const,
  episode: (showId: string, n: number) => ['episode', showId, n] as const,
  comments: (showId: string, n: number, sort: CommentSort) => ['comments', showId, n, sort] as const,
  friends: ['friends'] as const,
  requests: ['friend-requests'] as const,
  gifts: ['gifts'] as const,
  premiere: (showId: string) => ['premiere', showId] as const,
  earnings: ['earnings'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.currentUser() });
export const useMembership = () => useQuery({ queryKey: keys.membership, queryFn: () => api.membership() });
export const useShows = () => useQuery({ queryKey: keys.shows, queryFn: () => api.listShows(), staleTime: 60_000 });
export const useComingSoon = () => useQuery({ queryKey: keys.comingSoon, queryFn: () => api.comingSoon() });
export const useEpisode = (showId: string, n: number) =>
  useQuery({ queryKey: keys.episode(showId, n), queryFn: () => api.episode(showId, n) });
/** Several episodes at once, e.g. every episode in a 10-episode drop. */
export function useEpisodes(showId: string, numbers: number[]) {
  return useQueries({
    queries: numbers.map((n) => ({ queryKey: keys.episode(showId, n), queryFn: () => api.episode(showId, n) })),
    combine: (results) => {
      const data = results.map((r) => r.data).filter((e): e is Episode => Boolean(e));
      return { data: data.length === numbers.length && numbers.length > 0 ? data : undefined, isPending: results.some((r) => r.isPending) };
    },
  });
}
export const useFriends = () => useQuery({ queryKey: keys.friends, queryFn: () => api.listFriends() });
export const useFriendRequests = () => useQuery({ queryKey: keys.requests, queryFn: () => api.listFriendRequests() });
export const useGifts = () => useQuery({ queryKey: keys.gifts, queryFn: () => api.gifts(), staleTime: Infinity });
export const useEarnings = () => useQuery({ queryKey: keys.earnings, queryFn: () => api.earnings(), staleTime: 5 * 60_000 });
export const usePremiereStart = (showId: string) =>
  useQuery({ queryKey: keys.premiere(showId), queryFn: () => api.livePremiereStart(showId) });

export function useShow(showId: string | undefined) {
  const shows = useShows();
  return { ...shows, data: shows.data?.find((s) => s.id === showId) };
}

export const useComments = (showId: string, n: number, sort: CommentSort) =>
  useQuery({ queryKey: keys.comments(showId, n, sort), queryFn: () => api.listComments(showId, n, sort) });

export function usePostComment(showId: string, n: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; atSec?: number | null; parentId?: string | null }) =>
      api.postComment({ showId, episode: n, ...input }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['comments', showId, n] });
      if (c.parentId) void qc.invalidateQueries({ queryKey: ['replies', c.parentId] });
    },
  });
}

/** One comment's replies, loaded when its thread is opened. */
export const useReplies = (commentId: string, enabled: boolean) =>
  useQuery({ queryKey: ['replies', commentId], queryFn: () => api.listReplies(commentId), enabled });

export function useLikeComment(showId: string, n: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) => api.setCommentLike(id, liked),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['comments', showId, n] });
      void qc.invalidateQueries({ queryKey: ['replies'] });
    },
  });
}

export function useRespondToRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api.respondToFriendRequest(id, accept),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.requests });
      void qc.invalidateQueries({ queryKey: keys.friends });
    },
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uri: string) => api.uploadAvatar(uri),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}
