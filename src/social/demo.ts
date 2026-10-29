import type { ActorCard, ActorProfile, Media, Post, PostComment } from './api';

/**
 * Placeholder creators and posts so the feed looks alive while testing.
 * Shown in development builds, and in the live app only until real posts exist.
 * Nothing here is ever written to the server; ids start with "demo-".
 */

const HOUR = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
/** Stock photos (picsum.photos) stand in for real behind-the-scenes shots. */
const photo = (seed: string, w = 1080, h = 1350): Media => ({
  type: 'image',
  url: `https://picsum.photos/seed/cinara-${seed}/${w}/${h}`,
  preview: `https://picsum.photos/seed/cinara-${seed}/40/50?blur=6`,
  width: w,
  height: h,
});
const cover = (src: number): Media => ({ type: 'image', url: src, preview: src, width: 1080, height: 1350 });

const COVERS = {
  fortune: require('../../assets/covers/his-secret-fortune.jpg') as number,
  alpha: require('../../assets/covers/the-alpha-next-door.jpg') as number,
  exwife: require('../../assets/covers/the-ex-wife-returns.jpg') as number,
  don: require('../../assets/covers/married-to-the-don.jpg') as number,
};

export const DEMO_CREATORS: ActorCard[] = [
  { id: 'demo-marcus', handle: 'marcus.onset', displayName: 'Marcus Reyes', avatarUrl: null, followers: 18400, following: false, premiumPosts: 6, dmsOpen: true,
    bio: 'Marcus in His Secret Fortune. Also wrote it. Venice Beach.', verified: true, roles: [{ showId: 'his-secret-fortune', title: 'His Secret Fortune', role: 'Marcus' }], demo: true },
  { id: 'demo-nia', handle: 'nia.directs', displayName: 'Nia Brooks', avatarUrl: null, followers: 12900, following: false, premiumPosts: 4, dmsOpen: true,
    bio: 'Actor + director. I shoot what I can’t stop thinking about.', verified: true, roles: [{ showId: 'his-secret-fortune', title: 'His Secret Fortune', role: 'Nia' }], demo: true },
  { id: 'demo-sienna', handle: 'sienna.rose', displayName: 'Sienna Rose', avatarUrl: null, followers: 25100, following: false, premiumPosts: 9, dmsOpen: true,
    bio: 'Sienna in The Alpha Next Door. Wardrobe girl at heart.', verified: true, roles: [{ showId: 'the-alpha-next-door', title: 'The Alpha Next Door', role: 'Sienna' }], demo: true },
  { id: 'demo-cole', handle: 'cole.hart', displayName: 'Cole Hart', avatarUrl: null, followers: 9700, following: false, premiumPosts: 3, dmsOpen: false,
    bio: 'Cole. Directed it too. Mostly running on cold brew.', verified: true, roles: [{ showId: 'the-alpha-next-door', title: 'The Alpha Next Door', role: 'Cole' }], demo: true },
  { id: 'demo-ava', handle: 'ava.monroe', displayName: 'Ava Monroe', avatarUrl: null, followers: 31200, following: false, premiumPosts: 7, dmsOpen: true,
    bio: 'Ava in The Ex-Wife Returns. Yes, I wrote that line.', verified: true, roles: [{ showId: 'the-ex-wife-returns', title: 'The Ex-Wife Returns', role: 'Ava' }], demo: true },
  { id: 'demo-jax', handle: 'jax.cuts', displayName: 'Jax Moreno', avatarUrl: null, followers: 6400, following: false, premiumPosts: 2, dmsOpen: true,
    bio: 'Jax on screen, editor off screen.', verified: true, roles: [{ showId: 'the-alpha-next-door', title: 'The Alpha Next Door', role: 'Jax' }], demo: true },
];

const by = (id: string) => {
  const c = DEMO_CREATORS.find((x) => x.id === id)!;
  return { id: c.id, handle: c.handle, displayName: c.displayName, avatarUrl: null, isCast: true, verified: true };
};

