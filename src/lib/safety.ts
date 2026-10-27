import { Alert, Platform } from 'react-native';

import { api, type UserSummary } from '@/data';

/**
 * One menu for every piece of other people's content (comments, live chat):
 * report it, block the person, or delete it if it's yours.
 * Apple requires both reporting and blocking wherever users can post.
 */
export type SafetyTarget = {
  kind: 'comment' | 'chat';
  id: string;
  author: UserSummary;
  /** True when the signed-in viewer wrote it. */
  mine: boolean;
};

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export function notify(text: string) {
  if (Platform.OS === 'web') globalThis.alert?.(text);
  else Alert.alert(text);
}

const ask = (title: string, body: string, ok: string, destructive = false): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(Boolean(globalThis.confirm?.(`${title}\n\n${body}`)));
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });

export async function reportContent(t: SafetyTarget) {
  try {
    if (t.kind === 'comment') await api.reportComment(t.id, 'user_report');
    else await api.reportChat(t.id, 'user_report');
    notify('Thanks for telling us. Our team will review it.');
  } catch (e) {
    notify(message(e));
  }
}

export async function blockPerson(user: UserSummary, onChanged?: () => void) {
  const yes = await ask(
    `Block ${user.handle}?`,
    'You won’t see their comments or live chat, and they’ll be removed from your friends. They aren’t told.',
    'Block',
    true,
  );
  if (!yes) return;
  try {
    await api.blockUser(user.id);
    onChanged?.();
    notify(`${user.handle} is blocked. You can unblock them in Settings.`);
  } catch (e) {
    notify(message(e));
  }
}

export function openSafetyMenu(t: SafetyTarget, cb: { onChanged?: () => void; onDelete?: () => Promise<void> } = {}) {
  const label = t.kind === 'comment' ? 'comment' : 'message';
  if (t.mine) {
    if (!cb.onDelete) return;
    void ask(`Delete your ${label}?`, 'This can’t be undone.', 'Delete', true).then(async (yes) => {
      if (!yes) return;
      try {
        await cb.onDelete?.();
      } catch (e) {
        notify(message(e));
      }
    });
    return;
  }
  if (Platform.OS === 'web') {
    void (async () => {
      if (await ask(`Report this ${label}?`, 'Our team will review it.', 'Report')) await reportContent(t);
      if (await ask(`Block ${t.author.handle} too?`, 'You won’t see their comments or chat.', 'Block'))
        await blockPerson(t.author, cb.onChanged);
    })();
    return;
  }
  Alert.alert(t.author.handle, undefined, [
    { text: `Report ${label}`, onPress: () => void reportContent(t) },
    { text: `Block ${t.author.handle}`, style: 'destructive', onPress: () => void blockPerson(t.author, cb.onChanged) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
