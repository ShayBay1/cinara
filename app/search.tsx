import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { T } from '@/components/ui';
import type { Show } from '@/data';
import { coverSource } from '@/data/covers';
import { useShows } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, tintFor } from '@/theme/tokens';

const realName = (name: string) => (name.startsWith('[') ? '' : name);

/** Search shows, actors and tropes. People search for actors, so the cast is searchable too. */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const shows = useShows();
  const recent = useAppStore((s) => s.recentSearches);
  const addRecent = useAppStore((s) => s.addRecentSearch);
  const clearRecent = useAppStore((s) => s.clearRecentSearches);
  const [q, setQ] = useState(params.q ?? '');
  const list = shows.data ?? [];
  const tropes = [...new Set(list.map((s) => s.genre).filter(Boolean))];

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    const showHits = list.filter((s) =>
      [s.title, s.genre, s.tagline, s.synopsis ?? ''].some((f) => f.toLowerCase().includes(t)),
    );
    const castHits = list.flatMap((s) =>
      s.cast
        .map((c, index) => ({ show: s, c, index }))
        .filter(
          ({ c }) =>
            c.role.toLowerCase().includes(t) || realName(c.actorName).toLowerCase().includes(t),
        ),
    );
    return { showHits, castHits };
  }, [q, list]);

  const commit = (text = q) => addRecent(text);
  const openShow = (s: Show) => {
    commit();
    router.push({ pathname: '/show/[showId]', params: { showId: s.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top + 8 }}>
      <View style={styles.bar}>
        <View style={styles.field}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => commit()}
            placeholder="Shows, actors, tropes"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            accessibilityLabel="Search shows, actors and tropes"
            style={styles.input}
          />
          {q ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={() => setQ('')}
            >
              <Icon name="close" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancel}>
          <T style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text }}>Cancel</T>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 24 }}
      >
        {results === null ? (
          <>
            {recent.length ? (
              <View style={{ gap: 6 }}>
                <View style={styles.headRow}>
                  <T style={styles.h2}>Recent</T>
                  <Pressable accessibilityRole="button" onPress={clearRecent} hitSlop={8}>
                    <T style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted }}>
                      Clear
                    </T>
                  </Pressable>
                </View>
                {recent.map((r) => (
                  <Pressable
                    key={r}
                    accessibilityRole="button"
                    accessibilityLabel={`Search for ${r}`}
                    onPress={() => setQ(r)}
                    style={styles.recent}
                  >
                    <Icon name="replay" size={16} color={colors.muted} />
                    <T style={{ fontFamily: fonts.body, fontSize: 15, color: colors.text }}>{r}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ gap: 10 }}>
              <T style={styles.h2}>Browse by trope</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tropes.map((t) => (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    onPress={() => setQ(t)}
                    style={styles.chip}
                  >
                    <T style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text }}>
                      {t}
                    </T>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : results.showHits.length === 0 && results.castHits.length === 0 ? (
          <View style={{ paddingTop: 40, alignItems: 'center', gap: 8 }}>
            <Icon name="reel" size={40} color={colors.muted} />
            <T
              style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text }}
            >{`Nothing for “${q.trim()}”`}</T>
            <T
              style={{
                fontFamily: fonts.body,
                fontSize: 14,
                color: colors.muted,
                textAlign: 'center',
              }}
            >
              Try a show, an actor, or a trope like “Secret billionaire”.
            </T>
          </View>
        ) : (
          <>
            {results.showHits.length ? (
              <View style={{ gap: 10 }}>
                <T style={styles.h2}>Shows</T>
                {results.showHits.map((s) => (
                  <Pressy
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.title}. ${s.genre}`}
                    onPress={() => openShow(s)}
                    style={styles.showRow}
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
                      <T
                        style={{
                          fontFamily: fonts.engraved,
                          fontSize: 15,
                          color: colors.goldLight,
                        }}
                      >
                        {s.title}
                      </T>
                      <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted }}>
                        {s.genre}
                      </T>
                      <T
                        style={{
                          fontFamily: fonts.serifItalic,
                          fontSize: 14,
                          lineHeight: 18,
                          color: colors.textSoft,
                        }}
                        numberOfLines={2}
                      >
                        {s.tagline}
                      </T>
                    </View>
                  </Pressy>
                ))}
              </View>
            ) : null}
            {results.castHits.length ? (
              <View style={{ gap: 10 }}>
                <T style={styles.h2}>Cast</T>
                {results.castHits.map(({ show, c, index }) => (
                  <Pressy
                    key={`${show.id}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${realName(c.actorName) || 'Actor'}, plays ${c.role} in ${show.title}`}
                    onPress={() => {
                      commit();
                      router.push({
                        pathname: '/cast/[showId]/[index]',
                        params: { showId: show.id, index: String(index) },
                      });
                    }}
                    style={styles.showRow}
                  >
                    <View style={[styles.face, { backgroundColor: tintFor(c.role) }]}>
                      <T style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text }}>
                        {c.role.charAt(0)}
                      </T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>
                        {realName(c.actorName) || c.role}
                      </T>
                      <T
                        style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted }}
                      >{`Plays ${c.role} · ${show.title}`}</T>
                    </View>
                  </Pressy>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  field: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  // outlineWidth 0: no square browser focus ring inside the rounded field.
  input: { flex: 1, height: 46, color: colors.text, fontFamily: fonts.body, fontSize: 16, outlineWidth: 0 },
  cancel: { minHeight: 46, paddingHorizontal: 6, justifyContent: 'center' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
  },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 56 },
  poster: { width: 64, height: 92, borderRadius: 8, overflow: 'hidden' },
  face: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
});
