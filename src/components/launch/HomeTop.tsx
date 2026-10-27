import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { Reel } from '@/components/Reel';
import { GhostCard } from '@/components/Skeleton';
import { LivingCard } from '@/components/launch/LivingCard';
import { T } from '@/components/ui';
import type { Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useReminder } from '@/hooks/useReminder';
import { homeLogo, useLaunchFrame } from '@/lib/launchFrame';
import { playEpisode } from '@/lib/play';
import { countdownParts, premiereFor, premiereStage, type Premiere } from '@/lib/premieres';
import { capitalize, dayLabel, SLOT_LABEL } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, home } from '@/theme/tokens';

const LOGO = require('../../../assets/launch/home-logo.png');

const openShow = (show: Show) =>
  router.push({ pathname: '/show/[showId]', params: { showId: show.id } });
const openLive = (show: Show) =>
  router.push({ pathname: '/live/[showId]', params: { showId: show.id } });

/**
 * The top of Home: logo, search, the Tonight card and the Now streaming row.
 * Every position is in the launch animation's mock units (see launchFrame), so this lines up
 * with the video's last frame and the film lands exactly on the card.
 */
export function HomeTop({
  shows,
  premiere,
  featured,
  now,
}: {
  shows: Show[];
  premiere: Premiere | null;
  featured?: Show;
  now: Date;
}) {
  const frame = useLaunchFrame();
  const { u, x, y } = frame;
  const insets = useSafeAreaInsets();
  const logo = homeLogo(frame, insets.top);
  // The search pill is a full capsule (curves read as friendly), centred on the logo.
  const searchH = Math.max(44, u(40));
  // The featured title owns the card the launch film lands on; otherwise tonight's premiere.
  const show = featured ?? premiere?.show;
  const cardPremiere = featured ? premiereFor(featured, now) : premiere;

  return (
    <View>
      {/* Header: everything above the card. The logo sits halfway between the top of the screen and the card. */}
      <View style={{ height: y(126) }}>
        <Image
          source={LOGO}
          style={{
            position: 'absolute',
            left: logo.left,
            top: logo.top,
            width: logo.size,
            height: logo.size,
          }}
          contentFit="contain"
          accessibilityLabel="Cinara"
        />
        <Pressy
          accessibilityRole="search"
          accessibilityLabel="Search shows, actors and tropes"
          onPress={() => router.push('/search')}
          feel="tap"
          style={{
            position: 'absolute',
            left: x(96),
            width: u(179),
            top: logo.cy - searchH / 2,
            height: searchH,
          }}
        >
          <Glass
            radius={searchH / 2}
            interactive
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: u(8),
              paddingHorizontal: u(15),
            }}
          >
            <Icon name="search" size={u(16)} color={home.fieldIcon} />
            <T
              style={{ fontFamily: fonts.body, fontSize: u(13), color: home.placeholder }}
              numberOfLines={1}
            >
              Search shows and actors
            </T>
          </Glass>
        </Pressy>
      </View>

      {show ? (
        <LivingCard style={{ marginLeft: x(13) }} width={u(262)} height={u(300)}>
          <TonightCard show={show} premiere={cardPremiere} now={now} />
        </LivingCard>
      ) : (
        <GhostCard style={{ marginLeft: x(13), width: u(262), height: u(300) }} />
      )}

      {shows.length ? (
        <>
          <T
            style={[
              styles.label,
              {
                marginTop: u(21),
                marginLeft: x(16),
                marginBottom: u(8),
                fontSize: u(10),
                letterSpacing: u(10) * 0.26,
              },
            ]}
          >
            Now streaming
          </T>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: x(16), gap: u(8) }}
          >
            {shows.map((s) => (
              <Pressy
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}. ${s.genre}`}
                onPress={() => openShow(s)}
                style={{
                  width: u(80),
                  height: u(130),
                  borderRadius: 6,
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                  experimental_backgroundImage: `linear-gradient(170deg, ${s.color}, ${home.bg})`,
                }}
              >
                {coverSource(s) ? (
                  <Image
                    source={coverSource(s)!}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                ) : null}
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      experimental_backgroundImage:
                        'linear-gradient(180deg, rgba(21,16,11,0) 45%, rgba(21,16,11,0.92) 100%)',
                    },
                  ]}
                />
                <T
                  style={[
                    styles.label,
                    {
                      margin: u(6),
                      fontSize: u(7.5),
                      lineHeight: u(10),
                      letterSpacing: u(7.5) * 0.08,
                      color: home.goldLight,
                    },
                  ]}
                  numberOfLines={3}
                >
                  {s.title}
                </T>
              </Pressy>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

/**
 * The Tonight card: the card the launch film lands on. It changes with the clock: a countdown,
 * Doors open from 7:45, Live now, then the after-chat. One solid gold action.
 */
function TonightCard({
  show,
  premiere,
  now,
}: {
  show: Show;
  premiere: Premiere | null;
  now: Date;
}) {
  const { u, x } = useLaunchFrame();
  const reminder = useReminder(show);
  const savedEp = useAppStore((s) => {
    const p = s.progress[show.id];
    return p && p.episode <= show.latestEpisode ? p.episode : undefined;
  });
  const stage = premiere ? premiereStage(premiere.at, now) : null;
  const left = premiere ? premiere.at.getTime() - now.getTime() : 0;
  const c = countdownParts(left);

  const eyebrow =
    stage === null
      ? 'Now streaming'
      : stage === 'countdown'
        ? `${capitalize(dayLabel(premiere!.at, now))} at ${SLOT_LABEL}`
        : stage === 'doors'
          ? `Doors open · live at ${SLOT_LABEL}`
          : stage === 'live'
            ? 'Live now'
            : 'After-chat open';
  const action =
    stage === null
      ? {
          label: 'Watch now',
          onPress: () => playEpisode(show.id, savedEp ?? 1),
        }
      : stage === 'countdown'
        ? { label: reminder.isOn ? 'Reminder on' : 'Remind me', onPress: reminder.toggle }
        : stage === 'doors'
          ? { label: 'Join the lobby', onPress: () => openLive(show) }
          : stage === 'live'
            ? { label: 'Watch live', onPress: () => openLive(show) }
            : { label: 'Join the after-chat', onPress: () => openLive(show) };
  // The countdown reel shows for the last 24 hours; its ring empties as 8/7c gets closer.
  const showReel = (stage === 'countdown' && left < 86_400_000) || stage === 'doors';
  const btnH = Math.max(44, u(32));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${show.title}. ${eyebrow}`}
      onPress={() => openShow(show)}
      style={{
        flex: 1,
        overflow: 'hidden',
        borderWidth: u(1),
        borderColor: home.gold,
        backgroundColor: show.color,
      }}
    >
      {coverSource(show) ? (
        <Image
          source={coverSource(show)!}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ left: '50%', top: '20%' }}
          transition={250}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage:
              'linear-gradient(180deg, rgba(21,16,11,0.7) 0%, rgba(21,16,11,0.05) 28%, rgba(21,16,11,0.1) 45%, rgba(21,16,11,0.92) 100%)',
          },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          left: u(13),
          top: u(13),
          flexDirection: 'row',
          alignItems: 'center',
          gap: u(5),
        }}
      >
        {stage === 'live' ? (
          <View
            style={{ width: u(6), height: u(6), borderRadius: u(3), backgroundColor: colors.live }}
          />
        ) : null}
        <T
          style={[
            styles.label,
            {
              fontSize: u(9),
              lineHeight: u(13),
              letterSpacing: u(9) * 0.26,
              color: stage === 'live' ? colors.liveSoft : home.gold,
            },
          ]}
        >
          {eyebrow}
        </T>
      </View>
      {showReel ? (
        <View
          style={{ position: 'absolute', right: u(10), top: u(9), alignItems: 'center', gap: u(2) }}
        >
          <Reel
            size={u(40)}
            progress={1 - Math.min(1, left / 86_400_000)}
            spinning={stage === 'doors'}
            label={`${c.h} hours ${c.m} minutes until the premiere`}
          />
          <T
            style={{
              fontFamily: fonts.bodyHeavy,
              fontSize: u(9),
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >{`${c.h}:${c.m}:${c.s}`}</T>
        </View>
      ) : null}
      <T
        style={[
          styles.label,
          {
            position: 'absolute',
            left: u(13),
            right: u(13),
            bottom: u(13) + btnH + u(10),
            fontSize: u(19),
            lineHeight: u(26),
            letterSpacing: u(19) * 0.02,
            color: home.goldLight,
          },
        ]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {show.title}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          selected: stage === 'countdown' ? reminder.isOn : undefined,
          busy: reminder.busy,
        }}
        onPress={action.onPress}
        disabled={reminder.busy}
        style={({ pressed }) => ({
          position: 'absolute',
          left: u(13),
          right: u(13),
          bottom: u(13),
          height: btnH,
          borderRadius: btnH / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            stage === 'countdown' && reminder.isOn ? 'rgba(255,184,0,0.16)' : home.gold,
          borderWidth: stage === 'countdown' && reminder.isOn ? 1 : 0,
          borderColor: home.gold,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <T
          style={{
            fontFamily: fonts.bodyHeavy,
            fontSize: u(11),
            letterSpacing: u(11) * 0.04,
            color: stage === 'countdown' && reminder.isOn ? home.gold : home.bg,
          }}
        >
          {action.label}
        </T>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.engraved, textTransform: 'uppercase', color: home.parchment },
});
