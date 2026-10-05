import { useEventListener } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Easing as RNEasing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftGlyph, Icon, type IconName } from '@/components/Icon';
import { SideKeyboard } from '@/components/live/SideKeyboard';
import { BorderChrome } from '@/components/player/BorderChrome';
import { TurnStage } from '@/components/player/TurnStage';
import { Button, IconButton, T } from '@/components/ui';
import { api, type CastMember, type ChatMessage, type Episode, type Gift, type Show } from '@/data';
import { useEpisodes, useFriends, useGifts, usePremiereStart, useShow } from '@/hooks/queries';
import { useTurn } from '@/hooks/useTurn';
import { canSellHere, formatPrice } from '@/lib/billing';
import { type Drop, dropOf, SLOT_LABEL } from '@/lib/schedule';
import { CHROME_FADE_MS, CHROME_MS, viewerSize, type Orientation } from '@/lib/turn';
import { useAppStore } from '@/store/useAppStore';
import { colors, fonts, radius, tintFor } from '@/theme/tokens';

const MAX_MESSAGES = 7;
/** Height of our sideways chat keyboard (emoji row + four rows of keys). */
const KEYBOARD_H = 214;

export default function LivePremiereScreen() {
  const { showId } = useLocalSearchParams<{ showId: string }>();
  const show = useShow(showId);
  const start = usePremiereStart(showId ?? '');
  // The live premiere plays the newest drop: all of its episodes, back to back.
  const drop = show.data ? dropOf(Math.max(1, show.data.latestEpisode), show.data.episodeCount) : null;
  const numbers = useMemo(() => (drop ? Array.from({ length: drop.to - drop.from + 1 }, (_, i) => drop.from + i) : []), [drop?.from, drop?.to]);
  const playlist = useEpisodes(showId ?? '', numbers);

  if (!show.data || !drop || !playlist.data || start.isPending) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  if (!start.data) {
    return (
      <View style={[styles.fill, styles.center, { gap: 16, padding: 24 }]}>
        <T variant="serif" style={{ textAlign: 'center' }}>{`The next premiere starts at ${SLOT_LABEL}.`}</T>
        <Button kind="outline" label="Back" onPress={() => router.back()} />
      </View>
    );
  }
  return <Live show={show.data} drop={drop} playlist={playlist.data} startedAt={start.data} />;
}

/** Where the whole room is in the drop: which episode, and how far into it. */
function locate(starts: number[], playlist: Episode[], t: number) {
  for (let i = playlist.length - 1; i >= 0; i--) {
    const s = starts[i] ?? 0;
    if (t >= s) return { index: i, at: Math.min(t - s, playlist[i]?.durationSec ?? 0) };
  }
  return { index: 0, at: 0 };
}

/** Name to show for a cast member: the actor's real name once cast, otherwise the role. */
function castLabel(c: CastMember) {
  return c.actorName && !c.actorName.startsWith('[') ? c.actorName : c.role;
}
/** Gift recipients are stored by handle (or name); show them by name. */
function recipientLabel(show: Show, to: string) {
  if (to === 'cast') return 'the whole cast';
  const c = show.cast.find((m) => m.handle === to || m.actorName === to || m.role === to);
  return c ? castLabel(c) : to;
}

/**
 * The 8/7c live premiere. Same rules as the episode player, plus chat:
 * - The picture glides level as the phone turns, then settles (useTurn). Nothing zooms.
 * - Title and progress bar sit on the screen's border: 3 seconds on open, then a tap toggles them.
 * - Chat is clear and TikTok-style: upright it sits low-left, sideways in a rail on the right.
 *   It fades out during a turn and comes back once the turn settles.
 * - Typing: the turn pauses. Upright uses the phone's keyboard; sideways uses our own keyboard, drawn
 *   inside the turned view, so nothing spins.
 * - Gifts go to the actor each viewer picks (or the whole cast). Sold on the web only.
 */
