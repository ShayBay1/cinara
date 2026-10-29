import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Group, LinkRow, Rule, SettingsPage } from '@/components/settings/Page';
import { Bars, Periods, Stat, StatGrid } from '@/components/settings/Stats';
import { Button, T } from '@/components/ui';
import { useMe } from '@/hooks/queries';
import { compact, hoursLabel, useMyActivity } from '@/social/analytics';
import { minutesLabel, useWellbeing } from '@/store/wellbeing';
import { colors, fonts } from '@/theme/tokens';

/** Everyone's "Your activity": time spent, what you watched, how you've joined in. */
export default function YourActivityScreen() {
  const me = useMe();
  const signedIn = !!me.data;
  const [days, setDays] = useState(7);
  const q = useMyActivity(days, signedIn);
  const a = q.data;
  const usage = useWellbeing((s) => s.usage);
  const appMinutes = Object.entries(usage)
    .filter(([k]) => Date.now() - new Date(`${k}T12:00:00`).getTime() < days * 86_400_000)
    .reduce((t, [, sec]) => t + sec / 60, 0);

  if (!signedIn) {
    return (
      <SettingsPage title="Your activity">
        <T variant="caption">Sign in to see your watch time and activity.</T>
        <Button label="Continue with email" onPress={() => router.push('/sign-in')} />
      </SettingsPage>
    );
  }

  const labels = a?.daily.length
    ? days === 7
      ? a.daily.map((d) => new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' }))
      : [a.daily[0]!.day.slice(5), a.daily[a.daily.length - 1]!.day.slice(5)]
    : undefined;

  return (
    <SettingsPage title="Your activity">
      <Periods value={days} options={[7, 28, 90]} onChange={setDays} />
      {q.isLoading ? <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} /> : null}
      {q.error ? <T variant="caption">{q.error instanceof Error ? q.error.message : 'Your activity didn’t load.'}</T> : null}
      {a ? (
        <>
          <View style={{ gap: 2 }}>
            <T variant="caption">Time watched</T>
            <T style={{ fontFamily: fonts.serif, fontSize: 44, lineHeight: 48, color: colors.text }}>{hoursLabel(a.watchSeconds)}</T>
            <T variant="caption">{`Daily average: ${hoursLabel(a.watchSeconds / days)} · Time in the app: ${minutesLabel(Math.round(appMinutes))}`}</T>
          </View>
          <Bars values={a.daily.map((d) => d.seconds)} labels={labels} />

          <Group title="Most watched">
            {a.topShows.length === 0 ? (
              <T variant="caption" style={{ paddingVertical: 14 }}>
                Nothing yet in this period.
              </T>
            ) : (
              a.topShows.map((s, i) => (
                <View key={s.showId}>
                  {i > 0 ? <Rule /> : null}
                  <Pressable onPress={() => router.push(`/show/${s.showId}`)} style={({ pressed }) => [{ minHeight: 48, flexDirection: 'row', alignItems: 'center' }, pressed && { opacity: 0.6 }]}>
                    <T style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text }}>{s.title}</T>
                    <T variant="caption">{hoursLabel(s.seconds)}</T>
                  </Pressable>
                </View>
              ))
            )}
          </Group>

          <StatGrid>
            <Stat label="Comments" value={compact(a.comments)} />
            <Stat label="Likes" value={compact(a.likes)} />
            <Stat label="Friends" value={compact(a.friends)} onPress={() => router.push('/people')} />
            <Stat label="Following" value={compact(a.following)} />
          </StatGrid>

          <Group>
            <LinkRow icon="bell" label="Time management" hint="Daily limit, breaks and sleep reminders" onPress={() => router.push('/time-management')} />
            {me.data?.isCast ? (
              <>
                <Rule />
                <LinkRow icon="eye" label="Creator analytics" onPress={() => router.push('/analytics')} />
              </>
            ) : null}
          </Group>
        </>
      ) : null}
    </SettingsPage>
  );
}
