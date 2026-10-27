import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Small on-device preferences and progress. Anything that must be shared or
 * trusted (membership, comments, friends) lives on the server instead.
 */
interface Progress {
  episode: number;
  positionSec: number;
  /** Episode length, so home can say how much is left. */
  durationSec?: number;
  /** When it was last saved (ms), so Continue watching shows the most recent first. */
  updatedAt?: number;
}

/** A ticket stub: kept for every premiere you were in the room for, live. */
export interface TicketStub {
  /** showId + premiere start, so one night gives one stub. */
  id: string;
  showId: string;
  showTitle: string;
  /** ISO time the premiere started. */
  at: string;
  from: number;
  to: number;
  /** Cast roles who were in the chat, if any. */
  cast: string[];
}

interface AppState {
  myList: Record<string, true>;
  /** showId -> scheduled local notification id */
  reminders: Record<string, string>;
  progress: Record<string, Progress>;
  shareActivity: boolean;
  friendsFirst: boolean;
  chatHidden: boolean;
  avatarUrl: string | null;
  notifyComingSoon: boolean;
  /** "Smooth rotation": the glide turn. Off: the classic flip (hold past 45 degrees). */
  followTurn: boolean;
  recentSearches: string[];
  stubs: TicketStub[];
  /** How many times the Feed has shown its "swipe up" peek (it stops after a few). */
  feedHintsSeen: number;

  toggleMyList: (showId: string) => void;
  setReminder: (showId: string, notificationId: string | null) => void;
  saveProgress: (showId: string, p: Progress) => void;
  setShareActivity: (v: boolean) => void;
  setFriendsFirst: (v: boolean) => void;
  setChatHidden: (v: boolean) => void;
  setAvatarUrl: (url: string | null) => void;
  setNotifyComingSoon: (v: boolean) => void;
  setFollowTurn: (v: boolean) => void;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  addStub: (stub: TicketStub) => void;
  bumpFeedHint: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      myList: {},
      reminders: {},
      progress: {},
      shareActivity: true,
      friendsFirst: true,
      chatHidden: false,
      avatarUrl: null,
      notifyComingSoon: false,
      followTurn: true,
      recentSearches: [],
      stubs: [],
      feedHintsSeen: 0,

      toggleMyList: (showId) =>
        set((s) => {
          const next = { ...s.myList };
          if (next[showId]) delete next[showId];
          else next[showId] = true;
          return { myList: next };
        }),
      setReminder: (showId, notificationId) =>
        set((s) => {
          const next = { ...s.reminders };
          if (notificationId) next[showId] = notificationId;
          else delete next[showId];
          return { reminders: next };
        }),
      saveProgress: (showId, p) =>
        set((s) => ({ progress: { ...s.progress, [showId]: { ...p, updatedAt: Date.now() } } })),
      setShareActivity: (v) => set({ shareActivity: v }),
      setFriendsFirst: (v) => set({ friendsFirst: v }),
      setChatHidden: (v) => set({ chatHidden: v }),
      setAvatarUrl: (url) => set({ avatarUrl: url }),
      setNotifyComingSoon: (v) => set({ notifyComingSoon: v }),
      setFollowTurn: (v) => set({ followTurn: v }),
      addRecentSearch: (q) =>
        set((s) => {
          const t = q.trim();
          if (!t) return {};
          return {
            recentSearches: [
              t,
              ...s.recentSearches.filter((x) => x.toLowerCase() !== t.toLowerCase()),
            ].slice(0, 8),
          };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
      addStub: (stub) =>
        set((s) => (s.stubs.some((x) => x.id === stub.id) ? {} : { stubs: [stub, ...s.stubs] })),
      bumpFeedHint: () => set((s) => ({ feedHintsSeen: s.feedHintsSeen + 1 })),
    }),
    {
      name: 'cinara-app',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
