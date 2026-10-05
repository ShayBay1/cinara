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

  toggleMyList: (showId: string) => void;
  setReminder: (showId: string, notificationId: string | null) => void;
  saveProgress: (showId: string, p: Progress) => void;
  setShareActivity: (v: boolean) => void;
  setFriendsFirst: (v: boolean) => void;
  setChatHidden: (v: boolean) => void;
  setAvatarUrl: (url: string | null) => void;
  setNotifyComingSoon: (v: boolean) => void;
  setFollowTurn: (v: boolean) => void;
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
      saveProgress: (showId, p) => set((s) => ({ progress: { ...s.progress, [showId]: p } })),
      setShareActivity: (v) => set({ shareActivity: v }),
      setFriendsFirst: (v) => set({ friendsFirst: v }),
      setChatHidden: (v) => set({ chatHidden: v }),
      setAvatarUrl: (url) => set({ avatarUrl: url }),
      setNotifyComingSoon: (v) => set({ notifyComingSoon: v }),
      setFollowTurn: (v) => set({ followTurn: v }),
    }),
    {
      name: 'snippets-app',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
