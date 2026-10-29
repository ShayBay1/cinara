import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, Panel, SwitchRow, T } from '@/components/ui';
import { useMe } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { formatPrice } from '@/lib/billing';
import { notify } from '@/lib/safety';
import { setCreatorSettings, socialLive } from '@/social/api';
import { sk, useActor, useCreatorStats } from '@/social/hooks';
import { NeedsLive } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** For the cast: how you appear, whether fans can message you, and what you've earned from Backstage. */
export default function CreatorScreen() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const qc = useQueryClient();
  const handle = me.data?.handle ?? '';
  const profile = useActor(handle);
  const stats = useCreatorStats(!!me.data?.isCast);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [price, setPrice] = useState('9.99');
  const [dmsOpen, setDmsOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (!p || loaded) return;
    setDisplayName(p.displayName ?? '');
    setBio(p.bio ?? '');
    setPrice((p.dmPriceCents / 100).toFixed(2));
    setDmsOpen(p.dmsOpen);
    setLoaded(true);
  }, [profile.data, loaded]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const save = async () => {
    setSaving(true);
    try {
      const cents = Math.round(Number.parseFloat(price.replace(/[^0-9.]/g, '')) * 100);
      if (!Number.isFinite(cents) || cents < 299 || cents > 4999) {
        notify('Pick a messages price between $2.99 and $49.99.');
        return;
      }
      await setCreatorSettings({ displayName, bio, priceCents: cents, subsEnabled: dmsOpen, dmsOpen });
      await qc.invalidateQueries({ queryKey: sk.actor(handle) });
      notify('Saved');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
      <IconButton icon="back" label="Back" onPress={back} />
      <T variant="display" style={{ fontSize: 26, lineHeight: 32, textTransform: 'none' }}>
        Creator settings
      </T>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 16, paddingBottom: insets.bottom + 40 + keyboard, gap: 18 }}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      {!socialLive() ? (
        <NeedsLive />
      ) : !me.data?.isCast ? (
        <T variant="caption" style={{ fontSize: 14 }}>
          Creator settings are for the cast.
        </T>
      ) : profile.isPending ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatBox label="Followers" value={String(stats.data?.followers ?? '–')} />
            <StatBox label="Backstage fans this month" value={String(stats.data?.subscribers ?? '–')} />
            <StatBox label="Backstage views" value={String(stats.data?.views ?? '–')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatBox label="Messaging you" value={String(stats.data?.messageFans ?? '–')} />
            <StatBox label="Your share so far this month" value={stats.data ? formatPrice(stats.data.thisMonthCents) : '–'} />
            <StatBox label="Not paid out yet" value={stats.data ? formatPrice(stats.data.unpaidCents) : '–'} />
          </View>
          <T variant="caption">
            Backstage is one pass for every actor: each fan’s money (80% to the cast, after card fees and tax) goes to the
            actors whose Backstage posts and channel that fan opened that month. Messages are yours alone: fans who add
            messages with you pay your price, and you get 80% of it. Paid out monthly.
          </T>

          <View style={{ gap: 8 }}>
            <T variant="eyebrow" style={{ color: colors.text }}>
              Profile
            </T>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={colors.dim}
              maxLength={40}
              accessibilityLabel="Display name"
              style={styles.input}
            />
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Bio"
              placeholderTextColor={colors.dim}
              maxLength={280}
              multiline
              accessibilityLabel="Bio"
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            />
          </View>

          <Panel style={{ paddingHorizontal: 14 }}>
            <SwitchRow
              label="Sell messages"
              hint="Fans can add messages with you from your Backstage. That money goes to you (80% after card fees and tax)."
              value={dmsOpen}
              onChange={setDmsOpen}
            />
            {dmsOpen ? (
              <>
                <View style={{ height: 1, backgroundColor: colors.line }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                  <View style={{ flex: 1 }}>
                    <T variant="label">Messages price</T>
                    <T variant="caption">Per fan, per month. $2.99 to $49.99. Changes apply to new fans.</T>
                  </View>
                  <View style={styles.priceBox}>
                    <T style={{ fontFamily: fonts.bodyHeavy, color: colors.muted }}>$</T>
                    <TextInput
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Messages price in dollars"
                      style={{ color: colors.text, fontFamily: fonts.bodyHeavy, fontSize: 16, minWidth: 54, paddingVertical: 8 }}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </Panel>

          <Button label="Save" loading={saving} onPress={save} />
          <Button kind="outline" label="View my page" onPress={() => router.push({ pathname: '/actor/[handle]', params: { handle } })} />
        </>
      )}
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Panel style={{ flex: 1, padding: 14, gap: 4 }}>
      <T variant="title">{value}</T>
      <T variant="caption">{label}</T>
    </Panel>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 10,
  },
});
