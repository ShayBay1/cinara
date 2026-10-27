import type {
  ChatMessage,
  ComingSoon,
  Comment,
  CommentSort,
  Episode,
  Friend,
  FriendRequest,
  Gift,
  ActorEarnings,
  Membership,
  Show,
  UserSummary,
} from './types';

/**
 * Everything the app needs from a backend. Screens only talk to this
 * interface, so the sample backend and the Supabase backend are swappable.
 */
export interface PlatformApi {
  readonly mode: 'sample' | 'live';

  // Account
  currentUser(): Promise<UserSummary | null>;
  sendSignInCode(email: string): Promise<void>;
  verifySignInCode(email: string, code: string): Promise<UserSummary>;
  signOut(): Promise<void>;
  /** Deletes the signed-in account for good (cancels any membership first), then signs out. */
  deleteAccount(): Promise<void>;
  membership(): Promise<Membership>;
  /** Saves the viewer's birth year (gifts are 18+). */
  setBirthYear(year: number): Promise<void>;
  /** Changes the signed-in user's username (3–24 of a-z, 0-9, dot, underscore). */
  setHandle(handle: string): Promise<void>;
  /** Uploads a square JPEG for review and returns a private link you can preview it with. */
  uploadAvatar(localUri: string): Promise<string>;
  /** Removes your profile photo (and any photo waiting for review). */
  removeAvatar(): Promise<void>;

  // Catalog
  listShows(): Promise<Show[]>;
  comingSoon(): Promise<ComingSoon | null>;
  episode(showId: string, number: number): Promise<Episode>;
  /** When the current live premiere started (ISO), or null if none is live. */
  livePremiereStart(showId: string): Promise<string | null>;

  // Comments
  listComments(showId: string, episode: number, sort: CommentSort): Promise<Comment[]>;
  /** Posts a comment, or a reply when parentId is set (replies always join the top comment's thread). */
  postComment(input: { showId: string; episode: number; body: string; atSec?: number | null; parentId?: string | null }): Promise<Comment>;
  /** The replies under one comment, oldest first. */
  listReplies(commentId: string): Promise<Comment[]>;
  setCommentLike(commentId: string, liked: boolean): Promise<void>;
  reportComment(commentId: string, reason: string): Promise<void>;
  /** Deletes one of your own comments. */
  deleteComment(commentId: string): Promise<void>;

  // Safety: blocking and reporting people and chat messages
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  listBlocked(): Promise<UserSummary[]>;
  reportUser(userId: string, reason: string): Promise<void>;
  reportChat(messageId: string, reason: string): Promise<void>;

  // Friends
  listFriends(): Promise<Friend[]>;
  listFriendRequests(): Promise<FriendRequest[]>;
  sendFriendRequest(handle: string): Promise<void>;
  respondToFriendRequest(requestId: string, accept: boolean): Promise<void>;
  setActivitySharing(enabled: boolean): Promise<void>;

  // Live premiere chat
  gifts(): Promise<Gift[]>;
  subscribeToChat(showId: string, onMessage: (m: ChatMessage) => void): () => void;
  sendChat(showId: string, body: string): Promise<void>;
  /** Web only: returns a Stripe Checkout URL for a gift. Never called in native apps. */
  createGiftCheckout(input: { showId: string; giftId: string; to: string }): Promise<string>;
  /** Web only: returns a Stripe Checkout URL for the membership. */
  createMembershipCheckout(): Promise<string>;

  // Viewership: watched seconds for the Cinara Share. Returns the seconds the server credited.
  recordWatch(input: {
    sessionId: string;
    showId: string;
    episode: number;
    seq: number;
    positionSec: number;
    playingSec: number;
  }): Promise<number>;

  // Across devices
  /** Saves where you are in a show, so another device can resume there. */
  saveProgress(showId: string, p: { episode: number; positionSec: number; durationSec?: number }): Promise<void>;
  /** Everything you've started, newest first (signed-in only). */
  listProgress(): Promise<Array<{ showId: string; episode: number; positionSec: number; durationSec?: number; updatedAt: number }>>;
  /** Tells friends what you're watching right now (they see it only if you share activity). */
  setWatching(input: { showId: string; episode: number; watchingNow: boolean; caughtUp: boolean }): Promise<void>;
  /** Drop alerts by push: follow a show and register this phone. */
  setFollow(showId: string, on: boolean): Promise<void>;
  registerPushToken(token: string, platform: string): Promise<void>;

  // Actor pay
  /** The signed-in actor's Cinara Share statements, or null if they aren't cast on any show. */
  earnings(): Promise<ActorEarnings | null>;
}
