import { useEventListener } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Easing as RNEasing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftGlyph, Icon, type IconName } from '@/components/Icon';
import { SideKeyboard } from '@/components/live/SideKeyboard';
import { BorderChrome } from '@/components/player/BorderChrome';
import { TurnStage } from '@/components/player/TurnStage';
import { Reel } from '@/components/Reel';
import { Button, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import {
  api,
  FREE_EPISODES,
  type CastMember,
  type ChatMessage,
  type Episode,
  type Gift,
  type Show,
} from '@/data';
import {
  useEpisodes,
  useFriends,
  useGifts,
  useMe,
  useMembership,
  usePremiereStart,
  useShow,
} from '@/hooks/queries';
import { notify, openSafetyMenu } from '@/lib/safety';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useNow } from '@/hooks/useNow';
import { useReminder } from '@/hooks/useReminder';
import { countdownParts, DOORS_OPEN_MS, premiereFor, premiereStage } from '@/lib/premieres';
import { useTurn } from '@/hooks/useTurn';
import { canSellHere, formatPrice } from '@/lib/billing';
import { dayLabel, type Drop, dropOf, SLOT_LABEL } from '@/lib/schedule';
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
  const membership = useMembership();
  const now = useNow(1000);
  const addStub = useAppStore((s) => s.addStub);
  const premiere = show.data ? premiereFor(show.data, now) : null;
  const stage = premiere ? premiereStage(premiere.at, now) : null;
  // The room plays the drop being premiered tonight. Before the new episodes are out (or with no
  // premiere on), it plays the newest released drop, all of its episodes back to back.
  const drop = show.data
    ? premiere &&
      (stage === 'live' || stage === 'after') &&
      premiere.drop.from > show.data.latestEpisode
      ? premiere.drop
      : dropOf(Math.max(1, show.data.latestEpisode), show.data.episodeCount)
    : null;
  const numbers = useMemo(
    () => (drop ? Array.from({ length: drop.to - drop.from + 1 }, (_, i) => drop.from + i) : []),
    [drop?.from, drop?.to],
  );
  const playlist = useEpisodes(showId ?? '', numbers);
  const membersOnly = !!drop && drop.to > FREE_EPISODES;
  const isMember = membership.data?.active ?? false;
  const allowed = !membersOnly || isMember;

  // A ticket stub for every premiere you were in the room for, live.
  useEffect(() => {
    if (!show.data || !drop || !start.data || !allowed) return;
    addStub({
      id: `${show.data.id}@${start.data}`,
      showId: show.data.id,
      showTitle: show.data.title,
      at: start.data,
      from: drop.from,
      to: drop.to,
      cast: show.data.cast.map((c) => c.role),
    });
  }, [show.data, drop?.from, drop?.to, start.data, allowed, addStub]);

  if (!show.data || !drop || start.isPending || (membersOnly && membership.isPending)) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Reel size={56} spinning label="Loading the premiere" />
      </View>
    );
  }
  if (!start.data) return <Lobby show={show.data} now={now} />;
  if (!allowed) return <MembersOnly show={show.data} drop={drop} />;
  if (!playlist.data) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Reel size={56} spinning label="Loading the premiere" />
      </View>
    );
  }
  return <Live show={show.data} drop={drop} playlist={playlist.data} startedAt={start.data} />;
}

/**
 * Doors open: the lobby before 8/7c. The reel counts down in the centre, the cast arrive one by one
 * from 7:45, friends who are coming show up, and you can set a reminder or invite someone.
 */
