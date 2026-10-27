/** Domain types shared by the sample data, the Supabase backend and the UI. */

import type { ReframeTrack } from '@/lib/turn';

export type { ReframeKey, ReframeTrack } from '@/lib/turn';

export type ShowId = string;

export interface CastMember {
  role: string;
  /** Real name once cast. */
  actorName: string;
  /** Other credit on the show, e.g. "Also directed". */
  alsoCredit?: string;
  handle?: string;
}

export interface Show {
  id: ShowId;
  /** Display number, e.g. "01". */
  number: string;
  title: string;
  genre: string;
  tagline: string;
  /** One or two sentences for the show page. Falls back to the tagline. */
  synopsis?: string;
  /** Poster color, shown behind the cover while it loads (and instead of it until there is one). */
  color: string;
  /** Cover art (public URL, Supabase Storage "covers" bucket). Cropped to fit each spot. */
  coverUrl?: string | null;
  /** Pinned to the top of Home (the big card), ahead of the next premiere. */
  featured?: boolean;
  episodeCount: number;
  /** Newest released episode. */
  latestEpisode: number;
  /**
   * Drop nights, 0 = Sunday. Each one releases the next 10 episodes at
   * 8 PM Eastern (8/7c). Most shows have a single drop night a week.
   */
  releaseDays: number[];
  cast: CastMember[];
  /** Episode titles in order; missing ones show as "Episode N". */
  episodeTitles: string[];
}

export interface Episode {
  showId: ShowId;
  number: number;
  title: string;
  /** HLS stream of the square master (2160 x 2160, streamed at 1920 x 1920). */
  videoUrl: string;
  durationSec: number;
  /** Per-shot framing for upright and sideways. Missing: both views stay centered. */
  reframe?: ReframeTrack | null;
}

export interface UserSummary {
  id: string;
  handle: string;
  avatarUrl?: string | null;
  isCast?: boolean;
}

export interface Comment {
  id: string;
  showId: ShowId;
  episode: number;
  author: UserSummary;
  body: string;
  /** Moment in the episode the comment is pinned to. */
  atSec?: number | null;
  likes: number;
  likedByMe: boolean;
  isFriend: boolean;
  createdAt: string;
}

export type CommentSort = 'top' | 'newest' | 'friends';

export interface WatchingStatus {
  showId: ShowId;
  episode: number;
  watchingNow: boolean;
  caughtUp?: boolean;
}

export interface Friend extends UserSummary {
  watching?: WatchingStatus | null;
}

export interface FriendRequest {
  id: string;
  from: UserSummary;
  note: string;
}

export interface Gift {
  id: string;
  name: string;
  priceCents: number;
  color: string;
  /** SVG path for the gift icon. */
  iconPath: string;
}

export type ChatMessage =
  | { id: string; kind: 'text'; author: UserSummary; body: string; createdAt: string }
  | {
      id: string;
      kind: 'gift';
      author: UserSummary;
      giftId: string;
      /** Recipient: "cast" for the whole cast, or a cast handle/role. */
      to: string;
      createdAt: string;
    };

export interface ComingSoon {
  title?: string;
  teaser: string;
  starring: string;
  arrives: string;
  /** Key art uploaded in the admin; the bundled mock-up is used until there is one. */
  coverUrl?: string | null;
}

export interface Membership {
  active: boolean;
  renewsOn?: string | null;
}

/* ---------- The Cinara Share (actor pay) ---------- */

/** One show's line on an actor's statement. Money in cents. */
export interface ShowShare {
  showId: ShowId;
  showTitle: string;
  role: string;
  points: number;
  /** All the points on the show, every role together. */
  totalPoints: number;
  minutesWatched: number;
  /** Members who watched the show this period. */
  members: number;
  /** The show's revenue this period, after only card fees, refunds and tax. */
  revenueCents: number;
  /** The show's revenue in all earlier periods together. */
  earnedBeforeCents: number;
  /** The production budget written in the contract; the pool rises to 60% once revenue reaches it. */
  budgetCents: number;
  /** The server's figures (they include cents carried from last quarter). Used when present. */
  poolCents?: number;
  shareCents?: number;
}

export interface GiftShareLine {
  count: number;
  grossCents: number;
  cardFeesCents: number;
  /** The server's 90% figure, when present. */
  shareCents?: number;
}

export interface ShareStatement {
  /** e.g. "2026-Q3" */
  quarter: string;
  shows: ShowShare[];
  gifts: GiftShareLine;
  /** open = the quarter is still running; due = ended, not paid yet; paid = paid. */
  status: 'open' | 'due' | 'paid';
  paidOn?: string | null;
}

export interface ActorEarnings {
  /** The quarter in progress, to date. */
  current: ShareStatement;
  /** Earlier quarters, newest first. */
  past: ShareStatement[];
}
