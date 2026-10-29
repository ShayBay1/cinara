import { Platform } from 'react-native';

import { getSupabase, type UserSummary } from '@/data';

/**
 * The social side: actors post, fans follow, comment, chat in each show's fan room, and
 * subscribers message actors. Everything runs through Supabase functions (supabase/social_*.sql).
 * Sample mode has no social backend, so screens show a "needs the live backend" note instead.
 */

export type Visibility = 'public' | 'subscribers';
export interface Media {
  type: 'image' | 'video';
  /** Storage path in the private post-media bucket. Missing on locked posts. */
  path?: string;
  width?: number;
  height?: number;
  /** Signed link, filled in on the client. */
  url?: string | number;
  /** Tiny blurred stand-in shown on locked posts (a data: URI, or an image for sample posts). */
  preview?: string | number;
}
export interface Author extends UserSummary {
  displayName?: string | null;
}
export interface Post {
  id: string;
  author: Author;
  body: string | null;
  media: Media[];
  visibility: Visibility;
  showId: string | null;
  createdAt: string;
  /** True when it's for subscribers and you aren't one: no body, no media. */
  locked: boolean;
  /** Placeholder content shown while testing (never sent to the server). */
  demo?: boolean;
  likes: number;
  likedByMe: boolean;
  comments: number;
}
export interface PostComment {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  author: UserSummary;
}
export interface ActorProfile {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isCast: boolean;
  verified: boolean;
  subsEnabled: boolean;
  subPriceCents: number;
  dmsOpen: boolean;
  followers: number;
  posts: number;
  following: boolean;
  /** Has Backstage, so every exclusive post is open. */
  subscribed: boolean;
  /** Can message this actor (has their messages add-on). */
  canMessage: boolean;
  /** Monthly price of messages with this actor (their own choice). */
  dmPriceCents: number;
  premiumPosts: number;
  isMe: boolean;
  /** How you're connected: friends, a request either way, or none. */
  relation: Relation;
  friends: number;
  demo?: boolean;
  shows: Array<{ id: string; title: string; role: string | null }>;
}

export type Relation = 'me' | 'friends' | 'requested' | 'incoming' | 'none';
/** One person in search: an actor (follow them) or a fan (add them as a friend). */
export interface PersonResult {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isCast: boolean;
  verified: boolean;
  followers: number;
  following: boolean;
  relation: Relation;
  role: string | null;
  demo?: boolean;
}
export interface ActorCard {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio?: string | null;
  followers: number;
  following: boolean;
  premiumPosts: number;
  dmsOpen?: boolean;
  roles: Array<{ showId: string; title: string; role: string | null }>;
  verified?: boolean;
  demo?: boolean;
}

/** Backstage: one pass for every actor's exclusive posts, or with direct messages. */
export type PassTier = 'creators' | 'creators_dm';
export interface Pass {
  active: boolean;
  tier: PassTier | null;
  dmAccess: boolean;
  renewsOn: string | null;
}
export const PASS_PRICES: Record<PassTier, number> = { creators: 499, creators_dm: 1999 };
export interface Room {
  showId: string;
  title: string;
  color: string | null;
  coverUrl: string | null;
  lastAt: string | null;
  today: number;
}
export interface RoomMessage {
  id: string;
  body: string;
  createdAt: string;
  author: UserSummary;
}
export interface DmThread {
  id: string;
  lastMessageAt: string;
  other: Author;
  last: string | null;
  unread: number;
}
export interface DmMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}
export interface CreatorStats {
  followers: number;
  /** Backstage fans who opened your exclusive posts this month. */
  subscribers: number;
  /** Their unique views of your exclusive posts this month. */
  views: number;
  /** Fans with an active messages add-on for you. */
  messageFans: number;
  thisMonthCents: number;
  unpaidCents: number;
}

type Row = Record<string, unknown>;

export const socialLive = () => getSupabase() !== null;

const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('The social side needs the live backend.');
  return c;
};

const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> =>
  must(await sb().rpc(fn, args)) as T;

const toAuthor = (r: Row | null | undefined): Author => ({
  id: String(r?.id ?? ''),
  handle: String(r?.handle ?? 'someone'),
  avatarUrl: (r?.avatar_url as string | null) ?? null,
  isCast: Boolean(r?.is_cast),
  verified: Boolean(r?.verified),
  displayName: (r?.display_name as string | null) ?? null,
});

