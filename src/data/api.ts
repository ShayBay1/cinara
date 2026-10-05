import type {
  ChatMessage,
  ComingSoon,
  Comment,
  CommentSort,
  Episode,
  Friend,
  FriendRequest,
  Gift,
  Membership,
  Show,
  UserSummary,
} from './types';

/**
 * Everything the app needs from a backend. Screens only talk to this
 * interface, so the sample backend and the Supabase backend are swappable.
 */
export interface SnippetsApi {
  readonly mode: 'sample' | 'live';

  // Account
  currentUser(): Promise<UserSummary | null>;
  sendSignInCode(email: string): Promise<void>;
  verifySignInCode(email: string, code: string): Promise<UserSummary>;
  signOut(): Promise<void>;
  membership(): Promise<Membership>;
  /** Uploads a square JPEG and returns its public URL. */
  uploadAvatar(localUri: string): Promise<string>;

  // Catalog
  listShows(): Promise<Show[]>;
  comingSoon(): Promise<ComingSoon | null>;
  episode(showId: string, number: number): Promise<Episode>;
  /** When the current live premiere started (ISO), or null if none is live. */
  livePremiereStart(showId: string): Promise<string | null>;

  // Comments
  listComments(showId: string, episode: number, sort: CommentSort): Promise<Comment[]>;
  postComment(input: { showId: string; episode: number; body: string; atSec?: number | null }): Promise<Comment>;
  setCommentLike(commentId: string, liked: boolean): Promise<void>;
  reportComment(commentId: string, reason: string): Promise<void>;

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
}
