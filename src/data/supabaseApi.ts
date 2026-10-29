import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { PlatformApi } from './api';
import { sampleEarnings } from './sample';
import type { ActorEarnings, ChatMessage, Comment, CommentSort, Episode, Friend, FriendRequest, ShareStatement, Show, ShowShare, UserSummary } from './types';

/**
 * Supabase-backed API. Table and function names match supabase/schema.sql.
 * Payments never run here: checkout URLs come from a server function that
 * talks to Stripe with the secret key, and only the web build calls it.
 */
let client: SupabaseClient | null = null;
/** The Supabase client, for the admin pages (null in sample mode). */
export const getSupabase = (): SupabaseClient | null => client;

export function createSupabaseApi(url: string, anonKey: string): PlatformApi {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  client = sb;

  const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data as T;
  };

  /** Calls a server function and turns its { error } body into a readable message. */
  const invoke = async <T>(name: string, body: unknown): Promise<T> => {
    const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      const res = (error as { context?: Response }).context;
      const parsed = await res?.json?.().catch(() => null);
      const err = new Error(parsed?.error ?? 'Something went wrong. Try again.') as Error & { code?: string };
      if (parsed?.code) err.code = parsed.code;
      throw err;
    }
    return data as T;
  };

  const userId = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error('Please sign in first.');
    return data.user.id;
  };

  const toUser = (row: { id: string; handle: string; avatar_url: string | null; is_cast?: boolean; verified?: boolean; verified_at?: string | null }): UserSummary => ({
    id: row.id,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    isCast: row.is_cast ?? false,
    verified: row.verified ?? !!row.verified_at,
  });

  return {
    mode: 'live',

    async currentUser() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      const row = must(await sb.from('profiles').select('id, handle, avatar_url, is_cast, verified_at').eq('id', data.user.id).single()) as {
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
    async deleteAccount() {
      const { error } = await sb.functions.invoke('delete-account', { body: {} });
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? 'Your account couldn’t be deleted just now. Try again.');
      }
      await sb.auth.signOut({ scope: 'local' });
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
      // New photos go to a private bucket and stay there until an admin approves them.
      must(await sb.storage.from('avatars-pending').upload(path, body, { contentType: 'image/jpeg', upsert: true }));
      must(await sb.from('profiles').update({ pending_avatar_path: path }).eq('id', id));
      // Only you can see it meanwhile (signed link, 7 days).
      const signed = must(await sb.storage.from('avatars-pending').createSignedUrl(path, 7 * 24 * 3600)) as { signedUrl: string };
      return signed.signedUrl;
    },
    async removeAvatar() {
      must(await sb.rpc('remove_my_avatar'));
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
      const row = must(await sb.from('coming_soon').select('title, teaser, starring, arrives, cover_url').maybeSingle()) as
        | { title?: string; teaser: string; starring: string; arrives: string; cover_url: string | null }
        | null;
      if (!row) return null;
      const { cover_url, ...rest } = row;
      return { ...rest, coverUrl: cover_url };
    },
    async episode(showId, number) {
      // Signed playback URLs are issued by a server function so members-only episodes stay private.
      const data = await invoke<{
        title: string;
        url: string;
        durationSec: number;
        reframe?: Episode['reframe'];
      }>('playback-url', { showId, number });
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
        await sb.rpc('list_comment_threads', { p_show_id: showId, p_episode: episode, p_sort: sort }),
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
          parentId: null,
          replyCount: Number(r.reply_count ?? 0),
        }),
      );
    },
    async listReplies(commentId) {
      const rows = must(await sb.rpc('list_replies', { p_parent: commentId })) as Array<Record<string, unknown>>;
      return rows.map(
        (r): Comment => ({
          id: r.id as string,
          showId: '',
          episode: 0,
          author: toUser(r.author as never),
          body: r.body as string,
          atSec: null,
          likes: r.likes as number,
          likedByMe: r.liked_by_me as boolean,
          isFriend: r.is_friend as boolean,
          createdAt: r.created_at as string,
          parentId: commentId,
        }),
      );
    },
    async postComment({ showId, episode, body, atSec, parentId }) {
      const id = await userId();
      const row = must(
        await sb
          .from('comments')
          .insert({ show_id: showId, episode, body, at_sec: atSec ?? null, author_id: id, parent_id: parentId ?? null })
          .select('id, body, at_sec, parent_id, created_at')
          .single(),
      ) as { id: string; body: string; at_sec: number | null; parent_id: string | null; created_at: string };
      const me = await this.currentUser();
      if (!me) throw new Error('Please sign in first.');
      return {
        id: row.id,
        showId,
        episode,
        author: me,
        body: row.body,
        atSec: row.at_sec,
        likes: 0,
        likedByMe: false,
        isFriend: false,
        createdAt: row.created_at,
        parentId: row.parent_id,
        replyCount: 0,
      };
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
    async setBirthYear(year) {
      const id = await userId();
      const now = new Date().getFullYear();
      if (!Number.isInteger(year) || year < now - 110 || year > now) throw new Error('Enter the year you were born, like 1995.');
      must(await sb.from('profiles').update({ birth_year: year }).eq('id', id));
    },
    async setHandle(handle) {
      const id = await userId();
      const clean = handle.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9._]{3,24}$/.test(clean)) throw new Error('Use 3–24 letters, numbers, dots or underscores.');
      const { error } = await sb.from('profiles').update({ handle: clean }).eq('id', id);
      if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That username is taken.' : error.message);
    },
    async deleteComment(commentId) {
      const id = await userId();
      must(await sb.from('comments').delete().eq('id', commentId).eq('author_id', id));
    },
    async blockUser(target) {
      must(await sb.rpc('block_user', { p_user: target }));
    },
    async unblockUser(target) {
      must(await sb.rpc('unblock_user', { p_user: target }));
    },
    async listBlocked() {
      const rows = must(await sb.rpc('my_blocks')) as Array<{ id: string; handle: string; avatar_url: string | null }>;
      return rows.map((r) => toUser(r));
    },
    async reportUser(target, reason) {
      const id = await userId();
      must(await sb.from('reports').insert({ reported_user_id: target, reporter_id: id, reason }));
    },
    async reportChat(messageId, reason) {
      const id = await userId();
      must(await sb.from('reports').insert({ chat_message_id: messageId, reporter_id: id, reason }));
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
          const author: UserSummary = { id: r.author_id as string, handle: r.author_handle as string, isCast: r.author_is_cast as boolean, verified: Boolean(r.author_verified) };
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
      const data = await invoke<{ url: string }>('create-gift-checkout', input);
      return data.url;
    },
    async createMembershipCheckout() {
      const data = await invoke<{ url: string }>('create-membership-checkout', {});
      return data.url;
    },

    async saveProgress(showId, p) {
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      must(
        await sb.from('watch_progress').upsert({
          user_id: data.user.id,
          show_id: showId,
          episode: p.episode,
          position_sec: p.positionSec,
          duration_sec: p.durationSec ?? null,
          updated_at: new Date().toISOString(),
        }),
      );
    },
    async listProgress() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return [];
      const rows = must(await sb.from('watch_progress').select('*').order('updated_at', { ascending: false })) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        showId: r.show_id as string,
        episode: r.episode as number,
        positionSec: Number(r.position_sec),
        durationSec: r.duration_sec == null ? undefined : Number(r.duration_sec),
        updatedAt: new Date(r.updated_at as string).getTime(),
      }));
    },
    async setWatching({ showId, episode, watchingNow, caughtUp }) {
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      must(
        await sb.from('watch_activity').upsert({
          user_id: data.user.id,
          show_id: showId,
          episode,
          watching_now: watchingNow,
          caught_up: caughtUp,
          updated_at: new Date().toISOString(),
        }),
      );
    },
    async setFollow(showId, on) {
      const id = await userId();
      if (on) must(await sb.from('show_follows').upsert({ user_id: id, show_id: showId }));
      else must(await sb.from('show_follows').delete().eq('user_id', id).eq('show_id', showId));
    },
    async registerPushToken(token, platform) {
      const id = await userId();
      must(await sb.from('push_tokens').upsert({ token, user_id: id, platform, updated_at: new Date().toISOString() }));
    },

    async recordWatch(input) {
      const { data: session } = await sb.auth.getSession();
      if (!session.session) return 0; // signed-out viewers aren't counted
      const credited = must(
        await sb.rpc('record_watch', {
          p_session: input.sessionId,
          p_show: input.showId,
          p_episode: input.episode,
          p_seq: input.seq,
          p_position: Math.max(0, Math.round(input.positionSec * 100) / 100),
          p_playing: Math.max(0, input.playingSec),
        }),
      ) as number | null;
      return Number(credited ?? 0);
    },

    async earnings() {
      // One row per quarter for the signed-in actor, newest first (see my_share_statements in schema.sql).
      const res = await sb.rpc('my_share_statements');
      const rows = (res.error ? null : res.data) as Array<Record<string, unknown>> | null;
      // In development (Expo Go), show the sample statements until real ones exist, so the screen can be seen.
      if (!rows?.length) return __DEV__ ? sampleEarnings(new Date()) : null;
      const toStatement = (r: Record<string, unknown>): ShareStatement => {
        const gifts = (r.gifts ?? {}) as Record<string, number>;
        return {
          quarter: r.quarter as string,
          status: r.status as ShareStatement['status'],
          paidOn: (r.paid_on as string | null) ?? null,
          shows: ((r.shows ?? []) as Array<Record<string, unknown>>).map(
            (s): ShowShare => ({
              showId: s.show_id as string,
              showTitle: s.show_title as string,
              role: s.role as string,
              points: Number(s.points),
              totalPoints: Number(s.total_points),
              minutesWatched: Number(s.minutes_watched),
              members: Number(s.members),
              revenueCents: Number(s.revenue_cents),
              earnedBeforeCents: Number(s.earned_before_cents),
              budgetCents: Number(s.budget_cents),
              poolCents: s.pool_cents == null ? undefined : Number(s.pool_cents),
              shareCents: s.share_cents == null ? undefined : Number(s.share_cents),
            }),
          ),
          gifts: {
            count: gifts.count ?? 0,
            grossCents: gifts.gross_cents ?? 0,
            cardFeesCents: gifts.card_fees_cents ?? 0,
            shareCents: gifts.share_cents,
          },
        };
      };
      const all = rows.map(toStatement);
      const open = all.find((s) => s.status === 'open');
      const result: ActorEarnings = {
        current: open ?? { quarter: all[0]!.quarter, status: 'open', shows: [], gifts: { count: 0, grossCents: 0, cardFeesCents: 0 } },
        past: all.filter((s) => s !== open),
      };
      return result;
    },
  };
}
