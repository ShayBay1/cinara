import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { T } from '@/components/ui';
import { colors, fonts } from '@/theme/tokens';

/**
 * The live-chat keyboard for when the phone is sideways. The app stays locked upright, so the iPhone's
 * own keyboard would come up the wrong way (or make the whole screen spin). This one is drawn inside the
 * turned picture, so it is simply there, the right way up, with no screen rotation at all.
 *
 * Upright, live chat uses the normal phone keyboard (autocorrect, emoji, dictation and all).
 */
type Layout = 'letters' | 'numbers';

const LETTERS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const NUMBERS = ['1234567890', '-/:;()$&@"', '.,?!\''];
const QUICK = ['😂', '😭', '🔥', '😱', '❤️', '👀'];

export function SideKeyboard({
  value,
  onChange,
  onSend,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState<Layout>('letters');
  const [shift, setShift] = useState(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  // Capitalize the start of a message, like the phone keyboard does.
  useEffect(() => {
    if (value.length === 0) setShift(true);
  }, [value.length]);
  useEffect(() => () => stopRepeat(), []);

  const tick = () => void Haptics.selectionAsync();
  const type = (ch: string) => {
    tick();
    const next = valueRef.current + (shift && layout === 'letters' ? ch.toUpperCase() : ch);
    if (next.length > 200) return;
    onChange(next);
    if (shift) setShift(false);
  };
  const backspace = () => onChange(Array.from(valueRef.current).slice(0, -1).join(''));
  const startRepeat = () => {
    stopRepeat();
    repeat.current = setInterval(backspace, 90);
  };
  function stopRepeat() {
    if (repeat.current) clearInterval(repeat.current);
    repeat.current = null;
  }

  const rows = layout === 'letters' ? LETTERS : NUMBERS;

  return (
    <View style={styles.board} accessibilityLabel="Chat keyboard">
      <View style={styles.quick}>
        {QUICK.map((e) => (
          <Key key={e} label={e} onPress={() => type(e)} style={styles.emoji} text={{ fontSize: 18 }} />
        ))}
        <View style={{ flex: 1 }} />
        <Key label="Done" onPress={onClose} style={styles.done} text={{ fontSize: 12 }} />
      </View>
      {rows.map((row, r) => (
        <View key={row} style={styles.row}>
          {r === 2 ? (
            layout === 'letters' ? (
              <Key label={shift ? '⇧' : '⇪'} a11y={shift ? 'Shift on' : 'Shift'} onPress={() => setShift((v) => !v)} style={[styles.wide, shift && styles.on]} />
            ) : (
              <View style={styles.wide} />
            )
          ) : null}
          {Array.from(row).map((ch) => (
            <Key key={ch} label={shift && layout === 'letters' ? ch.toUpperCase() : ch} onPress={() => type(ch)} />
          ))}
          {r === 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete"
              onPress={() => {
                tick();
                backspace();
              }}
              onLongPress={startRepeat}
              onPressOut={stopRepeat}
              delayLongPress={350}
              style={({ pressed }) => [styles.key, styles.wide, pressed && styles.pressed]}
            >
              <T style={styles.keyText}>⌫</T>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={styles.row}>
        <Key label={layout === 'letters' ? '123' : 'ABC'} onPress={() => setLayout((l) => (l === 'letters' ? 'numbers' : 'letters'))} style={styles.wide} text={{ fontSize: 13 }} />
        <Key label="space" a11y="Space" onPress={() => type(' ')} style={{ flex: 5 }} text={{ fontSize: 13, color: colors.textSoft }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={() => {
            tick();
            onSend();
          }}
          style={({ pressed }) => [styles.key, styles.send, { backgroundColor: value.trim() ? colors.gold : 'rgba(232,194,122,0.35)' }, pressed && { opacity: 0.8 }]}
        >
          <Icon name="send" size={16} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  style,
  text,
  a11y,
}: {
  label: string;
  onPress: () => void;
  style?: object | (object | false)[];
  text?: object;
  a11y?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={({ pressed }) => [styles.key, style, pressed && styles.pressed]}>
      <T style={[styles.keyText, text]}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8, gap: 6 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', gap: 5, justifyContent: 'center' },
  key: { flex: 1, height: 34, maxWidth: 64, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,241,234,0.14)' },
  keyText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  pressed: { backgroundColor: 'rgba(244,241,234,0.32)' },
  wide: { flex: 1.5, maxWidth: 96 },
  on: { backgroundColor: 'rgba(244,241,234,0.4)' },
  emoji: { flex: 0, width: 40, height: 32, backgroundColor: 'transparent' },
  done: { flex: 0, width: 64, height: 30, backgroundColor: 'rgba(244,241,234,0.1)' },
  send: { flex: 1.5, maxWidth: 96 },
});
