import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

/** The admin's small set of parts: dark, plain, built for a desktop browser. */

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page}>
      <View style={s.pageHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.h1}>{title}</Text>
          {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={s.row}>{actions}</View> : null}
      </View>
      <View style={{ gap: 20 }}>{children}</View>
    </ScrollView>
  );
}

export function Card({ title, right, children, style }: { title?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.card, style]}>
      {title || right ? (
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
          {title ? <Text style={s.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={[s.card, { flex: 1, minWidth: 180, gap: 6 }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.stat}>{value}</Text>
      {hint ? <Text style={s.small}>{hint}</Text> : null}
    </View>
  );
}

export function Btn({
  label,
  onPress,
  kind = 'plain',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'plain' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ hovered, pressed }) => [
        s.btn,
        kind === 'primary' && { backgroundColor: colors.gold, borderColor: colors.gold },
        kind === 'danger' && { borderColor: colors.live },
        (hovered || pressed) && !off && { opacity: 0.85 },
        off && { opacity: 0.45 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={kind === 'primary' ? colors.goldInk : colors.text} /> : null}
      <Text style={[s.btnText, kind === 'primary' && { color: colors.goldInk }, kind === 'danger' && { color: colors.liveSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  width,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  width?: number;
  hint?: string;
}) {
  return (
    <View style={[{ gap: 6 }, width ? { width } : { flex: 1, minWidth: 200 }]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        multiline={multiline}
        style={[s.input, multiline && { minHeight: 84, textAlignVertical: 'top', paddingTop: 10 }]}
      />
      {hint ? <Text style={s.small}>{hint}</Text> : null}
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[s.row, { gap: 10 }]}>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.gold, false: colors.line }}
        thumbColor={colors.text}
        {...({ activeThumbColor: colors.goldInk } as object)}
      />
      <Text style={s.body}>{label}</Text>
    </View>
  );
}

export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'good' | 'warn' | 'muted' | 'gold' | 'live' }) {
  const c = { good: colors.online, warn: colors.goldLight, muted: colors.muted, gold: colors.gold, live: colors.liveSoft }[tone];
  return (
    <View style={[s.pill, { borderColor: c }]}>
      <Text style={[s.pillText, { color: c }]}>{text}</Text>
    </View>
  );
}

/** A table row: cells share the width by their flex numbers. */
export function Tr({ cells, flex, head, onPress }: { cells: ReactNode[]; flex: number[]; head?: boolean; onPress?: () => void }) {
  const body = (
    <View style={[s.tr, head && s.th]}>
      {cells.map((c, i) => (
        <View key={i} style={{ flex: flex[i] ?? 1, justifyContent: 'center', alignItems: 'flex-start', paddingRight: 12 }}>
          {typeof c === 'string' || typeof c === 'number' ? <Text style={head ? s.label : s.body}>{c}</Text> : c}
        </View>
      ))}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ hovered }) => hovered && { backgroundColor: colors.surfaceRaised }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <Text style={[s.body, { color: colors.liveSoft }]}>{error instanceof Error ? error.message : String(error)}</Text>;
}

export function Loading() {
  return <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />;
}

/** Minutes per day as small bars. */
export function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 }}>
        {data.map((d) => (
          <View
            key={d.label}
            accessibilityLabel={`${d.label}: ${d.value}`}
            style={{ flex: 1, height: Math.max(2, (d.value / max) * 120), backgroundColor: d.value ? colors.gold : colors.line, borderRadius: 2 }}
          />
        ))}
      </View>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.small}>{data[0]?.label}</Text>
        <Text style={s.small}>{data[data.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

export const T = {
  body: (t: ReactNode) => <Text style={s.body}>{t}</Text>,
  small: (t: ReactNode) => <Text style={s.small}>{t}</Text>,
};

export const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 80, maxWidth: 1240, width: '100%' },
  pageHead: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 24, gap: 16 },
  h1: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 1, color: colors.goldLight },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 20 },
  cardTitle: { fontFamily: fonts.engraved, fontSize: 13, letterSpacing: 2, color: colors.text, textTransform: 'uppercase' },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.4, color: colors.muted, textTransform: 'uppercase' },
  stat: { fontFamily: fonts.serifItalic, fontSize: 36, lineHeight: 40, color: colors.gold },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  input: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ink,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingHorizontal: 10,
  },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.4 },
  tr: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: 'center' },
  th: { paddingVertical: 8 },
});
