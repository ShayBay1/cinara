import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button, T } from '@/components/ui';
import { canOfferBackstage, formatPrice } from '@/lib/billing';
import { colors, fonts, radius } from '@/theme/tokens';

import { PASS_PRICES, type ActorProfile } from './api';
import { useMyPass } from './hooks';
import { nameOf } from './ui';

/**
 * Opens the sign-up sheet. Backstage is one pass for every actor; messages are an add-on for one
 * actor at a time (mode "messages" needs that actor's handle).
 */
export function openJoin(opts: { handle?: string; mode?: 'backstage' | 'messages' } = {}) {
  router.push({
    pathname: '/backstage',
    params: { ...(opts.handle ? { handle: opts.handle } : {}), ...(opts.mode === 'messages' ? { mode: 'messages' } : {}) },
  });
}

/**
 * The Backstage sign-up button, placed wherever a fan meets something locked. Hidden once they have
 * the pass, and in the native apps unless the external purchase link is switched on.
 */
export function JoinBackstage({
  handle,
  variant = 'button',
  label,
  style,
}: {
  handle?: string;
  variant?: 'button' | 'pill' | 'outline' | 'dark';
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pass = useMyPass();
  if (!canOfferBackstage || pass.data?.active) return null;
  const text = label ?? `Join Backstage · ${formatPrice(PASS_PRICES.creators)}/mo`;
  const go = () => openJoin({ handle });
  if (variant === 'pill')
    return (
      <Pressable onPress={go} accessibilityRole="button" accessibilityLabel="Join Backstage" style={[styles.pill, style]} hitSlop={6}>
        <Icon name="lock" size={12} color={colors.goldInk} />
        <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 12.5, color: colors.goldInk }}>{label ?? 'Backstage'}</T>
      </Pressable>
    );
  return (
    <Button
      compact={variant === 'outline'}
      kind={variant === 'outline' ? 'outline' : variant === 'dark' ? 'dark' : 'primary'}
      label={text}
      onPress={go}
      style={style}
    />
  );
}

/**
 * Messages with one actor: its own card in that actor's Backstage, separate from the pass.
 * Shown only when the actor takes messages and the fan can't message them yet.
 */
export function MessagesCard({ actor }: { actor: ActorProfile }) {
  if (!actor.verified || !actor.dmsOpen || actor.canMessage || actor.isMe) return null;
  const name = nameOf(actor);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.icon}>
          <Icon name="send" size={18} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{`Message ${name} directly`}</T>
          <T variant="caption">{`Your own conversation with ${name}. Everything goes to them (after fees).`}</T>
        </View>
      </View>
      {canOfferBackstage ? (
        <Button
          compact
          kind="outline"
          label={actor.trialDays ? `Try ${actor.trialDays} days free · then ${formatPrice(actor.dmPriceCents)}/mo` : `Add messages · ${formatPrice(actor.dmPriceCents)}/mo`}
          onPress={() => openJoin({ handle: actor.handle, mode: 'messages' })}
          style={{ borderColor: colors.gold, marginTop: 10 }}
        />
      ) : (
        <T variant="caption" style={{ marginTop: 8 }}>
          {`${name} replies to fans who added messages.`}
        </T>
      )}
    </View>
  );
}

/** "You have Backstage" / "Get Backstage" row for the profile tab. */
export function BackstageStatusRow() {
  const pass = useMyPass();
  const p = pass.data;
  if (!p?.active && !canOfferBackstage) return null;
  return (
    <Pressable
      onPress={() => (p?.active ? router.push({ pathname: '/social', params: { tab: 'backstage' } }) : openJoin())}
      accessibilityRole="button"
      style={styles.row}
    >
      <View style={styles.badge}>
        <Icon name="ticket" size={18} color={colors.goldInk} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{p?.active ? 'Backstage' : 'Get Backstage'}</T>
        <T variant="caption">
          {p?.active
            ? p.renewsOn
              ? `Renews ${new Date(p.renewsOn).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : 'Active'
            : `Every actor’s exclusive posts and channels · ${formatPrice(PASS_PRICES.creators)}/mo`}
        </T>
      </View>
      <Icon name="chevron" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#5A4E36',
    backgroundColor: colors.goldInk,
  },
  badge: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14 },
  icon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
