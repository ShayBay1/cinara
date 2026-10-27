import type { PlatformApi } from './api';
import {
  COMING_SOON,
  FRIEND_REQUESTS,
  FRIENDS,
  GIFTS,
  SAMPLE_CHAT_LINES,
  SAMPLE_VIDEO,
  SHOWS,
  sampleComments,
  sampleEarnings,
} from './sample';
import type { ChatMessage, Comment, CommentSort, Friend, FriendRequest, UserSummary } from './types';

/** In-memory backend with sample content. Used when Supabase isn't configured. */
export function createSampleApi(): PlatformApi {
  const me: UserSummary = { id: 'me', handle: 'you' };
  let avatarUrl: string | null = null;
  const comments = new Map<string, Comment[]>();
  let friends: Friend[] = [...FRIENDS];
  let requests: FriendRequest[] = [...FRIEND_REQUESTS];
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  const key = (showId: string, ep: number) => `${showId}:${ep}`;

  const getComments = (showId: string, ep: number) => {
    const k = key(showId, ep);
    if (!comments.has(k)) comments.set(k, sampleComments(showId, ep));
    return comments.get(k)!;
  };

  return {
    mode: 'sample',

    async currentUser() {
      return { ...me, avatarUrl };
    },
    async sendSignInCode() {
      await wait();
    },
    async verifySignInCode() {
      await wait();
      return { ...me, avatarUrl };
    },
    async signOut() {
      await wait();
    },
    async deleteAccount() {
      await wait();
    },
    async membership() {
      return { active: false };
    },
    async uploadAvatar(localUri) {
      await wait(300);
      avatarUrl = localUri;
      return localUri;
    },
    async removeAvatar() {
      await wait();
      avatarUrl = null;
    },

    async listShows() {
      await wait();
      return SHOWS;
    },
    async comingSoon() {
      return COMING_SOON;
    },
    async episode(showId, number) {
      const titles = SHOWS.find((s) => s.id === showId)?.episodeTitles ?? [];
      return { showId, number, title: titles[number - 1] ?? `Episode ${number}`, videoUrl: SAMPLE_VIDEO, durationSec: 90 };
    },
    async livePremiereStart() {
      // Sample: a premiere that began 20 seconds ago.
      return new Date(Date.now() - 20_000).toISOString();
    },

    async listComments(showId, episode, sort: CommentSort) {
      await wait();
      const all = getComments(showId, episode);
      const list = all
        .filter((c) => !c.parentId)
        .map((c) => ({ ...c, replyCount: all.filter((r) => r.parentId === c.id).length }));
      if (sort === 'friends') return list.filter((c) => c.isFriend || c.author.id === me.id);
      if (sort === 'newest') return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return list.sort((a, b) => b.likes - a.likes);
    },
    async listReplies(commentId) {
      await wait();
      for (const list of comments.values()) {
        const replies = list.filter((c) => c.parentId === commentId);
        if (replies.length) return [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return [];
    },
    async postComment({ showId, episode, body, atSec, parentId }) {
      await wait();
      const c: Comment = {
        id: `mine-${Date.now()}`,
        showId,
        episode,
        author: { ...me, avatarUrl },
        body,
        atSec: atSec ?? null,
        likes: 0,
        likedByMe: false,
        isFriend: false,
        createdAt: new Date().toISOString(),
        parentId: parentId ?? null,
      };
      getComments(showId, episode).unshift(c);
      return c;
    },
    async setCommentLike(commentId, liked) {
      for (const list of comments.values()) {
        const c = list.find((x) => x.id === commentId);
        if (c && c.likedByMe !== liked) {
          c.likedByMe = liked;
          c.likes += liked ? 1 : -1;
        }
      }
    },
    async reportComment() {
      await wait();
    },
    async deleteComment() {
      await wait();
    },
    async setHandle() {
      await wait();
    },
    async setBirthYear() {
      await wait();
    },
    async saveProgress() {},
    async listProgress() {
      return [];
    },
    async setWatching() {},
    async setFollow() {},
    async registerPushToken() {},
    async blockUser() {
      await wait();
    },
    async unblockUser() {
      await wait();
    },
    async listBlocked() {
      await wait();
      return [];
    },
    async reportUser() {
      await wait();
    },
    async reportChat() {
      await wait();
    },

    async listFriends() {
      await wait();
      return friends;
    },
    async listFriendRequests() {
      await wait();
      return requests;
    },
    async sendFriendRequest() {
      await wait();
    },
    async respondToFriendRequest(requestId, accept) {
      await wait();
      const req = requests.find((r) => r.id === requestId);
      requests = requests.filter((r) => r.id !== requestId);
      if (accept && req) friends = [{ ...req.from, watching: null }, ...friends];
    },
    async setActivitySharing() {
      await wait();
    },

    async gifts() {
      return GIFTS;
    },
    subscribeToChat(_showId, onMessage) {
      let i = 0;
      const timer = setInterval(() => {
        const line = SAMPLE_CHAT_LINES[i % SAMPLE_CHAT_LINES.length]!;
        i += 1;
        const msg: ChatMessage =
          i % 7 === 0
            ? { id: `g${i}`, kind: 'gift', author: { id: `u${i}`, handle: line.handle }, giftId: 'rose', to: 'cast', createdAt: new Date().toISOString() }
            : { id: `m${i}`, kind: 'text', author: { id: `u${i}`, handle: line.handle, isCast: line.isCast }, body: line.body, createdAt: new Date().toISOString() };
        onMessage(msg);
      }, 2200);
      return () => clearInterval(timer);
    },
    async sendChat() {
      await wait(50);
    },
    async createGiftCheckout() {
      return `${process.env.EXPO_PUBLIC_WEB_URL ?? 'https://cinaratv.com'}/checkout/demo-gift`;
    },
    async createMembershipCheckout() {
      return `${process.env.EXPO_PUBLIC_WEB_URL ?? 'https://cinaratv.com'}/checkout/demo-membership`;
    },

    async recordWatch() {
      return 0;
    },

    async earnings() {
      await wait();
      return sampleEarnings(new Date());
    },
  };
}
