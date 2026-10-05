import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { T } from '@/components/ui';
import { useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { LIVE_WINDOW_MS, upcomingPremieres, type Premiere } from '@/lib/premieres';
import { dayLabel, easternParts, SLOT_LABEL } from '@/lib/schedule';
import { colors, fonts } from '@/theme/tokens';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Every premiere at 8/7c, this week and next. */
export default function ScheduleScreen() {
  const shows = useShows();
  const now = useNow(30_000);
  const all = upcomingPremieres(shows.data ?? [], now);
  const weekEnd = now.getTime() + 7 * 86_400_000;
  const thisWeek = all.filter((p) => p.at.getTime() < weekEnd);
  const nextWeek = all.filter((p) => p.at.getTime() >= weekEnd && p.at.getTime() < weekEnd + 7 * 86_400_000);

  return (
    <Screen title="Schedule" subtitle={`Every premiere at ${SLOT_LABEL}. Ten episodes at a time.`} refreshing={shows.isRefetching} onRefresh={() => void shows.refetch()}>
      <View style={styles.card}>
        <T style={styles.week}>THIS WEEK</T>
        {thisWeek.map((p, i) => (
          <Row key={`${p.show.id}-${p.drop.from}`} premiere={p} now={now} first={i === 0} />
        ))}
        {nextWeek.length ? <T style={[styles.week, { marginTop: 18 }]}>NEXT WEEK</T> : null}
        {nextWeek.map((p, i) => (
          <Row key={`${p.show.id}-${p.drop.from}`} premiere={p} now={now} first={i === 0} quiet />
        ))}
        {all.length === 0 ? <T style={styles.sub}>No premieres scheduled. Every season is out.</T> : null}
      </View>
    </Screen>
  );
}

function Row({ premiere, now, first, quiet }: { premiere: Premiere; now: Date; first: boolean; quiet?: boolean }) {
  const { show, drop, at } = premiere;
  const reminder = useReminder(show);
  const left = at.getTime() - now.getTime();
  const live = left <= 0 && left > -LIVE_WINDOW_MS;
  const tonight = dayLabel(at, now) === 'tonight';
  const eyebrow = live ? 'LIVE NOW' : tonight ? 'TONIGHT · LIVE PREMIERE' : null;

  return (
    <View style={[styles.row, !first && styles.rule]}>
      <View style={[styles.day, (tonight || live) && styles.dayOn]}>
        <T style={[styles.dayName, (tonight || live) && { color: colors.ink }]}>{DAYS[easternParts(at).weekday] ?? ''}</T>
        <T style={[styles.dayTime, (tonight || live) && { color: colors.ink }]}>{SLOT_LABEL}</T>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          live
            ? router.push({ pathname: '/live/[showId]', params: { showId: show.id } })
            : router.push({ pathname: '/show/[showId]', params: { showId: show.id } })
        }
        style={{ flex: 1, gap: 2 }}
      >
        {eyebrow ? <T style={[styles.eyebrow, live && { color: '#FF8A8E' }]}>{eyebrow}</T> : null}
        <T style={[styles.title, quiet && { color: colors.textSoft }]}>{show.title}</T>
        <T style={styles.sub}>{`Episodes ${drop.from}–${drop.to}${tonight || live ? ' · cast in the chat' : ''}`}</T>
      </Pressable>
      {quiet ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remind me: ${show.title}`}
          accessibilityState={{ selected: reminder.isOn }}
          onPress={reminder.toggle}
          disabled={reminder.busy}
          style={[styles.bell, reminder.isOn && { backgroundColor: colors.gold, borderColor: colors.gold }]}
        >
          <Icon name="bell" size={18} color={reminder.isOn ? colors.ink : colors.text} filled={reminder.isOn} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#24242C' },
  week: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 2, color: colors.muted, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A33' },
  day: { width: 54, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(244,241,234,0.06)' },
  dayOn: { backgroundColor: colors.gold },
  dayName: { fontFamily: fonts.bodyHeavy, fontSize: 13, letterSpacing: 1, color: colors.text },
  dayTime: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.muted },
  eyebrow: { fontFamily: fonts.bodyHeavy, fontSize: 10, letterSpacing: 1.4, color: colors.gold },
  title: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  bell: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#3A3A44', alignItems: 'center', justifyContent: 'center' },
});