function Live({ show, drop, playlist, startedAt }: { show: Show; drop: Drop; playlist: Episode[]; startedAt: string }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const friends = useFriends();
  const gifts = useGifts();
  const shareActivity = useAppStore((s) => s.shareActivity);
  const chatHidden = useAppStore((s) => s.chatHidden);
  const setChatHidden = useAppStore((s) => s.setChatHidden);
  const smoothRotation = useAppStore((s) => s.followTurn);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [toast, setToast] = useState<ChatMessage | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [ended, setEnded] = useState(false);
  const [stayed, setStayed] = useState(false);
  const [typing, setTyping] = useState(false);
  const chatHiddenRef = useRef(chatHidden);
  chatHiddenRef.current = chatHidden;

  // ---------- The turn ----------
  const turn = useTurn(smoothRotation, typing);
  // On the web nothing rotates: the window is already the viewer's frame.
  const flat = web;
  const orientation: Orientation = flat ? 0 : turn.orientation;
  const sideways = flat ? W > H : orientation !== 0;
  const view = flat ? { width: W, height: H } : viewerSize(W, H, orientation);
  const flatSV = useSharedValue(flat ? 1 : 0);
  useEffect(() => {
    flatSV.value = flat ? 1 : 0;
  }, [flat, flatSV]);
  const drawAngle = useDerivedValue(() => (flatSV.value ? 0 : turn.angle.value));
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const zoom = useSharedValue(1);

  // ---------- Title and bar: 3 seconds on open, then a tap toggles them ----------
  const [chromeOn, setChromeOn] = useState(true);
  useEffect(() => {
    if (!chromeOn) return;
    const id = setTimeout(() => setChromeOn(false), CHROME_MS);
    return () => clearTimeout(id);
  }, [chromeOn]);
  const chrome = useDerivedValue<number>(() => withTiming(chromeOn ? 1 : 0, { duration: CHROME_FADE_MS }), [chromeOn]);
  // Chat, buttons and header step aside while the phone turns and come back once it settles.
  const steady = useDerivedValue(() => withTiming(turn.settled.value, { duration: turn.settled.value ? 220 : 120 }));
  const steadyStyle = useAnimatedStyle(() => ({ opacity: steady.value }));

  // ---------- Typing ----------
  // Sideways on a phone, the system keyboard would come up the wrong way, so we draw our own.
  const ownKeyboard = sideways && !web;
  const startTyping = () => setTyping(true);
  const stopTyping = () => setTyping(false);

  // ---------- Everyone watches in sync: the position in the drop = time since the premiere began ----------
  const starts = useMemo(() => playlist.reduce<number[]>((acc, _e, i) => [...acc, i === 0 ? 0 : (acc[i - 1] ?? 0) + (playlist[i - 1]?.durationSec ?? 0)], []), [playlist]);
  const total = playlist.reduce((sum, e) => sum + e.durationSec, 0);
  const syncedPosition = () => Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
  const firstSpot = locate(starts, playlist, syncedPosition());
  const [index, setIndex] = useState(firstSpot.index);
  const indexRef = useRef(firstSpot.index);
  const player = useVideoPlayer(playlist[firstSpot.index]?.videoUrl ?? null, (p) => {
    p.timeUpdateEventInterval = 1;
    p.currentTime = firstSpot.at;
    p.play();
  });
  const goTo = (i: number, at: number) => {
    indexRef.current = i;
    setIndex(i);
    player.replace(playlist[i]?.videoUrl ?? null);
    player.currentTime = at;
    player.play();
  };
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const t = syncedPosition();
    if (t >= total) {
      if (!stayed) setEnded(true);
      return;
    }
    const want = locate(starts, playlist, t);
    if (want.index !== indexRef.current) return goTo(want.index, want.at);
    setPosition((starts[indexRef.current] ?? 0) + currentTime);
    // Snap back if playback drifted more than 3 seconds (e.g. after buffering).
    if (Math.abs(currentTime - want.at) > 3) player.currentTime = want.at;
  });
  useEventListener(player, 'playToEnd', () => {
    const nextIndex = indexRef.current + 1;
    if (nextIndex < playlist.length) goTo(nextIndex, 0);
    else if (!stayed) setEnded(true);
  });
  const current = playlist[index] ?? playlist[0];
  const epLabel = `Ep ${current?.number ?? drop.from} of ${drop.from}–${drop.to}`;

  const addHeart = useCallback(() => setHearts((h) => [...h.slice(-8), Date.now() + Math.random()]), []);

  useEffect(() => {
    const unsubscribe = api.subscribeToChat(show.id, (m) => {
      setMessages((list) => [...list, m].slice(-MAX_MESSAGES));
      if (chatHiddenRef.current) setUnread((n) => n + 1);
      if (m.kind === 'gift') setToast(m);
    });
    return unsubscribe;
  }, [show.id]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const send = (body: string) => {
    const text = body.trim();
    if (!text) return;
    setMessages((list) =>
      [...list, { id: `me-${Date.now()}`, kind: 'text' as const, author: { id: 'me', handle: 'you' }, body: text, createdAt: new Date().toISOString() }].slice(-MAX_MESSAGES),
    );
    setDraft('');
    void api.sendChat(show.id, text);
  };
  const toggleChat = () => {
    setChatHidden(!chatHidden);
    setUnread(0);
  };

  const here = shareActivity ? (friends.data ?? []).filter((f) => f.watching?.watchingNow) : [];
  const duration = total > 0 ? total : 1;
  const giftName = (id: string) => gifts.data?.find((g) => g.id === id)?.name ?? 'a gift';
  const pads = { top: Math.max(12, insets.top), right: Math.max(12, insets.right), bottom: Math.max(12, insets.bottom), left: Math.max(12, insets.left) };
  // Safe area as the viewer sees it, for everything laid out in the viewer's frame.
  const safe = flat
    ? { top: Math.max(10, insets.top), bottom: Math.max(10, insets.bottom), left: Math.max(16, insets.left), right: Math.max(16, insets.right) }
    : orientation === 0
      ? { top: pads.top, bottom: pads.bottom, left: 12, right: 12 }
      : orientation === 90
        ? { top: 12, bottom: 12, left: pads.top, right: pads.bottom }
        : { top: 12, bottom: 12, left: pads.bottom, right: pads.top };
  const railW = Math.min(280, Math.round(view.width * 0.34));

  const chatLines = (
    <>
      {messages.length === 0 ? (
        <ChatLine name={castLabel(show.cast[0] ?? { role: 'The cast', actorName: '' })} tag="CAST" body="Watching live with you. This one's my favorite." />
      ) : null}
      {messages.map((m, i) => (
        <ChatLine
          key={m.id}
          name={m.author.handle}
          tag={m.author.isCast ? 'CAST' : undefined}
          me={m.author.id === 'me'}
          gift={m.kind === 'gift'}
          body={m.kind === 'text' ? m.body : `sent ${giftName(m.giftId)} to ${recipientLabel(show, m.to)}`}
          fade={0.4 + (0.6 * (i + 1)) / messages.length}
        />
      ))}
    </>
  );

  const input = ownKeyboard ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Write a message" onPress={startTyping} style={[styles.input, styles.fakeInput, typing && styles.fakeInputOn]}>
      <T numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 14, color: draft ? colors.text : 'rgba(244,241,234,0.55)', flexShrink: 1 }}>
        {draft || 'Say something…'}
      </T>
      {typing ? <View style={styles.caret} /> : null}
    </Pressable>
  ) : (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      placeholder="Say something…"
      placeholderTextColor="rgba(244,241,234,0.55)"
      maxLength={200}
      returnKeyType="send"
      onFocus={startTyping}
      onBlur={stopTyping}
      onSubmitEditing={() => send(draft)}
      accessibilityLabel="Chat with everyone watching"
      style={styles.input}
    />
  );

  return (
    <View style={styles.fill}>
      <TurnStage player={player} width={W} height={H} angle={drawAngle} fade={turn.fade} panX={panX} panY={panY} zoom={zoom} />

      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={chromeOn ? 'Hide title' : 'Show title'}
        onPress={() => {
          if (typing) {
            Keyboard.dismiss();
            stopTyping();
          } else setChromeOn((on) => !on);
        }}
      />

      <BorderChrome
        width={W}
        height={H}
        pads={flat ? { top: insets.top + 12, right: 12, bottom: insets.bottom + 12, left: 12 } : pads}
        angle={drawAngle}
        visible={chrome}
        title={`Live · ${epLabel}`}
        progress={Math.min(1, position / duration)}
      />

      {/* Everything below is laid out in the viewer's frame: upright, or turned to match the phone. */}
      <View
        pointerEvents="box-none"
        style={[styles.viewer, { width: view.width, height: view.height, left: (W - view.width) / 2, top: (H - view.height) / 2, transform: [{ rotate: `${orientation}deg` }] }]}
      >
        <KeyboardAvoidingView pointerEvents="box-none" style={StyleSheet.absoluteFill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View pointerEvents={turn.turning ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, steadyStyle]}>
            {/* Header: leave, LIVE, and who's here. */}
            <View pointerEvents="box-none" style={[styles.head, { top: safe.top - 8, left: safe.left - 6, right: sideways ? railW + safe.right : safe.right }]}>
              <IconButton icon="back" label="Leave the premiere" onPress={() => router.back()} />
              <View style={styles.liveBadge} accessibilityLabel="Live">
                <T variant="label" style={{ color: '#fff', fontSize: 11, letterSpacing: 1.4 }}>LIVE</T>
              </View>
              <T variant="label" numberOfLines={1} style={[styles.shadow, { fontSize: 12, flexShrink: 1 }]}>
                {here.length ? `${here.map((f) => f.handle).join(' and ')} ${here.length > 1 ? 'are' : 'is'} here` : sideways ? `${show.title} · ${epLabel}` : epLabel}
              </T>
              {here.length ? (
                <View style={{ flexDirection: 'row' }}>
                  {here.slice(0, 3).map((f, i) => (
                    <View key={f.id} style={[styles.face, { backgroundColor: tintFor(f.handle), marginLeft: i ? -8 : 0 }]}>
                      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 11 }}>{f.handle.charAt(0).toUpperCase()}</T>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {toast && toast.kind === 'gift' ? (
              <View style={[styles.toast, { top: safe.top + 48 }]} accessibilityLiveRegion="polite">
                <T variant="label" style={{ fontSize: 13 }}>{toast.author.handle}</T>
                <T variant="caption" style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>{`sent ${giftName(toast.giftId)} to ${recipientLabel(show, toast.to)}`}</T>
              </View>
            ) : null}

            {hearts.map((id) => (
              <FloatingHeart key={id} onDone={() => setHearts((h) => h.filter((x) => x !== id))} bottom={safe.bottom + (sideways ? 120 : 260)} right={sideways ? railW + safe.right + 10 : safe.right + 16} />
            ))}

            {sideways ? (
              <>
                {/* Sideways: a slim row of buttons up top, chat in a rail on the right. */}
                <View style={[styles.topButtons, { top: safe.top - 2, right: safe.right }]}>
                  <SmallButton icon="heart" label="React" onPress={addHeart} />
                  {canSellHere ? <SmallButton icon="gift" label="Send a gift" onPress={() => setGiftOpen(true)} gold /> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={chatHidden ? 'Show chat' : 'Hide chat'} accessibilityState={{ selected: !chatHidden }} onPress={toggleChat} style={styles.chatPill}>
                    <T variant="label" style={{ fontSize: 12, letterSpacing: 0.4 }}>{chatHidden && unread > 0 ? `Chat · ${unread}` : 'Chat'}</T>
                  </Pressable>
                </View>
                {chatHidden ? null : (
                  <View style={[styles.rail, { width: railW + safe.right, paddingRight: safe.right, paddingBottom: typing && ownKeyboard ? KEYBOARD_H + 8 : safe.bottom, paddingTop: safe.top + 44 }]}>
                    <View style={styles.lines} accessibilityLiveRegion="polite">{chatLines}</View>
                    {input}
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Upright: clear chat low-left, buttons down the right, message box at the bottom. */}
                <View style={[styles.side, { right: safe.right - 6, bottom: safe.bottom + 70 }]}>
                  <SideButton icon="heart" label="React" onPress={addHeart} />
                  <SideButton icon={chatHidden ? 'chat-off' : 'chat'} label={chatHidden && unread > 0 ? `Chat · ${unread}` : 'Chat'} onPress={toggleChat} active={!chatHidden} />
                  {canSellHere ? <SideButton icon="gift" label="Gift" onPress={() => setGiftOpen(true)} /> : null}
                </View>
                {chatHidden ? null : (
                  <>
                    <View style={[styles.lowChat, { left: safe.left, right: safe.right + 70, bottom: safe.bottom + 64 }]} accessibilityLiveRegion="polite">
                      {chatLines}
                    </View>
                    <View style={[styles.inputRow, { left: safe.left, right: safe.right + 70, bottom: safe.bottom + 10 }]}>{input}</View>
                  </>
                )}
              </>
            )}
          </Animated.View>

          {typing && ownKeyboard ? (
            <View style={[styles.keyboard, { paddingLeft: safe.left - 6, paddingRight: safe.right - 6 }]}>
              <SideKeyboard
                value={draft}
                onChange={setDraft}
                onSend={() => send(draft)}
                onClose={stopTyping}
              />
            </View>
          ) : null}

          {ended ? (
            <View style={styles.ended}>
              <T variant="eyebrow" style={{ color: colors.gold }}>Premiere complete</T>
              <T variant="serif" style={{ fontSize: 38, lineHeight: 40, textAlign: 'center' }}>You watched it live.</T>
              <T style={{ color: colors.textSoft, textAlign: 'center' }}>The chat stays open for 15 minutes. The cast is still here.</T>
              <Button
                label="Stay for the after-chat"
                style={{ alignSelf: 'stretch', maxWidth: 420 }}
                onPress={() => {
                  setEnded(false);
                  setStayed(true);
                }}
              />
              <Button kind="outline" label="Leave" onPress={() => router.back()} />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>

      {canSellHere ? <GiftSheet visible={giftOpen} onClose={() => setGiftOpen(false)} gifts={gifts.data ?? []} show={show} /> : null}
    </View>
  );
}

/** One chat line: no bubble, just text with a soft shadow so it reads over the picture. */
function ChatLine({ name, body, tag, me, gift, fade = 1 }: { name: string; body: string; tag?: string; me?: boolean; gift?: boolean; fade?: number }) {
  return (
    <View style={{ opacity: fade, gap: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <T variant="label" style={[styles.shadow, { fontSize: 12, color: me ? colors.friend : 'rgba(244,241,234,0.78)' }]}>{name}</T>
        {tag ? (
          <View style={styles.castTag}>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 9, letterSpacing: 1.1, color: colors.ink }}>{tag}</T>
          </View>
        ) : null}
      </View>
      <T style={[styles.shadow, { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18, color: gift ? colors.gold : '#FFFFFF' }]}>{body}</T>
    </View>
  );
}

function SideButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={active === undefined ? undefined : { selected: active }} onPress={onPress} style={{ width: 60, alignItems: 'center', gap: 1 }}>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={icon === 'gift' ? colors.gold : colors.text} />
      </View>
      <T variant="label" numberOfLines={1} style={[styles.shadow, { fontSize: 11 }]}>{label}</T>
    </Pressable>
  );
}

function SmallButton({ icon, label, onPress, gold }: { icon: IconName; label: string; onPress: () => void; gold?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.small, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={18} color={gold ? colors.gold : colors.text} />
    </Pressable>
  );
}

/** Web only: gifts are paid on the website through Stripe, never in the native apps. */
function GiftSheet({ visible, onClose, gifts, show }: { visible: boolean; onClose: () => void; gifts: Gift[]; show: Show }) {
  // Each viewer picks who gets it: one actor, or the whole cast.
  const recipients = [
    ...show.cast.map((c) => ({ key: c.handle ?? c.actorName ?? c.role, label: castLabel(c), sub: `plays ${c.role}` })),
    { key: 'cast', label: 'Whole cast', sub: 'split evenly' },
  ];
  const [to, setTo] = useState(0);
  const [pick, setPick] = useState(2);
  const [busy, setBusy] = useState(false);
  const gift = gifts[pick];

  const checkout = async () => {
    if (!gift) return;
    setBusy(true);
    try {
      const url = await api.createGiftCheckout({ showId: show.id, giftId: gift.id, to: recipients[to]?.key ?? 'cast' });
      globalThis.location?.assign(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(8,8,10,0.55)' }} accessibilityLabel="Close gifts" onPress={onClose} />
      <View style={styles.sheet}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <T variant="title" style={{ fontSize: 17 }}>Send a gift</T>
            <T variant="caption">Pick who gets it. Everyone in the chat sees it.</T>
          </View>
          <IconButton icon="close" label="Close gifts" onPress={onClose} />
        </View>
        <T variant="eyebrow">Send to</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {recipients.map((r, i) => (
            <Pressable
              key={r.key + i}
              accessibilityRole="button"
              accessibilityLabel={`${r.label}, ${r.sub}`}
              accessibilityState={{ selected: to === i }}
              onPress={() => setTo(i)}
              style={[styles.who, to === i && styles.whoOn]}
            >
              <T variant="label" style={{ fontSize: 13, color: to === i ? colors.ink : colors.text }}>{r.label}</T>
              <T style={{ fontFamily: fonts.body, fontSize: 11, color: to === i ? colors.goldInk : colors.muted }}>{r.sub}</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {gifts.map((g, i) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}, ${formatPrice(g.priceCents)}`}
              accessibilityState={{ selected: pick === i }}
              onPress={() => setPick(i)}
              style={[styles.gift, pick === i && styles.giftOn]}
            >
              <View style={[styles.giftIcon, { backgroundColor: g.color }]}>
                <GiftGlyph path={g.iconPath} />
              </View>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 11, textAlign: 'center' }}>{g.name}</T>
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.gold }}>{formatPrice(g.priceCents)}</T>
            </Pressable>
          ))}
        </View>
        {gift ? <Button label={`Send ${gift.name} to ${recipients[to]?.label ?? 'the cast'} · ${formatPrice(gift.priceCents)}`} loading={busy} onPress={checkout} /> : null}
        <T variant="caption" style={{ textAlign: 'center' }}>Paid in dollars on the web, no coins. Your gift goes to who you picked. 18+ only.</T>
      </View>
    </Modal>
  );
}

function FloatingHeart({ onDone, bottom, right }: { onDone: () => void; bottom: number; right: number }) {
  const progress = useRef(new RNAnimated.Value(0)).current;
  const offset = useRef(Math.random() * 20).current;
  useEffect(() => {
    RNAnimated.timing(progress, { toValue: 1, duration: 2600, easing: RNEasing.out(RNEasing.quad), useNativeDriver: true }).start(onDone);
  }, [onDone, progress]);
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: right + offset,
        bottom,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -220] }) }],
      }}
    >
      <Icon name="heart" size={22} color={colors.accent} filled />
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  viewer: { position: 'absolute' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  head: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: { height: 22, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#C8283C', justifyContent: 'center' },
  face: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: 'rgba(20,18,14,0.9)', borderWidth: 1, borderColor: colors.gold, alignItems: 'center' },
  side: { position: 'absolute', gap: 10 },
  lowChat: { position: 'absolute', maxHeight: 230, gap: 9, justifyContent: 'flex-end', overflow: 'hidden' },
  inputRow: { position: 'absolute' },
  input: { height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(244,241,234,0.22)', backgroundColor: 'rgba(8,8,10,0.3)', paddingHorizontal: 16, color: colors.text, fontFamily: fonts.body, fontSize: 14 },
  castTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(232,194,122,0.92)' },
  topButtons: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 2 },
  small: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,8,10,0.32)' },
  chatPill: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,8,10,0.35)' },
  fakeInput: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fakeInputOn: { borderColor: colors.gold },
  caret: { width: 2, height: 18, borderRadius: 1, backgroundColor: colors.gold },
  keyboard: { position: 'absolute', left: 0, right: 0, bottom: 0, height: KEYBOARD_H, justifyContent: 'flex-end', backgroundColor: 'rgba(14,14,18,0.86)' },
  rail: { position: 'absolute', right: 0, top: 0, bottom: 0, paddingLeft: 14, gap: 10, justifyContent: 'flex-end', experimental_backgroundImage: 'linear-gradient(90deg, rgba(8,8,10,0) 0%, rgba(8,8,10,0.82) 22%)' },
  lines: { gap: 9, justifyContent: 'flex-end', overflow: 'hidden', flexShrink: 1 },
  ended: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,8,10,0.84)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingBottom: 32, gap: 14 },
  who: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#3A3A44' },
  whoOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  gift: { flex: 1, minHeight: 108, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, backgroundColor: '#0C0C10', borderWidth: 1, borderColor: '#2A2A33', alignItems: 'center', gap: 5 },
  giftOn: { backgroundColor: '#221E16', borderWidth: 1.5, borderColor: colors.gold },
  giftIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
