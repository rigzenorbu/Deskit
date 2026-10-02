import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE, useTheme } from '@/theme';
import { IconButton, Row, Text } from './ui';

/** Header for screens opened on top of the tabs: back button, title, optional action. */
export function TopBar({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: SPACE.lg, backgroundColor: c.bg }}>
      <Row style={{ maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
        <IconButton icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text v="h2" numberOfLines={1}>{title}</Text>
          {sub ? <Text v="caption" muted numberOfLines={1}>{sub}</Text> : null}
        </View>
        {right}
      </Row>
    </View>
  );
}
