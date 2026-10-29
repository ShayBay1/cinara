import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { create } from 'zustand';

import { getSupabase } from '@/data';

import type { Author, Media, NewMedia } from './api';
import { DEMO_CREATORS, showDemo } from './demo';
import { useMyPass } from './hooks';

/**
 * Backstage channels: every verified actor's members-only broadcast channel (like Instagram channels).
 * The actor posts updates, photos and polls; members react, vote and reply. Opening a channel
 * counts as a view, so channels earn actors their share of Backstage just like exclusive posts.
 */

export const EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏'] as const;
export type Emoji = (typeof EMOJIS)[number];

export interface ChannelSummary {
  actor: Author;
  open: boolean;
  messages: number;
  lastAt: string | null;
  last: string | null;
  unread: number;
  demo?: boolean;
}
export interface Poll {
  question: string;
  options: string[];
  counts: number[];
  myVote: number | null;
}
export interface ChannelMessage {
  id: string;
  actorId: string;
  kind: 'text' | 'photo' | 'poll';
  body: string;
  media: Media[];
  poll: Poll | null;
  pinned: boolean;
  createdAt: string;
  reactions: Partial<Record<Emoji, number>>;
  mine: Emoji[];
  replies: number;
  highlight: { body: string; author: Author } | null;
  demo?: boolean;
}
export interface ChannelReply {
  id: string;
  body: string;
  createdAt: string;
  highlighted: boolean;
  author: Author;
}

type Row = Record<string, unknown>;
const live = () => getSupabase() !== null;
const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('Channels need the live backend.');
  return c;
};
const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};
const rpc = async <T>(fn: string, args?: Record<string, unknown>) => must(await sb().rpc(fn, args)) as T;

const toAuthor = (r: Row | null | undefined): Author => ({
  id: String(r?.id ?? ''),
  handle: String(r?.handle ?? 'someone'),
  avatarUrl: (r?.avatar_url as string | null) ?? null,
  isCast: Boolean(r?.is_cast),
  verified: Boolean(r?.verified),
  displayName: (r?.display_name as string | null) ?? null,
});

const toMessage = (r: Row): ChannelMessage => {
  const p = r.poll as Row | null;
  const h = r.highlight as Row | null;
  return {
    id: r.id as string,
    actorId: r.actor_id as string,
    kind: r.kind as ChannelMessage['kind'],
    body: (r.body as string) ?? '',
    media: (r.media as Media[]) ?? [],
    poll: p
      ? {
          question: p.question as string,
          options: (p.options as string[]) ?? [],
          counts: ((p.counts as number[]) ?? []).map(Number),
          myVote: p.my_vote == null ? null : Number(p.my_vote),
        }
      : null,
    pinned: Boolean(r.pinned),
    createdAt: r.created_at as string,
    reactions: (r.reactions as ChannelMessage['reactions']) ?? {},
    mine: (r.my_reactions as Emoji[]) ?? [],
    replies: Number(r.replies ?? 0),
    highlight: h ? { body: h.body as string, author: toAuthor(h.author as Row) } : null,
  };
};

async function sign(list: ChannelMessage[]) {
  const paths = list.flatMap((m) => m.media.map((x) => x.path).filter((p): p is string => !!p));
  if (!paths.length) return list;
  const { data } = await sb().storage.from('post-media').createSignedUrls([...new Set(paths)], 3600);
  const by = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return list.map((m) => ({ ...m, media: m.media.map((x) => (x.path ? { ...x, url: by.get(x.path) ?? undefined } : x)) }));
}

/* ---------- API ---------- */

