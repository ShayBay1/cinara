import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/Glass';
import { Button, T } from '@/components/ui';
import { coverSource } from '@/data/covers';
import { useShow } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { clock, resumePoint } from '@/lib/play';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

/** Before playing an episode you're partway through: Resume, or Start over. */
export default function ResumeSheet() {
  const { showId, episode } = useLocalSearchParams<{ showId: string; episode: string }>();
  const insets = useSafeAreaInsets();
  const show = useShow(showId);
  const n = Math.max(1, Number(episode) || 1);
  const at = resumePoint(showId ?? '', n) ?? 0;
  const duration = useAppStore((s) =>
    s.progress[showId ?? '']?.episode === n ? s.progress[showId ?? '']?.durationSec : undefined,
  );
  const saveProgress = useAppStore((s) => s.saveProgress);
  const title = show.data?.episodeTitles[n - 1];
  const frac = duration ? Math.min(1, at / duration) : 0;

  // Replace this sheet with the player, so Back from the player returns to where you came from.
  const play = (fromStart: boolean) => {
    haptic.tap();
    if (fromStart && showId)
      saveProgress(showId, { episode: n, positionSec: 0, durationSec: duration });
    router.replace({
      pathname: '/watch/[showId]/[episode]',
      params: { showId: showId ?? '', episode: String(n) },
    });
  };

  return (
    <View style={styles.fill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
      />
      <Glass radius={28} style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View accessibilityViewIsModal style={{ gap: 14 }}>
          <View style={styles.grab} />
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <View style={[styles.thumb, { backgroundColor: show.data?.color ?? colors.wine }]}>
              {show.data && coverSource(show.data) ? (
                <Image
                  source={coverSource(show.data)!}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : null}
              {frac > 0 ? (
                <View style={styles.track}>
                  <View
                    style={{ width: `${frac * 100}%`, height: 3, backgroundColor: colors.gold }}
                  />
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T variant="eyebrow">{show.data?.title ?? ''}</T>
              <T
                style={{ fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.text }}
                numberOfLines={2}
              >{`Episode ${n}${title ? ` · ${title}` : ''}`}</T>
              <T variant="caption">
                {duration
                  ? `Stopped at ${clock(at)} of ${clock(duration)}`
                  : `Stopped at ${clock(at)}`}
              </T>
            </View>
          </View>
          <Button icon="play" label={`Resume from ${clock(at)}`} onPress={() => play(false)} />
          <Button kind="outline" icon="replay" label="Start over" onPress={() => play(true)} />
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,7,4,0.6)' },
  sheet: { padding: 20, paddingTop: 10, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 6,
  },
  thumb: { width: 112, height: 63, borderRadius: radius.sm, overflow: 'hidden' },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(243,234,216,0.25)',
  },
});