function Lobby({ show, now }: { show: Show; now: Date }) {
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const reminder = useReminder(show);
  const premiere = premiereFor(show, now);
  const stage = premiere ? premiereStage(premiere.at, now) : null;
  const left = premiere ? premiere.at.getTime() - now.getTime() : 0;
  const c = countdownParts(left);
  const doors = stage === 'doors';
  // Cast arrive one by one across the 15 minutes the doors are open.
  const arrived = doors
    ? Math.min(
        show.cast.length,
        Math.ceil(((DOORS_OPEN_MS - left) / DOORS_OPEN_MS) * show.cast.length),
      )
    : 0;
  const coming = (friends.data ?? []).filter((f) => f.watching?.showId === show.id);
  const invite = () =>
    void Share.share({
      message: `${show.title} premieres live at 8/7c on Cinara, with the cast in the chat. Come watch with me.`,
    });

  return (
    <View
      style={[
        styles.fill,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton icon="back" label="Leave the lobby" onPress={() => router.back()} />
        <T variant="eyebrow">{doors ? 'Doors open' : 'Live premiere'}</T>
      </View>

      <View style={{ alignItems: 'center', gap: 10, marginTop: 28 }}>
        <Reel
          size={168}
          progress={premiere ? 1 - Math.min(1, left / 86_400_000) : undefined}
          spinning={doors}
          label={
            premiere
              ? `${c.days ? `${c.days} days ` : ''}${c.h} hours ${c.m} minutes until the premiere`
              : undefined
          }
        />
        {premiere ? (
          <View style={styles.clock} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {(c.days
              ? [
                  [String(c.days), c.days === 1 ? 'day' : 'days'],
                  [c.h, 'hrs'],
                  [c.m, 'min'],
                ]
              : Number(c.h) > 0
                ? [
                    [c.h, 'hrs'],
                    [c.m, 'min'],
                    [c.s, 'sec'],
                  ]
                : [
                    [c.m, 'min'],
                    [c.s, 'sec'],
                  ]
            ).map(([n, unit]) => (
              <View key={unit} style={styles.clockCell}>
                <T style={styles.clockNum}>{n}</T>
                <T style={styles.clockUnit}>{unit}</T>
              </View>
            ))}
          </View>
        ) : null}
        <T
          style={{
            fontFamily: fonts.serifItalic,
            fontSize: 20,
            color: colors.text,
            textAlign: 'center',
          }}
        >
          {premiere
            ? `${show.title} · Episodes ${premiere.drop.from}–${premiere.drop.to}`
            : show.title}
        </T>
        <T variant="caption" style={{ textAlign: 'center' }}>
          {premiere
            ? doors
              ? `Live at ${SLOT_LABEL}. The cast are arriving.`
              : `Doors open at 7:45, live at ${SLOT_LABEL}, ${dayLabel(premiere.at, now)}.`
            : 'No premiere is scheduled right now.'}
        </T>
      </View>

      {show.cast.length ? (
        <View style={{ marginTop: 28, gap: 12 }}>
          <T variant="eyebrow" style={{ color: colors.goldLight }}>
            {doors ? 'The cast is arriving' : 'In the chat at 8/7c'}
          </T>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              rowGap: 14,
              columnGap: show.cast.length > 4 ? 14 : 0,
              justifyContent: show.cast.length > 4 ? 'flex-start' : 'space-between',
            }}
          >
            {show.cast.map((m, i) => {
              const here = i < arrived;
              return (
                <View
                  key={m.role}
                  style={{
                    width: 66,
                    alignItems: 'center',
                    gap: 4,
                    opacity: doors && !here ? 0.45 : 1,
                  }}
                  accessible
                  accessibilityLabel={`${castLabel(m)}${doors ? (here ? ', here' : ', on the way') : ''}`}
                >
                  <View
                    style={[
                      styles.lobbyFace,
                      {
                        backgroundColor: tintFor(m.role),
                        borderStyle: doors && !here ? 'dashed' : 'solid',
                        borderColor: here ? colors.gold : colors.muted,
                      },
                    ]}
                  >
                    <T style={styles.lobbyInitial}>{m.role.charAt(0)}</T>
                  </View>
                  <T
                    style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text }}
                    numberOfLines={1}
                  >
                    {castLabel(m)}
                  </T>
                  {doors ? (
                    <T
                      style={{
                        fontFamily: fonts.bodyBold,
                        fontSize: 10,
                        color: here ? colors.friend : colors.muted,
                      }}
                    >
                      {here ? 'here' : 'on the way'}
                    </T>
                  ) : null}
                </View>
              );
            })}
          </View>
          {coming.length ? (
            <T variant="caption" style={{ color: colors.textSoft }}>{`${coming
              .map((f) => f.handle)
              .slice(0, 2)
              .join(
                ' and ',
              )}${coming.length > 2 ? ` and ${coming.length - 2} more` : ''} ${coming.length === 1 ? 'is' : 'are'} coming`}</T>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 'auto', gap: 10 }}>
        {premiere && !doors ? (
          <Button
            kind={reminder.isOn ? 'outline' : 'primary'}
            icon={reminder.isOn ? 'check' : 'bell'}
            label={reminder.isOn ? 'Reminder on' : 'Remind me at 8/7c'}
            loading={reminder.busy}
            onPress={reminder.toggle}
          />
        ) : null}
        <Button kind="outline" icon="friends" label="Invite a friend" onPress={invite} />
      </View>
    </View>
  );
}