const toPost = (r: Row): Post => ({
  id: r.id as string,
  author: toAuthor(r.author as Row),
  body: (r.body as string | null) ?? null,
  media: ((r.media as Media[] | null) ?? []).map((m) => ({ ...m })),
  visibility: (r.visibility as Visibility) ?? 'public',
  showId: (r.show_id as string | null) ?? null,
  createdAt: r.created_at as string,
  locked: Boolean(r.locked),
  likes: Number(r.likes ?? 0),
  likedByMe: Boolean(r.liked_by_me),
  comments: Number(r.comments ?? 0),
});

/** Signs every visible media path in one request (links last an hour; queries refetch long before). */
async function sign(posts: Post[]): Promise<Post[]> {
  const paths = posts.flatMap((p) => p.media.map((m) => m.path).filter((x): x is string => !!x));
  if (!paths.length) return posts;
  const { data } = await sb().storage.from('post-media').createSignedUrls([...new Set(paths)], 3600);
  const byPath = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return posts.map((p) => ({ ...p, media: p.media.map((m) => (m.path ? { ...m, url: byPath.get(m.path) ?? undefined } : m)) }));
}

/* ---------- Posts ---------- */

export async function feed(scope: 'all' | 'following' | 'premium', before?: string | null): Promise<Post[]> {
  const rows = await rpc<Row[]>('feed_posts', { p_scope: scope, p_author: null, p_before: before ?? null });
  return sign(rows.map(toPost));
}

export async function postsBy(authorId: string, before?: string | null): Promise<Post[]> {
  const rows = await rpc<Row[]>('feed_posts', { p_scope: 'all', p_author: authorId, p_before: before ?? null });
  return sign(rows.map(toPost));
}

export async function getPost(id: string): Promise<Post | null> {
  const row = await rpc<Row | null>('get_post', { p_id: id });
  if (!row) return null;
  const [p] = await sign([toPost(row)]);
  return p ?? null;
}

export async function likePost(postId: string, like: boolean) {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  if (like) {
    const { error } = await sb().from('post_likes').insert({ post_id: postId, user_id: data.user.id });
    if (error && (error as { code?: string }).code !== '23505') throw new Error(error.message);
  } else {
    must(await sb().from('post_likes').delete().eq('post_id', postId).eq('user_id', data.user.id));
  }
}

export async function deletePost(postId: string) {
  must(await sb().from('posts').delete().eq('id', postId));
}

export async function postComments(postId: string): Promise<PostComment[]> {
  const rows = await rpc<Row[]>('list_post_comments', { p_post: postId });
  return rows.map((r) => ({
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    body: r.body as string,
    createdAt: r.created_at as string,
    author: toAuthor(r.author as Row),
  }));
}

export async function addPostComment(postId: string, body: string, parentId?: string | null) {
  return rpc<string>('add_post_comment', { p_post: postId, p_body: body, p_parent: parentId ?? null });
}

export async function deletePostComment(id: string) {
  must(await sb().from('post_comments').delete().eq('id', id));
}

export interface NewMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  width?: number;
  height?: number;
  /** Tiny blurred stand-in (data: URI) that fans without Backstage see. */
  preview?: string;
}

/** Uploads to post-media/{me}/… then creates the post. Cast only (the database checks). */
export async function createPost(input: { body: string; visibility: Visibility; showId: string | null; media: NewMedia[] }) {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  const me = data.user.id;
  const uploaded: Media[] = [];
  try {
    for (const m of input.media) {
      const ext = m.type === 'video' ? (m.mimeType.includes('quicktime') ? 'mov' : 'mp4') : 'jpg';
      const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const body = await (await fetch(m.uri)).arrayBuffer();
      must(await sb().storage.from('post-media').upload(path, body, { contentType: m.mimeType, upsert: false }));
      uploaded.push({ type: m.type, path, width: m.width, height: m.height, ...(m.preview ? { preview: m.preview } : {}) });
    }
    const row = must(
      await sb()
        .from('posts')
        .insert({ author_id: me, body: input.body.trim(), visibility: input.visibility, show_id: input.showId, media: uploaded })
        .select('id')
        .single(),
    ) as { id: string };
    return row.id;
  } catch (e) {
    // Don't leave orphaned files behind if the post itself was refused.
    if (uploaded.length) await sb().storage.from('post-media').remove(uploaded.map((u) => u.path!));
    throw e;
  }
}

/* ---------- Actors ---------- */

