import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { ErrorState, T } from '@/components/ui';
import { FREE_EPISODES, type Show } from '@/data';
import { useMembership, useShow } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { countdownParts, dropNight, LIVE_WINDOW_MS, premiereFor } from '@/lib/premieres';
import { dayLabel, DROP_SIZE, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, tintFor } from '@/theme/tokens';
import { coverSource } from '@/data/covers';

/** The show page: key art, the one big button, episodes by drop, and the cast who made it. */
export default function ShowScreen() {
  const { showId } = useLocalSearchParams<{ showId: string }>();
  const show = useShow(showId);
  if (show.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message="This show didn’t load." onRetry={() => void show.refetch()} />
      </View>
    );
  }
  if (!show.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  return <ShowPage show={show.data} />;
}

const watch = (show: Show, n: number) => router.push({ pathname: '/watch/[showId]/[episode]', params: { showId: show.id, episode: String(n) } });

function ShowPage({ show }: { show: Show }) {
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const membership = useMembership();
  const isMember = membership.data?.active ?? false;
  const progress = useAppStore((s) => s.progress[show.id]);
  const inList = useAppStore((s) => !!s.myList[show.id]);
  const toggleList = useAppStore((s) => s.toggleMyList);
  const premiere = premiereFor(show, now);

  const resumeEp = progress && progress.episode <= show.latestEpisode ? progress.episode : null;
  const drops = Math.ceil(show.episodeCount / DROP_SIZE);
  const done = show.latestEpisode >= show.episodeCount;
  const seasonLine = done
    ? show.episodeCount === 1
      ? `${show.genre} · Special`
      : `Season 1 · All ${show.episodeCount} episodes out`
    : `Season 1 · ${show.episodeCount} episodes · 10 new every ${dropNight(show)} at ${SLOT_LABEL}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.ink }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={[styles.art, { backgroundColor: show.color, height: 300 + insets.top }]}>
        {coverSource(show) ? <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : <View style={styles.artGlow} />}
        <View style={styles.artFade} />
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={[styles.back, { top: insets.top + 6 }]}>
          <Icon name="back" />
        </Pressable>
      </View>

      <View style={styles.body}>
        <T style={styles.title}>{show.title}</T>
        <T style={styles.meta}>{seasonLine}</T>
        <T style={styles.synopsis}>{show.synopsis ?? show.tagline}</T>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Pressable accessibilityRole="button" onPress={() => watch(show, resumeEp ?? 1)} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.88 }]}>
            <Icon name="play" size={18} color={colors.ink} />
            <T style={styles.primaryText}>{resumeEp ? (show.episodeCount === 1 ? 'Resume' : `Resume Episode ${resumeEp}`) : show.episodeCount === 1 ? 'Watch free' : 'Watch Episode 1 free'}</T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={inList ? 'Remove from My List' : 'Add to My List'}
            accessibilityState={{ selected: inList }}
            onPress={() => toggleList(show.id)}
            style={[styles.square, inList && { borderColor: colors.gold }]}
          >
            <Icon name={inList ? 'check' : 'plus'} color={inList ? colors.gold : colors.text} />
          </Pressable>
        </View>

        <View style={styles.turnNote}>
          <View style={styles.turnIcon}>
            <Icon name="turn" size={20} />
          </View>
          <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: '#E3DFE8' }}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text }}>Watch it upright, or turn it sideways.</T> The picture follows your phone.
          </T>
        </View>
      </View>

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T style={styles.h2}>Episodes</T>
          <T style={styles.seasonPill}>Season 1</T>
        </View>
        {Array.from({ length: drops }, (_, i) => {
          const from = i * DROP_SIZE + 1;
          const to = Math.min(show.episodeCount, from + DROP_SIZE - 1);
          if (from <= show.latestEpisode) {
            return (
              <ReleasedDrop
                key={from}
                show={show}
                from={from}
                to={to}
                isMember={isMember}
                resumeEp={resumeEp}
                startOpen={resumeEp ? resumeEp >= from && resumeEp <= to : from === 1}
              />
            );
          }
          if (premiere && from === premiere.drop.from) return <NextDrop key={from} show={show} from={from} to={to} at={premiere.at} now={now} />;
          if (premiere && from === premiere.drop.from + DROP_SIZE) {
            return (
              <View key={from} style={[styles.drop, styles.dropFuture]}>
                <View>
                  <T style={styles.dropTitle}>{`Episodes ${from}–${show.episodeCount}`}</T>
                  <T style={styles.dropSub}>{`10 more every ${dropNight(show)} at ${SLOT_LABEL}`}</T>
                </View>
              </View>
            );
          }
          return null;
        })}
      </View>

      <View style={styles.section}>
        <T style={styles.h2}>Made by the people on screen</T>
        <T style={[styles.dropSub, { marginTop: -4, marginBottom: 12 }]}>The cast co-own this show.</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
          {show.cast.map((c) => (
            <View key={c.role} style={{ width: 76, alignItems: 'center', gap: 6 }}>
              <View style={[styles.face, { backgroundColor: tintFor(c.role) }]}>
                <T style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>{c.role.charAt(0)}</T>
              </View>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.text, textAlign: 'center' }} numberOfLines={1}>
                {c.actorName.startsWith('[') ? '[Actor]' : c.actorName}
              </T>
              <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: 'center' }} numberOfLines={1}>{c.role}</T>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

/** A drop that's out: the episode list (first few, then "Show all"). Members-only drops show a lock if you're not a member. */
function ReleasedDrop({ show, from, to, isMember, resumeEp, startOpen }: { show: Show; from: number; to: number; isMember: boolean; resumeEp: number | null; startOpen: boolean }) {
  const free = to <= FREE_EPISODES;
  const locked = !free && !isMember;
  const [open, setOpen] = useState(startOpen && !locked);
  const [all, setAll] = useState(false);
  const eps = Array.from({ length: Math.min(to, show.latestEpisode) - from + 1 }, (_, i) => from + i);
  // Collapsed: the first three, plus where you left off.
  const shown = all ? eps : eps.filter((n, i) => i < 3 || n === resumeEp);

  return (
    <View style={styles.drop}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => (locked ? watch(show, from) : setOpen((o) => !o))} style={styles.dropHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={styles.dropTitle}>{from === to ? `Episode ${from}` : `Episodes ${from}–${to}`}</T>
          {free ? <T style={styles.freeTag}>FREE</T> : null}
        </View>
        {free ? null : <T style={styles.dropSub}>Members · available now</T>}
        <View style={{ position: 'absolute', right: 0, top: 4 }}>
          {locked ? <Icon name="lock" size={18} color={colors.gold} /> : <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.muted }}>{open ? '–' : '+'}</T>}
        </View>
      </Pressable>
      {open ? (
        <View>
          {shown.map((n) => {
            const status = resumeEp === n ? 'Resume' : resumeEp !== null && n < resumeEp ? 'Watched' : '';
            return (
              <Pressable key={n} accessibilityRole="button" onPress={() => watch(show, n)} style={({ pressed }) => [styles.epRow, pressed && { backgroundColor: 'rgba(244,241,234,0.04)' }]}>
                <T style={styles.epNum}>{n}</T>
                <T style={styles.epTitle} numberOfLines={1}>{show.episodeTitles[n - 1] ?? `Episode ${n}`}</T>
                <T style={[styles.epStatus, status === 'Resume' && { color: colors.gold }]}>{status}</T>
              </Pressable>
            );
          })}
          {!all && eps.length > shown.length ? (
            <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={styles.showAll}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.textSoft }}>{`Show all ${eps.length}`}</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The next drop: premiere time and countdown, or Watch live while it's on. */
function NextDrop({ show, from, to, at, now }: { show: Show; from: number; to: number; at: Date; now: Date }) {
  const reminder = useReminder(show);
  const left = at.getTime() - now.getTime();
  const live = left <= 0 && left > -LIVE_WINDOW_MS;
  const word = dayLabel(at, now);
  const c = countdownParts(left);
  return (
    <View style={[styles.drop, styles.dropNext]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexShrink: 1 }}>
          <T style={styles.dropTitle}>{`Episodes ${from}–${to}`}</T>
          <T style={[styles.dropSub, { color: live ? '#FF8A8E' : colors.gold }]}>{live ? 'Live premiere · on now' : `Live premiere ${word} at ${SLOT_LABEL}`}</T>
        </View>
        {live ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/live/[showId]', params: { showId: show.id } })} style={styles.liveBtn}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: '#fff' }}>Watch live</T>
          </Pressable>
        ) : (
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <T style={styles.count}>{c.days ? `${c.days}d ${c.h}h` : `${c.h}:${c.m}:${c.s}`}</T>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: reminder.isOn }} onPress={reminder.toggle} hitSlop={6}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 12, color: reminder.isOn ? colors.gold : colors.textSoft }}>{reminder.isOn ? 'Reminder on' : 'Remind me'}</T>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: 24 },
  art: { overflow: 'hidden' },
  artGlow: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 35%, rgba(196,106,58,0.42) 0%, rgba(196,106,58,0) 45%), radial-gradient(circle at 95% 60%, rgba(46,125,166,0.35) 0%, rgba(46,125,166,0) 40%)',
  },
  artFade: { ...StyleSheet.absoluteFill, experimental_backgroundImage: 'linear-gradient(180deg, rgba(8,8,10,0) 55%, rgba(8,8,10,1) 100%)' },
  back: { position: 'absolute', left: 8, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,8,10,0.4)' },
  body: { paddingHorizontal: 16, marginTop: -54, gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 44, lineHeight: 52, textTransform: 'uppercase', color: colors.text },
  meta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.gold },
  synopsis: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: '#E3DFE8' },
  primary: { flex: 1, height: 54, borderRadius: 16, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  square: { width: 54, height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#3A3A44', alignItems: 'center', justifyContent: 'center' },
  turnNote: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#24242C' },
  turnIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(244,241,234,0.08)', alignItems: 'center', justifyContent: 'center' },
  section: { paddingTop: 30, paddingHorizontal: 16 },
  h2: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.text, marginBottom: 10 },
  seasonPill: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.textSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3A44', overflow: 'hidden', marginBottom: 10 },
  drop: { marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#24242C' },
  dropNext: { borderColor: 'rgba(232,194,122,0.45)', backgroundColor: '#17140F' },
  dropFuture: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#2E2E38' },
  dropHead: { gap: 2, paddingRight: 30 },
  dropTitle: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text },
  dropSub: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  freeTag: { fontFamily: fonts.bodyHeavy, fontSize: 9, letterSpacing: 1.2, color: colors.ink, backgroundColor: colors.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  epRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A33' },
  epNum: { width: 26, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.muted },
  epTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  epStatus: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  showAll: { paddingTop: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A33' },
  count: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  liveBtn: { height: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center' },
  face: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
