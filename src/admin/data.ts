import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/data';

/**
 * Data for the /admin pages. Every call runs as the signed-in admin: the database checks
 * is_admin() itself (policies and admin_* functions), so nothing here is trusted on its own.
 */
function sb() {
  const c = getSupabase();
  if (!c) throw new Error('The admin needs the live backend (Supabase keys in .env).');
  return c;
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/* ---------- Types ---------- */

export interface AdminShow {
  id: string;
  number: string;
  title: string;
  genre: string;
  tagline: string;
  synopsis: string | null;
  color: string;
  cover_url: string | null;
  episode_count: number;
  latest_episode: number;
  release_days: number[];
  cast: { role: string; actorName: string; alsoCredit?: string }[];
  episode_titles: string[];
  published: boolean;
  featured: boolean;
  production_budget_cents: number;
  /** Release each drop automatically at 8 PM Eastern on its drop nights. */
  auto_release?: boolean;
  last_drop_at?: string | null;
}

export interface AdminEpisode {
  number: number;
  title: string;
  duration_sec: number;
  mux_playback_id: string;
}

export interface Overview {
  members_active: number;
  accounts: number;
  revenue_month_gross_cents: number;
  revenue_month_net_cents: number;
  gifts_month_cents: number;
  minutes_today: number;
  minutes_7d: number;
  viewers_7d: number;
  reports_30d: number;
  daily_minutes: { day: string; minutes: number }[];
  shows: {
    id: string;
    number: string;
    title: string;
    published: boolean;
    featured: boolean;
    latest_episode: number;
    episode_count: number;
    episodes_uploaded: number;
    minutes_month: number;
    viewers_month: number;
    budget_cents: number;
    earned_cents: number;
    cast_deals: number;
  }[];
}

export interface QuarterReport {
  quarter: string;
  closed: boolean;
  pools: {
    show_id: string;
    title: string;
    revenue_cents: number;
    earned_before_cents: number;
    budget_cents: number;
    carry_in_cents: number;
    pool_cents: number;
    members: number;
    minutes: number;
  }[];
  statements: {
    profile_id: string;
    handle: string;
    email: string;
    status: 'open' | 'due' | 'paid';
    paid_on: string | null;
    shows_cents: number;
    gifts_cents: number;
    lines: { show: string; role: string; points: number; total_points: number; share_cents: number }[];
  }[];
}

export interface Person {
  id: string;
  handle: string;
  email: string;
  is_cast: boolean;
  is_admin: boolean;
  /** Confirmed real actor (gold seal). */
  verified?: boolean;
  verified_note?: string | null;
  member: boolean;
  banned?: boolean;
  ban_reason?: string | null;
  created_at: string;
}

export interface Member {
  user_id: string;
  handle: string | null;
  email: string | null;
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface PendingPhoto {
  id: string;
  handle: string;
  path: string;
  avatar_url: string | null;
}

export interface Deal {
  show_id: string;
  profile_id: string;
  role: string;
  points: number;
  profiles: { handle: string } | null;
}

export interface Premiere {
  id: number;
  show_id: string;
  episode: number;
  starts_at: string;
  is_live: boolean;
}

export interface Report {
  id: number;
  reason: string;
  created_at: string;
  status: 'open' | 'resolved' | 'dismissed';
  kind: 'comment' | 'chat' | 'user' | 'post' | 'post_comment' | 'room' | 'dm' | 'channel_reply';
  reporter: string | null;
  comment_id: string | null;
  chat_message_id: string | null;
  /** The post, post comment, fan-room message or DM for social reports. */
  target_id: string | null;
  body: string | null;
  hidden: boolean | null;
  author_id: string | null;
  author: string | null;
  author_banned: boolean;
  show_id: string | null;
}

/* ---------- Reads ---------- */

export const useIsAdmin = (userId: string | undefined) =>
  useQuery({
    queryKey: ['admin', 'is', userId],
    enabled: !!userId,
    queryFn: async () => (await must(sb().rpc('is_admin'))) === true,
  });

export const useOverview = () =>
  useQuery({ queryKey: ['admin', 'overview'], queryFn: async () => (await must(sb().rpc('admin_overview'))) as Overview });

export const useAdminShows = () =>
  useQuery({
    queryKey: ['admin', 'shows'],
    queryFn: async () => (await must(sb().from('shows').select('*').order('number'))) as AdminShow[],
  });

export const useEpisodes = (showId: string, poll = false) =>
  useQuery({
    queryKey: ['admin', 'episodes', showId],
    refetchInterval: poll ? 10_000 : false,
    queryFn: async () =>
      (await must(
        sb().from('episodes').select('number, title, duration_sec, mux_playback_id').eq('show_id', showId).order('number'),
      )) as AdminEpisode[],
  });

export const useQuarter = (quarter: string) =>
  useQuery({
    queryKey: ['admin', 'quarter', quarter],
    queryFn: async () => (await must(sb().rpc('admin_quarter', { p_quarter: quarter }))) as QuarterReport,
  });

export const useDeals = () =>
  useQuery({
    queryKey: ['admin', 'deals'],
    queryFn: async () =>
      (await must(sb().from('talent_deals').select('show_id, profile_id, role, points, profiles(handle)'))) as unknown as Deal[],
  });

export const usePeople = (query: string) =>
  useQuery({
    queryKey: ['admin', 'people', query],
    queryFn: async () => (await must(sb().rpc('admin_people', { p_query: query }))) as Person[],
  });

export const usePremieres = () =>
  useQuery({
    queryKey: ['admin', 'premieres'],
    queryFn: async () =>
      (await must(sb().from('premieres').select('*').order('starts_at', { ascending: false }).limit(60))) as Premiere[],
  });

export const useComingSoon = () =>
  useQuery({
    queryKey: ['admin', 'coming-soon'],
    queryFn: async () =>
      (await must(sb().from('coming_soon').select('*').maybeSingle())) as
        | { title: string | null; teaser: string; starring: string; arrives: string }
        | null,
  });

export const useReports = () =>
  useQuery({ queryKey: ['admin', 'reports'], queryFn: async () => (await must(sb().rpc('admin_reports'))) as Report[] });

export interface AdminGift {
  id: string;
  name: string;
  price_cents: number;
  color: string | null;
  icon_path: string | null;
}

export const useAdminGifts = () =>
  useQuery({
    queryKey: ['admin', 'gifts'],
    queryFn: async () => (await must(sb().from('gifts').select('*').order('price_cents'))) as AdminGift[],
  });

export const saveGift = async (g: { id: string; name: string; price_cents: number }) => {
  if (!g.name.trim()) throw new Error('Give the gift a name.');
  if (!Number.isInteger(g.price_cents) || g.price_cents < 50) throw new Error('Gifts need a price of at least $0.50.');
  await must(sb().from('gifts').update({ name: g.name.trim(), price_cents: g.price_cents }).eq('id', g.id));
};

export const useMembers = (status: string | null) =>
  useQuery({
    queryKey: ['admin', 'members', status],
    queryFn: async () => (await must(sb().rpc('admin_members', { p_status: status }))) as Member[],
  });

export const useBlockedWords = () =>
  useQuery({
    queryKey: ['admin', 'blocked-words'],
    queryFn: async () => ((await must(sb().from('blocked_words').select('word').order('word'))) as { word: string }[]).map((r) => r.word),
  });

/** Photos waiting for review, each with a short-lived private link to look at it. */
export const usePhotoQueue = () =>
  useQuery({
    queryKey: ['admin', 'photos'],
    queryFn: async () => {
      const rows = (await must(sb().rpc('admin_photo_queue'))) as PendingPhoto[];
      return Promise.all(
        rows.map(async (r) => {
          const { data } = await sb().storage.from('avatars-pending').createSignedUrl(r.path, 600);
          return { ...r, preview: data?.signedUrl ?? null };
        }),
      );
    },
  });

/* ---------- Writes ---------- */

/** A mutation that refreshes every admin read afterwards. */
export function useAdminAction<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const saveShow = async (show: Partial<AdminShow> & { id: string }) => {
  await must(sb().from('shows').upsert(show));
};

export const saveEpisodeTitle = async (showId: string, number: number, title: string) => {
  await must(sb().from('episodes').update({ title }).eq('show_id', showId).eq('number', number));
};

export const saveComingSoon = async (row: { title: string | null; teaser: string; starring: string; arrives: string }) => {
  await must(sb().from('coming_soon').upsert({ id: 1, ...row }));
};

export const addPremiere = async (row: { show_id: string; episode: number; starts_at: string }) => {
  await must(sb().from('premieres').insert({ ...row, is_live: false }));
};

export const setPremiereLive = async (id: number, isLive: boolean) => {
  await must(sb().from('premieres').update({ is_live: isLive }).eq('id', id));
};

export const removePremiere = async (id: number) => {
  await must(sb().from('premieres').delete().eq('id', id));
};

export const saveDeal = async (deal: { show_id: string; profile_id: string; role: string; points: number }) => {
  await must(sb().from('talent_deals').upsert(deal));
};

export const removeDeal = async (deal: { show_id: string; profile_id: string; role: string }) => {
  await must(
    sb().from('talent_deals').delete().eq('show_id', deal.show_id).eq('profile_id', deal.profile_id).eq('role', deal.role),
  );
};

export const markPaid = async (args: { profile: string; quarter: string }) => {
  await must(sb().rpc('admin_mark_paid', { p_profile: args.profile, p_quarter: args.quarter }));
};

export const closeQuarter = async (quarter: string) => {
  await must(sb().rpc('admin_close_quarter', { p_quarter: quarter }));
};

/** Verify an actor (also marks them cast). The note records how you checked, e.g. "ID + call, Oct 29". */
export const setVerified = async (args: { profile: string; verified: boolean; note?: string }) => {
  await must(sb().rpc('admin_set_verified', { p_profile: args.profile, p_verified: args.verified, p_note: args.note ?? null }));
};

export const setCast = async (args: { profile: string; isCast: boolean }) => {
  await must(sb().rpc('admin_set_cast', { p_profile: args.profile, p_is_cast: args.isCast }));
};

export const hideComment = async (args: { comment: string; hidden: boolean }) => {
  await must(sb().rpc('admin_hide_comment', { p_comment: args.comment, p_hidden: args.hidden }));
};

export const hideChat = async (args: { message: string; hidden: boolean }) => {
  await must(sb().rpc('admin_hide_chat', { p_message: args.message, p_hidden: args.hidden }));
};

export const banUser = async (args: { profile: string; banned: boolean; reason?: string }) => {
  await must(sb().rpc('admin_ban', { p_profile: args.profile, p_banned: args.banned, p_reason: args.reason ?? null }));
};

/** Hides (or shows again) a post, a post comment or a fan-room message. DMs are private: ban instead. */
export const hideSocial = async (args: { kind: 'post' | 'post_comment' | 'room' | 'channel_reply'; id: string; hidden: boolean }) => {
  await must(sb().rpc('admin_hide_social', { p_kind: args.kind, p_id: args.id, p_hidden: args.hidden }));
};

export interface ActorPayoutRow {
  actor_id: string;
  handle: string | null;
  month: string;
  gross_cents: number;
  actor_share_cents: number;
  unpaid_cents: number | null;
  subscribers: number;
}
export const useActorPayouts = () =>
  useQuery({
    queryKey: ['admin', 'actor-payouts'],
    queryFn: async () => ((await must(sb().rpc('admin_actor_payouts'))) as ActorPayoutRow[] | null) ?? [],
  });
export const markActorPaid = async (args: { actor: string; month: string }) => {
  await must(sb().rpc('admin_mark_sub_payout', { p_actor: args.actor, p_month: args.month }));
};

export interface PassMonth {
  month: string;
  finalized: boolean;
  passes: number;
  dm_passes: number;
  gross_cents: number;
  net_cents: number;
  rows: Array<{ actor_id: string; handle: string | null; cents: number; fans: number; views: number; unpaid_cents: number | null }>;
}
/** Backstage for one month: live estimate until it's finalized (automatically on the 3rd). */
export const usePassMonth = (month: string) =>
  useQuery({
    queryKey: ['admin', 'pass-month', month],
    queryFn: async () => (await must(sb().rpc('admin_pass_month', { p_month: month }))) as PassMonth,
  });
export interface MessageMonthRow { actor_id: string; handle: string | null; fans: number; gross_cents: number; cents: number; unpaid_cents: number | null }
/** Messages add-ons for one month (each actor's own fans; 80% to them). */
export const useMessageMonth = (month: string) =>
  useQuery({
    queryKey: ['admin', 'message-month', month],
    queryFn: async () => ((await must(sb().rpc('admin_message_month', { p_month: month }))) as MessageMonthRow[] | null) ?? [],
  });
export const finalizePassMonth = async (month: string) => {
  await must(sb().rpc('admin_finalize_pass_month', { p_month: month }));
};

export const resolveReport = async (args: { id: number; status: 'open' | 'resolved' | 'dismissed' }) => {
  await must(sb().rpc('admin_resolve_report', { p_report: args.id, p_status: args.status }));
};

export const setAdmin = async (args: { profile: string; isAdmin: boolean }) => {
  await must(sb().rpc('admin_set_admin', { p_profile: args.profile, p_is_admin: args.isAdmin }));
};

export const addBlockedWord = async (word: string) => {
  const w = word.trim().toLowerCase();
  if (w.length < 2) throw new Error('Words need at least 2 letters.');
  await must(sb().from('blocked_words').upsert({ word: w }));
};

export const removeBlockedWord = async (word: string) => {
  await must(sb().from('blocked_words').delete().eq('word', word));
};

/** Approve: copy the photo to the public bucket, point the profile at it, then delete the private copy. */
export const approvePhoto = async (p: PendingPhoto) => {
  const { data: blob, error } = await sb().storage.from('avatars-pending').download(p.path);
  if (error || !blob) throw new Error(error?.message ?? 'Couldn’t load the photo.');
  const publicPath = `${p.id}/${Date.now()}.jpg`;
  await must(sb().storage.from('avatars').upload(publicPath, blob, { contentType: 'image/jpeg', upsert: true }));
  const url = sb().storage.from('avatars').getPublicUrl(publicPath).data.publicUrl;
  await must(sb().rpc('admin_review_avatar', { p_profile: p.id, p_approved_url: url }));
  await sb().storage.from('avatars-pending').remove([p.path]);
};

export const rejectPhoto = async (p: PendingPhoto) => {
  await must(sb().rpc('admin_review_avatar', { p_profile: p.id, p_approved_url: null }));
  await sb().storage.from('avatars-pending').remove([p.path]);
};

export const deleteEpisode = async (showId: string, number: number) => {
  await must(sb().from('episodes').delete().eq('show_id', showId).eq('number', number));
};

export const deleteShow = async (showId: string) => {
  await must(sb().from('shows').delete().eq('id', showId));
};

/** Uploads cover art to the public "covers" bucket and saves its URL on the show. */
/** Key art for the Coming soon card in the Feed. */
export async function uploadComingSoonCover(file: File) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `coming-soon/${Date.now()}.${ext}`;
  await must(sb().storage.from('covers').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }));
  const url = sb().storage.from('covers').getPublicUrl(path).data.publicUrl;
  await must(sb().from('coming_soon').upsert({ id: 1, cover_url: url }));
  return url;
}

