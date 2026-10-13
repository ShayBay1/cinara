import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fade } from '@/components/feed/Fade';
import { Glass } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import type { Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useReminder } from '@/hooks/useReminder';
import { playEpisode } from '@/lib/play';
import { premiereFor, upcomingPremieres } from '@/lib/premieres';
import { dayLabel, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts } from '@/theme/tokens';

const openShow = (id: string) => router.push({ pathname: '/show/[showId]', params: { showId: id } });

/** Home's header: the wordmark, search, and shortcuts, floating over the hero. */
export function BrowseHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
      <Fade stops={[[0, 0.75], [1, 0]]} color={colors.ink} />
      <View style={styles.headRow}>
        <Text style={styles.logo}>Snippets.</Text>
        <Pressy accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/search')} scaleTo={0.9}>
          <Icon name="search" size={22} color={colors.text} />
        </Pressy>
      </View>
      <View style={styles.chips}>
        <Chip label="Premiere calendar" onPress={() => router.push('/schedule')} />
      </View>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressy accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressy>
  );
}

/** The featured show, poster-size, with Play and a reminder for its next drop. */
export function BrowseHero({ show, now }: { show: Show; now: Date }) {
  const { height } = useWindowDimensions();
  const progress = useAppStore((s) => s.progress[show.id]);
  const reminder = useReminder(show);
  const premiere = premiereFor(show, now);
  const ep = progress && progress.episode <= show.latestEpisode ? progress.episode : 1;
  const src = coverSource(show);
  return (
    <View style={[styles.hero, { height: Math.round(height * 0.68), backgroundColor: show.color }]}>
      {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : null}
      <Fade stops={[[0, 0.15], [0.35, 0], [0.62, 0.35], [1, 1]]} color={colors.ink} />
      <View style={styles.heroInner}>
        <Text style={styles.eyebrow}>
          No. {show.number}
          {premiere ? ` · New episodes ${dayLabel(premiere.at, now)} ${SLOT_LABEL}` : ''}
        </Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {show.title}
        </Text>
        <Text style={styles.tagline} numberOfLines={2}>
          {show.tagline}
        </Text>
        <View style={styles.heroBtns}>
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={`Play ${show.title}`}
            feel="tap"
            onPress={() => playEpisode(show.id, ep)}
            style={[styles.btn, { backgroundColor: colors.gold }]}
          >
            <Icon name="play" size={15} color={colors.goldInk} />
            <Text style={[styles.btnText, { color: colors.goldInk }]}>{ep > 1 ? `Play Ep ${ep}` : 'Play'}</Text>
          </Pressy>
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={reminder.isOn ? 'Reminder on' : 'Remind me'}
            onPress={() => void reminder.toggle()}
            style={styles.btn}
          >
            <Glass radius={999} style={StyleSheet.absoluteFill} />
            <Icon name={reminder.isOn ? 'check' : 'bell'} size={16} color={reminder.isOn ? colors.gold : colors.text} />
            <Text style={styles.btnText}>{reminder.isOn ? 'Reminded' : 'Remind me'}</Text>
          </Pressy>
        </View>
      </View>
    </View>
  );
}

/** A portrait poster with the title set on it. */
export function Poster({
  show,
  badge,
  width = 112,
}: {
  show: Show;
  badge?: string;
  width?: number;
}) {
  const src = coverSource(show);
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={`${show.title}${badge ? `, ${badge}` : ''}`}
      onPress={() => openShow(show.id)}
      style={[styles.poster, { width, height: width * 1.5, backgroundColor: show.color }]}
    >
      {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : null}
      <Fade stops={[[0.45, 0], [1, 0.88]]} />
      {badge ? (
        <View style={styles.pBadge}>
          <Text style={styles.pBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.pTitle} numberOfLines={2}>
        {show.title}
      </Text>
    </Pressy>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingTop: 26 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, alignItems: 'flex-end' }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Every drop in the next seven days, soonest first. */
export function PremieringRow({ shows, now }: { shows: Show[]; now: Date }) {
  const items = upcomingPremieres(shows, now, 1).filter(
    (p) => p.at.getTime() - now.getTime() < 7 * 24 * 3600 * 1000,
  );
  if (!items.length) return null;
  return (
    <Row label="Premiering this week">
      {items.map((p) => {
        const d = dayLabel(p.at, now);
        const tag = d === 'tonight' || d === 'tomorrow' ? d.toUpperCase() : d.slice(0, 3).toUpperCase();
        return <Poster key={`${p.show.id}-${p.at.getTime()}`} show={p.show} badge={`${tag} · ${SLOT_LABEL}`} />;
      })}
    </Row>
  );
}

/** The top shows, numbered. */
export function TopRow({ shows }: { shows: Show[] }) {
  if (!shows.length) return null;
  const ranked = [...shows].sort((a, b) => a.number.localeCompare(b.number)).slice(0, 10);
  return (
    <Row label="Top on Snippets">
      {ranked.map((s, i) => (
        <View key={s.id} style={styles.topItem}>
          <Text style={styles.topNum}>{i + 1}</Text>
          <Poster show={s} />
        </View>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 14, zIndex: 5 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 },
  logo: { fontFamily: fonts.serifItalic, fontSize: 30, color: colors.goldLight },
  chips: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,234,216,0.45)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(21,16,11,0.35)',
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSoft },
  hero: { width: '100%', justifyContent: 'flex-end', overflow: 'hidden' },
  heroInner: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 18 },
  eyebrow: {
    fontFamily: fonts.engraved,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.goldLight,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroTitle: { fontFamily: fonts.serifItalic, fontSize: 46, lineHeight: 46, color: colors.text, textAlign: 'center' },
  tagline: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSoft, textAlign: 'center', marginTop: 8 },
  heroBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    overflow: 'hidden',
  },
  btnText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text },
  rowLabel: {
    fontFamily: fonts.engraved,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textSoft,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  poster: { borderRadius: 10, overflow: 'hidden' },
  pBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.goldLight,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pBadgeText: { fontFamily: fonts.bodyHeavy, fontSize: 9, letterSpacing: 1, color: colors.goldInk },
  pTitle: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    fontFamily: fonts.serifItalic,
    fontSize: 17,
    lineHeight: 18,
    color: colors.text,
  },
  topItem: { flexDirection: 'row', alignItems: 'flex-end' },
  topNum: {
    fontFamily: fonts.serifItalic,
    fontSize: 104,
    lineHeight: 104,
    color: colors.gold,
    marginRight: -12,
    zIndex: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 8,
  },
});
