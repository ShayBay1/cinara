import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/data';
import { useAppStore } from '@/store/useAppStore';

/**
 * Keeps "where you left off" on the account, not just the phone: local progress is sent to the
 * server (at most every 15 s per show, right away on a new episode), and pulled back on sign-in.
 */
const lastSent: Record<string, number> = {};
let started = false;
let pulling = false;

export function startProgressSync() {
  if (started) return;
  started = true;
  useAppStore.subscribe((s, prev) => {
    if (pulling || s.progress === prev.progress) return;
    const now = Date.now();
    for (const [showId, p] of Object.entries(s.progress)) {
      const before = prev.progress[showId];
      if (before === p) continue;
      const newEpisode = before?.episode !== p.episode;
      if (!newEpisode && now - (lastSent[showId] ?? 0) < 15_000) continue;
      lastSent[showId] = now;
      void api.saveProgress(showId, p).catch(() => undefined);
    }
  });
}

/** Merges the account's progress into this device: the most recent save wins per show. */
export async function pullProgress() {
  const rows = await api.listProgress().catch(() => []);
  if (!rows.length) return;
  pulling = true;
  try {
    useAppStore.setState((s) => {
      const progress = { ...s.progress };
      for (const r of rows) {
        const local = progress[r.showId];
        if (!local || (local.updatedAt ?? 0) < r.updatedAt) {
          progress[r.showId] = { episode: r.episode, positionSec: r.positionSec, durationSec: r.durationSec, updatedAt: r.updatedAt };
        }
      }
      return { progress };
    });
  } finally {
    pulling = false;
  }
}

/**
 * Registers this phone for drop alerts. Returns false when push isn't available
 * (web, simulator, no permission, Expo Go without a project id) so callers can fall back.
 */
export async function registerForPush(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Platform.OS);
    return true;
  } catch {
    return false;
  }
}
