import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, T } from '@/components/ui';
import type { Show } from '@/data';
import { useComingSoon, useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { countdownParts, dropNights, LIVE_WINDOW_MS, soonestPremiere, type Premiere } from '@/lib/premieres';
import { dayLabel, dropOf, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';
import { coverSource } from '@/data/covers';

const openShow = (show: Show) => router.push({ pathname: '/show/[showId]', params: { showId: show.id } });

/** Home: tonight's premiere up top, then where you left off, every show, and what's coming. */
export default function HomeScreen() {
  const shows = useShows();
  const coming = useComingSoon();
  const now = useNow(1000);
  const list = shows.data ?? [];
  const premiere = soonestPremiere(list, now);

  return (
    <Screen
      title={
        <View>
          <T style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 36, letterSpacing: 0.5 }}>
            snippets<T style={{ fontFamily: fonts.display, fontSize: 28, color: colors.accent }}>.</T>
          </T>
          <T variant="serifItalic" style={{ color: colors.muted, fontSize: 15 }}>Made by the people on screen.</T>
        </View>
      }
      refreshing={shows.isRefetching}
      onRefresh={() => void shows.refetch()}
    >
      {shows.isError ? <ErrorState message="We couldn’t load the shows. Check your connection." onRetry={() => void shows.refetch()} /> : null}

      {premiere ? <Hero premiere={premiere} now={now} /> : null}

      <ContinueWatching shows={list} />

      {list.length ? (
        <View style={styles.section}>
          <T style={styles.h2}>Now streaming</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {list.map((show) => (
              <Pressable key={show.id} accessibilityRole="button" accessibilityLabel={show.title} onPress={() => openShow(show)} style={({ pressed }) => [{ width: 150, gap: 8 }, pressed && { opacity: 0.85 }]}>
                <View style={[styles.poster, { backgroundColor: show.color }]}>
                  {coverSource(show) ? <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
                  {coverSource(show) ? <View style={styles.posterShade} /> : null}
                  <T style={[styles.posterLetter, coverSource(show) ? { opacity: 0 } : null]}>{show.title.replace(/^The /, '').charAt(0)}</T>
                  <T style={styles.posterTitle} numberOfLines={3}>{show.title}</T>
                </View>
                <T style={styles.meta}>{show.latestEpisode >= show.episodeCount ? (show.episodeCount === 1 ? 'Special · out now' : `All ${show.episodeCount} episodes out`) : `New episodes ${dropNights(show)}`}</T>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {coming.data ? <ComingSoonRow title={coming.data.title ?? 'Next on Snippets'} arrives={coming.data.arrives} /> : null}
    </Screen>
  );
}

/** Tonight's premiere: key art, countdown, Remind me / Catch up. Turns into Watch live when it starts. */
function Hero({ premiere, now }: { premiere: Premiere; now: Date }) {
  const { show, drop, at } = premiere;
  const reminder = useReminder(show);
  const left = at.getTime() - now.getTime();
  const live = left <= 0 && left > -LIVE_WINDOW_MS;
  const word = dayLabel(at, now);
  const c = countdownParts(left);
  const eyebrow = live ? 'LIVE NOW' : word === 'tonight' ? `PREMIERES TONIGHT · ${SLOT_LABEL}` : `PREMIERES ${word.toUpperCase()} · ${SLOT_LABEL}`;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${show.title}. ${eyebrow}`} onPress={() => openShow(show)} style={[styles.hero, { backgroundColor: show.color }]}>
      {coverSource(show) ? <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : <View style={styles.heroArt} />}
      <View style={styles.stamp} accessibilityLabel="Real actors, no AI">
        <T style={styles.stampSmall}>REAL</T>
        <T style={styles.stampSerif}>actors</T>
        <T style={styles.stampSmall}>NO AI</T>
      </View>
      <View style={styles.heroText}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.dot, live && { backgroundColor: colors.live }]} />
          <T style={[styles.eyebrow, live && { color: '#FF8A8E' }]}>{eyebrow}</T>
        </View>
        <T style={styles.heroTitle}>{show.title}</T>
        <T style={styles.heroLine}>{`Episodes ${drop.from}–${drop.to} · Live, with the cast in the chat`}</T>
        {live ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`Starts in ${c.days ? `${c.days} days ` : ''}${c.h} hours ${c.m} minutes`}>
            {c.days ? (
              <>
                <T style={styles.box}>{`${c.days}d`}</T>
                <T style={styles.colon}> </T>
              </>
            ) : null}
            <T style={styles.box}>{c.h}</T>
            <T style={styles.colon}>:</T>
            <T style={styles.box}>{c.m}</T>
            <T style={styles.colon}>:</T>
            <T style={styles.box}>{c.s}</T>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {live ? (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/live/[showId]', params: { showId: show.id } })} style={[styles.cta, { backgroundColor: colors.live }]}>
              <Icon name="live" size={18} color="#fff" />
              <T style={[styles.ctaText, { color: '#fff' }]}>Watch live</T>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: reminder.isOn }}
              onPress={reminder.toggle}
              disabled={reminder.busy}
              style={[styles.cta, reminder.isOn ? styles.ctaOn : { backgroundColor: colors.gold }]}
            >
              <Icon name={reminder.isOn ? 'check' : 'bell'} size={17} color={reminder.isOn ? colors.gold : colors.ink} />
              <T style={[styles.ctaText, reminder.isOn && { color: colors.gold }]}>{reminder.isOn ? 'Reminder on' : 'Remind me'}</T>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={() => openShow(show)} style={[styles.cta, styles.ctaGhost]}>
            <T style={[styles.ctaText, { color: colors.text }]}>Catch up</T>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/** Where you left off, with this week's drop progress. */
function ContinueWatching({ shows }: { shows: Show[] }) {
  const progress = useAppStore((s) => s.progress);
  const resume = Object.entries(progress)
    .map(([id, p]) => ({ show: shows.find((s) => s.id === id), p }))
    .find((x) => x.show && x.p.episode <= x.show.latestEpisode);
  if (!resume?.show) return null;
  const { show, p } = resume;
  const dur = p.durationSec ?? 0;
  const left = dur > 0 ? Math.max(0, dur - p.positionSec) : 0;
  const frac = dur > 0 ? Math.min(1, p.positionSec / dur) : 0;
  const drop = dropOf(p.episode, show.episodeCount);
  const size = drop.to - drop.from + 1;
  const title = show.episodeTitles[p.episode - 1];
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <View style={styles.section}>
      <T style={styles.h2}>Continue watching</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue ${show.title}, episode ${p.episode}`}
        onPress={() => router.push({ pathname: '/watch/[showId]/[episode]', params: { showId: show.id, episode: String(p.episode) } })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
      >
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={[styles.thumb, { backgroundColor: show.color }]}>
            {coverSource(show) ? <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.thumbPlay}>
              <Icon name="play" size={14} color={colors.ink} />
            </View>
            <View style={styles.thumbTrack}>
              <View style={{ width: `${frac * 100}%`, height: 4, backgroundColor: colors.text }} />
            </View>
          </View>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <T style={styles.kicker}>{show.title.toUpperCase()}</T>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text }} numberOfLines={1}>{`Ep ${p.episode}${title ? ` · ${title}` : ''}`}</T>
            {left > 0 ? <T style={styles.meta}>{`${fmt(left)} left`}</T> : null}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: size }, (_, i) => {
              const n = drop.from + i;
              return <View key={n} style={[styles.seg, n < p.episode && { backgroundColor: colors.text }, n === p.episode && { backgroundColor: 'rgba(244,241,234,0.55)' }]} />;
            })}
          </View>
          <T style={styles.meta}>{`Episode ${p.episode} of ${drop.to}`}</T>
        </View>
      </Pressable>
    </View>
  );
}

