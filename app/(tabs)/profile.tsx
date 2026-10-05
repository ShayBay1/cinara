import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Avatar, Button, Panel, SectionHeader, SwitchRow, T } from '@/components/ui';
import { api } from '@/data';
import { useMe, useMembership, useShows, useUploadAvatar } from '@/hooks/queries';
import { canSellHere, MEMBERSHIP_PRICE_LABEL, showExternalJoinLink, WEB_URL } from '@/lib/billing';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme/tokens';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function ProfileScreen() {
  const me = useMe();
  const membership = useMembership();
  const shows = useShows();
  const upload = useUploadAvatar();
  const myList = useAppStore((s) => s.myList);
  const localAvatar = useAppStore((s) => s.avatarUrl);
  const setAvatarUrl = useAppStore((s) => s.setAvatarUrl);
  const followTurn = useAppStore((s) => s.followTurn);
  const setFollowTurn = useAppStore((s) => s.setFollowTurn);
  const [picking, setPicking] = useState(false);

  const handle = me.data?.handle ?? 'you';
  const avatarUrl = me.data?.avatarUrl ?? localAvatar;
  const saved = (shows.data ?? []).filter((s) => myList[s.id]);
  const isMember = membership.data?.active ?? false;

  const pickPhoto = async () => {
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) {
        say('Photo too large', 'Choose a photo under 15 MB.');
        return;
      }
      // Square, 320 px JPEG keeps uploads small and fast.
      const ctx = ImageManipulator.manipulate(asset.uri);
      ctx.resize({ width: 320, height: 320 });
      const image = await ctx.renderAsync();
      const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      const url = await upload.mutateAsync(out.uri);
      setAvatarUrl(url);
      if (api.mode === 'live') say('Photo uploaded', 'Your new photo appears once it passes our quick safety check.');
    } catch (e) {
      say('Couldn’t update your photo', e instanceof Error ? e.message : 'Try a JPG or PNG.');
    } finally {
      setPicking(false);
    }
  };

  const manageMembership = () => {
    if (canSellHere || showExternalJoinLink) void WebBrowser.openBrowserAsync(`${WEB_URL}/account`);
  };

  return (
    <Screen title="Profile" subtitle={`@${handle}`}>
      <Panel style={styles.photoCard}>
        <Pressable accessibilityRole="button" accessibilityLabel={avatarUrl ? 'Change profile photo' : 'Upload profile photo'} onPress={pickPhoto} disabled={picking || upload.isPending}>
          <Avatar handle={handle} url={avatarUrl} size={96} />
          <View style={styles.cam}>
            <Icon name="camera" size={18} color={colors.ink} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          <T variant="title" style={{ fontSize: 17 }}>{`@${handle}`}</T>
          <T variant="caption">Your photo shows on your comments, in live chat, and to friends.</T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button compact kind="outline" label={avatarUrl ? 'Change photo' : 'Upload photo'} loading={picking || upload.isPending} onPress={pickPhoto} />
            {avatarUrl ? <Button compact kind="outline" label="Remove" onPress={() => setAvatarUrl(null)} /> : null}
          </View>
        </View>
      </Panel>

      <Panel style={{ marginTop: 24, padding: 16, gap: 10 }}>
        <T variant="eyebrow">Membership</T>
        {isMember ? (
          <>
            <T variant="title" style={{ fontSize: 17 }}>Member</T>
            <T variant="caption">Billed monthly on the Snippets website. Cancel anytime there.</T>
            {canSellHere || showExternalJoinLink ? <Button compact kind="outline" label="Manage membership" onPress={manageMembership} style={{ alignSelf: 'flex-start' }} /> : null}
          </>
        ) : (
          <>
            <T variant="title" style={{ fontSize: 17 }}>Not a member</T>
            <T variant="caption">Episodes 1–10 of every show are free.</T>
            <Button kind="gold" label={canSellHere ? `Become a member · ${MEMBERSHIP_PRICE_LABEL}/month` : 'About membership'} onPress={() => router.push('/join')} />
          </>
        )}
      </Panel>

      {Platform.OS !== 'web' ? (
        <Panel style={{ marginTop: 24, paddingHorizontal: 16, paddingVertical: 4 }}>
          <SwitchRow
            label="Smooth rotation"
            hint="Episodes glide as you turn your phone. Off: they flip once you’ve turned past halfway."
            value={followTurn}
            onChange={setFollowTurn}
          />
        </Panel>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/friends')} style={styles.friendsRow}>
        <Icon name="friends" />
        <T variant="label" style={{ flex: 1, fontSize: 15 }}>Friends</T>
        <T variant="caption">See who’s watching</T>
      </Pressable>

      <View style={{ paddingTop: 28 }}>
        <SectionHeader title="My List" />
        {saved.length ? (
          <Panel>
            {saved.map((s, i) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/show/[showId]', params: { showId: s.id } })}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
              >
                <View style={{ width: 40, height: 54, borderRadius: 8, backgroundColor: s.color }} />
                <View style={{ flex: 1 }}>
                  <T variant="label" style={{ fontSize: 15 }}>{s.title}</T>
                  <T variant="caption">{`Episodes 1–${s.latestEpisode} out now`}</T>
                </View>
              </Pressable>
            ))}
          </Panel>
        ) : (
          <Panel style={{ padding: 16 }}>
            <T variant="caption" style={{ fontSize: 14 }}>Tap + on a show to save it here.</T>
          </Panel>
        )}
      </View>

      <View style={{ paddingTop: 28, gap: 10 }}>
        {me.data && api.mode === 'live' ? (
          <Button kind="outline" label="Sign out" onPress={() => void api.signOut().then(() => me.refetch())} />
        ) : (
          <Button kind="outline" label="Sign in" onPress={() => router.push('/sign-in')} />
        )}
      </View>
    </Screen>
  );
}

function say(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  friendsRow: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#24242C' },
  photoCard: { marginTop: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  cam: { position: 'absolute', right: -2, bottom: -2, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
