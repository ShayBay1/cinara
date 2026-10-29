import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** Period switch: 7 / 28 / 90 days, like Instagram's insights. */
export function Periods({ value, options, onChange }: { value: number; options: number[]; onChange: (d: number) => void }) {
  return (
    <View style={st.periods}>
      {options.map((d) => (
        <Pressable
          key={d}
          onPress={() => onChange(d)}
          accessibilityRole="button"
          accessibilityState={{ selected: d === value }}
          style={[st.period, d === value && st.periodOn]}
        >
          <T style={[st.periodText, d === value && { color: colors.goldInk }]}>{`${d} days`}</T>
        </Pressable>
      ))}
    </View>
  );
}

/** One number with an optional change against the period before. */
export function Stat({ label, value, delta, onPress }: { label: string; value: string; delta?: string | null; onPress?: () => void }) {
  const up = delta && (delta === 'New' || delta.startsWith('+'));
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={st.stat} accessibilityLabel={`${label}: ${value}${delta ? `, ${delta}` : ''}`}>
      <T variant="caption">{label}</T>
      <T style={st.value}>{value}</T>
      {delta ? <T style={[st.delta, { color: up ? colors.online : colors.liveSoft }]}>{delta === 'New' ? 'New' : `${delta} vs. before`}</T> : null}
    </Pressable>
  );
}

export const StatGrid = ({ children }: { children: React.ReactNode }) => <View style={st.grid}>{children}</View>;

/** A small bar chart of daily values. Today's bar is gold. */
export function Bars({ values, labels, height = 110 }: { values: number[]; labels?: string[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: values.length > 31 ? 1 : 3, height }}>
        {values.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: Math.max(2, (v / max) * height),
              borderRadius: 3,
              backgroundColor: i === values.length - 1 ? colors.gold : v ? colors.muted : colors.line,
            }}
          />
        ))}
      </View>
      {labels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {labels.map((l, i) => (
            <T key={i} variant="caption" style={{ fontSize: 11 }}>
              {l}
            </T>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const st = StyleSheet.create({
  periods: { flexDirection: 'row', gap: 8 },
  period: { paddingHorizontal: 14, minHeight: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  periodOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  periodText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 2, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  value: { fontFamily: fonts.bodyHeavy, fontSize: 24, color: colors.text },
  delta: { fontFamily: fonts.bodyBold, fontSize: 12 },
});
