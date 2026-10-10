import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Develop } from '@/components/Develop';
import { Glass } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { Reel } from '@/components/Reel';
import { ErrorState, T } from '@/components/ui';
import { FREE_EPISODES, type Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useMembership, useShow } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { countdownParts, dropNight, premiereFor, premiereStage } from '@/lib/premieres';
import { dayLabel, DROP_SIZE, SLOT_LABEL } from '@/lib/schedule';
import { playEpisode, resumeEpisode, resumePoint, startOver } from '@/lib/play';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, tintFor } from '@/theme/tokens';

/** The show page: sells the show in five seconds, then episodes as a film strip and the cast who made it. */
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
        <Reel size={56} spinning label="Loading" />
      </View>
    );
  }
  return <ShowPage show={show.data} />;
}

/** Episodes on the strip: asks Resume or Start over if you're partway through that one. */
const watch = (show: Show, n: number) => playEpisode(show.id, n);
const openLive = (show: Show) =>
  router.push({ pathname: '/live/[showId]', params: { showId: show.id } });

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
  const resumeFrac = progress?.durationSec
    ? Math.min(1, progress.positionSec / progress.durationSec)
    : 0;
  // Partway through: show Resume plus a Start over button.
  const canStartOver =
    resumeEp !== null && progress !== undefined && resumePoint(show.id, resumeEp) !== null;
  const drops = Math.ceil(show.episodeCount / DROP_SIZE);
  const done = show.latestEpisode >= show.episodeCount;
  const special = show.episodeCount === 1;
  const seasonLine = done
    ? special
      ? `${show.genre} · Special`
      : `Season 1 · All ${show.episodeCount} episodes out`
    : `${show.genre} · 10 new every ${dropNight(show)} at ${SLOT_LABEL}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      <View style={[styles.art, { backgroundColor: show.color, height: 340 + insets.top }]}>
        {coverSource(show) ? (
          <Image
            source={coverSource(show)!}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={{ left: '50%', top: '20%' }}
            transition={250}
          />
        ) : (
          <View style={styles.artGlow} />
        )}
        <View style={styles.artFade} />
        <Pressy
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={[styles.back, { top: insets.top + 6 }]}
        >
          <Glass radius={22} interactive style={styles.glassBtn}>
            <Icon name="back" />
          </Glass>
        </Pressy>
      </View>

      <View style={styles.body}>
        <T style={styles.eyebrow}>A Snippets original</T>
        <T style={styles.title}>{show.title}</T>
        <T style={styles.hook}>{show.tagline}</T>
        <T style={styles.meta}>{seasonLine}</T>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Pressy
            accessibilityRole="button"
            onPress={() => resumeEpisode(show.id, resumeEp ?? 1)}
            style={styles.primary}
          >
            <Icon name="play" size={18} color={colors.ink} filled />
            <T style={styles.primaryText}>
              {resumeEp
                ? special
                  ? 'Resume'
                  : `Resume Episode ${resumeEp}`
                : special
                  ? 'Play · free'
                  : 'Play Episode 1 · free'}
            </T>
            {resumeEp && resumeFrac > 0 ? (
              <View style={styles.primaryTrack}>
                <View
                  style={{ width: `${resumeFrac * 100}%`, height: 3, backgroundColor: colors.ink }}
                />
              </View>
            ) : null}
          </Pressy>
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={inList ? 'Remove from My List' : 'Add to My List'}
            accessibilityState={{ selected: inList }}
            feel={inList ? 'tap' : 'success'}
            onPress={() => toggleList(show.id)}
            style={[styles.square, inList && { borderColor: colors.gold }]}
          >
            <Icon name={inList ? 'check' : 'plus'} color={inList ? colors.gold : colors.text} />
          </Pressy>
        </View>
        {canStartOver ? (
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={
              special
                ? 'Start over from the beginning'
                : `Start Episode ${resumeEp} over from the beginning`
            }
            onPress={() => startOver(show.id, resumeEp!)}
            style={styles.startOver}
          >
            <Icon name="replay" size={16} color={colors.text} />
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.text }}>
              {special ? 'Start over' : `Start Episode ${resumeEp} over`}
            </T>
          </Pressy>
        ) : null}

        {show.synopsis ? <T style={styles.synopsis}>{show.synopsis}</T> : null}

        <View style={styles.turnNote}>
          <View style={styles.turnIcon}>
            <Icon name="turn" size={20} />
          </View>
          <T
            style={{
              flex: 1,
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 18,
              color: colors.textSoft,
            }}
          >
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.text }}>
              Vertical or Cinema.
            </T>{' '}
            Watch it upright, or turn your phone sideways and the picture follows.
          </T>
        </View>
      </View>

      <View style={styles.section}>
        <T style={styles.h2}>Episodes</T>
        {Array.from({ length: drops }, (_, i) => {
          const from = i * DROP_SIZE + 1;
          const to = Math.min(show.episodeCount, from + DROP_SIZE - 1);
          if (from <= show.latestEpisode) {
            return (
              <FilmStrip
                key={from}
                show={show}
                from={from}
                to={Math.min(to, show.latestEpisode)}
                isMember={isMember}
                resumeEp={resumeEp}
              />
            );
          }
          if (premiere && from === premiere.drop.from)
            return (
              <NextDrop key={from} show={show} from={from} to={to} at={premiere.at} now={now} />
            );
          if (premiere && from === premiere.drop.from + DROP_SIZE) {
            return (
              <View key={from} style={[styles.drop, styles.dropFuture]}>
                <T style={styles.dropTitle}>{`Episodes ${from}–${show.episodeCount}`}</T>
                <T style={styles.dropSub}>{`10 more every ${dropNight(show)} at ${SLOT_LABEL}`}</T>
              </View>
            );
          }
          return null;
        })}
      </View>

      <View style={styles.section}>
        <T style={styles.h2}>Made by the people on screen</T>
        <T style={[styles.dropSub, { marginTop: -6, marginBottom: 14 }]}>
          The cast co-own this show. Tap someone to meet them.
        </T>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -16 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
        >
          {show.cast.map((c, index) => {
            const name = c.actorName.startsWith('[') ? '[Actor]' : c.actorName;
            return (
              <Pressy
                key={c.role}
                accessibilityRole="button"
                accessibilityLabel={`${name}, plays ${c.role}. Open their page.`}
                onPress={() =>
                  router.push({
                    pathname: '/cast/[showId]/[index]',
                    params: { showId: show.id, index: String(index) },
                  })
                }
                style={{ width: 80, alignItems: 'center', gap: 6 }}
              >
                <View style={[styles.face, { backgroundColor: tintFor(c.role) }]}>
                  <T style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>
                    {c.role.charAt(0)}
                  </T>
                </View>
                <T
                  style={{
                    fontFamily: fonts.bodyHeavy,
                    fontSize: 12,
                    color: colors.text,
                    textAlign: 'center',
                  }}
                  numberOfLines={1}
                >
                  {name}
                </T>
                <T
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 11,
                    color: colors.muted,
                    textAlign: 'center',
                  }}
                  numberOfLines={1}
                >
                  {c.role}
                </T>
              </Pressy>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

/**
 * A released drop as a strip of film: watched frames in colour, unwatched ones in sepia,
 * members' episodes in sepia with the reel lock. Progress shows at a glance.
 */
function FilmStrip({
  show,
  from,
  to,
  isMember,
  resumeEp,
}: {
  show: Show;
  from: number;
  to: number;
  isMember: boolean;
  resumeEp: number | null;
}) {
  const free = to <= FREE_EPISODES;
  const locked = !free && !isMember;
  const eps = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const watchedCount = resumeEp ? eps.filter((n) => n < resumeEp).length : 0;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={styles.stripHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={styles.dropTitle}>
            {from === to ? `Episode ${from}` : `Episodes ${from}–${to}`}
          </T>
          {free ? (
            <T style={styles.freeTag}>FREE</T>
          ) : locked ? (
            <Icon name="lock" size={14} color={colors.gold} />
          ) : null}
        </View>
        <T style={styles.dropSub}>
          {locked
            ? 'Members'
            : watchedCount
              ? `${watchedCount} of ${eps.length} watched`
              : `${eps.length} episodes`}
        </T>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={{ paddingHorizontal: 10, gap: 8 }}
      >
        {eps.map((n) => {
          const watched = resumeEp !== null && n < resumeEp;
          const current = resumeEp === n;
          const title = show.episodeTitles[n - 1] ?? `Episode ${n}`;
          return (
            <Pressy
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`Episode ${n}, ${title}${watched ? ', watched' : current ? ', in progress' : locked ? ', for members' : ''}`}
              onPress={() => watch(show, n)}
              style={{ width: 86, gap: 5 }}
            >
              <Develop
                developed={watched || current}
                style={[styles.frame, current && { borderColor: colors.gold, borderWidth: 2 }]}
              >
                <View style={[StyleSheet.absoluteFill, { backgroundColor: show.color }]} />
                {coverSource(show) ? (
                  <Image
                    source={coverSource(show)!}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                ) : null}
                <T style={styles.frameNum}>{n}</T>
                {locked ? (
                  <View style={styles.frameLock}>
                    <Icon name="reel" size={22} color={colors.goldLight} />
                  </View>
                ) : null}
              </Develop>
              <T style={[styles.frameTitle, current && { color: colors.gold }]} numberOfLines={1}>
                {current ? 'Resume' : title}
              </T>
            </Pressy>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The next drop: the last frame on the strip, in sepia, with the countdown reel. */
function NextDrop({
  show,
  from,
  to,
  at,
  now,
}: {
  show: Show;
  from: number;
  to: number;
  at: Date;
  now: Date;
}) {
  const reminder = useReminder(show);
  const stage = premiereStage(at, now);
  const left = at.getTime() - now.getTime();
  const c = countdownParts(left);
  const onNow = stage === 'doors' || stage === 'live' || stage === 'after';
  const line =
    stage === 'live'
      ? 'Live premiere · on now'
      : stage === 'doors'
        ? 'Doors are open · live at 8/7c'
        : stage === 'after'
          ? 'After-chat open with the cast'
          : `Premieres live ${dayLabel(at, now)} at ${SLOT_LABEL}, with the cast`;
  return (
    <View style={[styles.drop, styles.dropNext]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Reel
          size={48}
          progress={onNow ? undefined : 1 - Math.min(1, left / (7 * 86_400_000))}
          spinning={onNow}
        />
        <View style={{ flex: 1 }}>
          <T style={styles.dropTitle}>{`Episodes ${from}–${to}`}</T>
          <T style={[styles.dropSub, { color: stage === 'live' ? colors.liveSoft : colors.gold }]}>
            {line}
          </T>
          {!onNow ? (
            <T style={styles.count}>
              {c.days ? `${c.days}d ${c.h}h ${c.m}m` : `${c.h}:${c.m}:${c.s}`}
            </T>
          ) : null}
        </View>
      </View>
      {onNow ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => openLive(show)}
          style={[
            styles.dropBtn,
            { backgroundColor: stage === 'live' ? colors.live : colors.gold },
          ]}
        >
          <T
            style={{
              fontFamily: fonts.bodyHeavy,
              fontSize: 14,
              color: stage === 'live' ? '#FFFFFF' : colors.ink,
            }}
          >
            {stage === 'doors'
              ? 'Join the lobby'
              : stage === 'live'
                ? 'Watch live'
                : 'Join the after-chat'}
          </T>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: reminder.isOn, busy: reminder.busy }}
          onPress={reminder.toggle}
          style={[
            styles.dropBtn,
            reminder.isOn
              ? { borderWidth: 1, borderColor: colors.gold }
              : { backgroundColor: colors.gold },
          ]}
        >
          <Icon
            name={reminder.isOn ? 'check' : 'bell'}
            size={16}
            color={reminder.isOn ? colors.gold : colors.ink}
          />
          <T
            style={{
              fontFamily: fonts.bodyHeavy,
              fontSize: 14,
              color: reminder.isOn ? colors.gold : colors.ink,
            }}
          >
            {reminder.isOn ? 'Reminder on' : 'Remind me'}
          </T>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  startOver: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  center: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  art: { overflow: 'hidden' },
  artGlow: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      'radial-gradient(circle at 30% 35%, rgba(255,184,0,0.22) 0%, rgba(255,184,0,0) 45%)',
  },
  artFade: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(21,16,11,0.35) 0%, rgba(21,16,11,0) 25%, rgba(21,16,11,0) 50%, rgba(21,16,11,1) 100%)',
  },
  back: { position: 'absolute', left: 10, width: 44, height: 44 },
  glassBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, marginTop: -64, gap: 8 },
  eyebrow: {
    fontFamily: fonts.engraved,
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.goldLight,
  },
  hook: { fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: colors.text },
  meta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  synopsis: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSoft,
  },
  primary: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  primaryTrack: {
    position: 'absolute',
    left: 26,
    right: 26,
    bottom: 7,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(21,16,11,0.25)',
    overflow: 'hidden',
  },
  square: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnNote: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  turnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(243,234,216,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { paddingTop: 30, paddingHorizontal: 16 },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
    marginBottom: 12,
  },
  stripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  strip: {
    marginHorizontal: -16,
    paddingVertical: 10,
    backgroundColor: '#0E0A07',
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  frame: {
    width: 86,
    height: 120,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  frameNum: {
    position: 'absolute',
    left: 6,
    top: 4,
    fontFamily: fonts.engraved,
    fontSize: 14,
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
  frameLock: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21,16,11,0.35)',
  },
  frameTitle: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSoft },
  drop: {
    marginBottom: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  dropNext: { borderColor: colors.gold, backgroundColor: '#221A0F' },
  dropFuture: { backgroundColor: 'transparent', borderStyle: 'dashed', gap: 2 },
  dropTitle: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text },
  dropSub: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  dropBtn: {
    height: 46,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  freeTag: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.ink,
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  count: {
    marginTop: 2,
    fontFamily: fonts.bodyHeavy,
    fontSize: 17,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  face: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
});
