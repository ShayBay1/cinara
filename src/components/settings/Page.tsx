import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { IconButton, T } from '@/components/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** The frame every settings page uses: back button, title, scrolling content. */
export function SettingsPage({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 18 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -10 }}>
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.text, flex: 1 }}>{title}</T>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Group({ title, children, note }: { title?: string; children: ReactNode; note?: string }) {
  return (
    <View>
      {title ? <T style={s.h2}>{title}</T> : null}
      <View style={s.card}>{children}</View>
      {note ? <T variant="caption" style={{ marginTop: 6, paddingHorizontal: 4 }}>{note}</T> : null}
    </View>
  );
}

export const Rule = () => <View style={s.rule} />;

/** A tappable row, Instagram settings style: icon, label, optional value, chevron. */
export function LinkRow({
  icon,
  label,
  value,
  hint,
  onPress,
  danger,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      {icon ? <Icon name={icon} size={20} color={danger ? colors.liveSoft : colors.text} /> : null}
      <View style={{ flex: 1 }}>
        <T style={[s.label, danger && { color: colors.liveSoft }]}>{label}</T>
        {hint ? <T variant="caption">{hint}</T> : null}
      </View>
      {value ? <T variant="caption" style={{ fontSize: 14 }}>{value}</T> : null}
      {danger ? null : <Icon name="chevron" size={16} color={colors.muted} />}
    </Pressable>
  );
}

/** One choice in a list of choices (radio). */
export function ChoiceRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      <T style={[s.label, { flex: 1 }]}>{label}</T>
      <View style={[s.radio, on && { borderColor: colors.gold }]}>{on ? <View style={s.dot} /> : null}</View>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  h2: { fontFamily: fonts.engraved, fontSize: 12, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.muted, marginBottom: 8, paddingHorizontal: 4 },
  card: { paddingHorizontal: 14, paddingVertical: 2, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.gold },
});
