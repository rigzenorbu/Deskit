import React from 'react';
import { View } from 'react-native';
import { ORGANISATION, PRIVACY_POLICY, PRIVACY_UPDATED } from '@dyeskit/core';
import { SPACE, useTheme } from '@/theme';
import { Card, Screen, Text } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

/** The privacy policy — open to everyone, signed in or not (also published at /privacy). */
export default function Privacy() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Privacy policy" sub={`${ORGANISATION.name} · updated ${PRIVACY_UPDATED}`} />
      <Screen bottomInset={false}>
        {PRIVACY_POLICY.map(sec => (
          <Card key={sec.title} style={{ marginBottom: SPACE.md }}>
            <Text v="h3">{sec.title}</Text>
            {sec.body.map((p, i) => <Text key={i} v="small" muted style={{ marginTop: 8, lineHeight: 21 }}>{p}</Text>)}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
