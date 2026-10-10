import { router, Tabs } from 'expo-router';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Glass } from '@/components/Glass';
import { Avatar } from '@/components/ui';
import { useMe, useShows } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptics';
import { soonestPremiere } from '@/lib/premieres';
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
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="schedule" options={tab('Schedule', 'schedule')} />
      {/* Live opens the next premiere's room straight away (it's a full-screen player, not a tab page). */}
      <Tabs.Screen
        name="live"
        options={tab('Tonight', 'reel')}
        listeners={{
          tabPress: (e) => {
            const next = soonestPremiere(shows.data ?? [], new Date());
            if (!next) return;
            e.preventDefault();
            router.push({ pathname: '/live/[showId]', params: { showId: next.show.id } });
          },
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
      {/* Friends lives under Profile now. */}
      <Tabs.Screen name="friends" options={{ href: null }} />
    </Tabs>
  );
}
