import { useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Group, Rule, SettingsPage } from '@/components/settings/Page';
import { Avatar, Button, T } from '@/components/ui';
import { api, getSupabase } from '@/data';
import { useMe, useUploadAvatar } from '@/hooks/queries';
import { notify } from '@/lib/safety';
import { useActor } from '@/social/hooks';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

/** Edit profile, like Instagram: photo, name, username and bio in one place. */
export default function EditProfileScreen() {
  const me = useMe();
  const qc = useQueryClient();
  const profile = useActor(me.data?.handle ?? '');
  const upload = useUploadAvatar();
  const localAvatar = useAppStore((s) => s.avatarUrl);
  const setAvatarUrl = useAppStore((s) => s.setAvatarUrl);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (loaded || !me.data || profile.isPending) return;
    setHandle(me.data.handle);
    setName(profile.data?.displayName ?? '');
    setBio(profile.data?.bio ?? '');
    setLoaded(true);
  }, [me.data, profile.data, profile.isPending, loaded]);

  const pickPhoto = async () => {
    setPicking(true);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      const asset = r.canceled ? undefined : r.assets[0];
      if (!asset) return;
      const ctx = ImageManipulator.manipulate(asset.uri);
      ctx.resize({ width: 320, height: 320 });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      setAvatarUrl(await upload.mutateAsync(out.uri));
      notify('Your new photo appears once it passes our quick safety check.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Try a JPG or PNG.');
    } finally {
      setPicking(false);
    }
  };

  const removePhoto = () => {
    const go = async () => {
      try {
        await api.removeAvatar();
        setAvatarUrl(null);
        await qc.invalidateQueries();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'That didn’t work.');
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Remove your profile photo?')) void go();
      return;
    }
    Alert.alert('Remove your profile photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void go() },
    ]);
  };

  const save = async () => {
    if (!me.data?.id) return;
    setSaving(true);
    try {
      const clean = handle.trim().toLowerCase();
      if (clean !== me.data.handle) await api.setHandle(clean);
      const sb = getSupabase();
      if (sb) {
        const { error } = await sb
          .from('profiles')
          .update({ display_name: name.trim() || null, bio: bio.trim() || null })
          .eq('id', me.data.id);
        if (error) throw new Error(error.message);
      }
      await qc.invalidateQueries();
      router.back();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage title="Edit profile" right={<Button compact label="Done" loading={saving} onPress={() => void save()} />}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar handle={me.data?.handle ?? 'you'} url={me.data?.avatarUrl ?? localAvatar} size={96} />
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={() => void pickPhoto()} disabled={picking} accessibilityRole="button">
            <T style={{ fontFamily: fonts.bodyHeavy, color: colors.gold }}>{picking ? 'Uploading…' : 'Edit picture'}</T>
          </Pressable>
          {me.data?.avatarUrl || localAvatar ? (
            <Pressable onPress={removePhoto} accessibilityRole="button">
              <T style={{ fontFamily: fonts.bodyBold, color: colors.muted }}>Remove</T>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Group>
        <Field label="Name" value={name} onChange={setName} placeholder="Your name" max={40} />
        <Rule />
        <Field
          label="Username"
          value={handle}
          onChange={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24))}
          placeholder="username"
          max={24}
        />
        <Rule />
        <Field label="Bio" value={bio} onChange={setBio} placeholder="Say something about yourself" max={150} multiline />
      </Group>
      <T variant="caption" style={{ paddingHorizontal: 4 }}>
        {me.data?.isCast
          ? 'Your name and bio show on your creator page. Fans find you by your username.'
          : 'Friends find you by your username. Your name and bio show on your profile.'}
      </T>
    </SettingsPage>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  max,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <T style={styles.label}>{label}</T>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        maxLength={max}
        multiline={multiline}
        autoCapitalize={label === 'Username' ? 'none' : 'sentences'}
        autoCorrect={label !== 'Username'}
        accessibilityLabel={label}
        style={[styles.input, multiline && { minHeight: 64, textAlignVertical: 'top' }]}
      />
      {multiline ? <T variant="caption" style={{ alignSelf: 'flex-end' }}>{`${value.length}/${max}`}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { paddingVertical: 10, gap: 4 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  input: { color: colors.text, fontFamily: fonts.body, fontSize: 16, paddingVertical: 4, borderRadius: radius.sm },
});
