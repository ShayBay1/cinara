import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { Verified } from '@/components/Verified';
import { useMe } from '@/hooks/queries';
import { money, shareProfile, studioKeys, useStudioHome, type StudioTask, type TaskKey } from '@/social/studio';
import { useQueryClient } from '@tanstack/react-query';
import { colors, fonts, radius } from '@/theme/tokens';

const TASKS: Record<TaskKey, { title: string; icon: IconName; color: string }> = {
  post: { title: 'Post on your page', icon: 'plus', color: colors.online },
  reply: { title: 'Reply to messages', icon: 'chat', color: '#B48CFF' },
  mass_dm: { title: 'Send a mass message', icon: 'megaphone', color: '#6FA8FF' },
  paid_dm: { title: 'Send a paid message', icon: 'dollar', color: colors.gold },
  promote: { title: 'Promote your Backstage', icon: 'link', color: '#FF9F6B' },
};

/**
 * The actor's home base (like the creator home on subscription apps): what they've earned, one-tap
 * actions, today's five-task challenge that keeps fans coming back, and more ways to earn.
 */
export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useMe();
  const qc = useQueryClient();
  const home = useStudioHome(!!me.data?.isCast);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<TaskKey | null>(null);
  const h = home.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  if (!me.data?.isCast) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12 }}>
        <IconButton icon="back" label="Back" onPress={back} />
        <T variant="caption">The studio is for actors. Ask Cinara to set up your actor account.</T>
      </View>
    );
  }
  if (!h) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {home.isError ? (
          <>
            <T variant="caption">{home.error instanceof Error ? home.error.message : 'The studio didn’t load.'}</T>
            <Button compact label="Try again" onPress={() => void home.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={colors.gold} />
        )}
      </View>
    );
  }

  const done = h.tasks.filter((t) => t.done).length;
  const minutesLeft = h.tasks.filter((t) => !t.done).reduce((n, t) => n + t.minutes, 0);
  const cardW = Math.min(width, 700) - 32;
  const cards = [
    { label: 'Lifetime earnings', value: money(h.lifetimeCents), note: h.lifetimeCents ? 'Everything you’ve earned on Cinara' : 'Your first sale shows up here' },
    { label: 'This month', value: money(h.monthCents), note: `${h.subscribers} message subscribers · ${h.followers} followers` },
    { label: 'Today', value: money(h.todayCents), note: 'New subscriptions and unlocks since midnight ET' },
  ];
  const share = () => void shareProfile(h.handle, h.displayName).then(() => qc.invalidateQueries({ queryKey: studioKeys.home }));

  const go = (t: StudioTask) => {
    switch (t.key) {
      case 'post':
        return router.push('/post/new');
      case 'reply':
        return router.push('/messages');
      case 'mass_dm':
      case 'paid_dm':
        return router.push('/mass-dm');
      case 'promote':
        return share();
    }
  };
  const status = (t: StudioTask) => {
    if (t.key === 'post') return t.done ? 'Posted today' : 'No posts today';
    if (t.key === 'reply') return t.count ? `${t.count} unread messages` : 'All caught up';
    if (t.key === 'mass_dm') return t.done ? 'Sent today' : 'No mass message sent today';
    if (t.key === 'paid_dm') return t.done ? `${money(t.earnedCents ?? 0)} earned in messages today` : `${money(t.earnedCents ?? 0)} earned in messages today`;
    return t.done ? 'Shared today' : 'Recommended twice a week';
  };
  const tip: Record<TaskKey, string> = {
    post: 'A photo, a video or a quick update. Fans who see you every day stay subscribed.',
    reply: 'Fans who get replies stay and spend more. Top spenders are at the top of the Top spenders filter.',
    mass_dm: 'One message to all your subscribers. Ask a question, share a behind-the-scenes photo, tease what’s next.',
    paid_dm: 'Lock a photo or video with a price. Fans unlock it once; you keep 80%.',
    promote: 'Share your link on Instagram or TikTok. New fans land on your page and can join Backstage.',
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      refreshControl={<RefreshControl tintColor={colors.gold} refreshing={home.isRefetching} onRefresh={() => void home.refetch()} />}
    >
      {/* Cover */}
      <View style={[st.cover, { height: 230 + insets.top }]}>
        {h.coverUrl ? <Image source={{ uri: h.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(21,16,11,0.35)' }]} />
        <View style={[st.coverTop, { paddingTop: insets.top + 4 }]}>
          <IconButton icon="back" label="Back" onPress={back} />
          <Pressable onPress={() => router.push('/creator')} accessibilityRole="button" accessibilityLabel={`Not paid out yet: ${money(h.balanceCents)}`} style={st.balance}>
            <Icon name="dollar" size={16} color={colors.goldInk} />
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.goldInk }}>{money(h.balanceCents)}</T>
          </Pressable>
        </View>
        <View style={st.coverName}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 26, lineHeight: 34, color: colors.text }}>{h.displayName || h.handle}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T variant="caption" style={{ color: colors.textSoft }}>{`@${h.handle}`}</T>
            {h.verified ? <Verified size={14} /> : null}
          </View>
          {!h.coverUrl ? (
            <Pressable onPress={() => router.push('/creator')} accessibilityRole="button">
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.goldLight }}>+ Add a cover photo</T>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16, marginTop: 14 }}>
        {/* Earnings + quick actions */}
        <View style={{ flexDirection: width > 520 ? 'row' : 'column', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (width > 520 ? cardW / 2 : cardW)))}
            >
              {cards.map((c) => (
                <View key={c.label} style={[st.money, { width: width > 520 ? cardW / 2 - 7 : cardW }]}>
                  <T style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textSoft }}>{c.label}</T>
                  <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 44, lineHeight: 56, color: colors.text }}>{c.value}</T>
                  <T variant="caption">{c.note}</T>
                </View>
              ))}
            </ScrollView>
            <View style={st.dots}>
              {cards.map((c, i) => (
                <View key={c.label} style={[st.dot, i === page && { backgroundColor: colors.gold, width: 16 }]} />
              ))}
            </View>
          </View>
          <View style={st.actions}>
            <Action icon="plus" label="New post" onPress={() => router.push('/post/new')} />
            <Action icon="megaphone" label="Mass message" onPress={() => router.push('/mass-dm')} />
            <Action icon="chat" label="Channel" onPress={() => router.push({ pathname: '/channel/[handle]', params: { handle: h.handle } })} />
            <Action icon="vault" label="Vault" onPress={() => router.push('/vault')} />
          </View>
        </View>

        {/* Share */}
        <Pressable onPress={share} accessibilityRole="button" style={st.card}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text }}>Share your Backstage</T>
              <Icon name="chevron" size={14} color={colors.muted} />
            </View>
            <T variant="caption">Grow with your link: cinaratv.com/actor/{h.handle}</T>
          </View>
          <View style={st.round}>
            <Icon name="link" size={18} color={colors.goldInk} />
          </View>
        </Pressable>

        {/* Daily challenge */}
        <View style={[st.card, { flexDirection: 'column', alignItems: 'stretch', gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <T style={st.eyebrow}>Daily challenge</T>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 20, lineHeight: 26, color: colors.text }}>
                {done === 5 ? 'All done. See you tomorrow.' : done ? 'Keep going' : 'Let’s get started'}
              </T>
              <T variant="caption">{done === 5 ? 'Fans noticed. Come back tomorrow for a new set.' : `Do all 5 to make the most of today · ~${minutesLeft} min left`}</T>
            </View>
            <Ring done={done} total={5} />
          </View>
          {h.tasks.map((t) => {
            const meta = TASKS[t.key];
            const expanded = open === t.key;
            return (
              <Pressable key={t.key} onPress={() => setOpen(expanded ? null : t.key)} accessibilityRole="button" style={[st.task, t.done && { opacity: 0.6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[st.taskIcon, { backgroundColor: t.done ? colors.online : meta.color }]}>
                    <Icon name={t.done ? 'check' : meta.icon} size={15} color={colors.goldInk} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, textDecorationLine: t.done ? 'line-through' : 'none' }}>{meta.title}</T>
                    <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: t.done ? colors.online : colors.liveSoft }}>{status(t)}</T>
                  </View>
                  <T variant="caption">{`~${t.minutes} min`}</T>
                  <Icon name="chevron" size={14} color={colors.muted} />
                </View>
                {expanded ? (
                  <View style={{ gap: 10, marginTop: 10 }}>
                    <T variant="caption" style={{ fontSize: 13 }}>{tip[t.key]}</T>
                    <Button compact label={t.done ? 'Do it again' : 'Do it now'} onPress={() => go(t)} style={{ alignSelf: 'flex-start' }} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* More ways to earn */}
        <View style={{ gap: 10 }}>
          <View>
            <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.text }}>More ways to earn</T>
            <T variant="caption">Features worth trying</T>
          </View>
          <View style={st.grid}>
            <Way icon="lock" title="Paid posts" body="Lock a post with a price anyone can unlock." onPress={() => router.push('/post/new')} />
            <Way icon="ghost" title="Disappearing" body="Messages that vanish a minute after they’re opened." onPress={() => router.push('/mass-dm')} />
            <Way icon="ticket" title={h.trialDays ? `${h.trialDays}-day free trial` : 'Free trial'} body="Let new fans try messages before they pay." onPress={() => router.push('/creator')} />
            <Way icon="chat" title="Channel polls" body="Ask Backstage fans what they want next." onPress={() => router.push({ pathname: '/channel/[handle]', params: { handle: h.handle } })} />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Button kind="outline" label="Analytics" onPress={() => router.push('/analytics')} />
          <Button kind="outline" label="Creator settings" onPress={() => router.push('/creator')} />
          <Button kind="outline" label="View my page" onPress={() => router.push({ pathname: '/actor/[handle]', params: { handle: h.handle } })} />
        </View>
        {!h.dmsOpen ? (
          <Pressable onPress={() => router.push('/creator')}>
            <T variant="caption" style={{ color: colors.liveSoft }}>
              Messages are off, so fans can’t subscribe to message you. Turn them on in Creator settings.
            </T>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [st.action, pressed && { opacity: 0.7 }]}>
      <View style={st.actionBtn}>
        <Icon name={icon} size={22} color={colors.goldInk} />
      </View>
      <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, textAlign: 'center' }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

function Way({ icon, title, body, onPress }: { icon: IconName; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [st.way, pressed && { opacity: 0.7 }]}>
      <View style={[st.round, { width: 34, height: 34 }]}>
        <Icon name={icon} size={16} color={colors.goldInk} />
      </View>
      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.text }}>{`${title} ›`}</T>
      <T variant="caption">{body}</T>
    </Pressable>
  );
}

/** Progress ring: how many of today's tasks are done. */
function Ring({ done, total }: { done: number; total: number }) {
  const size = 84;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${done} of ${total} done`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={7} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.gold}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * done) / total} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 22, lineHeight: 30, color: colors.text }}>{`${done}/${total}`}</T>
    </View>
  );
}

const st = StyleSheet.create({
  cover: { backgroundColor: colors.wine, justifyContent: 'space-between' },
  coverTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingRight: 16 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.gold },
  coverName: { paddingHorizontal: 16, paddingBottom: 14, gap: 2 },
  money: { padding: 18, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginRight: 14 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  action: { width: '24%', alignItems: 'center', gap: 6 },
  actionBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: fonts.engraved, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.gold },
  task: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  taskIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  way: { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 6, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
