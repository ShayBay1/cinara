import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';

import { T } from './ui';

/** Scrolling tab screen with the standard gutter, safe areas and pull-to-refresh. */
export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
}: {
  title?: ReactNode;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120, paddingHorizontal: 16 }}
      refreshControl={onRefresh ? <RefreshControl tintColor={colors.gold} refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <View style={{ flexShrink: 1 }}>
            {typeof title === 'string' ? (
              <T variant="display" style={{ fontSize: 30, lineHeight: 34, textTransform: 'none' }} >
                {title}
              </T>
            ) : (
              title
            )}
            {subtitle ? <T variant="serifItalic" style={{ color: colors.muted, fontSize: 15 }}>{subtitle}</T> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}
