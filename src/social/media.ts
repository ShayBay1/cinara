import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { getSupabase } from '@/data';

import type { NewMedia } from './api';

/** Photos, videos and voice notes the app uploads (posts, DMs, the vault, cover photos). */

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SEC = 180;

export type Bucket = 'post-media' | 'dm-media';

/** A stored file: what posts, DMs and the vault keep in their media lists. */
export interface StoredMedia {
  type: 'image' | 'video' | 'audio';
  path: string;
  bucket?: Bucket;
  width?: number;
  height?: number;
  duration_ms?: number;
  preview?: string;
}

/** Shrinks a photo (long side 1440 px) and makes the tiny blurred stand-in locked content shows. */
export async function preparePhoto(uri: string, width: number, height: number): Promise<NewMedia> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width >= height && width > 1440) ctx.resize({ width: 1440 });
  else if (height > width && height > 1440) ctx.resize({ height: 1440 });
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const tiny = ImageManipulator.manipulate(out.uri);
  tiny.resize({ width: 24 });
  const small = await (await tiny.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.5, base64: true });
  return {
    uri: out.uri,
    type: 'image',
    mimeType: 'image/jpeg',
    width: out.width,
    height: out.height,
    preview: small.base64 ? `data:image/jpeg;base64,${small.base64}` : undefined,
  };
}

/** Opens the photo library. Returns ready-to-upload items; skips videos that are too long or large. */
export async function pickMedia(opts: { limit: number; videos?: boolean; onSkip?: (why: string) => void }): Promise<NewMedia[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.videos === false ? ['images'] : ['images', 'videos'],
    allowsMultipleSelection: opts.limit > 1,
    selectionLimit: opts.limit,
    quality: 0.9,
    videoMaxDuration: MAX_VIDEO_SEC,
  });
  if (result.canceled) return [];
  const out: NewMedia[] = [];
  for (const a of result.assets.slice(0, opts.limit)) {
    if (a.type === 'video') {
      if ((a.fileSize ?? 0) > MAX_VIDEO_BYTES) {
        opts.onSkip?.('That video is over 50 MB. Trim it or export a smaller version.');
        continue;
      }
      if (a.duration && a.duration / 1000 > MAX_VIDEO_SEC) {
        opts.onSkip?.('Videos can be up to 3 minutes.');
        continue;
      }
      out.push({ uri: a.uri, type: 'video', mimeType: a.mimeType ?? 'video/mp4', width: a.width, height: a.height });
    } else {
      out.push(await preparePhoto(a.uri, a.width, a.height));
    }
  }
  return out;
}

const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('This needs the live backend.');
  return c;
};

export async function myId(): Promise<string> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  return data.user.id;
}

const extOf = (m: { type: string; mimeType: string }) =>
  m.type === 'video' ? (m.mimeType.includes('quicktime') ? 'mov' : 'mp4') : m.type === 'audio' ? 'm4a' : 'jpg';

/** Uploads to {bucket}/{me}/… and returns what to store on the post, message or vault item. */
export async function uploadMedia(
  items: (NewMedia | { uri: string; type: 'audio'; mimeType: string; durationMs: number })[],
  bucket: Bucket,
  folder = '',
): Promise<StoredMedia[]> {
  const me = await myId();
  const done: StoredMedia[] = [];
  try {
    for (const m of items) {
      const path = `${me}/${folder}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(m)}`;
      const body = await (await fetch(m.uri)).arrayBuffer();
      const { error } = await sb().storage.from(bucket).upload(path, body, { contentType: m.mimeType, upsert: false });
      if (error) throw new Error(error.message);
      if (m.type === 'audio') done.push({ type: 'audio', path, bucket, duration_ms: (m as { durationMs: number }).durationMs });
      else {
        const n = m as NewMedia;
        done.push({ type: n.type, path, bucket, width: n.width, height: n.height, ...(n.preview ? { preview: n.preview } : {}) });
      }
    }
    return done;
  } catch (e) {
    for (const b of ['post-media', 'dm-media'] as const) {
      const mine = done.filter((d) => (d.bucket ?? 'post-media') === b).map((d) => d.path);
      if (mine.length) await sb().storage.from(b).remove(mine);
    }
    throw e;
  }
}

/** Signs private files in one request per bucket. Returns path → link (an hour). */
export async function signPaths(items: { path?: string; bucket?: string }[]): Promise<Map<string, string>> {
  const by = new Map<string, string>();
  for (const b of ['post-media', 'dm-media'] as const) {
    const paths = [...new Set(items.filter((m) => m.path && (m.bucket ?? 'post-media') === b).map((m) => m.path!))];
    if (!paths.length) continue;
    const { data } = await sb().storage.from(b).createSignedUrls(paths, 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) by.set(d.path, d.signedUrl);
  }
  return by;
}

export const coverUrl = (path?: string | null) =>
  path ? (getSupabase()?.storage.from('profile-covers').getPublicUrl(path).data.publicUrl ?? null) : null;
