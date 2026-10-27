import { previousQuarter, quarterOf } from '@/lib/share';

import type { ActorEarnings, ComingSoon, Comment, Friend, FriendRequest, Gift, Show } from './types';

/**
 * Sample content used when no backend is configured. Titles, people and
 * numbers are placeholders until real shows are cast and shot.
 */

/** Public HLS test stream from Mux, standing in for real episodes. */
export const SAMPLE_VIDEO = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export const FREE_EPISODES = 10;

export const SHOWS: Show[] = [
  {
    id: 'his-secret-fortune',
    number: '01',
    title: 'His Secret Fortune',
    genre: 'Secret billionaire',
    tagline: 'Sixty days in the mailroom. Four billion on the line.',
    synopsis:
      'Dumped on the night he proposed, a broke delivery driver inherits $4.2 billion. The catch: sixty days in the mailroom, and nobody can know.',
    color: '#3A1420',
    episodeCount: 60,
    latestEpisode: 20,
    releaseDays: [1],
    episodeTitles: ['The Ring', 'The Will', 'The Condition', 'The Mailroom', 'Vivian', 'The Pool', 'Rolax', 'The Gala Invite', 'Cap and Gown', 'The Door'],
    cast: [
      { role: 'Marcus', actorName: '[Actor name]', alsoCredit: 'Also wrote it' },
      { role: 'Nia', actorName: '[Actor name]', alsoCredit: 'Also directed' },
      { role: 'Tasha', actorName: '[Actor name]', alsoCredit: 'Also did makeup' },
      { role: 'Derek', actorName: '[Actor name]', alsoCredit: 'Also held the boom mic' },
    ],
  },
  {
    id: 'the-alpha-next-door',
    number: '02',
    title: 'The Alpha Next Door',
    genre: 'Werewolf romance',
    tagline: 'Her building manager is an alpha. She is his mate.',
    color: '#1D1A33',
    episodeCount: 60,
    latestEpisode: 10,
    releaseDays: [2],
    episodeTitles: [],
    cast: [
      { role: 'Riley', actorName: '[Actor name]', alsoCredit: 'Also wrote it' },
      { role: 'Cole', actorName: '[Actor name]', alsoCredit: 'Also directed' },
      { role: 'Jax', actorName: '[Actor name]', alsoCredit: 'Also the editor' },
      { role: 'Sienna', actorName: '[Actor name]', alsoCredit: 'Also did wardrobe' },
    ],
  },
  {
    id: 'the-ex-wife-returns',
    number: '03',
    title: 'The Ex-Wife Returns',
    genre: 'Divorce revenge',
    tagline: 'He threw her out in the rain. Now she owns the roof.',
    color: '#13302B',
    episodeCount: 60,
    latestEpisode: 10,
    releaseDays: [0],
    episodeTitles: [],
    cast: [
      { role: 'Ava', actorName: '[Actor name]', alsoCredit: 'Also wrote it' },
      { role: 'Ryan', actorName: '[Actor name]', alsoCredit: 'Also directed' },
      { role: 'Brittany', actorName: '[Actor name]', alsoCredit: 'Also did hair' },
      { role: 'Noah', actorName: '[Actor name]', alsoCredit: 'Also ran sound' },
    ],
  },
];

