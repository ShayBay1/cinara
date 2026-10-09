import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, HIT, radius, tintFor } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';

/* ---------- Text ---------- */

type TextVariant =
  'display' | 'serif' | 'serifItalic' | 'title' | 'body' | 'label' | 'eyebrow' | 'caption';

export function T({
  variant = 'body',
  style,
  children,
  ...rest
}: Omit<TextProps, 'style'> & {
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}) {
  const flat = StyleSheet.flatten([textStyles[variant], style]) as TextStyle;
  return (
    <Text style={[flat, displayLineFix(flat)]} maxFontSizeMultiplier={1.4} {...rest}>
      {children}
    </Text>
  );
}

/**
 * Display capitals (Cinzel) have tall letters. If the line height is close
 * to the font size, iOS clips the tops of the letters and numbers, so every
 * display-font text gets at least 1.25x line height.
 */
function displayLineFix(s: TextStyle): TextStyle | null {
  if (s.fontFamily !== fonts.display || !s.fontSize) return null;
  return {
    lineHeight: Math.max(s.lineHeight ?? 0, Math.ceil(s.fontSize * 1.25)),
    includeFontPadding: false,
  };
}

const textStyles = StyleSheet.create({
  display: {
    fontFamily: fonts.display,
    color: colors.goldLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 34,
    lineHeight: 42,
  },
  serif: { fontFamily: fonts.serif, color: colors.text, fontSize: 28, lineHeight: 32 },
  serifItalic: { fontFamily: fonts.serifItalic, color: colors.text, fontSize: 18, lineHeight: 23 },
  title: { fontFamily: fonts.bodyHeavy, color: colors.text, fontSize: 18 },
  body: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.bodyHeavy, color: colors.text, fontSize: 14 },
  eyebrow: {
    fontFamily: fonts.engraved,
    color: colors.gold,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 17 },
});

/* ---------- Buttons ---------- */

type ButtonKind = 'primary' | 'gold' | 'outline' | 'ghost' | 'live';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({
  label,
  kind = 'primary',
  icon,
  loading,
  style,
  compact,
  disabled,
  ...rest
}: ButtonProps) {
  const fg =
    kind === 'primary' || kind === 'gold' ? colors.ink : kind === 'live' ? '#FFFFFF' : colors.text;
  // One primary style everywhere: solid gold leaf, dark text, 52 pt, pill.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      hitSlop={compact ? 6 : 0}
      style={({ pressed }) => [
        btn.base,
        compact && btn.compact,
        btn[kind],
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? (
            <Icon name={icon} size={compact ? 16 : 18} color={fg} filled={icon === 'play'} />
          ) : null}
          <Text style={[btn.text, compact && btn.textCompact, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const btn = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  compact: { minHeight: HIT - 4, borderRadius: radius.pill, paddingHorizontal: 14 },
  primary: { backgroundColor: colors.gold },
  gold: { backgroundColor: colors.gold },
  outline: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  ghost: {
    borderWidth: 1,
    borderColor: 'rgba(243,234,216,0.35)',
    backgroundColor: 'rgba(21,16,11,0.35)',
  },
  live: { backgroundColor: colors.live },
  text: { fontFamily: fonts.bodyHeavy, fontSize: 15 },
  textCompact: { fontSize: 13 },
});

export function IconButton({
  icon,
  label,
  onPress,
  size = HIT,
  color = colors.text,
  filled,
  style,
  pressed: isPressed,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
  pressed?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={isPressed === undefined ? undefined : { selected: isPressed }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: size / 2,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} color={color} filled={filled} />
    </Pressable>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({
  handle,
  url,
  size = 40,
  online,
}: {
  handle: string;
  url?: string | null;
  size?: number;
  online?: boolean;
}) {
  const initial = (handle.replace(/[^A-Za-z]/g, '').charAt(0) || '?').toUpperCase();
  return (
    <View
      accessibilityLabel={`${handle} profile picture`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tintFor(handle),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Text style={{ fontFamily: fonts.serif, color: colors.text, fontSize: size * 0.45 }}>
          {initial}
        </Text>
      )}
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.online,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
}

/* ---------- Small pieces ---------- */

export function HumanStamp({ size = 62 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Human-made. No AI."
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: 'rgba(243,234,216,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: '10deg' }],
      }}
    >
      <Text style={stamp.small}>HUMAN</Text>
      <Text style={stamp.made}>made</Text>
      <Text style={stamp.small}>NO AI</Text>
    </View>
  );
}
const stamp = StyleSheet.create({
  small: { fontFamily: fonts.engraved, fontSize: 8, letterSpacing: 1.6, color: colors.text },
  made: { fontFamily: fonts.serifItalic, fontSize: 16, lineHeight: 17, color: colors.text },
});

export function WaxSeal({ size = 60 }: { size?: number }) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.seal,
        borderWidth: 2,
        borderColor: colors.sealEdge,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: '-12deg' }],
      }}
    >
      <Text style={{ fontFamily: fonts.serifItalic, fontSize: size * 0.4, color: '#F1D9C4' }}>
        s.
      </Text>
    </View>
  );
}

export function Tag({
  label,
  color = colors.gold,
  textColor = colors.ink,
}: {
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: color,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{ fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.4, color: textColor }}
      >
        {label}
      </Text>
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 12,
        gap: 12,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <T variant="eyebrow" style={{ fontSize: 12, color: colors.text }}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" style={{ fontSize: 13 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function ProgressBar({
  fraction,
  color = colors.accent,
  height = 4,
}: {
  fraction: number;
  color?: string;
  height?: number;
}) {
  return (
    <View
      style={{ height, borderRadius: height, backgroundColor: colors.line, overflow: 'hidden' }}
    >
      <View
        style={{
          height,
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: 24, gap: 12, alignItems: 'flex-start' }}>
      <T variant="label">Something went wrong</T>
      <T variant="caption">{message}</T>
      {onRetry ? <Button label="Try again" kind="outline" compact onPress={onRetry} /> : null}
    </View>
  );
}

/* ---------- Settings switch ---------- */

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}>
        <T variant="label">{label}</T>
        <T variant="caption">{hint}</T>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.line, true: colors.gold }}
        thumbColor={colors.text}
      />
    </View>
  );
}