export async function actorProfile(handle: string): Promise<ActorProfile | null> {
  const r = await rpc<Row | null>('actor_profile', { p_handle: handle });
  if (!r) return null;
  return {
    id: r.id as string,
    handle: r.handle as string,
    displayName: (r.display_name as string | null) ?? null,
    bio: (r.bio as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    isCast: Boolean(r.is_cast),
    verified: Boolean(r.verified),
    subsEnabled: Boolean(r.subs_enabled),
    subPriceCents: Number(r.sub_price_cents ?? 499),
    dmsOpen: Boolean(r.dms_open),
    followers: Number(r.followers ?? 0),
    posts: Number(r.posts ?? 0),
    following: Boolean(r.following),
    subscribed: Boolean(r.subscribed),
    canMessage: Boolean(r.can_message),
    dmPriceCents: Number(r.dm_price_cents ?? r.sub_price_cents ?? 999),
    premiumPosts: Number(r.premium_posts ?? 0),
    isMe: Boolean(r.is_me),
    relation: ((r.relation as Relation) ?? 'none'),
    friends: Number(r.friends ?? 0),
    shows: (r.shows as ActorProfile['shows']) ?? [],
  };
}

export async function listActors(): Promise<ActorCard[]> {
  const rows = await rpc<Row[]>('list_actors');
  return rows.map((r) => ({
    id: r.id as string,
    handle: r.handle as string,
    displayName: (r.display_name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    bio: (r.bio as string | null) ?? null,
    followers: Number(r.followers ?? 0),
    following: Boolean(r.following),
    premiumPosts: Number(r.premium_posts ?? 0),
    dmsOpen: Boolean(r.dms_open),
    verified: Boolean(r.verified),
    roles: ((r.roles as Array<{ show_id: string; title: string; role: string | null }> | null) ?? []).map((x) => ({
      showId: x.show_id,
      title: x.title,
      role: x.role,
    })),
  }));
}

export async function follow(actorId: string, on: boolean) {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  if (on) {
    const { error } = await sb().from('follows').insert({ follower_id: data.user.id, actor_id: actorId });
    if (error && (error as { code?: string }).code !== '23505') throw new Error(error.message);
  } else {
    must(await sb().from('follows').delete().eq('follower_id', data.user.id).eq('actor_id', actorId));
  }
}

/* ---------- Backstage ---------- */

export async function getSignedInId(): Promise<string | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data } = await c.auth.getUser();
  return data.user?.id ?? null;
}

export async function myPass(): Promise<Pass> {
  const { data } = await sb().auth.getUser();
  if (!data.user) return { active: false, tier: null, dmAccess: false, renewsOn: null };
  const r = await rpc<Row | null>('my_pass');
  return {
    active: Boolean(r?.active),
    tier: (r?.tier as PassTier | null) ?? null,
    dmAccess: Boolean(r?.dm_access),
    renewsOn: (r?.renews_on as string | null) ?? null,
  };
}

/**
 * Web only: opens Stripe Checkout for Backstage (or upgrades $4.99 to $19.99 in place).
 * Returns the checkout link, or null when the upgrade went through without one.
 */
export async function backstageCheckout(tier: PassTier, back: string): Promise<string | null> {
  if (Platform.OS !== 'web') throw new Error('Backstage is handled on cinaratv.com.');
  const { data, error } = await sb().functions.invoke('create-backstage-checkout', { body: { tier, back } });
  if (error) {
    const res = (error as { context?: Response }).context;
    const parsed = await res?.json?.().catch(() => null);
    throw new Error(parsed?.error ?? 'Checkout didn’t open. Try again.');
  }
  return (data as { url?: string }).url ?? null;
}

/** Web only: Stripe Checkout for messages with one actor (that actor's own monthly price). */
export async function messagesCheckout(actorId: string, back: string): Promise<string> {
  if (Platform.OS !== 'web') throw new Error('Messages are handled on cinaratv.com.');
  const { data, error } = await sb().functions.invoke('create-actor-subscription-checkout', { body: { actorId, back } });
  if (error) {
    const res = (error as { context?: Response }).context;
    const parsed = await res?.json?.().catch(() => null);
    throw new Error(parsed?.error ?? 'Checkout didn’t open. Try again.');
  }
  return (data as { url: string }).url;
}

/** Counts a Backstage member's first look at exclusive posts (this is how actors get paid). */
export async function recordViews(postIds: string[]) {
  if (!postIds.length) return;
  await sb().rpc('record_post_views', { p_posts: postIds });
}

export async function setCreatorSettings(s: {
  displayName: string;
  bio: string;
  priceCents: number;
  subsEnabled: boolean;
  dmsOpen: boolean;
}) {
  await rpc('set_creator_settings', {
    p_display_name: s.displayName,
    p_bio: s.bio,
    p_price_cents: s.priceCents,
    p_subs_enabled: s.subsEnabled,
    p_dms_open: s.dmsOpen,
  });
}

