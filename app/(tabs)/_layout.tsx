import { router, Tabs } from 'expo-router';
import { Platform, View, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Avatar } from '@/components/ui';
import { useMe, useShows } from '@/hooks/queries';
import { useAppStore } from '@/store/useAppStore';
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: '#A8977A',
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: 12,
          bottom: Platform.OS === 'ios' ? 24 : 16,
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: '#3A2E20',
          backgroundColor: 'rgba(30,23,16,0.97)',
        },
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
