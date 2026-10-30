import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Develop } from '@/components/Develop';
import { BackstageStatusRow } from '@/social/Join';
import { Icon } from '@/components/Icon';
import { Pressy } from '@/components/Pressy';
import { Reel } from '@/components/Reel';
import { Screen } from '@/components/Screen';
import { Avatar, Button, T } from '@/components/ui';
import { coverSource } from '@/data/covers';
import { type ActorEarnings, api, type Show } from '@/data';
import { useEarnings, useMe, useMembership, useShows, useUploadAvatar } from '@/hooks/queries';
import { canSellHere, MEMBERSHIP_PRICE_LABEL, showExternalJoinLink, WEB_URL } from '@/lib/billing';
import { easternParts } from '@/lib/schedule';
import { money, shortDate, statementTotals } from '@/lib/share';
import { useAppStore, type TicketStub } from '@/store/useAppStore';
import { colors, fonts, radius } from '@/theme/tokens';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function ProfileScreen() {
  const me = useMe();
  const membership = useMembership();
  const earnings = useEarnings();
  const shows = useShows();
  const upload = useUploadAvatar();
  const myList = useAppStore((s) => s.myList);
  const localAvatar = useAppStore((s) => s.avatarUrl);
  const setAvatarUrl = useAppStore((s) => s.setAvatarUrl);
  const stubs = useAppStore((s) => s.stubs);
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
      if (api.mode === 'live')
        say('Photo uploaded', 'Your new photo appears once it passes our quick safety check.');
    } catch (e) {
      say('Couldn’t update your photo', e instanceof Error ? e.message : 'Try a JPG or PNG.');
    } finally {
      setPicking(false);
    }
  };

  const manageMembership = () => {
    if (canSellHere || showExternalJoinLink) void WebBrowser.openBrowserAsync(`${WEB_URL}/account`);
  };

  // Stubs from the last seven days fill the reel: a full week of premieres, one per night.
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = new Set(
    stubs.filter((t) => Date.parse(t.at) >= weekAgo).map((t) => t.at.slice(0, 10)),
  ).size;

  return (
    <Screen
      title={`@${handle}`}
      subtitle={
        stubs.length
          ? `${stubs.length} ${stubs.length === 1 ? 'premiere' : 'premieres'} attended live`
          : 'Your photo, your stubs, your list'
      }
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={styles.iconBtn}
        >
          <Icon name="settings" size={20} />
        </Pressable>
      }
    >
      <View style={styles.photoRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? 'Change profile photo' : 'Upload profile photo'}
          onPress={pickPhoto}
          disabled={picking || upload.isPending}
        >
          <View style={styles.ring}>
            <Avatar handle={handle} url={avatarUrl} size={84} />
          </View>
          <View style={styles.cam}>
            <Icon name="camera" size={16} color={colors.ink} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          <T variant="caption" style={{ fontSize: 13 }}>
            Your photo shows on your comments, in live chat, and to friends.
          </T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              compact
              kind="outline"
              label={avatarUrl ? 'Change photo' : 'Upload photo'}
              loading={picking || upload.isPending}
              onPress={pickPhoto}
            />
            {avatarUrl ? (
              <Button
                compact
                kind="outline"
                label="Remove"
                onPress={() => {
                  setAvatarUrl(null);
                  void api.removeAvatar().then(() => me.refetch()).catch(() => undefined);
                }}
              />
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.memberCard}>
        <T variant="eyebrow">{isMember ? 'Member' : 'Membership'}</T>
        {isMember ? (
          <>
            <T style={styles.memberLine}>Your membership pays the cast of every show you watch.</T>
            <T variant="caption">Billed monthly on the Cinara website. Cancel anytime there.</T>
            {canSellHere || showExternalJoinLink ? (
              <Button
                compact
                kind="outline"
                label="Manage membership"
                onPress={manageMembership}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
          </>
        ) : (
          <>
            <T style={styles.memberLine}>
              Every episode, the night it premieres. Paid straight to the people on screen.
            </T>
            <T variant="caption">Episodes 1–10 of every show are free.</T>
            <Button
              label={
                canSellHere
                  ? `Become a member · ${MEMBERSHIP_PRICE_LABEL}/month`
                  : 'About membership'
              }
              onPress={() => router.push('/join')}
              style={{ marginTop: 4 }}
            />
          </>
        )}
      </View>

      {earnings.data ? <ShareCard earnings={earnings.data} /> : null}

      <View style={styles.section}>
        <BackstageStatusRow />
      </View>

      {me.data?.isCast ? (
        <View style={[styles.section, { flexDirection: 'row', gap: 8 }]}>
          <Button
            compact
            label="My social page"
            onPress={() => router.push({ pathname: '/actor/[handle]', params: { handle: me.data!.handle } })}
            style={{ flex: 1 }}
          />
          <Button compact kind="outline" label="Studio" onPress={() => router.push('/studio')} style={{ flex: 1 }} />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.headRow}>
          <T style={styles.h2}>Your ticket stubs</T>
          {stubs.length ? <T variant="caption">{`${thisWeek} of 7 this week`}</T> : null}
        </View>
        {stubs.length ? (
          <View style={{ gap: 10 }}>
            {stubs.slice(0, 12).map((t) => (
              <Stub key={t.id} stub={t} show={(shows.data ?? []).find((s) => s.id === t.showId)} />
            ))}
            {thisWeek < 7 ? (
              <View style={styles.reelNote}>
                <Reel size={34} progress={thisWeek / 7} />
                <T variant="caption" style={{ flex: 1, fontSize: 13, color: colors.textSoft }}>
                  {`${7 - thisWeek} more ${7 - thisWeek === 1 ? 'premiere' : 'premieres'} this week and your stubs make a full reel.`}
                </T>
              </View>
            ) : (
              <View style={styles.reelNote}>
                <Reel size={34} progress={1} />
                <T variant="caption" style={{ flex: 1, fontSize: 13, color: colors.gold }}>
                  A full reel: seven premieres in seven nights.
                </T>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyStub}>
            <Icon name="ticket" size={26} color={colors.muted} />
            <T variant="caption" style={{ flex: 1, fontSize: 14 }}>
              Watch a premiere live at 8/7c and its ticket stub lands here.
            </T>
          </View>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Friends. See who’s watching."
        onPress={() => router.push('/friends')}
        style={styles.friendsRow}
      >
        <Icon name="friends" />
        <T variant="label" style={{ flex: 1, fontSize: 15 }}>
          Friends
        </T>
        <T variant="caption">See who’s watching</T>
      </Pressable>

      <View style={styles.section}>
        <T style={[styles.h2, { marginBottom: 12 }]}>My List</T>
        {saved.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {saved.map((s) => (
              <Pressy
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={s.title}
                onPress={() =>
                  router.push({ pathname: '/show/[showId]', params: { showId: s.id } })
                }
                style={{ width: 104, gap: 6 }}
              >
                <View style={[styles.poster, { backgroundColor: s.color }]}>
                  {coverSource(s) ? (
                    <Image
                      source={coverSource(s)!}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : null}
                </View>
                <T
                  style={{
                    fontFamily: fonts.engraved,
                    fontSize: 11,
                    lineHeight: 14,
                    color: colors.goldLight,
                  }}
                  numberOfLines={2}
                >
                  {s.title}
                </T>
              </Pressy>
            ))}
          </ScrollView>
        ) : (
          <T variant="caption" style={{ fontSize: 14 }}>
            Tap + on a show to save it here.
          </T>
        )}
      </View>
    </Screen>
  );
}

const STUB_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** An engraved ticket stub for one premiere you watched live. */
function Stub({ stub, show }: { stub: TicketStub; show?: Show }) {
  const at = new Date(stub.at);
  const p = easternParts(at);
  return (
    <View
      accessible
      accessibilityLabel={`Ticket stub: ${stub.showTitle}, episodes ${stub.from} to ${stub.to}, ${STUB_DAYS[p.weekday]} ${p.month}/${p.day}`}
      style={styles.stub}
    >
      <Develop developed style={{ width: 66 }}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: show?.color ?? colors.wine }]} />
        {show && coverSource(show) ? (
          <Image source={coverSource(show)!} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </Develop>
      <View style={styles.stubBody}>
        <T style={styles.stubEyebrow}>Admit one · live premiere</T>
        <T style={styles.stubTitle} numberOfLines={1}>
          {stub.showTitle}
        </T>
        <T style={styles.stubLine}>{`Episodes ${stub.from}–${stub.to}`}</T>
        {stub.cast.length ? (
          <T
            style={styles.stubCast}
            numberOfLines={1}
          >{`Cast in the chat: ${stub.cast.join(', ')}`}</T>
        ) : null}
      </View>
      <View style={styles.stubDate}>
        <T style={styles.stubDay}>{STUB_DAYS[p.weekday]}</T>
        <T style={styles.stubNum}>{`${p.month}/${p.day}`}</T>
        <T style={styles.stubDay}>8/7c</T>
      </View>
    </View>
  );
}

/** For cast members: this quarter's Cinara Share so far, opening the full statement. */
function ShareCard({ earnings }: { earnings: ActorEarnings }) {
  const t = statementTotals(earnings.current);
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={`Your Cinara Share. ${money(t.totalCents)} so far this quarter. Open your statements.`}
      onPress={() => router.push('/earnings')}
      style={styles.shareCard}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="eyebrow">Your Cinara Share</T>
        <T style={styles.shareAmount}>{money(t.totalCents)}</T>
        <T variant="caption" style={{ fontSize: 13 }}>
          {`So far in ${t.quarter.label} · paid by ${shortDate(t.quarter.payBy)}`}
        </T>
      </View>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <Icon name="back" size={18} color={colors.gold} />
      </View>
    </Pressy>
  );
}

function say(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { padding: 3, borderRadius: 48, borderWidth: 2, borderColor: colors.gold },
  cam: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCard: {
    marginTop: 22,
    padding: 16,
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    experimental_backgroundImage: 'linear-gradient(135deg, #3A2A0E 0%, #1E1710 65%)',
  },
  shareCard: {
    marginTop: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  shareAmount: { fontFamily: fonts.serifItalic, fontSize: 34, lineHeight: 41, color: colors.gold },
  memberLine: { fontFamily: fonts.serifItalic, fontSize: 19, lineHeight: 24, color: colors.text },
  section: { paddingTop: 28 },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
  },
  stub: {
    flexDirection: 'row',
    height: 92,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3EAD8',
  },
  stubBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 2,
    borderRightWidth: 2,
    borderRightColor: '#C9B48E',
    borderStyle: 'dashed',
  },
  stubEyebrow: {
    fontFamily: fonts.engraved,
    fontSize: 8.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#8A5A10',
  },
  stubTitle: { fontFamily: fonts.engraved, fontSize: 14, color: '#2A1D10' },
  stubLine: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#2A1D10' },
  stubCast: { fontFamily: fonts.body, fontSize: 10, color: '#6B5636' },
  stubDate: { width: 62, alignItems: 'center', justifyContent: 'center', gap: 1 },
  stubDay: { fontFamily: fonts.bodyHeavy, fontSize: 10, color: '#8A5A10' },
  stubNum: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 26, color: '#2A1D10' },
  reelNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  emptyStub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  friendsRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  poster: { width: 104, height: 148, borderRadius: 8, overflow: 'hidden' },
});
