import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share } from 'react-native';

import { getSupabase } from '@/data';
import { canOfferBackstage, WEB_URL } from '@/lib/billing';
import { checkout } from '@/lib/fastCheckout';

import { coverUrl, signPaths, uploadMedia, type StoredMedia } from './media';
import type { NewMedia } from './api';

/**
 * The creator studio (borrowed from what works on subscription apps): a home with money and a daily
 * challenge, mass messages, paid and disappearing DMs, the content vault, a cover photo and free trials.
 * Everything is checked again on the server (supabase/studio.sql).
 */

type Row = Record<string, unknown>;
const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('The studio needs the live backend.');
  return c;
};
const live = () => getSupabase() !== null;
const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};
const n = (v: unknown) => Number(v ?? 0) || 0;

/* ---------- Creator home ---------- */

export type TaskKey = 'post' | 'reply' | 'mass_dm' | 'paid_dm' | 'promote';
export interface StudioTask {
  key: TaskKey;
  done: boolean;
  minutes: number;
  count?: number;
  earnedCents?: number;
}
export interface StudioHome {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  dmsOpen: boolean;
  trialDays: number;
  lifetimeCents: number;
  balanceCents: number;
  monthCents: number;
  todayCents: number;
  subscribers: number;
  followers: number;
  unread: number;
  tasks: StudioTask[];
}

