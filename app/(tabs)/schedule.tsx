import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Develop } from '@/components/Develop';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { Reel } from '@/components/Reel';
import { Screen } from '@/components/Screen';
import { Ghost } from '@/components/Skeleton';
import { SwitchRow, T } from '@/components/ui';
import type { Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { haptic } from '@/lib/haptics';
import { countdownParts, premiereStage, upcomingPremieres, type Premiere } from '@/lib/premieres';
import { cancelReminder, scheduleNextPremiere } from '@/lib/reminders';
import { dayLabel, easternParts, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_MS = 86_400_000;

/** Eastern calendar day key, e.g. "2026-10-12". */
const dayKey = (d: Date) => {
  const p = easternParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/** A TV guide for the week: one strip of seven nights, a premiere every night at 8/7c. */
export default function ScheduleScreen() {
  const shows = useShows();
  const now = useNow(1000);
  const all = upcomingPremieres(shows.data ?? [], now);
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * DAY_MS));
  const [picked, setPicked] = useState(0);
  const pickedKey = dayKey(days[picked] ?? now);
  const tonight = all.filter((p) => dayKey(p.at) === pickedKey);
  const later = all.filter((p) => p.at.getTime() >= now.getTime() + 7 * DAY_MS).slice(0, 6);

  return (
    <Screen
      title="Schedule"
      subtitle={`A premiere every night at ${SLOT_LABEL}. Ten episodes at a time.`}
      refreshing={shows.isRefetching}
      onRefresh={() => void shows.refetch()}
    >
      <View style={styles.week} accessibilityRole="tablist">
        {days.map((d, i) => {
          const has = all.some((p) => dayKey(p.at) === dayKey(d));
          const on = i === picked;
          const label =
            i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : (DAYS[easternParts(d).weekday] ?? '');
          return (
            <Pressable
              key={i}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label}${has ? ', premiere at 8/7c' : ', no premiere'}`}
              onPress={() => {
                haptic.pick();
                setPicked(i);
              }}
              style={[styles.day, on && styles.dayOn]}
            >
              <T style={[styles.dayName, on && { color: colors.ink }]}>
                {DAYS[easternParts(d).weekday]}
              </T>
              <T style={[styles.dayNum, on && { color: colors.ink }]}>{easternParts(d).day}</T>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: has ? (on ? colors.ink : colors.gold) : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <RemindEveryNight premieres={all} />

      <View style={{ gap: 12, marginTop: 8 }}>
        {shows.isPending ? (
          <>
            <Ghost style={{ height: 136, borderRadius: 14 }} />
            <Ghost style={{ height: 136, borderRadius: 14 }} />
          </>
        ) : tonight.length ? (
          tonight.map((p) => <Night key={`${p.show.id}-${p.drop.from}`} premiere={p} now={now} />)
        ) : (
          <View style={styles.empty}>
            <Icon name="reel" size={30} color={colors.muted} />
            <T style={styles.sub}>
              {all.length
                ? 'No premiere this night. Pick another day.'
                : 'No premieres scheduled. Every season is out.'}
            </T>
          </View>
        )}
      </View>

      {later.length ? (
        <View style={{ marginTop: 26 }}>
          <T style={styles.h2}>Next week</T>
          <View style={styles.card}>
            {later.map((p, i) => (
              <Pressable
                key={`${p.show.id}-${p.drop.from}`}
                accessibilityRole="button"
                accessibilityLabel={`${p.show.title}, episodes ${p.drop.from} to ${p.drop.to}, ${dayLabel(p.at, now)} at 8/7c`}
                onPress={() =>
                  router.push({ pathname: '/show/[showId]', params: { showId: p.show.id } })
                }
                style={[styles.laterRow, i > 0 && styles.rule]}
              >
                <T style={styles.laterDay}>{DAYS[easternParts(p.at).weekday]}</T>
                <T
                  style={{
                    flex: 1,
                    fontFamily: fonts.bodyHeavy,
                    fontSize: 14,
                    color: colors.textSoft,
                  }}
                  numberOfLines={1}
                >
                  {p.show.title}
                </T>
                <T style={styles.sub}>{`Eps ${p.drop.from}–${p.drop.to}`}</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

/** One switch for the whole week: a reminder for every premiere. */
function RemindEveryNight({ premieres }: { premieres: Premiere[] }) {
  const reminders = useAppStore((s) => s.reminders);
  const setReminder = useAppStore((s) => s.setReminder);
  const [busy, setBusy] = useState(false);
  const showsAhead = [...new Map(premieres.map((p) => [p.show.id, p.show])).values()];
  const allOn = showsAhead.length > 0 && showsAhead.every((s) => !!reminders[s.id]);

  const toggle = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      for (const show of showsAhead) {
        const id = reminders[show.id];
        if (on && !id) {
          const r = await scheduleNextPremiere(show);
          if (r.ok) setReminder(show.id, r.notificationId);
          else if (r.reason === 'denied') break;
        } else if (!on && id) {
          await cancelReminder(id);
          setReminder(show.id, null);
        }
      }
    } finally {
      setBusy(false);
      if (on) haptic.success();
      else haptic.tap();
    }
  };

  if (!showsAhead.length) return null;
  return (
    <View style={[styles.card, { paddingVertical: 2, marginTop: 14 }]}>
      <SwitchRow
        label="Remind me every night"
        hint="A nudge before each premiere this week."
        value={allOn}
        onChange={(v) => void toggle(v)}
      />
    </View>
  );
}

/** One night's premiere: the poster sits in sepia until it goes live, then develops into colour. */
function Night({ premiere, now }: { premiere: Premiere; now: Date }) {
  const { show, drop, at } = premiere;
  const reminder = useReminder(show);
  const stage = premiereStage(at, now);
  const onNow = stage === 'doors' || stage === 'live' || stage === 'after';
  const c = countdownParts(at.getTime() - now.getTime());
  const stub = useAppStore((s) =>
    s.stubs.some((x) => x.showId === show.id && x.from === drop.from),
  );
  const line =
    stage === 'live'
      ? 'Live now'
      : stage === 'doors'
        ? 'Doors open'
        : stage === 'after'
          ? 'After-chat open'
          : `${dayLabel(at, now) === 'tonight' ? 'Tonight' : DAYS[easternParts(at).weekday]} · ${SLOT_LABEL}`;

  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={`${show.title}, episodes ${drop.from} to ${drop.to}. ${line}.`}
      onPress={() =>
        onNow
          ? openLive(show)
          : router.push({ pathname: '/show/[showId]', params: { showId: show.id } })
      }
      style={[styles.night, stage === 'live' && { borderColor: colors.live }]}
    >
      <Develop developed={onNow || stub} style={styles.poster}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: show.color }]} />
        {coverSource(show) ? (
          <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </Develop>
      <View style={{ flex: 1, gap: 4 }}>
        <T style={[styles.eyebrow, stage === 'live' && { color: colors.liveSoft }]}>{line}</T>
        <T
          style={{
            fontFamily: fonts.engraved,
            fontSize: 16,
            lineHeight: 21,
            color: colors.goldLight,
          }}
        >
          {show.title}
        </T>
        <T style={styles.sub}>{`Episodes ${drop.from}–${drop.to} · cast in the chat`}</T>
        {!onNow ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Reel
              size={22}
              progress={1 - Math.min(1, (at.getTime() - now.getTime()) / (7 * DAY_MS))}
            />
            <T
              style={{
                fontFamily: fonts.bodyHeavy,
                fontSize: 13,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {c.days ? `${c.days}d ${c.h}h` : `${c.h}:${c.m}:${c.s}`}
            </T>
          </View>
        ) : null}
      </View>
      {onNow ? (
        <View
          style={[
            styles.bell,
            {
              backgroundColor: stage === 'live' ? colors.live : colors.gold,
              borderColor: 'transparent',
            },
          ]}
        >
          <Icon name="play" size={16} color={stage === 'live' ? '#FFFFFF' : colors.ink} filled />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            reminder.isOn ? `Reminder on for ${show.title}` : `Remind me about ${show.title}`
          }
          accessibilityState={{ selected: reminder.isOn, busy: reminder.busy }}
          onPress={reminder.toggle}
          disabled={reminder.busy}
          style={[
            styles.bell,
            reminder.isOn && { backgroundColor: colors.gold, borderColor: colors.gold },
          ]}
        >
          <Icon
            name={reminder.isOn ? 'check' : 'bell'}
            size={18}
            color={reminder.isOn ? colors.ink : colors.text}
          />
        </Pressable>
      )}
    </Pressy>
  );
}

const openLive = (show: Show) =>
  router.push({ pathname: '/live/[showId]', params: { showId: show.id } });

const styles = StyleSheet.create({
  week: { marginTop: 14, flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dayName: { fontFamily: fonts.bodyHeavy, fontSize: 10, letterSpacing: 1, color: colors.muted },
  dayNum: { fontFamily: fonts.engraved, fontSize: 17, color: colors.text },
  dot: { width: 5, height: 5, borderRadius: 3 },
  card: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  night: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  poster: { width: 78, height: 112, borderRadius: 8 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
    marginBottom: 10,
  },
  laterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  laterDay: {
    width: 40,
    fontFamily: fonts.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.muted,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  eyebrow: {
    fontFamily: fonts.engraved,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  sub: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