export async function channelsOverview(): Promise<ChannelSummary[]> {
  const rows = await rpc<Row[]>('channels_overview');
  return rows.map((r) => ({
    actor: toAuthor(r.actor as Row),
    open: Boolean(r.open),
    messages: Number(r.messages ?? 0),
    lastAt: (r.last_at as string | null) ?? null,
    last: (r.last as string | null) ?? null,
    unread: Number(r.unread ?? 0),
  }));
}
export async function channelFeed(actorId: string): Promise<ChannelMessage[] | null> {
  const rows = await rpc<Row[] | null>('channel_feed', { p_actor: actorId, p_before: null });
  return rows ? sign(rows.map(toMessage)) : null;
}
export const markChannelRead = (actorId: string) => rpc('mark_channel_read', { p_actor: actorId });
export const react = (id: string, emoji: Emoji, on: boolean) => rpc('react_channel', { p_message: id, p_emoji: emoji, p_on: on });
export const vote = (id: string, option: number) => rpc('vote_channel_poll', { p_message: id, p_option: option });
export const pin = (id: string, on: boolean) => rpc('pin_channel_message', { p_message: id, p_pinned: on });
export async function deleteChannelMessage(id: string) {
  must(await sb().from('channel_messages').delete().eq('id', id));
}
export async function replies(id: string): Promise<ChannelReply[]> {
  const rows = await rpc<Row[]>('channel_replies_list', { p_message: id });
  return rows.map((r) => ({
    id: r.id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
    highlighted: Boolean(r.highlighted),
    author: toAuthor(r.author as Row),
  }));
}
export const reply = (id: string, body: string) => rpc<string>('reply_channel', { p_message: id, p_body: body });
export const highlight = (replyId: string, on: boolean) => rpc('highlight_channel_reply', { p_reply: replyId, p_on: on });
export async function deleteReply(id: string) {
  must(await sb().from('channel_replies').delete().eq('id', id));
}

