import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, GRADIENTS, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { useOutbox } from '@/lib/outbox';
import { hasAlerts, useAlerts } from '@/lib/alerts';
import { Text, tap, type IconName } from '@/components/ui';

const ICONS: Record<string, IconName> = { index: 'home', villages: 'map', collect: 'plus', insights: 'zap', more: 'grid' };
const LABELS: Record<string, string> = { index: 'Home', villages: 'Villages', collect: 'Collect', insights: 'Insights', more: 'More' };

/** A floating tab bar with a raised centre button for collecting surveys. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const meta = useMeta();
  const { surveys } = useOutbox();
  const alerts = useAlerts();
  const waiting = surveys.filter(s => s.status === 'queued' || s.status === 'failed').length;
  // household members see only Home, their survey and More
  const own = meta.rights.read === 'own';
  const routes = state.routes.filter(r => (r.name !== 'collect' || meta.rights.addData) && !(own && (r.name === 'villages' || r.name === 'insights')));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 10), alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '92%', maxWidth: 560, height: 66, borderRadius: 33,
        backgroundColor: isDark ? '#18213F' : '#FFFFFF', borderWidth: 1, borderColor: c.line,
        shadowColor: c.shadow, shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
        {routes.map(route => {
          const index = state.routes.indexOf(route);
          const focused = state.index === index;
          const onPress = () => {
            tap();
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
          };
          if (route.name === 'collect') {
            return (
              <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
                <LinearGradient colors={GRADIENTS.sunrise} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 58, height: 58, borderRadius: 29, marginTop: -26, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 4, borderColor: c.bg, shadowColor: '#E2554F', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
                  <Feather name="plus" size={28} color="#fff" />
                </LinearGradient>
                {waiting ? (
                  <View style={{ position: 'absolute', top: -30, right: '22%', minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text v="caption" color="#fff" style={{ fontSize: 10, fontFamily: FONT.bold }}>{waiting}</Text>
                  </View>
                ) : null}
                <Text v="caption" color={focused ? c.brand : c.ink3} style={{ marginTop: 2 }}>{own ? 'My survey' : 'Collect'}</Text>
              </Pressable>
            );
          }
          return (
            <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <View style={{ width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? c.brandSoft : 'transparent' }}>
                <Feather name={ICONS[route.name]} size={20} color={focused ? c.brand : c.ink3} />
                {route.name === 'more' && hasAlerts(alerts.data) ? (
                  <View style={{ position: 'absolute', top: 2, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger, borderWidth: 2, borderColor: isDark ? '#18213F' : '#FFFFFF' }} />
                ) : null}
              </View>
              <Text v="caption" color={focused ? c.brand : c.ink3} style={{ fontFamily: focused ? FONT.bold : FONT.medium }}>{LABELS[route.name]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={props => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="villages" />
      <Tabs.Screen name="collect" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
