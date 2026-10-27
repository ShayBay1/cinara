import { useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { T } from '@/components/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** Set by the query cache: true while the last network read failed and nothing has worked since. */
export const useConnection = create<{ down: boolean; setDown: (v: boolean) => void }>((set) => ({
  down: false,
  setDown: (down) => set({ down }),
}));

/**
 * One app-wide notice when Cinara can't be reached (offline, or the server is down), so no screen
 * just sits empty. Tapping it retries everything that failed.
 */
export function ConnectionBanner() {
  const down = useConnection((s) => s.down);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  if (!down) return null;
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Can't reach Cinara. Tap to try again."
        onPress={() => {
          useConnection.getState().setDown(false);
          void qc.refetchQueries({ type: 'active' });
        }}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
      >
        <T style={styles.text}>Can’t reach Cinara. Check your connection · Tap to retry</T>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000 },
  pill: {
    backgroundColor: '#2A1712',
    borderColor: colors.liveSoft,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, textAlign: 'center' },
});
