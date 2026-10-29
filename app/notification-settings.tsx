import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { Group, LinkRow, Rule, SettingsPage } from '@/components/settings/Page';
import { SwitchRow, T } from '@/components/ui';
import { useMe } from '@/hooks/queries';
import { notify } from '@/lib/safety';
import { nk, PREFS, setPref, useNotificationPrefs, type PrefKey } from '@/social/notifications';
import { colors } from '@/theme/tokens';

/** Instagram-style notification settings: pause everything, or pick what you hear about. */
export default function NotificationSettingsScreen() {
  const me = useMe();
  const qc = useQueryClient();
  const prefs = useNotificationPrefs(!!me.data?.id);
  const p = prefs.data ?? {};
  const paused = !!p.pause_all;

  const toggle = (key: PrefKey, on: boolean) => {
    qc.setQueryData(nk.prefs, { ...p, [key]: on });
    void setPref(key, on).catch((e) => {
      notify(e instanceof Error ? e.message : 'That didn’t save.');
      void prefs.refetch();
    });
  };

  return (
    <SettingsPage title="Notifications">
      {prefs.isPending ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <>
          <Group>
            <SwitchRow label="Pause all" hint="Stop every notification until you turn this off." value={paused} onChange={(v) => toggle('pause_all', v)} />
          </Group>
          <Group title="Push notifications" note="Your choices apply to this account on every device.">
            {PREFS.filter((x) => me.data?.isCast || (x.key !== 'follows' && x.key !== 'gifts')).map((x, i) => (
              <View key={x.key} style={{ opacity: paused ? 0.45 : 1 }} pointerEvents={paused ? 'none' : 'auto'}>
                {i > 0 ? <Rule /> : null}
                <SwitchRow label={x.label} hint={x.hint} value={p[x.key] !== false} onChange={(v) => toggle(x.key, v)} />
              </View>
            ))}
          </Group>
          <Group note="Turn post notifications on or off for one actor with the bell on their page.">
            {Platform.OS !== 'web' ? (
              <LinkRow icon="bell" label="Phone notification settings" hint="Sounds, banners and the lock screen" onPress={() => void Linking.openSettings()} />
            ) : (
              <T variant="caption" style={{ paddingVertical: 12 }}>
                Push notifications arrive in the Cinara app on your phone.
              </T>
            )}
          </Group>
        </>
      )}
    </SettingsPage>
  );
}
