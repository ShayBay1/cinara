import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { SnippetsApi } from './api';
import type { ChatMessage, Comment, CommentSort, Episode, Friend, FriendRequest, Show, UserSummary } from './types';

/**
 * Supabase-backed API. Table and function names match supabase/schema.sql.
 * Payments never run here: checkout URLs come from a server function that
 * talks to Stripe with the secret key, and only the web build calls it.
 */
export function createSupabaseApi(url: string, anonKey: string): SnippetsApi {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data as T;
  };

  const userId = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error('Please sign in first.');
    return data.user.id;
  };

  const toUser = (row: { id: string; handle: string; avatar_url: string | null; is_cast?: boolean }): UserSummary => ({
    id: row.id,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    isCast: row.is_cast ?? false,
  });

  return {
    mode: 'live',

    async currentUser() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      const row = must(await sb.from('profiles').select('id, handle, avatar_url, is_cast').eq('id', data.user.id).single()) as {
        id: string;
        handle: string;
        avatar_url: string | null;
        is_cast: boolean;
      };
      return toUser(row);
    },
    async sendSignInCode(email) {
      must(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    },
    async verifySignInCode(email, code) {
      must(await sb.auth.verifyOtp({ email, token: code, type: 'email' }));
      const user = await this.currentUser();
      if (!user) throw new Error('Sign-in did not complete. Try the code again.');
      return user;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async membership() {
      const id = await userId();
      const row = must(await sb.from('memberships').select('status, current_period_end').eq('user_id', id).maybeSingle()) as
        | { status: string; current_period_end: string | null }
        | null;
      return { active: row?.status === 'active', renewsOn: row?.current_period_end ?? null };
    },
    async uploadAvatar(localUri) {
      const id = await userId();
      const body = await (await fetch(localUri)).arrayBuffer();
      const path = `${id}/${Date.now()}.jpg`;
      must(await sb.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg', upsert: true }));
      // New photos are held as "pending" until the moderation function approves them.
      must(await sb.from('profiles').update({ pending_avatar_path: path }).eq('id', id));
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },

    async listShows() {
      const rows = must(await sb.from('shows').select('*').eq('published', true).order('number')) as Array<Record<string, unknown>>;
      return rows.map(
        (r): Show => ({
          id: r.id as string,
          number: r.number as string,
          title: r.title as string,
          genre: r.genre as string,
          tagline: r.tagline as string,
          synopsis: (r.synopsis as string | null) ?? undefined,
          color: r.color as string,
          coverUrl: (r.cover_url as string | null) ?? null,
          featured: (r.featured as boolean | null) ?? false,
          episodeCount: r.episode_count as number,
          latestEpisode: r.latest_episode as number,
          releaseDays: r.release_days as number[],
          cast: (r.cast as Show['cast']) ?? [],
          episodeTitles: (r.episode_titles as string[]) ?? [],
        }),
      );
    },
    async comingSoon() {
      const row = must(await sb.from('coming_soon').select('title, teaser, starring, arrives').maybeSingle());
      return row as { title?: string; teaser: string; starring: string; arrives: string } | null;
    },
    async episode(showId, number) {
      // Signed playback URLs are issued by a server function so members-only episodes stay private.
      const data = must(await sb.functions.invoke('playback-url', { body: { showId, number } })) as {
        title: string;
        url: string;
        durationSec: number;
        reframe?: Episode['reframe'];
      };
      return { showId, number, title: data.title, videoUrl: data.url, durationSec: data.durationSec, reframe: data.reframe ?? null };
    },
    async livePremiereStart(showId) {
      const row = must(await sb.from('premieres').select('starts_at').eq('show_id', showId).eq('is_live', true).maybeSingle()) as
        | { starts_at: string }
        | null;
      return row?.starts_at ?? null;
    },

    async listComments(showId, episode, sort: CommentSort) {
      const rows = must(
        await sb.rpc('list_comments', { p_show_id: showId, p_episode: episode, p_sort: sort }),
      ) as Array<Record<string, unknown>>;
      return rows.map(
        (r): Comment => ({
          id: r.id as string,
          showId,
          episode,
          author: toUser(r.author as never),
          body: r.body as string,
          atSec: (r.at_sec as number | null) ?? null,
          likes: r.likes as number,
          likedByMe: r.liked_by_me as boolean,
          isFriend: r.is_friend as boolean,
          createdAt: r.created_at as string,
        }),
      );
    },
    async postComment({ showId, episode, body, atSec }) {
      const id = await userId();
      must(await sb.from('comments').insert({ show_id: showId, episode, body, at_sec: atSec ?? null, author_id: id }));
      const [newest] = await this.listComments(showId, episode, 'newest');
      if (!newest) throw new Error('Comment was not saved.');
      return newest;
    },
    async setCommentLike(commentId, liked) {
      const id = await userId();
      if (liked) must(await sb.from('comment_likes').upsert({ comment_id: commentId, user_id: id }));
      else must(await sb.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', id));
    },
    async reportComment(commentId, reason) {
      const id = await userId();
      must(await sb.from('reports').insert({ comment_id: commentId, reporter_id: id, reason }));
    },

    async listFriends() {
      const rows = must(await sb.rpc('list_friends')) as Array<Record<string, unknown>>;
      return rows.map(
        (r): Friend => ({
          ...toUser(r as never),
          watching: r.watching_show_id
            ? {
                showId: r.watching_show_id as string,
                episode: r.watching_episode as number,
                watchingNow: r.watching_now as boolean,
                caughtUp: r.caught_up as boolean,
              }
            : null,
        }),
      );
    },
    async listFriendRequests() {
      const rows = must(await sb.rpc('list_friend_requests')) as Array<Record<string, unknown>>;
      return rows.map((r): FriendRequest => ({ id: r.id as string, from: toUser(r.from as never), note: (r.note as string) ?? '' }));
    },
    async sendFriendRequest(handle) {
      must(await sb.rpc('send_friend_request', { p_handle: handle.replace(/^@/, '') }));
    },
    async respondToFriendRequest(requestId, accept) {
      must(await sb.rpc('respond_friend_request', { p_request_id: requestId, p_accept: accept }));
    },
    async setActivitySharing(enabled) {
      const id = await userId();
      must(await sb.from('profiles').update({ share_activity: enabled }).eq('id', id));
    },

    async gifts() {
      const rows = must(await sb.from('gifts').select('id, name, price_cents, color, icon_path').order('price_cents')) as Array<
        Record<string, unknown>
      >;
      return rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        priceCents: r.price_cents as number,
        color: r.color as string,
        iconPath: r.icon_path as string,
      }));
    },
    subscribeToChat(showId, onMessage) {
      const channel = sb
        .channel(`chat:${showId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `show_id=eq.${showId}` }, (payload: { new: Record<string, unknown> }) => {
          const r = payload.new;
          const author: UserSummary = { id: r.author_id as string, handle: r.author_handle as string, isCast: r.author_is_cast as boolean };
          const msg: ChatMessage =
            r.kind === 'gift'
              ? { id: r.id as string, kind: 'gift', author, giftId: r.gift_id as string, to: r.gift_to as string, createdAt: r.created_at as string }
              : { id: r.id as string, kind: 'text', author, body: r.body as string, createdAt: r.created_at as string };
          onMessage(msg);
        })
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
    async sendChat(showId, body) {
      must(await sb.rpc('send_chat', { p_show_id: showId, p_body: body }));
    },
    async createGiftCheckout(input) {
      const data = must(await sb.functions.invoke('create-gift-checkout', { body: input })) as { url: string };
      return data.url;
    },
    async createMembershipCheckout() {
      const data = must(await sb.functions.invoke('create-membership-checkout', { body: {} })) as { url: string };
      return data.url;
    },
  };
}
