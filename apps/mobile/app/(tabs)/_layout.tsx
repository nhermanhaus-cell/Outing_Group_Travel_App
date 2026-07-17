import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 18, color, lineHeight: 22 }}>{label}</Text>;
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
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label={focused ? '◈' : '◇'} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label={focused ? '⊕' : '⊙'} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label={focused ? '⊠' : '⊡'} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label={focused ? '◉' : '○'} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}