export async function studioHome(): Promise<StudioHome> {
  const r = await rpc<Row>('creator_home');
  return {
    handle: String(r.handle),
    displayName: (r.display_name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    coverUrl: coverUrl(r.cover_path as string | null),
    verified: Boolean(r.verified),
    dmsOpen: Boolean(r.dms_open),
    trialDays: n(r.trial_days),
    lifetimeCents: n(r.lifetime_cents),
    balanceCents: n(r.balance_cents),
    monthCents: n(r.month_cents),
    todayCents: n(r.today_cents),
    subscribers: n(r.subscribers),
    followers: n(r.followers),
    unread: n(r.unread),
    tasks: ((r.tasks as Row[]) ?? []).map((t) => ({
      key: t.key as TaskKey,
      done: Boolean(t.done),
      minutes: n(t.minutes),
      count: t.count == null ? undefined : n(t.count),
      earnedCents: t.earned_cents == null ? undefined : n(t.earned_cents),
    })),
  };
}

export const profileLink = (handle: string) => `${WEB_URL}/actor/${encodeURIComponent(handle)}`;

/** The share sheet with the actor's link; counts toward today's "Promote your Backstage". */
export async function shareProfile(handle: string, name?: string | null) {
  const url = profileLink(handle);
  const res = await Share.share({ message: `${name || `@${handle}`} on Cinara: exclusive posts, behind the scenes and messages. ${url}`, url });
  if (res.action === Share.sharedAction && live()) await rpc('log_creator_event', { p_kind: 'share' }).catch(() => undefined);
}

/* ---------- Mass messages ---------- */

export interface Audience {
  messages: number;
  backstage: number;
  sentToday: number;
}
export type AudienceKey = 'messages' | 'backstage' | 'all';

export async function massAudience(): Promise<Audience> {
  const r = await rpc<Row>('mass_dm_audience');
  return { messages: n(r.messages), backstage: n(r.backstage), sentToday: n(r.sent_today) };
}

export async function sendMassDm(input: { body: string; media: StoredMedia[]; priceCents: number | null; ghost: boolean; audience: AudienceKey }) {
  return rpc<number>('send_mass_dm', {
    p_body: input.body.trim(),
    p_media: input.media,
    p_price_cents: input.priceCents,
    p_ghost: input.ghost,
    p_audience: input.audience,
  });
}

/* ---------- Unlocks (bought on the website) ---------- */

/** Where a fan buys one paid DM or post. Store rules: the iPhone and Android apps never sell. */
export function unlockUrl(kind: 'dm' | 'post', id: string, back: string) {
  return `${WEB_URL}/unlock?kind=${kind}&id=${encodeURIComponent(id)}&back=${encodeURIComponent(back)}`;
}
export const canUnlockHere = canOfferBackstage;
/** One tap: straight to Stripe in Safari (Apple Pay / saved card), then back into the app at `back`. */
export async function openUnlock(kind: 'dm' | 'post', id: string, back: string) {
  await checkout({ type: 'unlock', kind, id }, back);
}

/* ---------- Reactions ---------- */

export const REACTIONS = ['😂', '🔥', '👀', '😍', '😮', '😢'] as const;
export type Reaction = (typeof REACTIONS)[number];

export async function reactPost(postId: string, emoji: Reaction, on: boolean): Promise<Record<string, number>> {
  return rpc<Record<string, number>>('react_post', { p_post: postId, p_emoji: emoji, p_on: on });
}

/* ---------- Vault ---------- */

export interface VaultItem {
  id: string;
  path: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
  preview?: string;
  folder: string | null;
  tags: string[];
  createdAt: string;
  inPosts: number;
  inDms: number;
  url?: string;
}

export async function vaultList(): Promise<VaultItem[]> {
  const rows = await rpc<Row[]>('vault_list');
  const list: VaultItem[] = rows.map((r) => ({
    id: String(r.id),
    path: String(r.path),
    type: r.type === 'video' ? 'video' : 'image',
    width: (r.width as number | null) ?? undefined,
    height: (r.height as number | null) ?? undefined,
    preview: (r.preview as string | null) ?? undefined,
    folder: (r.folder as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    createdAt: String(r.created_at),
    inPosts: n(r.in_posts),
    inDms: n(r.in_dms),
  }));
  const urls = await signPaths(list.map((v) => ({ path: v.path, bucket: 'post-media' })));
  return list.map((v) => ({ ...v, url: urls.get(v.path) }));
}

export async function addToVault(items: NewMedia[], folder: string | null) {
  const stored = await uploadMedia(items, 'post-media', 'vault/');
  const rows = stored.map((s) => ({
    path: s.path,
    type: s.type === 'video' ? 'video' : 'image',
    width: s.width ?? null,
    height: s.height ?? null,
    preview: s.preview ?? null,
    folder,
  }));
  const { error } = await sb().from('vault_items').insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateVaultItems(ids: string[], patch: { folder?: string | null; tags?: string[] }) {
  const { error } = await sb().from('vault_items').update(patch).in('id', ids);
  if (error) throw new Error(error.message);
}

/** Removes from the vault. Files already used in posts or messages stay where they are. */
export async function deleteVaultItems(items: VaultItem[]) {
  const { error } = await sb().from('vault_items').delete().in('id', items.map((i) => i.id));
  if (error) throw new Error(error.message);
  const unused = items.filter((i) => !i.inPosts && !i.inDms).map((i) => i.path);
  if (unused.length) await sb().storage.from('post-media').remove(unused);
}

/** Vault items as message or post media (the files stay where they are; nothing is uploaded again). */
export const vaultAsMedia = (items: VaultItem[]): StoredMedia[] =>
  items.map((v) => ({
    type: v.type,
    path: v.path,
    bucket: 'post-media',
    width: v.width,
    height: v.height,
    ...(v.preview ? { preview: v.preview } : {}),
  }));

/* ---------- Cover photo and free trial ---------- */

export async function setCover(item: NewMedia | null) {
  if (!item) return rpc('set_profile_extras', { p_clear_cover: true });
  const { data } = await sb().auth.getUser();
  const me = data.user?.id;
  if (!me) throw new Error('Please sign in first.');
  const path = `${me}/cover-${Date.now()}.jpg`;
  const body = await (await fetch(item.uri)).arrayBuffer();
  const { error } = await sb().storage.from('profile-covers').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  await rpc('set_profile_extras', { p_cover_path: path });
}

export const TRIAL_OPTIONS = [0, 3, 7, 14, 30] as const;
export async function setTrialDays(days: number) {
  await rpc('set_profile_extras', { p_trial_days: days });
}

/* ---------- Hooks ---------- */

export const studioKeys = {
  home: ['social', 'studio'] as const,
  audience: ['social', 'mass-audience'] as const,
  vault: ['social', 'vault'] as const,
};
export const useStudioHome = (enabled = true) =>
  useQuery({ queryKey: studioKeys.home, queryFn: studioHome, enabled: live() && enabled, staleTime: 15_000 });
export const useMassAudience = (enabled = true) =>
  useQuery({ queryKey: studioKeys.audience, queryFn: massAudience, enabled: live() && enabled });
export const useVault = (enabled = true) => useQuery({ queryKey: studioKeys.vault, queryFn: vaultList, enabled: live() && enabled });

export function useReactPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; emoji: Reaction; on: boolean }) => reactPost(v.postId, v.emoji, v.on),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['social'] }),
  });
}

export const money = (cents: number) =>
  cents >= 100_000 ? `$${(cents / 100_000).toFixed(1).replace(/\.0$/, '')}k` : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/* ---------- Picking from the vault for another screen ---------- */

let pendingPick: { target: string; items: VaultItem[] } | null = null;
/** The vault, opened to pick, hands its selection to the screen that asked (by name, e.g. "mass" or a thread id). */
export const vaultPick = {
  set(target: string, items: VaultItem[]) {
    pendingPick = { target, items };
  },
  take(target: string): VaultItem[] | null {
    if (pendingPick?.target !== target) return null;
    const items = pendingPick.items;
    pendingPick = null;
    return items;
  },
};
