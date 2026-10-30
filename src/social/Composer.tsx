import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { T } from '@/components/ui';
import { colors, fonts, radius } from '@/theme/tokens';

import { money } from './studio';

/** Pieces shared by the DM composer, mass messages and new posts. */

export const PRICES = [499, 999, 1999, 2999, 4999] as const;

/** Free, or a price fans pay once to unlock (photos and videos). */
export function PriceChips({ value, onChange, freeLabel = 'Free' }: { value: number | null; onChange: (v: number | null) => void; freeLabel?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {[null, ...PRICES].map((p) => {
        const on = value === p;
        return (
          <Pressable
            key={String(p)}
            onPress={() => onChange(p)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[c.chip, on && c.on]}
          >
            {p ? <Icon name="lock" size={12} color={on ? colors.goldInk : colors.muted} /> : null}
            <T style={[c.text, on && { color: colors.goldInk }]}>{p ? money(p) : freeLabel}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface Attachment {
  key: string;
  type: 'image' | 'video' | 'audio';
  /** Local file or signed link, for the thumbnail. */
  uri?: string;
  label?: string;
}

/** Thumbnails of what's about to be sent, each with a remove button. */
export function Attachments({ items, onRemove }: { items: Attachment[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {items.map((a) => (
        <View key={a.key} style={c.thumb}>
          {a.type === 'audio' ? (
            <View style={[StyleSheet.absoluteFill, c.center, { gap: 2 }]}>
              <Icon name="mic" size={20} color={colors.gold} />
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text }}>{a.label ?? 'Voice'}</T>
            </View>
          ) : a.uri ? (
            <Image source={{ uri: a.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          {a.type === 'video' ? (
            <View style={[StyleSheet.absoluteFill, c.center]}>
              <Icon name="play" size={18} color="#fff" />
            </View>
          ) : null}
          <Pressable onPress={() => onRemove(a.key)} accessibilityRole="button" accessibilityLabel="Remove" hitSlop={8} style={c.remove}>
            <Icon name="close" size={12} color="#fff" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

/** A round toolbar button (photo, vault, mic, price, disappearing). */
export function Tool({ icon, label, on, onPress, color }: { icon: Parameters<typeof Icon>[0]['name']; label: string; on?: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on }} hitSlop={4} style={[c.tool, on && c.toolOn]}>
      <Icon name={icon} size={20} color={on ? colors.goldInk : (color ?? colors.text)} filled={on && icon === 'ghost'} />
    </Pressable>
  );
}

export const c = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  on: { backgroundColor: colors.gold, borderColor: colors.gold },
  text: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text },
  thumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  center: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  tool: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: colors.gold },
});
