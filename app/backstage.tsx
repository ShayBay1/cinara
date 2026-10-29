import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { backstageUrl, canOfferBackstage, canSellHere, formatPrice, messagesUrl } from '@/lib/billing';
import { PASS_PRICES } from '@/social/api';
import { startBackstage, startMessages } from '@/social/checkout';
import { useActor, useMyPass } from '@/social/hooks';
import { CreatorRing, nameOf } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

const BACKSTAGE_PERKS = [
  'Every actor’s exclusive posts, photos and videos',
  'Every actor’s Backstage channel: updates, polls, replies',
  'Your money goes to the actors you actually watch',
];

/**
 * The sign-up sheet every button opens. Two separate things:
 *  - Backstage: one pass for every actor's exclusive posts and channels.
 *  - Messages with one actor: an add-on on that actor's Backstage, at their own price.
 * The web build checks out directly; the phone apps open cinaratv.com in Safari.
 */
export default function JoinScreen() {
  const params = useLocalSearchParams<{ handle?: string; mode?: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMe();
  const pass = useMyPass();
  const actor = useActor(params.handle ?? '');
  const a = params.handle ? actor.data : null;
  const messages = params.mode === 'messages' && !!a;
  const [busy, setBusy] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/social', params: { tab: 'backstage' } }));
  const price = formatPrice(messages && a ? a.dmPriceCents : PASS_PRICES.creators);

  const go = async () => {
    if (!me.data?.id) {
      router.push('/sign-in');
      return;
    }
    if (canSellHere) {
      setBusy(true);
      if (messages && a) await startMessages(a.id, `/actor/${a.handle}`);
      else await startBackstage('creators', a && !a.demo ? `/actor/${a.handle}` : '/social?tab=backstage', qc);
      setBusy(false);
      return;
    }
    // Phone apps: Apple requires these to open in Safari, not inside the app.
    // Sample creators only exist in the app, so send those to the general Backstage page.
    const real = a && !a.demo ? a : null;
    await Linking.openURL(messages && real ? messagesUrl(real.handle) : backstageUrl(real?.handle));
  };

  const done = messages ? !!a?.canMessage : !!pass.data?.active;
  if (done)
    return (
      <View style={[styles.fill, { paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 16 }]}>
        <IconButton icon="close" label="Close" onPress={close} />
        <T style={styles.title}>{messages && a ? `You can message ${nameOf(a)}.` : 'You’re Backstage.'}</T>
        <Button
          label={messages && a ? `Open ${nameOf(a)}’s page` : 'Go Backstage'}
          onPress={() =>
            messages && a
              ? router.replace({ pathname: '/actor/[handle]', params: { handle: a.handle } })
              : router.replace({ pathname: '/social', params: { tab: 'backstage' } })
          }
        />
      </View>
    );

  const perks = messages && a
    ? [`Your own conversation with ${nameOf(a)}`, `${nameOf(a)} gets your whole subscription (80% after card fees and tax)`, 'Cancel anytime']
    : BACKSTAGE_PERKS;

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 24, gap: 18 }}>
        <IconButton icon="close" label="Close" onPress={close} style={{ marginLeft: -10 }} />

        {a ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <CreatorRing handle={a.handle} url={a.avatarUrl} size={84} gold />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text }}>{nameOf(a)}</T>
              {a.verified ? <Verified size={15} /> : null}
            </View>
            <T style={[styles.title, { textAlign: 'center' }]}>
              {messages ? `Message ${nameOf(a)} directly` : `See everything ${nameOf(a)} shares`}
            </T>
            <T variant="caption" style={{ textAlign: 'center', fontSize: 14 }}>
              {messages
                ? `Messages are just between you and ${nameOf(a)}, separate from Backstage.`
                : `${a.premiumPosts} Backstage ${a.premiumPosts === 1 ? 'post' : 'posts'}, their channel, and every other actor on Cinara. One pass.`}
            </T>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="ticket" size={18} color={colors.gold} />
              <T variant="eyebrow">Cinara Backstage</T>
            </View>
            <T style={styles.title}>One pass. Every actor.</T>
            <T variant="caption" style={{ fontSize: 14 }}>
              The posts, channels and moments the cast only shares with Backstage.
            </T>
          </View>
        )}

        <View style={styles.plan}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={messages ? 'send' : 'ticket'} size={18} color={colors.gold} />
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text }}>
                {messages && a ? `Messages with ${nameOf(a)}` : 'Backstage'}
              </T>
            </View>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.gold }}>
              {price}
              <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>/mo</T>
            </T>
          </View>
          <View style={{ gap: 6, marginTop: 12 }}>
            {perks.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="check" size={14} color={colors.gold} />
                <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSoft }}>{x}</T>
              </View>
            ))}
          </View>
        </View>

        {messages && a && !pass.data?.active ? (
          <T variant="caption" style={{ textAlign: 'center' }}>
            {`Want ${nameOf(a)}’s exclusive posts and channel too? That’s Backstage (${formatPrice(PASS_PRICES.creators)}/mo, every actor).`}
          </T>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {messages && a?.demo ? (
          <T variant="caption" style={{ textAlign: 'center', fontSize: 14 }}>
            {`${nameOf(a)} is a sample creator for testing, so messages can’t be bought. With a real verified actor, this button opens their messages checkout.`}
          </T>
        ) : canOfferBackstage ? (
          <>
            <Button
              label={!me.data?.id ? 'Sign in to continue' : canSellHere ? `Continue · ${price}/month` : `Continue on cinaratv.com · ${price}/mo`}
              loading={busy}
              onPress={() => void go()}
            />
            <T variant="caption" style={{ textAlign: 'center' }}>
              Renews monthly. Cancel anytime from your account. Payments are handled securely by Stripe.
            </T>
          </>
        ) : (
          <T variant="caption" style={{ textAlign: 'center', fontSize: 14 }}>
            {messages ? 'Messages are available to fans who added them.' : 'Backstage members see everything here.'}
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.text },
  plan: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: '#2A1F0E', padding: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.ink },
});
