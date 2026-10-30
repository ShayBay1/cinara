import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme/tokens';

const FLAGS = ['unlocked', 'backstage', 'messages', 'member'] as const;

/**
 * cinaratv.com/done opens here (Universal Link) after paying in Safari.
 * Sends you to the screen you paid from, with the same flags the old cinara:// link carried.
 */
export default function DoneScreen() {
  const params = useLocalSearchParams<{ to?: string } & Partial<Record<(typeof FLAGS)[number], string>>>();
  useEffect(() => {
    let to = typeof params.to === 'string' && params.to.startsWith('/') && !params.to.startsWith('//') ? params.to : '/';
    if (to === '/done' || to.startsWith('/done?')) to = '/';
    const on = FLAGS.filter((f) => params[f] === '1');
    const extra = on.length ? `${on.map((f) => `${f}=1`).join('&')}&paid=1` : 'paid=0';
    router.replace(`${to}${to.includes('?') ? '&' : '?'}${extra}` as Href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}
