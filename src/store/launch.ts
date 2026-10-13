import { create } from 'zustand';

/**
 * Where the app is in its opening, so screens can make an entrance instead of just appearing.
 * intro: the painted opening is playing. arriving: its warm light is fading off the Feed and the
 * first show is "developing". done: normal use.
 */
export type LaunchPhase = 'intro' | 'arriving' | 'done';

export const useLaunch = create<{ phase: LaunchPhase; setPhase: (p: LaunchPhase) => void }>((set) => ({
  phase: 'intro',
  setPhase: (phase) => set({ phase }),
}));
