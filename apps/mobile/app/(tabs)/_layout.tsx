import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { OutingIcon, type OutingIconName } from '../../components/ui/OutingIcon';
import { featureFlags } from '../../src/lib/featureFlags';

function TabIcon({ name, color, focused }: { name: OutingIconName; color: string; focused: boolean }) {
  return <OutingIcon name={name} color={color} size={22} filled={focused && name === 'bookmark'} />;
}

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 66,
          paddingTop: 7,
          paddingBottom: 7,
        },
        tabBarLabelStyle: { fontFamily: 'Manrope_700Bold', fontSize: 10, marginBottom: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" focused={focused} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="discover" focused={focused} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          href: featureFlags.assistantV1 ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="ask" focused={focused} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="trips" focused={focused} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="you" focused={focused} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}
