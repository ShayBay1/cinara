import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, T } from '@/components/ui';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { notify } from '@/lib/safety';
import type { NewMedia } from '@/social/api';
import { Attachments, PriceChips, Tool, type Attachment } from '@/social/Composer';
import { pickMedia, uploadMedia } from '@/social/media';
import { money, sendMassDm, studioKeys, useMassAudience, vaultAsMedia, vaultPick, type AudienceKey, type VaultItem } from '@/social/studio';
import { colors, fonts, radius } from '@/theme/tokens';

/** One message to many fans at once (up to 3 a day): free, or locked with a price; optionally disappearing. */
export default function MassDmScreen() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const qc = useQueryClient();
  const audience = useMassAudience();
  const [who, setWho] = useState<AudienceKey>('messages');
  const [body, setBody] = useState('');
  const [fresh, setFresh] = useState<NewMedia[]>([]);
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [ghost, setGhost] = useState(false);
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const picked = vaultPick.take('mass');
      if (picked?.length) setVault((v) => [...v, ...picked].slice(0, 6));
    }, []),
  );

  const a = audience.data;
  const counts: Record<AudienceKey, number> = {
    messages: a?.messages ?? 0,
    backstage: a?.backstage ?? 0,
    all: (a?.messages ?? 0) + (a?.backstage ?? 0),
  };
  const reach = counts[who];
  const left = Math.max(0, 3 - (a?.sentToday ?? 0));
  const items: Attachment[] = [
    ...vault.map((v) => ({ key: `v${v.id}`, type: v.type, uri: v.url })),
    ...fresh.map((f, i) => ({ key: `n${i}`, type: f.type, uri: f.uri })),
  ];
  const hasMedia = items.length > 0;

  const send = async () => {
    if (!body.trim() && !hasMedia) return notify('Write something or add a photo.');
    if (price && !hasMedia) return notify('Add a photo or video for fans to unlock.');
    setSending(true);
    try {
      const uploaded = fresh.length ? await uploadMedia(fresh, 'dm-media') : [];
      const n = await sendMassDm({ body, media: [...vaultAsMedia(vault), ...uploaded], priceCents: price, ghost, audience: who });
      await qc.invalidateQueries({ queryKey: ['social'] });
      void qc.invalidateQueries({ queryKey: studioKeys.home });
      notify(n === 1 ? 'Sent to 1 fan.' : `Sent to ${n} fans.`);
      router.back();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t send that.');
    } finally {
      setSending(false);
    }
  };

  const AUDIENCES: { key: AudienceKey; label: string; hint: string }[] = [
    { key: 'messages', label: 'Message subscribers', hint: 'Fans with your messages add-on. They can reply.' },
    { key: 'backstage', label: 'Backstage followers', hint: 'Followers with the Backstage pass. They can read it; replying needs your messages add-on.' },
    { key: 'all', label: 'Both', hint: 'Everyone above, once each.' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingBottom: keyboard }}>
      <View style={[st.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="close" label="Cancel" onPress={() => (router.canGoBack() ? router.back() : router.replace('/studio'))} />
        <T variant="label" style={{ flex: 1 }}>
          Mass message
        </T>
        <Button compact label={reach ? `Send to ${reach}` : 'Send'} loading={sending} disabled={!reach || !left} onPress={send} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <T variant="caption">{left ? `${left} of 3 mass messages left today.` : 'You’ve sent 3 mass messages today. More tomorrow.'}</T>

        <View style={{ gap: 8 }}>
          <T style={st.h}>Who gets it</T>
          {AUDIENCES.map((x) => (
            <Pressable key={x.key} onPress={() => setWho(x.key)} accessibilityRole="radio" accessibilityState={{ selected: who === x.key }} style={[st.option, who === x.key && st.optionOn]}>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text }}>{x.label}</T>
                <T variant="caption">{x.hint}</T>
              </View>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: who === x.key ? colors.gold : colors.muted }}>{counts[x.key]}</T>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <T style={st.h}>Message</T>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Say something to your fans…"
            placeholderTextColor={colors.dim}
            multiline
            maxLength={1000}
            style={st.input}
            accessibilityLabel="Message"
          />
          <Attachments
            items={items}
            onRemove={(k) => {
              if (k.startsWith('v')) setVault((v) => v.filter((x) => `v${x.id}` !== k));
              else setFresh((f) => f.filter((_, i) => `n${i}` !== k));
            }}
          />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Tool
              icon="image"
              label="Add photos or videos"
              onPress={() =>
                void pickMedia({ limit: Math.max(1, 6 - items.length), onSkip: notify })
                  .then((m) => setFresh((f) => [...f, ...m].slice(0, 6)))
                  .catch((e) => notify(e instanceof Error ? e.message : 'Couldn’t add that.'))
              }
            />
            <Tool icon="vault" label="From your vault" onPress={() => router.push({ pathname: '/vault', params: { pick: 'mass' } })} />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <T style={st.h}>Price</T>
          <PriceChips value={price} onChange={setPrice} />
          <T variant="caption">
            {price
              ? `Fans see a blurred preview and unlock it for ${money(price)}. You keep 80%.`
              : 'Free: everyone who gets it sees it.'}
          </T>
        </View>

        <View style={st.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text }}>Disappearing</T>
            <T variant="caption">Gone a minute after each fan opens it.</T>
          </View>
          <Switch value={ghost} onValueChange={setGhost} trackColor={{ true: colors.gold, false: colors.line }} />
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingRight: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  h: { fontFamily: fonts.engraved, fontSize: 12, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.muted },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.gold },
  input: {
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
