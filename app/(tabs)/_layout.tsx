import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Glass } from '@/components/Glass';
import { Avatar } from '@/components/ui';
import { useMe, useShows } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/hooks/useNow';
import { soonestPremiere } from '@/lib/premieres';
import { syncPremiereActivity, syncTonightWidget } from '@/lib/widgetSync';
import { useUnreadDms } from '@/social/hooks';
import { useNotificationBadges } from '@/social/notifications';
import { colors, fonts } from '@/theme/tokens';

/** The Profile tab is just your picture (like Instagram): no icon, no label, a thin ring when you're on it. */
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const me = useMe();
  const localAvatar = useAppStore((s) => s.avatarUrl);
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: focused ? colors.text : 'transparent',
      }}
    >
      <Avatar handle={me.data?.handle ?? 'you'} url={me.data?.avatarUrl ?? localAvatar} size={26} />
    </View>
  );
}

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: ColorValue }) => (
    <Icon name={icon} color={String(color)} size={23} />
  ),
});

export default function TabsLayout() {
  const shows = useShows();
  const reminders = useAppStore((s) => s.reminders);
  const me = useMe();
  const dms = useUnreadDms(!!me.data?.id);
  // Unread notifications + messages: the Social tab badge and the app icon badge.
  const badges = useNotificationBadges(me.data?.id, dms.data ?? 0);
  // Home-screen widget and Dynamic Island countdown (iPhone builds only). Re-synced each minute,
  // whichever tab is open.
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  useEffect(() => {
    const list = shows.data ?? [];
    if (!list.length) return;
    syncTonightWidget(list);
    void syncPremiereActivity(list, Object.keys(reminders));
  }, [shows.data, reminders, minute]);
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.pick() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        // The tab bar floats over the content as glass: posters and key art scroll underneath it.
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: 12,
          bottom: Platform.OS === 'ios' ? 24 : 16,
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
          borderRadius: 33,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        },
        tabBarBackground: () => <Glass radius={33} style={StyleSheet.absoluteFill} />,
        sceneStyle: { backgroundColor: colors.ink },
      }}
    >
      {/* Feed is first and is where the app opens (TikTok-style). Home is the browse page. */}
      <Tabs.Screen name="index" options={tab('Feed', 'play')} />
      <Tabs.Screen name="home" options={tab('Home', 'home')} />
      {/* Live opens the next premiere's room straight away (it's a full-screen player, not a tab page). */}
      <Tabs.Screen
        name="live"
        options={tab('Live', 'live')}
        listeners={{
          tabPress: (e) => {
            const next = soonestPremiere(shows.data ?? [], new Date());
            if (!next) return;
            e.preventDefault();
            router.push({ pathname: '/live/[showId]', params: { showId: next.show.id } });
          },
        }}
      />
      {/* Social: actors' posts, fan rooms and messages. Friends open from its header. */}
      <Tabs.Screen
        name="social"
        options={{
          ...tab('Social', 'friends'),
          tabBarBadge: badges.total ? (badges.total > 9 ? '9+' : badges.total) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.live, color: '#fff', fontFamily: fonts.bodyHeavy, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Your profile',
          tabBarLabel: () => null,
          tabBarIconStyle: { width: 34, height: 34, marginTop: 6 },
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
      {/* The premiere calendar opens from Home now. */}
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="friends" options={{ href: null }} />
    </Tabs>
  );
}
