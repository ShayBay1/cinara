import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Time management, like TikTok's screen time tools: a daily limit, break reminders and a sleep
 * reminder, plus how long you've had Cinara open each day. All of it stays on this phone.
 */
interface Wellbeing {
  /** Minutes per day before a reminder; 0 = off. */
  dailyLimit: number;
  /** Remind me to take a break every N minutes of continuous use; 0 = off. */
  breakEvery: number;
  /** Sleep reminder time "HH:MM", or '' for off. */
  sleepAt: string;
  /** Seconds the app was open, by local date (YYYY-MM-DD); last 30 days kept. */
  usage: Record<string, number>;
  setDailyLimit: (m: number) => void;
  setBreakEvery: (m: number) => void;
  setSleepAt: (t: string) => void;
  addUsage: (day: string, sec: number) => void;
}

export const useWellbeing = create<Wellbeing>()(
  persist(
    (set) => ({
      dailyLimit: 0,
      breakEvery: 0,
      sleepAt: '',
      usage: {},
      setDailyLimit: (dailyLimit) => set({ dailyLimit }),
      setBreakEvery: (breakEvery) => set({ breakEvery }),
      setSleepAt: (sleepAt) => set({ sleepAt }),
      addUsage: (day, sec) =>
        set((st) => {
          const usage = { ...st.usage, [day]: (st.usage[day] ?? 0) + sec };
          const keep = Object.keys(usage).sort().slice(-30);
          return { usage: Object.fromEntries(keep.map((k) => [k, usage[k]!])) };
        }),
    }),
    { name: 'cinara-wellbeing', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/** Counts time with the app open and shows the reminders. Mount once (root layout). */
export function useTimeManagement() {
  const session = useRef(0);
  const shown = useRef<{ limitDay?: string; sleepDay?: string; lastBreakAt: number }>({ lastBreakAt: 0 });
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !active) session.current = 0;
      active = s === 'active';
    });
    const ask = (title: string, body: string) => Alert.alert(title, body, [{ text: 'OK' }]);
    const id = setInterval(() => {
      if (!active) return;
      const st = useWellbeing.getState();
      const day = today();
      st.addUsage(day, 30);
      session.current += 30;
      const used = (st.usage[day] ?? 0) + 30;
      if (st.dailyLimit && used >= st.dailyLimit * 60 && shown.current.limitDay !== day) {
        shown.current.limitDay = day;
        ask('You’ve reached your daily limit', `You set ${minutesLabel(st.dailyLimit)} a day for Cinara. You can change it in Settings › Time management.`);
      }
      if (st.breakEvery && session.current - shown.current.lastBreakAt >= st.breakEvery * 60) {
        shown.current.lastBreakAt = session.current;
        ask('Time for a break?', `You’ve been watching for ${minutesLabel(Math.round(session.current / 60))}. Stretch, grab some water, the next episode will wait.`);
      }
      if (st.sleepAt && shown.current.sleepDay !== day) {
        const [h, m] = st.sleepAt.split(':').map(Number);
        const now = new Date();
        if (now.getHours() * 60 + now.getMinutes() >= (h ?? 0) * 60 + (m ?? 0)) {
          shown.current.sleepDay = day;
          ask('It’s getting late', 'Your sleep reminder is on. Finish this one and get some rest.');
        }
      }
    }, 30_000);
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
}
