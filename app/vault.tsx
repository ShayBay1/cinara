import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { notify } from '@/lib/safety';
import { pickMedia } from '@/social/media';
import { addToVault, deleteVaultItems, studioKeys, updateVaultItems, useVault, vaultPick, type VaultItem } from '@/social/studio';
import { colors, fonts, radius } from '@/theme/tokens';

type Kind = 'all' | 'image' | 'video' | 'unused';

/**
 * Every photo and video an actor keeps for posts and messages, in one place: folders, filters,
 * and a mark on what's been posted or sent. Opened with ?pick=<target> it becomes a picker.
 */
export default function VaultScreen() {
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const vault = useVault();
  const [kind, setKind] = useState<Kind>('all');
  const [folder, setFolder] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(!!pick);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<'new' | 'move' | null>(null);
  const [name, setName] = useState('');

  const items = vault.data ?? [];
  const folders = useMemo(() => [...new Set(items.map((i) => i.folder).filter((f): f is string => !!f))].sort(), [items]);
  const shown = items.filter(
    (i) =>
      (folder ? i.folder === folder : true) &&
      (kind === 'all' ? true : kind === 'unused' ? !i.inPosts && !i.inDms : i.type === kind),
  );
  const chosen = items.filter((i) => picked.includes(i.id));
  const size = Math.floor((Math.min(width, 700) - 4) / 3);
  const refresh = () => qc.invalidateQueries({ queryKey: studioKeys.vault });

  const upload = async () => {
    try {
      const media = await pickMedia({ limit: 20, onSkip: notify });
      if (!media.length) return;
      setBusy(true);
      await addToVault(media, folder);
      await refresh();
      notify(media.length === 1 ? 'Added to your vault.' : `${media.length} added to your vault.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t upload that.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (v: VaultItem) => setPicked((p) => (p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id].slice(0, pick ? 6 : 200)));

  const use = () => {
    vaultPick.set(pick!, chosen);
    router.back();
  };
  const post = () => {
    vaultPick.set('post', chosen.slice(0, 10));
    router.push('/post/new');
  };
  const message = () => {
    vaultPick.set('mass', chosen.slice(0, 6));
    router.push('/mass-dm');
  };
  const remove = () => {
    const go = async () => {
      setBusy(true);
      try {
        await deleteVaultItems(chosen);
        setPicked([]);
        await refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Couldn’t delete that.');
      } finally {
        setBusy(false);
      }
    };
    const msg = 'Removes them from your vault. Anything already posted or sent stays where it is.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(msg)) void go();
    } else Alert.alert(`Delete ${chosen.length}?`, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void go() }]);
  };
  const saveName = async () => {
    const n = name.trim().slice(0, 40);
    if (!n) return setNaming(null);
    if (naming === 'move') {
      try {
        await updateVaultItems(picked, { folder: n });
        await refresh();
        setPicked([]);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Couldn’t move them.');
      }
    }
    setFolder(n);
    setNaming(null);
    setName('');
  };

  const KINDS: { key: Kind; label: string }[] = [
    { key: 'all', label: `All ${items.length || ''}`.trim() },
    { key: 'image', label: 'Photos' },
    { key: 'video', label: 'Videos' },
    { key: 'unused', label: 'Not used yet' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={[st.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/studio'))} />
        <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.text, flex: 1 }}>{pick ? 'Pick from your vault' : 'Content vault'}</T>
        {!pick ? (
          <Pressable onPress={() => { setSelecting((v) => !v); setPicked([]); }} accessibilityRole="button" style={{ padding: 10 }}>
            <T style={{ fontFamily: fonts.bodyBold, color: colors.gold }}>{selecting ? 'Done' : 'Select'}</T>
          </Pressable>
        ) : null}
        <IconButton icon="plus" label="Upload to the vault" onPress={() => void upload()} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.chips}>
        {KINDS.map((k) => (
          <Pressable key={k.key} onPress={() => setKind(k.key)} style={[st.chip, kind === k.key && st.chipOn]} accessibilityRole="tab">
            <T style={[st.chipText, kind === k.key && { color: colors.goldInk }]}>{k.label}</T>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.chips}>
        <Pressable onPress={() => setFolder(null)} style={[st.folder, !folder && st.folderOn]} accessibilityRole="tab">
          <Icon name="vault" size={14} color={!folder ? colors.gold : colors.muted} />
          <T style={st.folderText}>Everything</T>
        </Pressable>
        {folders.map((f) => (
          <Pressable key={f} onPress={() => setFolder(f)} style={[st.folder, folder === f && st.folderOn]} accessibilityRole="tab">
            <T style={st.folderText}>{f}</T>
          </Pressable>
        ))}
        <Pressable onPress={() => setNaming('new')} style={st.folder} accessibilityRole="button" accessibilityLabel="New folder">
          <Icon name="plus" size={14} color={colors.muted} />
          <T style={st.folderText}>Folder</T>
        </Pressable>
      </ScrollView>

      {naming ? (
        <View style={st.nameRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder={naming === 'move' ? 'Move to folder…' : 'Folder name'}
            placeholderTextColor={colors.dim}
            onSubmitEditing={() => void saveName()}
            style={st.nameInput}
            maxLength={40}
          />
          {naming === 'move' && folders.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {folders.map((f) => (
                <Pressable key={f} onPress={() => setName(f)} style={st.folder}>
                  <T style={st.folderText}>{f}</T>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Button compact label="Save" onPress={() => void saveName()} />
        </View>
      ) : null}

      {vault.isPending || busy ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} /> : null}
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        numColumns={3}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110, gap: 2, alignSelf: 'center' }}
        columnWrapperStyle={{ gap: 2 }}
        ListEmptyComponent={
          vault.isPending ? undefined : (
            <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
              <Icon name="vault" size={34} color={colors.muted} />
              <T style={{ fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' }}>Keep everything in one place</T>
              <T variant="caption" style={{ textAlign: 'center' }}>
                Upload photos and videos once, then post them or send them in messages whenever you like.
              </T>
              <Button compact label="Upload" icon="plus" onPress={() => void upload()} />
            </View>
          )
        }
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          const used = item.inPosts ? 'Posted' : item.inDms ? 'Sent' : null;
          return (
            <Pressable
              onPress={() => {
                setSelecting(true);
                toggle(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.type === 'video' ? 'Video' : 'Photo'}${used ? `, ${used.toLowerCase()}` : ''}${on ? ', selected' : ''}`}
              style={{ width: size, height: size * 1.25, backgroundColor: colors.surface }}
            >
              {item.type === 'image' && item.url ? (
                <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : item.preview ? (
                <Image source={{ uri: item.preview }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={8} />
              ) : null}
              {item.type === 'video' ? (
                <View style={st.videoMark}>
                  <Icon name="play" size={12} color="#fff" />
                </View>
              ) : null}
              {used ? (
                <View style={st.used}>
                  <Icon name="check" size={11} color="#fff" />
                  <T style={st.usedText}>{used}</T>
                </View>
              ) : null}
              {selecting ? <View style={[st.tick, on && st.tickOn]}>{on ? <Icon name="check" size={13} color={colors.goldInk} /> : null}</View> : null}
            </Pressable>
          );
        }}
      />

      {selecting && picked.length ? (
        <View style={[st.bar, { paddingBottom: insets.bottom + 10 }]}>
          {pick ? (
            <Button label={`Use ${picked.length}`} onPress={use} style={{ flex: 1 }} />
          ) : (
            <>
              <Button compact label="Post" icon="plus" onPress={post} style={{ flex: 1 }} />
              <Button compact kind="outline" label="Message" icon="send" onPress={message} style={{ flex: 1 }} />
              <Button compact kind="outline" label="Move" onPress={() => setNaming('move')} style={{ flex: 1 }} />
              <IconButton icon="close" label="Delete selected" color={colors.liveSoft} onPress={remove} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingBottom: 4 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chip: { minHeight: 32, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  folderOn: { borderColor: colors.gold },
  folderText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  nameInput: { flex: 1, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.body },
  videoMark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  used: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.5)' },
  usedText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#fff' },
  tick: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.line },
});