const EPISODE_TITLES: Record<string, string[]> = {
  'his-secret-fortune': [
    'The Ring', 'The Will', 'The Condition', 'Day 1', 'Twelve Coffees', 'Spilled', 'Rolax', 'Delivery', 'Walk Home', 'Close the Door',
    'Two Million', 'Anonymous', 'The Hunt', 'Speed Round', '$11 Date', 'Defended', 'Fired', 'New Owner', 'M', 'The Vote',
    'Missing', 'Planted', 'Suspended', 'The Camera', 'Cleared', 'M Again', 'Not Him', 'The Gala', 'The Message', 'The Wind',
    'Followed', 'Proof', 'The Exam', 'New Hire', 'The Paperwork', 'Smith', 'The Truth', 'Rain', 'Partners', 'Hello, Cousin',
    'Day 59', 'The Offer', 'The Leak', 'Cookies', 'Chosen', 'Pickpocket', 'Scheduled', 'Fine Print', 'Clause 7', 'The Trap',
    'Flat Tire', 'Sent', 'Broken?', 'Voice Memo', '$12 Million', 'Day 60', 'Believers', 'Promotion', 'The Pool', 'Yes',
  ],
  'the-alpha-next-door': [
    'Moonview', 'The Super', 'Neighbors', 'Dog Park', 'House Rules', 'Stitches', 'The Elders', 'Flowers', 'Thursday', 'Gold Eyes',
    'Balconies', 'The Steaks', 'Council', 'Claimed', 'The Bond', "Jax's Tour", 'Patient', 'Your Mother', "Sienna's Deal", 'What You Are',
    'Silver', 'Forty Nights', 'Doubt', 'His Version', 'The Kiss', 'Pack Law', 'Bodyguard', 'Buffering', 'Pack Dinner', 'Hearing Things',
    'Twenty Years', 'Alone', 'The Real Story', 'Bad Plan', 'Phone Records', 'Exiled', 'Friday', 'Surrounded', 'Shadows', 'The Deal',
    'Crescent', 'Poison', 'Sienna Turns', 'Caught', 'The Catch', 'Healed', 'Not Worth It', 'Step Down', 'Acting Alpha', 'Escape',
    'The Letter', 'Fever', 'The Bond Speaks', 'Blood Moon', 'Chaos', 'Silver Eyes', 'The Silver Wolf', 'Luna', 'The Mark', 'Home',
  ],
  'the-ex-wife-returns': [
    'Rain', 'The List', 'The Pitch', 'Noah', 'Terms', 'Hands Off', 'Class', 'The Plan', 'Signature', "It's Her",
    'No Way', 'Friday', 'Item Two', 'Bring a Coat', 'Moving In', 'Overseas', 'Not Here for Love', 'Vance Media', 'The Toast', 'The Date',
    'Tagged', 'The Scar', 'Go Ahead', 'The Story', 'Tiebreaker', 'Brothers', 'Notary', 'What Do You Want', 'Twenty Percent', 'Fifty',
    'Never', 'Trade', 'Double Cross', 'Merger', 'Never Left', '9:14 a.m.', 'Never Loved You', 'The Bar', 'Recorded', 'Hello, Ryan',
    'Five Years', 'Brittany Knows', 'Friday Vote', 'One Vote', 'Diane', 'The Kiss', 'Jealous', 'Her Handwriting', 'Sorry', 'Wine Cellar',
    'Vote Day', 'Stall', 'No', 'Evidence', 'Forged', 'Item Five', 'Rain Again', 'Fresh Start', 'New Page', 'Sinclair & Co.',
  ],
};

for (const show of SHOWS) show.episodeTitles = EPISODE_TITLES[show.id] ?? [];

export const COMING_SOON: ComingSoon = {
  title: 'Married to the Don',
  teaser: 'To pay her father’s debt, she married the most feared man in LA.',
  starring: 'Starring [ACTOR] & [ACTOR]',
  arrives: 'Arrives [MONTH]',
};

