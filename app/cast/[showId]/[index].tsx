import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Reel } from '@/components/Reel';
import { Button, HumanStamp, T } from '@/components/ui';
import { coverSource } from '@/data/covers';
import { useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { countdownParts, premiereFor, premiereStage } from '@/lib/premieres';
import { capitalize, dayLabel, SLOT_LABEL } from '@/lib/schedule';
import { colors, fonts, radius, tintFor } from '@/theme/tokens';

const realName = (name: string) => (name.startsWith('[') ? '' : name);

/** An actor's page: the person first, the roles they play, their shows, and where gifts go. */
export default function CastScreen() {
  const { showId, index } = useLocalSearchParams<{ showId: string; index: string }>();
  const insets = useSafeAreaInsets();
  const shows = useShows();
  const now = useNow(1000);
  const show = shows.data?.find((s) => s.id === showId);
  const member = show?.cast[Number(index)];
  const reminder = useReminder(show);

  if (!show || !member) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {shows.isPending ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <T variant="caption">This person isn’t listed any more.</T>
        )}
      </View>
    );
  }

  const name = realName(member.actorName);
  // Every role this person plays across Snippets (matched by name once real names are in).
  const roles = (shows.data ?? []).flatMap((s) =>
    s.cast
      .map((c, i) => ({ s, c, i }))
      .filter(({ c, s: sh }) =>
        name ? realName(c.actorName) === name : sh.id === show.id && c.role === member.role,
      ),
  );
  const premiere = premiereFor(show, now);
  const stage = premiere ? premiereStage(premiere.at, now) : null;
  const c = premiere ? countdownParts(premiere.at.getTime() - now.getTime()) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      >
        <Icon name="back" />
      </Pressable>

      <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 24 }}>
        <View style={[styles.face, { backgroundColor: tintFor(member.role) }]}>
          <T style={{ fontFamily: fonts.serif, fontSize: 64, lineHeight: 72, color: colors.text }}>
            {(name || member.role).charAt(0)}
          </T>
        </View>
        <T
          style={{
            fontFamily: fonts.serif,
            fontSize: 34,
            lineHeight: 40,
            color: colors.text,
            textAlign: 'center',
          }}
        >
          {name || '[Actor name]'}
        </T>
        <T
          style={{
            fontFamily: fonts.engraved,
            fontSize: 12,
            letterSpacing: 2.4,
            textTransform: 'uppercase',
            color: colors.gold,
            textAlign: 'center',
          }}
        >
          {`Plays ${member.role} · ${show.title}`}
        </T>
        {member.alsoCredit ? (
          <T
            style={{
              fontFamily: fonts.serifItalic,
              fontSize: 19,
              lineHeight: 24,
              color: colors.textSoft,
            }}
          >
            {member.alsoCredit}
          </T>
        ) : null}
        <View style={{ marginTop: 6 }}>
          <HumanStamp size={70} />
        </View>
        <T
          style={{
            fontFamily: fonts.body,
            fontSize: 14,
            lineHeight: 20,
            color: colors.muted,
            textAlign: 'center',
          }}
        >
          A real person, on screen and behind it. The cast co-own every show they make on Snippets.
        </T>
      </View>

      <View style={styles.section}>
        <T style={styles.h2}>{roles.length > 1 ? 'Their shows' : 'Their show'}</T>
        {roles.map(({ s, c: role }) => (
          <Pressable
            key={`${s.id}-${role.role}`}
            accessibilityRole="button"
            accessibilityLabel={`${s.title}, as ${role.role}`}
            onPress={() => router.push({ pathname: '/show/[showId]', params: { showId: s.id } })}
            style={({ pressed }) => [styles.showRow, pressed && { opacity: 0.85 }]}
          >
            <View style={[styles.poster, { backgroundColor: s.color }]}>
              {coverSource(s) ? (
                <Image
                  source={coverSource(s)!}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T style={{ fontFamily: fonts.engraved, fontSize: 15, color: colors.goldLight }}>
                {s.title}
              </T>
              <T
                style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted }}
              >{`As ${role.role} · ${s.genre}`}</T>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.giftCard}>
          <Reel
            size={52}
            progress={
              stage === 'countdown' && c && c.days === 0
                ? 1 - (Number(c.h) * 60 + Number(c.m)) / 1440
                : undefined
            }
            spinning={stage === 'doors' || stage === 'live'}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>
              {stage === 'live'
                ? `${name || 'They'}’s in the chat right now`
                : premiere
                  ? `Catch ${name || 'them'} live ${dayLabel(premiere.at, now)} at ${SLOT_LABEL}`
                  : 'In the chat at every premiere'}
            </T>
            <T
              style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted }}
            >
              Send a gift during a live premiere and pick who gets it: it goes to the person you
              choose.
            </T>
          </View>
        </View>
        {premiere && (stage === 'doors' || stage === 'live' || stage === 'after') ? (
          <Button
            label={
              stage === 'doors'
                ? 'Join the lobby'
                : stage === 'live'
                  ? 'Watch live'
                  : 'Join the after-chat'
            }
            onPress={() => router.push({ pathname: '/live/[showId]', params: { showId: show.id } })}
            style={{ marginTop: 12 }}
          />
        ) : premiere ? (
          <Button
            kind={reminder.isOn ? 'outline' : 'primary'}
            icon={reminder.isOn ? 'check' : 'bell'}
            label={
              reminder.isOn
                ? 'Reminder on'
                : `Remind me · ${capitalize(dayLabel(premiere.at, now))} at ${SLOT_LABEL}`
            }
            loading={reminder.busy}
            onPress={reminder.toggle}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.gold,
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
  showRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 56, marginBottom: 10 },
  poster: { width: 56, height: 80, borderRadius: 8, overflow: 'hidden' },
  giftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
});