type Seed = Omit<Post, 'locked' | 'likedByMe' | 'demo'>;
const SEEDS: Seed[] = [
  { id: 'demo-p1', author: by('demo-sienna'), visibility: 'public', showId: 'the-alpha-next-door', createdAt: ago(1.2), likes: 4821, comments: 214,
    body: 'Episode 21 drops tonight at 8. I cried for real in the last scene and we kept it.', media: [cover(COVERS.alpha)] },
  { id: 'demo-p2', author: by('demo-marcus'), visibility: 'subscribers', showId: 'his-secret-fortune', createdAt: ago(2.5), likes: 1290, comments: 88,
    body: 'The deleted ending. Nobody’s seen this but the crew. Tell me if we should’ve used it.', media: [photo('m-cut1'), photo('m-cut2'), photo('m-cut3')] },
  { id: 'demo-p3', author: by('demo-ava'), visibility: 'public', showId: 'the-ex-wife-returns', createdAt: ago(4), likes: 9310, comments: 502,
    body: 'Wardrobe fitting for the wedding episode. Which dress? 1, 2 or 3 👀', media: [photo('a-dress1'), photo('a-dress2'), photo('a-dress3')] },
  { id: 'demo-p4', author: by('demo-nia'), visibility: 'public', showId: 'his-secret-fortune', createdAt: ago(6), likes: 2104, comments: 97,
    body: 'Directing myself in a mirror scene is a special kind of chaos.', media: [photo('n-mirror', 1080, 1080)] },
  { id: 'demo-p5', author: by('demo-sienna'), visibility: 'subscribers', showId: null, createdAt: ago(9), likes: 3388, comments: 141,
    body: 'Voice memo from the trailer at 4am. Backstage only, you know why.', media: [photo('s-trailer')] },
  { id: 'demo-p6', author: by('demo-cole'), visibility: 'public', showId: 'the-alpha-next-door', createdAt: ago(13), likes: 1477, comments: 63,
    body: 'Day 6 call sheet vs. what actually happened. Swipe.', media: [photo('c-call1'), photo('c-call2')] },
  { id: 'demo-p7', author: by('demo-ava'), visibility: 'subscribers', showId: 'the-ex-wife-returns', createdAt: ago(20), likes: 5120, comments: 233,
    body: 'Table read for the finale. I’m posting the whole thing in parts this week.', media: [photo('a-read1'), photo('a-read2')] },
  { id: 'demo-p8', author: by('demo-marcus'), visibility: 'public', showId: 'his-secret-fortune', createdAt: ago(26), likes: 7044, comments: 389,
    body: 'Fourteen takes. FOURTEEN. Episode 12 is out now.', media: [cover(COVERS.fortune)] },
  { id: 'demo-p9', author: by('demo-jax'), visibility: 'public', showId: 'the-alpha-next-door', createdAt: ago(31), likes: 880, comments: 41,
    body: 'Editing bay view. 3 episodes left to cut before Friday.', media: [photo('j-bay', 1080, 1080)] },
  { id: 'demo-p10', author: by('demo-nia'), visibility: 'subscribers', showId: 'his-secret-fortune', createdAt: ago(40), likes: 1650, comments: 72,
    body: 'Shot list for next week + the location we just locked. Don’t screenshot 🙏', media: [photo('n-loc1'), photo('n-loc2')] },
  { id: 'demo-p11', author: by('demo-sienna'), visibility: 'public', showId: null, createdAt: ago(52), likes: 6210, comments: 301,
    body: 'Golden hour between setups.', media: [photo('s-golden')] },
  { id: 'demo-p12', author: by('demo-ava'), visibility: 'public', showId: 'married-to-the-don', createdAt: ago(70), likes: 12840, comments: 911,
    body: 'New show. Coming soon. That’s all I’m allowed to say.', media: [cover(COVERS.don)] },
  { id: 'demo-p13', author: by('demo-marcus'), visibility: 'subscribers', showId: null, createdAt: ago(80), likes: 2210, comments: 120,
    body: 'Rehearsal tape for the rooftop scene.', media: [photo('m-roof')] },
  { id: 'demo-p14', author: by('demo-cole'), visibility: 'public', showId: 'the-ex-wife-returns', createdAt: ago(96), likes: 990, comments: 38,
    body: 'Guest spot on The Ex-Wife Returns. Ava made me do 9 takes of one line.', media: [cover(COVERS.exwife)] },
];

