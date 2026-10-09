import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { T } from '@/components/ui';
import type { Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useReminder } from '@/hooks/useReminder';
import { useLaunchFrame } from '@/lib/launchFrame';
import { LIVE_WINDOW_MS, premiereFor, type Premiere } from '@/lib/premieres';
import { capitalize, dayLabel } from '@/lib/schedule';
import { fonts, home } from '@/theme/tokens';

const LOGO = require('../../../assets/launch/home-logo.png');

const openShow = (show: Show) =>
  router.push({ pathname: '/show/[showId]', params: { showId: show.id } });

/**
 * The top of Home: logo, search, tonight's premiere card and the Now streaming row.
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
  const { u, x, y } = useLaunchFrame();
  // The featured title (The Making of Zipline) owns the card the launch film lands on; otherwise tonight's premiere.
  const show = featured ?? premiere?.show;
  const cardPremiere = featured ? premiereFor(featured, now) : premiere;

  return (
    <View>
      {/* Header: everything above the card */}
      <View style={{ height: y(126) }}>
        <Image
          source={LOGO}
          style={{
            position: 'absolute',
            left: x(17.15),
            top: y(45.35),
            width: u(78.64),
            height: u(78.64),
          }}
          contentFit="contain"
          accessibilityLabel="Snippets"
        />
        <View
          accessibilityRole="search"
          style={{
            position: 'absolute',
            left: x(96),
            width: u(179),
            top: y(60),
            height: u(40),
            flexDirection: 'row',
            alignItems: 'center',
            gap: u(8),
            paddingHorizontal: u(13),
            backgroundColor: home.field,
            borderWidth: 1,
            borderColor: home.fieldLine,
            borderRadius: u(8),
          }}
        >
          <Svg
            width={u(16)}
            height={u(16)}
            viewBox="0 0 24 24"
            fill="none"
            stroke={home.fieldIcon}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.5-3.5" />
          </Svg>
          <T
            style={{ fontFamily: fonts.body, fontSize: u(13), color: home.placeholder }}
            numberOfLines={1}
          >
            Search shows and actors
          </T>
        </View>
      </View>

      {show ? (
        <PremiereCard show={show} premiere={cardPremiere} now={now} />
      ) : (
        <View style={{ height: u(300) }} />
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
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={s.title}
                onPress={() => openShow(s)}
                style={({ pressed }) => [
                  {
                    width: u(80),
                    height: u(130),
                    overflow: 'hidden',
                    experimental_backgroundImage: `linear-gradient(170deg, ${s.color}, ${home.bg})`,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {coverSource(s) ? (
                  <Image
                    source={coverSource(s)!}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

/** Tonight's premiere (or the featured title): the card the launch film lands on. */
function PremiereCard({
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
  const left = premiere ? premiere.at.getTime() - now.getTime() : 0;
  const live = !!premiere && left <= 0 && left > -LIVE_WINDOW_MS;
  const eyebrow = !premiere
    ? 'Now streaming'
    : live
      ? 'Live now'
      : `${capitalize(dayLabel(premiere.at, now))} at 8 · 7 Central.`;
  const action = !premiere
    ? {
        label: 'Watch now',
        onPress: () =>
          router.push({
            pathname: '/watch/[showId]/[episode]',
            params: { showId: show.id, episode: '1' },
          }),
      }
    : live
      ? {
          label: 'Watch live',
          onPress: () => router.push({ pathname: '/live/[showId]', params: { showId: show.id } }),
        }
      : { label: reminder.isOn ? 'Reminder on' : 'Notify me', onPress: reminder.toggle };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${show.title}. ${eyebrow}`}
      onPress={() => openShow(show)}
      style={{
        marginLeft: x(13),
        width: u(262),
        height: u(300),
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
      <T
        style={[
          styles.label,
          {
            position: 'absolute',
            left: u(13),
            top: u(13),
            fontSize: u(9),
            lineHeight: u(13),
            letterSpacing: u(9) * 0.26,
            color: home.gold,
          },
        ]}
      >
        {eyebrow}
      </T>
      <T
        style={[
          styles.label,
          {
            position: 'absolute',
            left: u(13),
            right: u(13),
            bottom: u(55),
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
        accessibilityState={{ selected: reminder.isOn }}
        onPress={action.onPress}
        disabled={reminder.busy}
        style={({ pressed }) => [
          {
            position: 'absolute',
            left: u(13),
            right: u(13),
            bottom: u(13),
            height: u(32),
            borderWidth: 1,
            borderColor: home.parchment,
            alignItems: 'center',
            justifyContent: 'center',
          },
          pressed && { backgroundColor: 'rgba(243,234,216,0.12)' },
        ]}
      >
        <T
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: u(10),
            letterSpacing: u(10) * 0.08,
            textTransform: 'uppercase',
            color: home.parchment,
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