export const GIFTS: Gift[] = [
  { id: 'popcorn', name: 'Popcorn', priceCents: 99, color: '#F5D27A', iconPath: 'M6 10h12l-1.5 10h-9zM7 10a2.5 2.5 0 0 1 3-3 2.5 2.5 0 0 1 4 0 2.5 2.5 0 0 1 3 3' },
  { id: 'rose', name: 'Rose', priceCents: 199, color: '#FF8A7A', iconPath: 'M12 21v-8M12 13a4 4 0 0 1-4-4c0-2 2-4 4-5 2 1 4 3 4 5a4 4 0 0 1-4 4zM12 17c-1.5 0-3-.8-4-2' },
  { id: 'ovation', name: 'Standing Ovation', priceCents: 499, color: '#E8C27A', iconPath: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z' },
  { id: 'encore', name: 'Encore', priceCents: 999, color: '#C9A6FF', iconPath: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z' },
  { id: 'wrap-party', name: 'Wrap Party', priceCents: 2499, color: '#7FE0C4', iconPath: 'M4 10h16v10H4zM4 10l1.5-5 14 2-1 3M9 5.5L8 10M14 6.3l-1 3.7' },
];

export const FRIENDS: Friend[] = [
  { id: 'u-kayla', handle: 'kayla.watches', watching: { showId: 'his-secret-fortune', episode: 12, watchingNow: true } },
  { id: 'u-dre', handle: 'dre.on.venice', watching: { showId: 'his-secret-fortune', episode: 12, watchingNow: false, caughtUp: true } },
  { id: 'u-jas', handle: 'jas.mine', watching: { showId: 'the-alpha-next-door', episode: 4, watchingNow: true } },
  { id: 'u-nico', handle: 'nico.ramos', watching: { showId: 'his-secret-fortune', episode: 6, watchingNow: false } },
];

export const FRIEND_REQUESTS: FriendRequest[] = [
  { id: 'r-tasha', from: { id: 'u-tasha', handle: 'tasha.b' }, note: 'Watching His Secret Fortune' },
  { id: 'r-marco', from: { id: 'u-marco', handle: 'marco_vb' }, note: '2 friends in common' },
];

export function sampleComments(showId: string, episode: number): Comment[] {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return [
    { id: `${showId}-${episode}-c1`, showId, episode, author: { id: 'cast-1', handle: 'marcus.onset', isCast: true }, body: 'We did fourteen takes of this scene. Fourteen.', atSec: 42, likes: 412, likedByMe: false, isFriend: false, createdAt: at(120) },
    { id: `${showId}-${episode}-c2`, showId, episode, author: { id: 'u-kayla', handle: 'kayla.watches' }, body: 'He is SO broke and I am SO in love.', likes: 96, likedByMe: false, isFriend: true, createdAt: at(60) },
    { id: `${showId}-${episode}-c3`, showId, episode, author: { id: 'u-jdub', handle: 'jdub_310' }, body: 'Called it three episodes ago. Nobody listened.', atSec: 70, likes: 58, likedByMe: false, isFriend: false, createdAt: at(180) },
    { id: `${showId}-${episode}-c4`, showId, episode, author: { id: 'u-mari', handle: 'mariposa.reads' }, body: 'The delivery on that last line, like a court verdict.', likes: 31, likedByMe: false, isFriend: false, createdAt: at(240) },
    { id: `${showId}-${episode}-c5`, showId, episode, author: { id: 'u-dre', handle: 'dre.on.venice' }, body: 'The next premiere cannot come fast enough.', likes: 12, likedByMe: false, isFriend: true, createdAt: at(300) },
  ];
}

export const SAMPLE_CHAT_LINES: { handle: string; body: string; isCast?: boolean }[] = [
  { handle: 'tasha.b', body: 'I KNEW IT' },
  { handle: 'nico.ramos', body: 'HOW does nobody recognize him with the cap' },
  { handle: 'jas.mine', body: 'she needs to RUN' },
  { handle: '[Actor name]', body: 'we shot this at 3am lol', isCast: true },
  { handle: 'marco_vb', body: 'the music right now' },
  { handle: 'kayla.watches', body: 'screaming' },
];

/**
 * A sample actor's Cinara Share: you play Marcus on His Secret Fortune (6 of 20 points) and Cole on
 * The Alpha Next Door (4 of 18). His Secret Fortune earns back its budget this quarter, so its pool
 * steps up from 40% to 60% partway through. Placeholder numbers until real shows run.
 */
export function sampleEarnings(now: Date): ActorEarnings {
  const q = quarterOf(now);
  const q1 = previousQuarter(q);
  const q2 = previousQuarter(q1);
  const hsf = { showId: 'his-secret-fortune', showTitle: 'His Secret Fortune', role: 'Marcus', points: 6, totalPoints: 20, budgetCents: 60_000_00 };
  const alpha = { showId: 'the-alpha-next-door', showTitle: 'The Alpha Next Door', role: 'Cole', points: 4, totalPoints: 18, budgetCents: 45_000_00 };
  return {
    current: {
      quarter: q.key,
      status: 'open',
      shows: [
        { ...hsf, minutesWatched: 412_300, members: 3_180, revenueCents: 14_500_00, earnedBeforeCents: 52_000_00 },
        { ...alpha, minutesWatched: 168_900, members: 1_240, revenueCents: 6_200_00, earnedBeforeCents: 12_000_00 },
      ],
      gifts: { count: 37, grossCents: 142_63, cardFeesCents: 4_28 },
    },
    past: [
      {
        quarter: q1.key,
        status: 'paid',
        paidOn: new Date(q.start.getTime() + 11 * 86_400_000).toISOString(),
        shows: [
          { ...hsf, minutesWatched: 1_208_400, members: 6_920, revenueCents: 31_000_00, earnedBeforeCents: 21_000_00 },
          { ...alpha, minutesWatched: 402_700, members: 2_610, revenueCents: 9_800_00, earnedBeforeCents: 2_200_00 },
        ],
        gifts: { count: 112, grossCents: 418_88, cardFeesCents: 12_57 },
      },
      {
        quarter: q2.key,
        status: 'paid',
        paidOn: new Date(q1.start.getTime() + 13 * 86_400_000).toISOString(),
        shows: [
          { ...hsf, minutesWatched: 801_500, members: 4_350, revenueCents: 21_000_00, earnedBeforeCents: 0 },
          { ...alpha, minutesWatched: 61_900, members: 540, revenueCents: 2_200_00, earnedBeforeCents: 0 },
        ],
        gifts: { count: 64, grossCents: 233_36, cardFeesCents: 7_00 },
      },
    ],
  };
}