/** Demo posts as the viewer sees them: exclusive ones open only with Backstage. */
export function demoPosts(hasPass: boolean, scope: 'all' | 'following' | 'premium' = 'all', followed: string[] = []): Post[] {
  return SEEDS.filter((p) => (scope === 'premium' ? p.visibility === 'subscribers' : true))
    .filter((p) => (scope === 'following' ? followed.includes(p.author.id) : true))
    .map((p) => {
      const locked = p.visibility === 'subscribers' && !hasPass;
      return {
        ...p,
        demo: true,
        likedByMe: false,
        locked,
        body: locked ? null : p.body,
        media: locked ? p.media.map((m) => ({ type: m.type, preview: m.preview, width: m.width, height: m.height })) : p.media,
      };
    });
}

export const isDemoId = (id: string) => id.startsWith('demo-');
export const demoCreatorByHandle = (handle: string) => DEMO_CREATORS.find((c) => c.handle === handle.toLowerCase());

export function demoProfile(handle: string, hasPass: boolean, dmAccess: boolean): ActorProfile | null {
  const c = demoCreatorByHandle(handle);
  if (!c) return null;
  return {
    id: c.id,
    handle: c.handle,
    displayName: c.displayName,
    bio: c.bio ?? null,
    avatarUrl: null,
    isCast: true,
    verified: true,
    subsEnabled: true,
    subPriceCents: 499,
    dmsOpen: !!c.dmsOpen,
    followers: c.followers,
    posts: SEEDS.filter((p) => p.author.id === c.id).length,
    premiumPosts: SEEDS.filter((p) => p.author.id === c.id && p.visibility === 'subscribers').length,
    following: c.following,
    subscribed: hasPass,
    canMessage: dmAccess && !!c.dmsOpen,
    dmPriceCents: 999,
    isMe: false,
    relation: 'none',
    friends: 0,
    shows: c.roles.map((r) => ({ id: r.showId, title: r.title, role: r.role })),
    demo: true,
  };
}

const FANS = ['kayla.watches', 'dre.on.venice', 'jas.mine', 'nico.ramos', 'mariposa.reads', 'jdub_310', 'tasha.b'];
const LINES = [
  'I KNEW something was off in that scene',
  'the way I screamed',
  'okay but the lighting here 😭',
  'please tell me there’s a season 2',
  'this is why I watch every premiere live',
  'not me rewatching episode 12 for the third time',
  'you two have the best chemistry on this app',
];

export function demoComments(postId: string): PostComment[] {
  const n = (postId.charCodeAt(postId.length - 1) % 4) + 3;
  return Array.from({ length: n }, (_, i) => ({
    id: `${postId}-c${i}`,
    parentId: null,
    body: LINES[(i + postId.length) % LINES.length]!,
    createdAt: ago(0.3 + i * 0.7),
    author: { id: `demo-fan-${i}`, handle: FANS[(i + postId.length) % FANS.length]!, avatarUrl: null, isCast: false },
  }));
}

/** Show sample content? Always in development builds; in the live app only while nobody has posted yet. */
export const showDemo = (realCount: number) => __DEV__ || realCount === 0;

/** Sample creators that match a search (or all of them for the empty search). */
export function demoPeople(query: string) {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  return DEMO_CREATORS.filter((c) => !q || c.handle.includes(q) || (c.displayName ?? '').toLowerCase().includes(q)).map((c) => ({
    id: c.id,
    handle: c.handle,
    displayName: c.displayName,
    avatarUrl: null,
    isCast: true,
    verified: true,
    followers: c.followers,
    following: c.following,
    relation: 'none' as const,
    role: c.roles[0]?.title ?? null,
    demo: true,
  }));
}
