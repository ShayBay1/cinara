import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Group, LinkRow, Rule, SettingsPage } from '@/components/settings/Page';
import { Bars, Periods, Stat, StatGrid, shortDay } from '@/components/settings/Stats';
import { Button, T } from '@/components/ui';
import { useMe } from '@/hooks/queries';
import { formatPrice } from '@/lib/billing';
import { change, compact, useCreatorAnalytics } from '@/social/analytics';
import { colors, fonts, radius } from '@/theme/tokens';

const METRICS = [
  { key: 'reached', label: 'Accounts reached' },
  { key: 'visits', label: 'Profile visits' },
  { key: 'followers', label: 'New followers' },
] as const;

/** The creator dashboard: reach, followers, engagement, Backstage and earnings. */
export default function AnalyticsScreen() {
  const me = useMe();
  const isCreator = !!me.data?.isCast;
  const [days, setDays] = useState(28);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('reached');
  const q = useCreatorAnalytics(days, isCreator);
  const a = q.data;

  if (!isCreator) {
    return (
      <SettingsPage title="Analytics">
        <T variant="caption">Analytics are for verified actors and creators. Your own watch time and activity are in Your activity.</T>
        <Button label="See your activity" onPress={() => router.replace('/your-activity')} />
      </SettingsPage>
    );
  }

  const values = a?.daily.map((d) => d[metric]) ?? [];
  const labels = a?.daily.length ? [shortDay(a.daily[0]!.day), shortDay(a.daily[a.daily.length - 1]!.day)] : undefined;

  return (
    <SettingsPage title="Analytics">
      <Periods value={days} options={[7, 28, 90]} onChange={setDays} />
      {q.isLoading ? <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} /> : null}
      {q.error ? <T variant="caption">{q.error instanceof Error ? q.error.message : 'Analytics didn’t load.'}</T> : null}
      {a ? (
        <>
          <View style={{ gap: 2 }}>
            <T variant="caption">{`Last ${a.days} days`}</T>
            <T style={st.big}>{compact(a.followers)}</T>
            <T variant="caption">{`followers · ${a.newFollowers >= 0 ? '+' : ''}${a.newFollowers} this period`}</T>
          </View>

          <StatGrid>
            <Stat label="Accounts reached" value={compact(a.reached)} delta={change(a.reached, a.reachedPrev)} onPress={() => setMetric('reached')} />
            <Stat label="Profile visits" value={compact(a.profileVisits)} delta={change(a.profileVisits, a.profileVisitsPrev)} onPress={() => setMetric('visits')} />
            <Stat label="New followers" value={compact(a.newFollowers)} delta={change(a.newFollowers, a.newFollowersPrev)} onPress={() => setMetric('followers')} />
            <Stat label="Impressions" value={compact(a.impressions)} />
            <Stat label="Likes" value={compact(a.likes)} delta={change(a.likes, a.likesPrev)} />
            <Stat label="Comments" value={compact(a.comments)} />
          </StatGrid>

          <View style={st.chart}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {METRICS.map((m) => (
                <Pressable key={m.key} onPress={() => setMetric(m.key)} style={[st.chip, metric === m.key && st.chipOn]} accessibilityRole="button">
                  <T style={[st.chipText, metric === m.key && { color: colors.goldInk }]}>{m.label}</T>
                </Pressable>
              ))}
            </View>
            <Bars values={values} labels={labels} />
          </View>

          <Group title="Backstage" note="Backstage pay follows each fan: their share is split by the exclusive posts they open.">
            <Row label="Fans who opened your Backstage" value={compact(a.backstageFans)} />
            <Rule />
            <Row label="Backstage views" value={compact(a.backstageViews)} />
            <Rule />
            <Row label="Message subscribers" value={compact(a.messageFans)} />
            <Rule />
            <Row label="Earned this period" value={formatPrice(a.earnedCents)} />
          </Group>

          <Group title="Top posts">
            {a.topPosts.length === 0 ? (
              <T variant="caption" style={{ paddingVertical: 14 }}>
                Post something and its reach shows up here.
              </T>
            ) : (
              a.topPosts.slice(0, 10).map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Rule /> : null}
                  <Pressable onPress={() => router.push(`/post/${p.id}`)} style={({ pressed }) => [st.post, pressed && { opacity: 0.6 }]}>
                    <View style={st.thumb}>
                      {typeof p.media?.url === 'string' ? <Image source={{ uri: p.media.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T numberOfLines={1} style={st.postBody}>
                        {p.body || (p.media?.type === 'video' ? 'Video' : 'Photo')}
                      </T>
                      <T variant="caption">{`${compact(p.reached)} reached · ${compact(p.likes)} likes · ${compact(p.comments)} comments`}</T>
                    </View>
                    {p.visibility === 'subscribers' ? <T style={st.tag}>Backstage</T> : null}
                  </Pressable>
                </View>
              ))
            )}
          </Group>

          <Group>
            <LinkRow icon="settings" label="Creator settings" hint="Messages price, Backstage and payouts" onPress={() => router.push('/creator')} />
          </Group>
        </>
      ) : null}
    </SettingsPage>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={st.row}>
    <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text }}>{label}</T>
    <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{value}</T>
  </View>
);

const st = StyleSheet.create({
  big: { fontFamily: fonts.serif, fontSize: 44, lineHeight: 48, color: colors.text },
  chart: { gap: 14, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  chip: { paddingHorizontal: 12, height: 30, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  post: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  thumb: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.line },
  postBody: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  tag: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.gold },
});
