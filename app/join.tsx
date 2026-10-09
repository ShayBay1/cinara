import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, T } from '@/components/ui';
import { api, FREE_EPISODES } from '@/data';
import { canSellHere, MEMBERSHIP_PRICE_LABEL, showExternalJoinLink, WEB_URL } from '@/lib/billing';
import { colors, fonts } from '@/theme/tokens';

/**
 * Membership screen. On the web it opens Stripe Checkout. In the iPhone and
 * Android apps nothing is sold (build rule #1): it explains membership and,
 * only if allowed by config, links to the website.
 */
export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const { episode } = useLocalSearchParams<{ showId?: string; episode?: string }>();
  const ep = Number(episode ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = await api.createMembershipCheckout();
      globalThis.location?.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout didn’t open. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={{ alignSelf: 'flex-end' }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <T variant="eyebrow" style={{ color: colors.gold }}>
        {ep > FREE_EPISODES ? 'Free episodes complete' : 'Snippets membership'}
      </T>
      <T variant="serif" style={{ fontSize: 36, lineHeight: 38 }}>
        {ep > FREE_EPISODES ? `Episode ${ep} is waiting.` : 'Every show. Every episode.'}
      </T>
      <T style={{ color: colors.textSoft, fontSize: 15 }}>
        Members watch every episode the night it premieres. Your membership pays the actors
        directly.
      </T>

      {canSellHere ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T
              style={{
                fontFamily: fonts.display,
                fontSize: 40,
                lineHeight: 44,
                color: colors.gold,
              }}
            >
              {MEMBERSHIP_PRICE_LABEL}
            </T>
            <T variant="label" style={{ color: colors.textSoft }}>
              / month
            </T>
          </View>
          <Button label="Continue to checkout" loading={loading} onPress={startCheckout} />
          {error ? (
            <T variant="caption" style={{ color: colors.liveSoft }}>
              {error}
            </T>
          ) : null}
          <T variant="caption" style={{ textAlign: 'center' }}>
            Paid securely through Stripe. Renews monthly. Cancel anytime in your account.
          </T>
        </>
      ) : (
        <>
          <T style={{ color: colors.textSoft, fontSize: 15 }}>
            Already a member? Sign in with the email you used to join and every episode unlocks.
          </T>
          <Button label="Continue with email" onPress={() => router.replace('/sign-in')} />
          {showExternalJoinLink ? (
            <Button
              kind="outline"
              label="Join on the Snippets website"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/join`)}
            />
          ) : null}
          <T
            variant="caption"
            style={{ textAlign: 'center' }}
          >{`Episodes 1–${FREE_EPISODES} of every show are free.`}</T>
        </>
      )}
      <Button kind="outline" label="Not now" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
});
