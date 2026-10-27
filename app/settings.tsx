import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRAND } from '@/brand';
import { Icon } from '@/components/Icon';
import { openPrivacy, openTerms } from '@/components/LegalNote';
import * as Linking from 'expo-linking';
import { Avatar, Button, SwitchRow, T } from '@/components/ui';
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ pick?: string }>();
  const picking = params.pick === '1';
  const [handle, setHandle] = useState('');
  const [handleMsg, setHandleMsg] = useState<string | null>(null);
  const [savingHandle, setSavingHandle] = useState(false);
  useEffect(() => {
    if (me.data?.handle && !/^user[0-9a-f]{8}$/.test(me.data.handle)) setHandle(me.data.handle);
  }, [me.data?.handle]);
  const blocked = useQuery({ queryKey: ['blocked'], queryFn: () => api.listBlocked(), enabled: signedIn });

  const saveHandle = async () => {
    setSavingHandle(true);
    setHandleMsg(null);
    try {
      await api.setHandle(handle);
      await qc.invalidateQueries();
      setHandleMsg('Saved.');
      if (picking) router.back();
    } catch (e) {
      setHandleMsg(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setSavingHandle(false);
    }
  };

  const unblock = async (id: string) => {
    try {
      await api.unblockUser(id);
      await blocked.refetch();
      await qc.invalidateQueries({ queryKey: ['comments'] });
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAccount();
      await me.refetch();
      router.replace('/');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Your account couldn’t be deleted. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    const title = 'Delete your account?';
    const body =
      'This deletes your profile, photo, comments, friends and watch history, and cancels your membership right away. It can’t be undone.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${body}`)) void deleteAccount();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => void deleteAccount() },
    ]);
  };

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

      {signedIn ? (
        <View>
          <T style={styles.h2}>{picking ? 'Pick your username' : 'Username'}</T>
          <View style={[styles.card, { paddingVertical: 12, gap: 10 }]}>
            <T variant="caption">
              {picking
                ? 'This is how friends find you and how you appear in comments and live chat.'
                : 'Friends find you by this name.'}
            </T>
            <TextInput
              value={handle}
              onChangeText={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24))}
              placeholder="yourname"
              placeholderTextColor={colors.dim}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Username"
              style={styles.field}
            />
            <Button label="Save username" compact loading={savingHandle} disabled={handle.length < 3} onPress={() => void saveHandle()} />
            {handleMsg ? <T variant="caption">{handleMsg}</T> : null}
          </View>
        </View>
      ) : null}

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

      {signedIn ? (
        <View>
          <T style={styles.h2}>Blocked people</T>
          <View style={styles.card}>
            {(blocked.data ?? []).length === 0 ? (
              <T variant="caption" style={{ paddingVertical: 12 }}>
                No one. Long-press a chat message or tap ··· on a comment to block someone.
              </T>
            ) : (
              (blocked.data ?? []).map((u, i) => (
                <View key={u.id}>
                  {i > 0 ? <View style={styles.rule} /> : null}
                  <View style={[styles.linkRow, { gap: 12 }]}>
                    <Avatar handle={u.handle} url={u.avatarUrl} size={32} />
                    <T style={[styles.linkLabel, { flex: 1 }]}>{u.handle}</T>
                    <Button compact kind="outline" label="Unblock" onPress={() => void unblock(u.id)} />
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}

      <View>
        <T style={styles.h2}>Help and legal</T>
        <View style={styles.card}>
          {[
            { label: 'Contact support', hint: BRAND.supportEmail, onPress: () => void Linking.openURL(`mailto:${BRAND.supportEmail}`) },
            { label: 'Terms of Service', onPress: openTerms },
            { label: 'Privacy Policy', onPress: openPrivacy },
          ].map((row, i) => (
            <View key={row.label}>
              {i > 0 ? <View style={styles.rule} /> : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={row.label}
                onPress={row.onPress}
                style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1 }}>
                  <T style={styles.linkLabel}>{row.label}</T>
                  {row.hint ? <T variant="caption">{row.hint}</T> : null}
                </View>
                <Icon name="chevron" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View>
        <T style={styles.h2}>Account</T>
        {signedIn ? (
          <View style={{ gap: 10 }}>
            <Button
              kind="outline"
              label="Sign out"
              onPress={() => void api.signOut().then(() => me.refetch())}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              disabled={deleting}
              onPress={confirmDelete}
              style={({ pressed }) => [styles.danger, (pressed || deleting) && { opacity: 0.6 }]}
            >
              <T style={styles.dangerText}>{deleting ? 'Deleting…' : 'Delete account'}</T>
            </Pressable>
            {deleteError ? (
              <T variant="caption" style={{ color: colors.liveSoft, textAlign: 'center' }}>
                {deleteError}
              </T>
            ) : null}
          </View>
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
  linkRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  linkLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  field: {
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  danger: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  dangerText: { color: colors.liveSoft, fontSize: 15, fontWeight: '600' },
});
