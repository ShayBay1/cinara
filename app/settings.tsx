import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, SwitchRow, T } from '@/components/ui';
import { api } from '@/data';
import { useMe } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

/** Settings live here so Profile can feel like a person, not a list of switches. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const followTurn = useAppStore((s) => s.followTurn);
  const setFollowTurn = useAppStore((s) => s.setFollowTurn);
  const shareActivity = useAppStore((s) => s.shareActivity);
  const setShareActivity = useAppStore((s) => s.setShareActivity);
  const friendsFirst = useAppStore((s) => s.friendsFirst);
  const setFriendsFirst = useAppStore((s) => s.setFriendsFirst);
  const signedIn = !!me.data && api.mode === 'live';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 40,
        gap: 18,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Icon name="back" />
        </Pressable>
        <T variant="display" style={{ fontSize: 26, lineHeight: 34, textTransform: 'none' }}>
          Settings
        </T>
      </View>

      {Platform.OS !== 'web' ? (
        <View>
          <T style={styles.h2}>Watching</T>
          <View style={styles.card}>
            <SwitchRow
              label="Smooth rotation"
              hint="Episodes glide as you turn your phone between Vertical and Cinema. Off: they flip once you’ve turned past halfway."
              value={followTurn}
              onChange={setFollowTurn}
            />
          </View>
        </View>
      ) : null}

      <View>
        <T style={styles.h2}>Friends</T>
        <View style={styles.card}>
          <SwitchRow
            label="Share what I’m watching"
            hint="Friends see your show and episode."
            value={shareActivity}
            onChange={(v) => {
              setShareActivity(v);
              void api.setActivitySharing(v).catch(() => undefined);
            }}
          />
          <View style={styles.rule} />
          <SwitchRow
            label="Friends’ comments first"
            hint="Adds a Friends tab to comments."
            value={friendsFirst}
            onChange={setFriendsFirst}
          />
        </View>
      </View>

      <View>
        <T style={styles.h2}>Account</T>
        {signedIn ? (
          <Button
            kind="outline"
            label="Sign out"
            onPress={() => void api.signOut().then(() => me.refetch())}
          />
        ) : (
          <Button
            kind="outline"
            label="Continue with email"
            onPress={() => router.push('/sign-in')}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
    marginBottom: 10,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