export async function uploadCover(showId: string, file: File) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${showId}/${Date.now()}.${ext}`;
  await must(sb().storage.from('covers').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }));
  const url = sb().storage.from('covers').getPublicUrl(path).data.publicUrl;
  await saveShow({ id: showId, cover_url: url });
  return url;
}

/**
 * Sends an episode file straight to Mux (never through our server). Mux processes it for a few
 * minutes, then mux-webhook files the episode and it appears in the list.
 */
export async function uploadEpisode(
  args: { showId: string; number: number; title?: string; file: File },
  onProgress: (fraction: number) => void,
) {
  const { data, error } = await sb().functions.invoke('admin-mux-upload', {
    body: { showId: args.showId, number: args.number, title: args.title || undefined },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : undefined;
    throw new Error(detail ?? error.message);
  }
  const url = (data as { url?: string; error?: string }).url;
  if (!url) throw new Error((data as { error?: string }).error ?? 'No upload URL.');
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(args.file);
  });
}

/** Opens the browser's file picker. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Saves rows as a CSV download. */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
}

/** Opens the browser's file picker for several files, sorted by name. */
export function pickFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = () =>
      resolve(Array.from(input.files ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    input.click();
  });
}

/** Paid DMs and paid posts (unlocks), per actor for one month. */
export interface UnlockMonthRow {
  actor_id: string;
  handle: string | null;
  sales: number;
  gross_cents: number;
  actor_cents: number;
  paid: boolean;
}
export const useUnlockMonth = (month: string) =>
  useQuery({
    queryKey: ['admin', 'unlock-month', month],
    queryFn: async () => ((await must(sb().rpc('admin_unlock_month', { p_month: month }))) as UnlockMonthRow[] | null) ?? [],
  });
export const markUnlocksPaid = async (args: { actor: string; month: string }) => {
  await must(sb().rpc('admin_mark_unlock_payout', { p_actor: args.actor, p_month: args.month }));
};