/** Tonight's premiere is members-only episodes: say so plainly, and how to get in. */
function MembersOnly({ show, drop }: { show: Show; drop: Drop }) {
  return (
    <View style={[styles.fill, styles.center, { gap: 14, padding: 28 }]}>
      <Reel size={72} />
      <T variant="eyebrow">Members premiere</T>
      <T
        style={{
          fontFamily: fonts.serif,
          fontSize: 26,
          lineHeight: 32,
          color: colors.text,
          textAlign: 'center',
        }}
      >{`${show.title} · Episodes ${drop.from}–${drop.to}`}</T>
      <T variant="caption" style={{ textAlign: 'center', fontSize: 14 }}>
        Members watch every premiere live, with the cast in the chat. Episodes 1–10 of every show
        are free.
      </T>
      <Button
        label="About membership"
        onPress={() => router.replace('/join')}
        style={{ alignSelf: 'stretch' }}
      />
      <Button
        kind="outline"
        label="Not now"
        onPress={() => router.back()}
        style={{ alignSelf: 'stretch' }}
      />
    </View>
  );
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
function Live({
  show,
  drop,
  playlist,
  startedAt,
}: {
  show: Show;
  drop: Drop;
  playlist: Episode[];
  startedAt: string;
}) {
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
  const me = useMe();
  const keyboard = useKeyboardHeight();
  const myIdRef = useRef<string | undefined>(undefined);
  myIdRef.current = me.data?.id;
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
  const chrome = useDerivedValue<number>(
    () => withTiming(chromeOn ? 1 : 0, { duration: CHROME_FADE_MS }),
    [chromeOn],
  );
  // Chat, buttons and header step aside while the phone turns and come back once it settles.
  const steady = useDerivedValue(() =>
    withTiming(turn.settled.value, { duration: turn.settled.value ? 220 : 120 }),
  );
  const steadyStyle = useAnimatedStyle(() => ({ opacity: steady.value }));

  // ---------- Typing ----------
  // Sideways on a phone, the system keyboard would come up the wrong way, so we draw our own.
  const ownKeyboard = sideways && !web;
  const startTyping = () => setTyping(true);
  const stopTyping = () => setTyping(false);

  // ---------- Everyone watches in sync: the position in the drop = time since the premiere began ----------
  const starts = useMemo(
    () =>
      playlist.reduce<number[]>(
        (acc, _e, i) => [
          ...acc,
          i === 0 ? 0 : (acc[i - 1] ?? 0) + (playlist[i - 1]?.durationSec ?? 0),
        ],
        [],
      ),
    [playlist],
  );
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

  const addHeart = useCallback(
    () => setHearts((h) => [...h.slice(-8), Date.now() + Math.random()]),
    [],
  );

  useEffect(() => {
    const unsubscribe = api.subscribeToChat(show.id, (m) => {
      // Our own text messages are already on screen (added the moment we send).
      if (m.kind === 'text' && m.author.id === myIdRef.current) return;
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
    if (!me.data) {
      router.push('/sign-in');
      return;
    }
    const localId = `me-${Date.now()}`;
    setMessages((list) =>
      [
        ...list,
        {
          id: localId,
          kind: 'text' as const,
          author: { id: 'me', handle: 'you' },
          body: text,
          createdAt: new Date().toISOString(),
        },
      ].slice(-MAX_MESSAGES),
    );
    setDraft('');
    api.sendChat(show.id, text).catch((e: unknown) => {
      // Take back the line we showed and say why it didn't send.
      setMessages((list) => list.filter((m) => m.id !== localId));
      notify(e instanceof Error ? e.message : 'Your message didn’t send. Try again.');
    });
  };
  const toggleChat = () => {
    setChatHidden(!chatHidden);
    setUnread(0);
  };

  const here = shareActivity ? (friends.data ?? []).filter((f) => f.watching?.watchingNow) : [];
  const duration = total > 0 ? total : 1;
  const giftName = (id: string) => gifts.data?.find((g) => g.id === id)?.name ?? 'a gift';
  const pads = {
    top: Math.max(12, insets.top),
    right: Math.max(12, insets.right),
    bottom: Math.max(12, insets.bottom),
    left: Math.max(12, insets.left),
  };
  // Safe area as the viewer sees it, for everything laid out in the viewer's frame.
  const safe = flat
    ? {
        top: Math.max(10, insets.top),
        bottom: Math.max(10, insets.bottom),
        left: Math.max(16, insets.left),
        right: Math.max(16, insets.right),
      }
    : orientation === 0
      ? { top: pads.top, bottom: pads.bottom, left: 12, right: 12 }
      : orientation === 90
        ? { top: 12, bottom: 12, left: pads.top, right: pads.bottom }
        : { top: 12, bottom: 12, left: pads.bottom, right: pads.top };
  const railW = Math.min(280, Math.round(view.width * 0.34));

  const chatLines = (
    <>
      {messages.length === 0 ? (
        <ChatLine name="Cinara" body="You'll see your friends and the cast here. Say hi." />
      ) : null}
      {messages.map((m, i) => (
        <ChatLine
          key={m.id}
          name={m.author.handle}
          tag={m.author.isCast ? 'CAST' : undefined}
          verified={m.author.verified}
          me={m.author.id === 'me'}
          gift={m.kind === 'gift'}
          body={
            m.kind === 'text'
              ? m.body
              : `sent ${giftName(m.giftId)} to ${recipientLabel(show, m.to)}`
          }
          fade={0.4 + (0.6 * (i + 1)) / messages.length}
          onLongPress={
            m.author.id === 'me' || m.author.id === me.data?.id || m.id.startsWith('me-')
              ? undefined
              : () => openSafetyMenu({ kind: 'chat', id: m.id, author: m.author, mine: false }, {
                  onChanged: () => setMessages((list) => list.filter((x) => x.author.id !== m.author.id)),
                })
          }
        />
      ))}
    </>
  );

  const input = ownKeyboard ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Write a message"
      onPress={startTyping}
      style={[styles.input, styles.fakeInput, typing && styles.fakeInputOn]}
    >
      <T
        numberOfLines={1}
        style={{
          fontFamily: fonts.body,
          fontSize: 14,
          color: draft ? colors.text : 'rgba(243,234,216,0.55)',
          flexShrink: 1,
        }}
      >
        {draft || 'Say something…'}
      </T>
      {typing ? <View style={styles.caret} /> : null}
    </Pressable>
  ) : (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      placeholder="Say something…"
      placeholderTextColor="rgba(243,234,216,0.55)"
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
      <TurnStage
        player={player}
        width={W}
        height={H}
        angle={drawAngle}
        fade={turn.fade}
        panX={panX}
        panY={panY}
        zoom={zoom}
      />

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
        pads={
          flat ? { top: insets.top + 12, right: 12, bottom: insets.bottom + 12, left: 12 } : pads
        }
        angle={drawAngle}
        visible={chrome}
        title={`Live · ${epLabel}`}
        progress={Math.min(1, position / duration)}
      />

      {/* Everything below is laid out in the viewer's frame: upright, or turned to match the phone. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.viewer,
          {
            width: view.width,
            height: view.height,
            left: (W - view.width) / 2,
            top: (H - view.height) / 2,
            transform: [{ rotate: `${orientation}deg` }],
          },
        ]}
      >
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingBottom: keyboard }]}>
          <Animated.View
            pointerEvents={turn.turning ? 'none' : 'box-none'}
            style={[StyleSheet.absoluteFill, steadyStyle]}
          >
            {/* Header: leave, LIVE, and who's here. */}
            <View
              pointerEvents="box-none"
              style={[
                styles.head,
                {
                  top: safe.top - 8,
                  left: safe.left - 6,
                  right: sideways ? railW + safe.right : safe.right,
                },
              ]}
            >
              <IconButton icon="back" label="Leave the premiere" onPress={() => router.back()} />
              <View style={styles.liveBadge} accessibilityLabel="Live">
                <T variant="label" style={{ color: '#fff', fontSize: 11, letterSpacing: 1.4 }}>
                  LIVE
                </T>
              </View>
              <T
                variant="label"
                numberOfLines={1}
                style={[styles.shadow, { fontSize: 12, flexShrink: 1 }]}
              >
                {here.length
                  ? `${here.map((f) => f.handle).join(' and ')} ${here.length > 1 ? 'are' : 'is'} here`
                  : sideways
                    ? `${show.title} · ${epLabel}`
                    : epLabel}
              </T>
              {here.length ? (
                <View style={{ flexDirection: 'row' }}>
                  {here.slice(0, 3).map((f, i) => (
                    <View
                      key={f.id}
                      style={[
                        styles.face,
                        { backgroundColor: tintFor(f.handle), marginLeft: i ? -8 : 0 },
                      ]}
                    >
                      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 11 }}>
                        {f.handle.charAt(0).toUpperCase()}
                      </T>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {toast && toast.kind === 'gift' ? (
              <View style={[styles.toast, { top: safe.top + 48 }]} accessibilityLiveRegion="polite">
                <T variant="label" style={{ fontSize: 13 }}>
                  {toast.author.handle}
                </T>
                <T
                  variant="caption"
                  style={{ color: colors.gold, fontFamily: fonts.bodyBold }}
                >{`sent ${giftName(toast.giftId)} to ${recipientLabel(show, toast.to)}`}</T>
              </View>
            ) : null}

            {hearts.map((id) => (
              <FloatingHeart
                key={id}
                onDone={() => setHearts((h) => h.filter((x) => x !== id))}
                bottom={safe.bottom + (sideways ? 120 : 260)}
                right={sideways ? railW + safe.right + 10 : safe.right + 16}
              />
            ))}

            {sideways ? (
              <>
                {/* Sideways: a slim row of buttons up top, chat in a rail on the right. */}
                <View style={[styles.topButtons, { top: safe.top - 2, right: safe.right }]}>
                  <SmallButton icon="heart" label="React" onPress={addHeart} />
                  {canSellHere ? (
                    <SmallButton
                      icon="gift"
                      label="Send a gift"
                      onPress={() => setGiftOpen(true)}
                      gold
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={chatHidden ? 'Show chat' : 'Hide chat'}
                    accessibilityState={{ selected: !chatHidden }}
                    onPress={toggleChat}
                    style={styles.chatPill}
                  >
                    <T variant="label" style={{ fontSize: 12, letterSpacing: 0.4 }}>
                      {chatHidden && unread > 0 ? `Chat · ${unread}` : 'Chat'}
                    </T>
                  </Pressable>
                </View>
                {chatHidden ? null : (
                  <View
                    style={[
                      styles.rail,
                      {
                        width: railW + safe.right,
                        paddingRight: safe.right,
                        paddingBottom: typing && ownKeyboard ? KEYBOARD_H + 8 : safe.bottom,
                        paddingTop: safe.top + 44,
                      },
                    ]}
                  >
                    <View style={styles.lines} accessibilityLiveRegion="polite">
                      {chatLines}
                    </View>
                    {input}
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Upright: clear chat low-left, buttons down the right, message box at the bottom. */}
                <View style={[styles.side, { right: safe.right - 6, bottom: safe.bottom + 70 }]}>
                  <SideButton icon="heart" label="React" onPress={addHeart} />
                  <SideButton
                    icon={chatHidden ? 'chat-off' : 'chat'}
                    label={chatHidden && unread > 0 ? `Chat · ${unread}` : 'Chat'}
                    onPress={toggleChat}
                    active={!chatHidden}
                  />
                  {canSellHere ? (
                    <SideButton icon="gift" label="Gift" onPress={() => setGiftOpen(true)} />
                  ) : null}
                </View>
                {chatHidden ? null : (
                  <>
                    <View
                      style={[
                        styles.lowChat,
                        { left: safe.left, right: safe.right + 70, bottom: safe.bottom + 64 },
                      ]}
                      accessibilityLiveRegion="polite"
                    >
                      {chatLines}
                    </View>
                    <View
                      style={[
                        styles.inputRow,
                        { left: safe.left, right: safe.right + 70, bottom: safe.bottom + 10 },
                      ]}
                    >
                      {input}
                    </View>
                  </>
                )}
              </>
            )}
          </Animated.View>

          {typing && ownKeyboard ? (
            <View
              style={[
                styles.keyboard,
                { paddingLeft: safe.left - 6, paddingRight: safe.right - 6 },
              ]}
            >
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
              <T variant="eyebrow" style={{ color: colors.gold }}>
                Premiere complete
              </T>
              <T variant="serif" style={{ fontSize: 38, lineHeight: 40, textAlign: 'center' }}>
                You watched it live.
              </T>
              <T style={{ color: colors.textSoft, textAlign: 'center' }}>
                The chat stays open for 15 minutes. The cast is still here.
              </T>
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
        </View>
      </View>

      {canSellHere ? (
        <GiftSheet
          visible={giftOpen}
          onClose={() => setGiftOpen(false)}
          gifts={gifts.data ?? []}
          show={show}
        />
      ) : null}
    </View>
  );
}

/** One chat line: no bubble, just text with a soft shadow so it reads over the picture. */
function ChatLine({
  name,
  body,
  tag,
  verified,
  me,
  gift,
  fade = 1,
  onLongPress,
}: {
  name: string;
  body: string;
  tag?: string;
  verified?: boolean;
  me?: boolean;
  gift?: boolean;
  fade?: number;
  /** Report or block the writer (other people's lines only). */
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onLongPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityHint={onLongPress ? 'Long press to report or block' : undefined}
      style={{ opacity: fade, gap: 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <T
          variant="label"
          style={[
            styles.shadow,
            { fontSize: 12, color: me ? colors.friend : 'rgba(243,234,216,0.78)' },
          ]}
        >
          {name}
        </T>
        {verified ? <Verified size={12} /> : null}
        {tag && !verified ? (
          <View style={styles.castTag}>
            <T
              style={{
                fontFamily: fonts.bodyHeavy,
                fontSize: 9,
                letterSpacing: 1.1,
                color: colors.ink,
              }}
            >
              {tag}
            </T>
          </View>
        ) : null}
      </View>
      <T
        style={[
          styles.shadow,
          {
            fontFamily: fonts.bodyBold,
            fontSize: 14,
            lineHeight: 18,
            color: gift ? colors.gold : '#FFFFFF',
          },
        ]}
      >
        {body}
      </T>
    </Pressable>
  );
}

function SideButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      style={{ width: 60, alignItems: 'center', gap: 1 }}
    >
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={icon === 'gift' ? colors.gold : colors.text} />
      </View>
      <T variant="label" numberOfLines={1} style={[styles.shadow, { fontSize: 11 }]}>
        {label}
      </T>
    </Pressable>
  );
}

function SmallButton({
  icon,
  label,
  onPress,
  gold,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  gold?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.small, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={18} color={gold ? colors.gold : colors.text} />
    </Pressable>
  );
}

/** Web only: gifts are paid on the website through Stripe, never in the native apps. */
function GiftSheet({
  visible,
  onClose,
  gifts,
  show,
}: {
  visible: boolean;
  onClose: () => void;
  gifts: Gift[];
  show: Show;
}) {
  // Each viewer picks who gets it: one actor, or the whole cast.
  const recipients = [
    ...show.cast.map((c) => ({
      key: c.handle ?? c.actorName ?? c.role,
      label: castLabel(c),
      sub: `plays ${c.role}`,
    })),
    { key: 'cast', label: 'Whole cast', sub: 'split evenly' },
  ];
  const [to, setTo] = useState(0);
  const [pick, setPick] = useState(2);
  const [busy, setBusy] = useState(false);
  const gift = gifts[pick];

  const checkout = async () => {
    if (!gift) return;
    setBusy(true);
    const input = { showId: show.id, giftId: gift.id, to: recipients[to]?.key ?? 'cast' };
    try {
      let url: string;
      try {
        url = await api.createGiftCheckout(input);
      } catch (e) {
        if ((e as { code?: string }).code !== 'age_required') throw e;
        // Gifts are 18+: ask once, save it, then try again.
        const answer = globalThis.prompt?.('Gifts are for viewers 18 and over. What year were you born?');
        if (!answer) return;
        await api.setBirthYear(Number(answer.trim()));
        url = await api.createGiftCheckout(input);
      }
      globalThis.location?.assign(url);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Checkout didn’t open. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(21,16,11,0.55)' }}
        accessibilityLabel="Close gifts"
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View>
            <T variant="title" style={{ fontSize: 17 }}>
              Send a gift
            </T>
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
              <T
                variant="label"
                style={{ fontSize: 13, color: to === i ? colors.ink : colors.text }}
              >
                {r.label}
              </T>
              <T
                style={{
                  fontFamily: fonts.body,
                  fontSize: 11,
                  color: to === i ? colors.goldInk : colors.muted,
                }}
              >
                {r.sub}
              </T>
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
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 11, textAlign: 'center' }}>
                {g.name}
              </T>
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.gold }}>
                {formatPrice(g.priceCents)}
              </T>
            </Pressable>
          ))}
        </View>
        {gift ? (
          <Button
            label={`Send ${gift.name} to ${recipients[to]?.label ?? 'the cast'} · ${formatPrice(gift.priceCents)}`}
            loading={busy}
            onPress={checkout}
          />
        ) : null}
        <T variant="caption" style={{ textAlign: 'center' }}>
          Paid in dollars on the web, no coins. Your gift goes to who you picked. 18+ only.
        </T>
      </View>
    </Modal>
  );
}

function FloatingHeart({
  onDone,
  bottom,
  right,
}: {
  onDone: () => void;
  bottom: number;
  right: number;
}) {
  const progress = useRef(new RNAnimated.Value(0)).current;
  const offset = useRef(Math.random() * 20).current;
  useEffect(() => {
    RNAnimated.timing(progress, {
      toValue: 1,
      duration: 2600,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start(onDone);
  }, [onDone, progress]);
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: right + offset,
        bottom,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -220] }) },
        ],
      }}
    >
      <Icon name="heart" size={22} color={colors.accent} filled />
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  clock: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 2 },
  clockCell: { alignItems: 'center', minWidth: 54 },
  clockNum: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 34,
    lineHeight: 38,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  clockUnit: {
    fontFamily: fonts.engraved,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  lobbyInitial: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 28,
    color: colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  lobbyFace: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  viewer: { position: 'absolute' },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  head: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#E5484D',
    justifyContent: 'center',
  },
  face: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,18,14,0.9)',
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  side: { position: 'absolute', gap: 10 },
  lowChat: {
    position: 'absolute',
    maxHeight: 230,
    gap: 9,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  inputRow: { position: 'absolute' },
  input: {
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(243,234,216,0.22)',
    backgroundColor: 'rgba(21,16,11,0.3)',
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  castTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,184,0,0.92)',
  },
  topButtons: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 2,
  },
  small: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21,16,11,0.32)',
  },
  chatPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21,16,11,0.35)',
  },
  fakeInput: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fakeInputOn: { borderColor: colors.gold },
  caret: { width: 2, height: 18, borderRadius: 1, backgroundColor: colors.gold },
  keyboard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: KEYBOARD_H,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(14,14,18,0.86)',
  },
  rail: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    paddingLeft: 14,
    gap: 10,
    justifyContent: 'flex-end',
    experimental_backgroundImage:
      'linear-gradient(90deg, rgba(21,16,11,0) 0%, rgba(21,16,11,0.82) 22%)',
  },
  lines: { gap: 9, justifyContent: 'flex-end', overflow: 'hidden', flexShrink: 1 },
  ended: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(21,16,11,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  who: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A2E20',
  },
  whoOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  gift: {
    flex: 1,
    minHeight: 108,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: '#110D09',
    borderWidth: 1,
    borderColor: '#3A2E20',
    alignItems: 'center',
    gap: 5,
  },
  giftOn: { backgroundColor: '#221E16', borderWidth: 1.5, borderColor: colors.gold },
  giftIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
