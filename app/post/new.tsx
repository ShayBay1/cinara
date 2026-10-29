import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { useMe, useShows } from '@/hooks/queries';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { notify } from '@/lib/safety';
import { createPost, socialLive, type NewMedia, type Visibility } from '@/social/api';
import { NeedsLive } from '@/social/ui';
import { colors, fonts, radius } from '@/theme/tokens';

const MAX_ITEMS = 10;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SEC = 180;

/** The cast's composer: photos or videos, a caption, who can see it, and which show it's about. */
export default function NewPostScreen() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const me = useMe();
  const shows = useShows();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<NewMedia[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [showId, setShowId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/social'));

  const pick = async () => {
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_ITEMS - media.length,
        quality: 0.9,
        videoMaxDuration: MAX_VIDEO_SEC,
      });
      if (result.canceled) return;
      const next: NewMedia[] = [];
      for (const a of result.assets) {
        if (a.type === 'video') {
          if ((a.fileSize ?? 0) > MAX_VIDEO_BYTES) {
            notify('That video is over 50 MB. Trim it or export a smaller version.');
            continue;
          }
          if (a.duration && a.duration / 1000 > MAX_VIDEO_SEC) {
            notify('Videos can be up to 3 minutes.');
            continue;
          }
          next.push({ uri: a.uri, type: 'video', mimeType: a.mimeType ?? 'video/mp4', width: a.width, height: a.height });
        } else {
          // Long side 1440 px keeps photos sharp on phones and quick to load.
          const ctx = ImageManipulator.manipulate(a.uri);
          if (a.width >= a.height && a.width > 1440) ctx.resize({ width: 1440 });
          else if (a.height > a.width && a.height > 1440) ctx.resize({ height: 1440 });
          const img = await ctx.renderAsync();
          const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
          // A 24 px copy, shown blurred on Backstage posts to fans who don't have the pass yet.
          const tiny = ImageManipulator.manipulate(out.uri);
          tiny.resize({ width: 24 });
          const small = await (await tiny.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.5, base64: true });
          next.push({
            uri: out.uri,
            type: 'image',
            mimeType: 'image/jpeg',
            width: out.width,
            height: out.height,
            preview: small.base64 ? `data:image/jpeg;base64,${small.base64}` : undefined,
          });
        }
      }
      setMedia((m) => [...m, ...next].slice(0, MAX_ITEMS));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t add that.');
    } finally {
      setPicking(false);
    }
  };

  const post = async () => {
    if (!body.trim() && !media.length) return;
    setPosting(true);
    try {
      const id = await createPost({ body, visibility, showId, media });
      await qc.invalidateQueries({ queryKey: ['social'] });
      router.replace({ pathname: '/post/[id]', params: { id } });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t post. Try again.');
    } finally {
      setPosting(false);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <IconButton icon="close" label="Cancel" onPress={close} />
      <T variant="label">New post</T>
      <Button
        compact
        label="Share"
        loading={posting}
        disabled={!body.trim() && !media.length}
        onPress={post}
        style={{ minWidth: 76 }}
      />
    </View>
  );

  if (!socialLive())
    return (
      <View style={styles.fill}>
        {header}
        <View style={{ paddingHorizontal: 16 }}>
          <NeedsLive />
        </View>
      </View>
    );

  if (!me.data?.isCast)
    return (
      <View style={styles.fill}>
        {header}
        <T variant="caption" style={{ padding: 16, fontSize: 14 }}>
          Posting is for the cast. Fans can comment on posts and chat in the fan rooms.
        </T>
      </View>
    );

  return (
    <View style={[styles.fill, { paddingBottom: keyboard }]}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {media.map((m, i) => (
            <View key={m.uri} style={styles.thumb}>
              {m.type === 'image' ? (
                <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="play" filled color={colors.text} />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove"
                hitSlop={8}
                onPress={() => setMedia((list) => list.filter((_, j) => j !== i))}
                style={styles.remove}
              >
                <Icon name="close" size={14} color={colors.text} />
              </Pressable>
            </View>
          ))}
          {media.length < MAX_ITEMS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos or videos"
              onPress={pick}
              disabled={picking}
              style={[styles.thumb, styles.add]}
            >
              <Icon name="camera" color={colors.muted} />
              <T variant="caption">{picking ? 'Adding…' : 'Add'}</T>
            </Pressable>
          ) : null}
        </ScrollView>

        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write a caption…"
          placeholderTextColor={colors.dim}
          multiline
          maxLength={2200}
          accessibilityLabel="Caption"
          style={styles.caption}
        />

        <View style={{ gap: 8 }}>
          <T variant="eyebrow" style={{ color: colors.text }}>
            Who can see it
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Choice on={visibility === 'public'} label="Everyone" onPress={() => setVisibility('public')} />
            <Choice on={visibility === 'subscribers'} label="Backstage" icon onPress={() => setVisibility('subscribers')} />
          </View>
          <T variant="caption">
            {visibility === 'public'
              ? 'Anyone on Cinara can see and comment.'
              : 'Everyone sees a blurred preview; Backstage members open it. You earn from every Backstage fan who views it.'}
          </T>
        </View>

        {(shows.data ?? []).length ? (
          <View style={{ gap: 8 }}>
            <T variant="eyebrow" style={{ color: colors.text }}>
              About a show (optional)
            </T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(shows.data ?? []).map((sh) => (
                <Choice key={sh.id} on={showId === sh.id} label={sh.title} onPress={() => setShowId(showId === sh.id ? null : sh.id)} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Choice({ on, label, onPress, icon }: { on: boolean; label: string; onPress: () => void; icon?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.choice, on && { backgroundColor: colors.gold, borderColor: colors.gold }]}
    >
      {icon ? <Icon name="lock" size={13} color={on ? colors.goldInk : colors.muted} /> : null}
      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 13, color: on ? colors.goldInk : colors.text }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingRight: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  thumb: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  add: { borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 14,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