/** Actor only: uploads photos to post-media/{me}/channel/… then posts. */
export async function postToChannel(input: { kind: 'text' | 'photo' | 'poll'; body: string; photos?: NewMedia[]; poll?: { question: string; options: string[] } }) {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  const uploaded: Media[] = [];
  try {
    for (const m of input.photos ?? []) {
      const path = `${data.user.id}/channel/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const body = await (await fetch(m.uri)).arrayBuffer();
      must(await sb().storage.from('post-media').upload(path, body, { contentType: m.mimeType, upsert: false }));
      uploaded.push({ type: 'image', path, width: m.width, height: m.height });
    }
    return await rpc<string>('post_channel_message', {
      p_kind: input.kind,
      p_body: input.body,
      p_media: uploaded,
      p_poll: input.poll ?? null,
    });
  } catch (e) {
    if (uploaded.length) await sb().storage.from('post-media').remove(uploaded.map((u) => u.path!));
    throw e;
  }
}

export function watchChannel(actorId: string, onChange: () => void) {
  const c = getSupabase();
  if (!c) return () => {};
  const ch = c
    .channel(`channel:${actorId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_messages', filter: `actor_id=eq.${actorId}` }, onChange)
    .subscribe();
  return () => {
    void c.removeChannel(ch);
  };
}

/* ---------- Sample channels (testing only) ---------- */

const HOUR = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const pic = (seed: string): Media => ({ type: 'image', url: `https://picsum.photos/seed/cinara-ch-${seed}/900/1100`, width: 900, height: 1100 });
const fan = (handle: string): Author => ({ id: `demo-fan-${handle}`, handle, avatarUrl: null, isCast: false, verified: false, displayName: null });

type Seed = Omit<ChannelMessage, 'mine' | 'demo' | 'actorId'>;
const SEEDS: Record<string, Seed[]> = {
  'demo-sienna': [
    { id: 'demo-ch-s1', kind: 'text', body: 'Welcome to my Backstage channel 🖤 This is where I’ll drop things before anyone else sees them.', media: [], poll: null, pinned: true, createdAt: ago(50), reactions: { '❤️': 812, '🔥': 230 }, replies: 64, highlight: null },
    { id: 'demo-ch-s2', kind: 'photo', body: 'Fitting for episode 24. Don’t tell anyone.', media: [pic('s-fit1'), pic('s-fit2')], poll: null, pinned: false, createdAt: ago(20), reactions: { '😮': 340, '❤️': 921 }, replies: 112, highlight: { body: 'THE GREEN ONE. please.', author: fan('kayla.watches') } },
    { id: 'demo-ch-s3', kind: 'poll', body: '', media: [], poll: { question: 'Should Sienna forgive Cole in the finale?', options: ['Yes, he earned it', 'Absolutely not', 'Make him work for it'], counts: [412, 690, 1203], myVote: null }, pinned: false, createdAt: ago(6), reactions: { '😂': 88, '🔥': 145 }, replies: 230, highlight: null },
    { id: 'demo-ch-s4', kind: 'text', body: 'Just wrapped the last scene of the season. I’m a mess. Thank you for being here for this.', media: [], poll: null, pinned: false, createdAt: ago(1.5), reactions: { '😢': 402, '❤️': 1310, '👏': 220 }, replies: 98, highlight: { body: 'we’re so proud of you!!', author: fan('jas.mine') } },
  ],
  'demo-ava': [
    { id: 'demo-ch-a1', kind: 'text', body: 'Okay Backstage fam, I’m going to read every reply on this one. What do you want to see more of?', media: [], poll: null, pinned: true, createdAt: ago(30), reactions: { '❤️': 640 }, replies: 340, highlight: { body: 'more table reads!!!', author: fan('mariposa.reads') } },
    { id: 'demo-ch-a2', kind: 'photo', body: 'The wedding set before anyone got there.', media: [pic('a-set')], poll: null, pinned: false, createdAt: ago(9), reactions: { '😮': 510, '❤️': 990 }, replies: 77, highlight: null },
    { id: 'demo-ch-a3', kind: 'poll', body: '', media: [], poll: { question: 'Next Backstage drop?', options: ['Bloopers', 'Table read part 2', 'My trailer tour'], counts: [880, 410, 650], myVote: null }, pinned: false, createdAt: ago(2), reactions: { '🔥': 310 }, replies: 51, highlight: null },
  ],
  'demo-marcus': [
    { id: 'demo-ch-m1', kind: 'text', body: 'Writing episode 30 right now. You’re not ready.', media: [], poll: null, pinned: false, createdAt: ago(14), reactions: { '🔥': 760, '😮': 120 }, replies: 140, highlight: { body: 'we are NEVER ready', author: fan('dre.on.venice') } },
    { id: 'demo-ch-m2', kind: 'photo', body: 'Page one. That’s all you get.', media: [pic('m-script')], poll: null, pinned: false, createdAt: ago(3), reactions: { '😮': 450, '❤️': 300 }, replies: 66, highlight: null },
  ],
  'demo-nia': [
    { id: 'demo-ch-n1', kind: 'poll', body: '', media: [], poll: { question: 'Where should we shoot the season 2 opener?', options: ['Venice boardwalk', 'Downtown rooftop', 'The desert'], counts: [530, 720, 610], myVote: null }, pinned: true, createdAt: ago(18), reactions: { '🔥': 210 }, replies: 88, highlight: null },
  ],
};

const useDemoChannel = create<{ reacted: Record<string, Emoji[]>; votes: Record<string, number>; toggle: (id: string, e: Emoji) => void; vote: (id: string, o: number) => void }>((set) => ({
  reacted: {},
  votes: {},
  toggle: (id, e) =>
    set((st) => {
      const cur = st.reacted[id] ?? [];
      return { reacted: { ...st.reacted, [id]: cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e] } };
    }),
  vote: (id, o) => set((st) => ({ votes: { ...st.votes, [id]: o } })),
}));

function demoMessages(actorId: string, reacted: Record<string, Emoji[]>, votes: Record<string, number>): ChannelMessage[] {
  return (SEEDS[actorId] ?? []).map((m) => {
    const mine = reacted[m.id] ?? [];
    const reactions = { ...m.reactions };
    for (const e of mine) reactions[e] = (reactions[e] ?? 0) + 1;
    const v = votes[m.id];
    const poll = m.poll
      ? { ...m.poll, myVote: v ?? null, counts: m.poll.counts.map((c, i) => c + (v === i ? 1 : 0)) }
      : null;
    return { ...m, actorId, mine, reactions, poll, demo: true };
  });
}

function demoSummaries(hasPass: boolean): ChannelSummary[] {
  return DEMO_CREATORS.filter((c) => SEEDS[c.id]).map((c) => {
    const list = SEEDS[c.id]!;
    const last = list[list.length - 1]!;
    return {
      actor: { id: c.id, handle: c.handle, displayName: c.displayName, avatarUrl: null, isCast: true, verified: true },
      open: hasPass,
      messages: list.length,
      lastAt: last.createdAt,
      last: hasPass ? (last.kind === 'poll' ? `Poll: ${last.poll?.question}` : last.body || 'Sent a photo') : null,
      unread: hasPass ? 1 : 0,
      demo: true,
    };
  });
}

/* ---------- Hooks ---------- */

export const ck = {
  list: ['social', 'channels'] as const,
  feed: (actorId: string) => ['social', 'channel', actorId] as const,
  replies: (id: string) => ['social', 'channel-replies', id] as const,
};

export function useChannels() {
  const pass = useMyPass();
  const q = useQuery({ queryKey: ck.list, queryFn: channelsOverview, enabled: live(), staleTime: 20_000 });
  const data = useMemo(() => {
    const real = q.data ?? [];
    if (live() && q.isPending) return undefined;
    if (!showDemo(real.length)) return real;
    return [...real, ...demoSummaries(!!pass.data?.active)].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  }, [q.data, q.isPending, pass.data?.active]);
  return { ...q, data, isPending: live() ? q.isPending : false };
}

export function useChannelFeed(actorId: string) {
  const reacted = useDemoChannel((st) => st.reacted);
  const votes = useDemoChannel((st) => st.votes);
  const pass = useMyPass();
  const isDemo = actorId.startsWith('demo-');
  const q = useQuery({ queryKey: ck.feed(actorId), queryFn: () => channelFeed(actorId), enabled: live() && !!actorId && !isDemo });
  const data = useMemo(() => {
    if (!isDemo) return q.data;
    return pass.data?.active ? demoMessages(actorId, reacted, votes) : null;
  }, [isDemo, q.data, actorId, reacted, votes, pass.data?.active]);
  return { ...q, data, isPending: isDemo ? false : q.isPending };
}

export function useChannelReplies(id: string) {
  const isDemo = id.startsWith('demo-');
  const q = useQuery({ queryKey: ck.replies(id), queryFn: () => replies(id), enabled: live() && !!id && !isDemo });
  const data = useMemo((): ChannelReply[] | undefined => {
    if (!isDemo) return q.data;
    const fans = ['kayla.watches', 'dre.on.venice', 'jas.mine', 'nico.ramos', 'mariposa.reads', 'tasha.b'];
    const lines = ['this is everything', 'I KNEW IT', 'best channel on the app', 'please more of this', 'screaming', 'okay but when is the next drop'];
    return fans.map((f, i) => ({ id: `${id}-r${i}`, body: lines[i]!, createdAt: ago(0.2 + i * 0.4), highlighted: i === 0, author: fan(f) }));
  }, [isDemo, q.data, id]);
  return { ...q, data, isPending: isDemo ? false : q.isPending };
}

/** Reactions and votes: instant on screen, then saved (sample messages stay on this phone). */
export function useChannelActions(actorId: string) {
  const qc = useQueryClient();
  const demo = useDemoChannel();
  const patch = (id: string, fn: (m: ChannelMessage) => ChannelMessage) =>
    qc.setQueryData<ChannelMessage[] | null>(ck.feed(actorId), (list) => list?.map((m) => (m.id === id ? fn(m) : m)));
  const reactM = useMutation({
    mutationFn: ({ id, emoji, on }: { id: string; emoji: Emoji; on: boolean }) => react(id, emoji, on),
    onMutate: ({ id, emoji, on }) =>
      patch(id, (m) => ({
        ...m,
        mine: on ? [...m.mine, emoji] : m.mine.filter((x) => x !== emoji),
        reactions: { ...m.reactions, [emoji]: Math.max(0, (m.reactions[emoji] ?? 0) + (on ? 1 : -1)) },
      })),
    onError: () => void qc.invalidateQueries({ queryKey: ck.feed(actorId) }),
  });
  const voteM = useMutation({
    mutationFn: ({ id, option }: { id: string; option: number }) => vote(id, option),
    onMutate: ({ id, option }) =>
      patch(id, (m) =>
        m.poll
          ? {
              ...m,
              poll: {
                ...m.poll,
                myVote: option,
                counts: m.poll.counts.map((c, i) => c + (i === option ? 1 : 0) - (i === m.poll!.myVote ? 1 : 0)),
              },
            }
          : m,
      ),
    onError: () => void qc.invalidateQueries({ queryKey: ck.feed(actorId) }),
  });
  return {
    react: (m: ChannelMessage, emoji: Emoji) =>
      m.demo ? demo.toggle(m.id, emoji) : reactM.mutate({ id: m.id, emoji, on: !m.mine.includes(emoji) }),
    vote: (m: ChannelMessage, option: number) => (m.demo ? demo.vote(m.id, option) : voteM.mutate({ id: m.id, option })),
  };
}