export async function creatorStats(): Promise<CreatorStats> {
  const r = await rpc<Row>('my_creator_stats');
  return {
    followers: Number(r.followers ?? 0),
    subscribers: Number(r.subscribers ?? 0),
    views: Number(r.views ?? 0),
    messageFans: Number(r.message_fans ?? 0),
    thisMonthCents: Number(r.this_month_cents ?? 0),
    unpaidCents: Number(r.unpaid_cents ?? 0),
  };
}

/* ---------- People ---------- */

export async function searchPeople(query: string): Promise<PersonResult[]> {
  const rows = await rpc<Row[]>('search_people', { p_query: query });
  return rows.map((r) => ({
    id: r.id as string,
    handle: r.handle as string,
    displayName: (r.display_name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    isCast: Boolean(r.is_cast),
    verified: Boolean(r.verified),
    followers: Number(r.followers ?? 0),
    following: Boolean(r.following),
    relation: (r.relation as Relation) ?? 'none',
    role: (r.role as string | null) ?? null,
  }));
}

/** Friend request by username (asking someone who already asked you makes you friends). */
export async function addFriend(handle: string) {
  await rpc('send_friend_request', { p_handle: handle });
}
export async function cancelFriendRequest(userId: string) {
  await rpc('cancel_friend_request', { p_to: userId });
}

/* ---------- Fan rooms ---------- */

export async function rooms(): Promise<Room[]> {
  const rows = await rpc<Row[]>('rooms_overview');
  return rows.map((r) => ({
    showId: r.show_id as string,
    title: r.title as string,
    color: (r.color as string | null) ?? null,
    coverUrl: (r.cover_url as string | null) ?? null,
    lastAt: (r.last_at as string | null) ?? null,
    today: Number(r.today ?? 0),
  }));
}

export async function roomMessages(showId: string): Promise<RoomMessage[]> {
  const rows = await rpc<Row[]>('list_room_messages', { p_show: showId, p_before: null });
  return rows.map((r) => ({
    id: r.id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
    author: toAuthor(r.author as Row),
  }));
}

export async function sendRoomMessage(showId: string, body: string) {
  return rpc<string>('send_room_message', { p_show: showId, p_body: body });
}

export async function deleteRoomMessage(id: string) {
  must(await sb().from('room_messages').delete().eq('id', id));
}

/** Calls onChange whenever someone posts in the room (the screen refetches). */
export function watchRoom(showId: string, onChange: () => void) {
  const c = getSupabase();
  if (!c) return () => {};
  const ch = c
    .channel(`room:${showId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `show_id=eq.${showId}` }, onChange)
    .subscribe();
  return () => {
    void c.removeChannel(ch);
  };
}

/* ---------- Direct messages ---------- */

export async function openDm(actorId: string) {
  return rpc<string>('open_dm', { p_actor: actorId });
}

export async function dmThreads(): Promise<DmThread[]> {
  const rows = await rpc<Row[]>('list_dm_threads');
  return rows.map((r) => ({
    id: r.id as string,
    lastMessageAt: r.last_message_at as string,
    other: toAuthor(r.other as Row),
    last: (r.last as string | null) ?? null,
    unread: Number(r.unread ?? 0),
  }));
}

export async function dmMessages(threadId: string): Promise<DmMessage[]> {
  const rows = await rpc<Row[]>('list_dm_messages', { p_thread: threadId });
  return rows.map((r) => ({
    id: r.id as string,
    senderId: r.sender_id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
  }));
}

export async function sendDm(threadId: string, body: string) {
  return rpc<string>('send_dm', { p_thread: threadId, p_body: body });
}

export async function unreadDms(): Promise<number> {
  return rpc<number>('unread_dm_count');
}

export function watchThread(threadId: string, onChange: () => void) {
  const c = getSupabase();
  if (!c) return () => {};
  const ch = c
    .channel(`dm:${threadId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` }, onChange)
    .subscribe();
  return () => {
    void c.removeChannel(ch);
  };
}

/* ---------- Safety ---------- */

export type SocialKind = 'post' | 'post_comment' | 'room' | 'dm' | 'channel_reply';
const REPORT_COLUMN: Record<SocialKind, string> = {
  channel_reply: 'channel_reply_id',
  post: 'post_id',
  post_comment: 'post_comment_id',
  room: 'room_message_id',
  dm: 'dm_message_id',
};

export async function reportSocial(kind: SocialKind, id: string) {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  must(await sb().from('reports').insert({ [REPORT_COLUMN[kind]]: id, reporter_id: data.user.id, reason: 'user_report' }));
}
