import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Develop } from '@/components/Develop';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { Button, T } from '@/components/ui';
import { coverSource } from '@/data/covers';
import { useShows } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts } from '@/theme/tokens';

const MAX_PICKS = 3;

/**
 * First run: "Pick three". Posters sit in sepia and develop into colour when tapped, which teaches
 * the app's sepia-to-colour language on the very first screen. Then Episode 1 starts, no sign-in.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const shows = useShows();
  const toggleList = useAppStore((s) => s.toggleMyList);
  const myList = useAppStore((s) => s.myList);
  const setOnboarded = useAppStore((s) => s.setOnboarded);
  const [picked, setPicked] = useState<string[]>([]);
  const list = shows.data ?? [];
  const goal = Math.min(MAX_PICKS, list.length || MAX_PICKS);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-MAX_PICKS)));

  const start = () => {
    for (const id of picked) if (!myList[id]) toggleList(id);
    setOnboarded(true);
    const first = picked[0];
    if (first)
      router.replace({
        pathname: '/watch/[showId]/[episode]',
        params: { showId: first, episode: '1' },
      });
    else router.back();
  };
  const skip = () => {
    setOnboarded(true);
    router.back();
  };
  const left = goal - picked.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 20,
          paddingBottom: 140,
          gap: 14,
        }}
      >
        <T variant="eyebrow">Welcome to Snippets</T>
        <T style={{ fontFamily: fonts.serif, fontSize: 34, lineHeight: 38, color: colors.text }}>
          {`Pick ${goal === 3 ? 'three' : goal} ${goal === 1 ? 'show' : 'shows'}.`}
          {'\n'}
          <T
            style={{
              fontFamily: fonts.serifItalic,
              fontSize: 34,
              lineHeight: 38,
              color: colors.goldLight,
            }}
          >
            Watch them develop.
          </T>
        </T>
        <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted }}>
          Tap a poster to bring it into colour. Real actors, every one of them. No AI.
        </T>

        <View style={styles.grid}>
          {list.map((s) => {
            const on = picked.includes(s.id);
            return (
              <Pressy
                feel="pick"
                key={s.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${s.title}. ${s.genre}`}
                onPress={() => toggle(s.id)}
                style={styles.cell}
              >
                <Develop developed={on} style={[styles.poster, on && { borderColor: colors.gold }]}>
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: s.color }]} />
                  {coverSource(s) ? (
                    <Image
                      source={coverSource(s)!}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
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
                  <T style={styles.posterTitle} numberOfLines={3}>
                    {s.title}
                  </T>
                </Develop>
                {on ? (
                  <View style={styles.check}>
                    <Icon name="check" size={14} color={colors.ink} />
                  </View>
                ) : null}
                <T
                  style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted }}
                  numberOfLines={1}
                >
                  {s.genre}
                </T>
              </Pressy>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <T
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 13,
            color: colors.muted,
            textAlign: 'center',
          }}
          accessibilityLiveRegion="polite"
        >
          {picked.length === 0
            ? 'Pick at least one to start'
            : left > 0
              ? `${left} more if you like`
              : 'Your first episode is ready.'}
        </T>
        <Button
          label="Start Episode 1 · free"
          icon="play"
          disabled={picked.length === 0}
          onPress={start}
        />
        <Pressable
          accessibilityRole="button"
          onPress={skip}
          style={{
            alignSelf: 'center',
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: 12,
          }}
        >
          <T style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSoft }}>
            Skip for now
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  cell: { width: '30.5%', gap: 6 },
  poster: {
    aspectRatio: 0.66,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'flex-end',
  },
  posterTitle: {
    margin: 8,
    fontFamily: fonts.engraved,
    fontSize: 11,
    lineHeight: 14,
    color: colors.goldLight,
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 8,
    backgroundColor: 'rgba(21,16,11,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