function ComingSoonRow({ title, arrives }: { title: string; arrives: string }) {
  const notify = useAppStore((s) => s.notifyComingSoon);
  const setNotify = useAppStore((s) => s.setNotifyComingSoon);
  return (
    <View style={styles.section}>
      <T style={styles.h2}>Coming soon</T>
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={styles.soonArt}>
          <T style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>s<T style={{ fontFamily: fonts.display, fontSize: 22, color: colors.accent }}>.</T></T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{title}</T>
          <T style={styles.meta}>{arrives}</T>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: notify }} onPress={() => setNotify(!notify)} style={[styles.notify, notify && { borderColor: colors.text }]}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text }}>{notify ? 'On' : 'Notify me'}</T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 26 },
  h2: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.text, marginBottom: 10 },
  meta: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSoft },
  kicker: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.4, color: '#A7A3B3' },
  hero: { marginTop: 10, height: 470, borderRadius: 22, overflow: 'hidden' },
  heroArt: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      'radial-gradient(circle at 35% 22%, rgba(196,106,58,0.45) 0%, rgba(196,106,58,0) 45%), radial-gradient(circle at 98% 50%, rgba(46,125,166,0.38) 0%, rgba(46,125,166,0) 40%)',
  },
  stamp: { position: 'absolute', right: 16, top: 16, width: 66, height: 66, borderRadius: 33, borderWidth: 1.5, borderColor: 'rgba(244,241,234,0.75)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '10deg' }] },
  stampSmall: { fontFamily: fonts.bodyHeavy, fontSize: 8, letterSpacing: 1.2, color: colors.text },
  stampSerif: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 16, color: colors.text },
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 120, paddingHorizontal: 18, paddingBottom: 18, gap: 10, experimental_backgroundImage: 'linear-gradient(180deg, rgba(26,9,15,0) 0%, rgba(14,8,10,0.92) 45%)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  eyebrow: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.8, color: colors.gold },
  heroTitle: { fontFamily: fonts.display, fontSize: 44, lineHeight: 52, textTransform: 'uppercase', color: colors.text },
  heroLine: { fontFamily: fonts.serifItalic, fontSize: 19, lineHeight: 24, color: '#F1E6E2' },
  box: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(8,8,10,0.55)', fontFamily: fonts.bodyHeavy, fontSize: 22, color: colors.text, fontVariant: ['tabular-nums'] },
  colon: { fontFamily: fonts.bodyHeavy, fontSize: 22, color: '#A7A3B3' },
  cta: { height: 50, paddingHorizontal: 18, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaOn: { backgroundColor: 'rgba(232,194,122,0.16)', borderWidth: 1, borderColor: colors.gold },
  ctaGhost: { borderWidth: 1, borderColor: 'rgba(244,241,234,0.4)' },
  ctaText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.ink },
  card: { gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#24242C' },
  thumb: { width: 132, height: 74, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbPlay: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(244,241,234,0.9)', alignItems: 'center', justifyContent: 'center' },
  thumbTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(244,241,234,0.25)' },
  seg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#2E2E38' },
  poster: { height: 220, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end', padding: 10 },
  posterLetter: { position: 'absolute', right: -14, top: -20, fontFamily: fonts.display, fontSize: 200, lineHeight: 230, color: 'rgba(244,241,234,0.07)' },
  posterShade: { ...StyleSheet.absoluteFill, experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%)' },
  posterTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, textTransform: 'uppercase', color: colors.text },
  soonArt: { width: 56, height: 72, borderRadius: 10, backgroundColor: colors.wine, alignItems: 'center', justifyContent: 'center' },
  notify: { height: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: '#4A4A55', alignItems: 'center', justifyContent: 'center' },
});
