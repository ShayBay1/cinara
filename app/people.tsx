import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { notify } from '@/lib/safety';
import { addFriend, cancelFriendRequest, type PersonResult } from '@/social/api';
import { useFollow, useSearchPeople } from '@/social/hooks';
import { CreatorRing, nameOf } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/**
 * Find anyone on Cinara: actors (follow them, open their Backstage) and fans (add them as friends).
 * Verified actors come first; an empty search suggests actors to follow.
 */
export default function PeopleScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(id);
  }, [text]);

  const results = useSearchPeople(query);
  const list = results.data ?? [];
  const actors = list.filter((p) => p.isCast);
  const fans = list.filter((p) => !p.isCast);
  const rows: Array<{ kind: 'head'; title: string } | { kind: 'person'; p: PersonResult }> = [
    ...(actors.length ? [{ kind: 'head' as const, title: query.trim() ? 'Actors' : 'Actors to follow' }] : []),
    ...actors.map((p) => ({ kind: 'person' as const, p })),
    ...(fans.length ? [{ kind: 'head' as const, title: 'People' }] : []),
    ...fans.map((p) => ({ kind: 'person' as const, p })),
  ];

  return (
    <View style={[styles.fill, { paddingTop: insets.top + 6 }]}>
      <View style={styles.bar}>
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />
        <View style={styles.field}>
          <Icon name="search" size={17} color={colors.muted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            placeholder="Search actors and people"
            placeholderTextColor={colors.dim}
            accessibilityLabel="Search actors and people"
            style={styles.input}
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={8} accessibilityLabel="Clear search">
              <Icon name="close" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!me.data?.id ? (
        <View style={{ padding: 16, gap: 12 }}>
          <T variant="caption" style={{ fontSize: 14 }}>
            Sign in to find friends and follow the cast.
          </T>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      ) : results.isPending ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => (r.kind === 'head' ? `h-${r.title}` : r.p.id) + i}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}>
              <T variant="label">{`No one found for “${query.trim()}”`}</T>
              <T variant="caption">Try their username, like @kayla.watches</T>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'head' ? (
              <T variant="eyebrow" style={{ color: colors.text, marginTop: 18, marginBottom: 6 }}>
                {item.title}
              </T>
            ) : (
              <PersonRow p={item.p} />
            )
          }
        />
      )}
    </View>
  );
}

function PersonRow({ p }: { p: PersonResult }) {
  const qc = useQueryClient();
  const follow = useFollow(p.handle);
  const [following, setFollowing] = useState(p.following);
  const [relation, setRelation] = useState(p.relation);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFollowing(p.following), [p.following]);
  useEffect(() => setRelation(p.relation), [p.relation]);

  const open = () => router.push({ pathname: '/actor/[handle]', params: { handle: p.handle } });

  const friend = async () => {
    if (p.demo) return notify('This is a sample creator. Friends work with real accounts.');
    setBusy(true);
    try {
      if (relation === 'requested') {
        await cancelFriendRequest(p.id);
        setRelation('none');
      } else {
        await addFriend(p.handle);
        setRelation(relation === 'incoming' ? 'friends' : 'requested');
        haptic.pick();
      }
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
      void qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const subtitle = p.isCast
    ? [p.role, `${p.followers.toLocaleString()} ${p.followers === 1 ? 'follower' : 'followers'}`].filter(Boolean).join(' · ')
    : relation === 'friends'
      ? 'Friends'
      : relation === 'incoming'
        ? 'Wants to be friends'
        : `@${p.handle}`;

  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${nameOf(p)}. Open profile.`} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <CreatorRing handle={p.handle} url={p.avatarUrl} size={52} gold={p.verified} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {p.isCast ? nameOf(p) : p.handle}
          </T>
          {p.verified ? <Verified size={13} /> : null}
        </View>
        <T variant="caption" numberOfLines={1}>
          {p.isCast && p.displayName ? `@${p.handle} · ${subtitle}` : subtitle}
        </T>
      </View>
      {p.isCast ? (
        <Button
          compact
          kind={following ? 'outline' : 'primary'}
          label={following ? 'Following' : 'Follow'}
          onPress={() => {
            haptic.pick();
            setFollowing(!following);
            follow.mutate({ actorId: p.id, on: !following });
          }}
          style={{ minWidth: 96 }}
        />
      ) : relation === 'friends' ? (
        <View style={styles.badge}>
          <Icon name="check" size={13} color={colors.friend} />
          <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.friend }}>Friends</T>
        </View>
      ) : (
        <Button
          compact
          kind={relation === 'requested' ? 'outline' : 'primary'}
          label={relation === 'requested' ? 'Requested' : relation === 'incoming' ? 'Accept' : 'Add friend'}
          loading={busy}
          onPress={() => void friend()}
          style={{ minWidth: 104 }}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingRight: 16, paddingBottom: 6 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
});
