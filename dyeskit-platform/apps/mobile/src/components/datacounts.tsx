/** The small count badges used on the All data screens. */
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import type { Counts } from '@/lib/data';
import { Badge, Row, Text } from './ui';

export function CountBadges({ c: n }: { c: Counts }) {
  const { c } = useTheme();
  return (
    <Row wrap gap={6} style={{ marginTop: 8 }}>
      <Badge label={`${n.surveys} survey${n.surveys === 1 ? '' : 's'}`} color={c.brand} icon="clipboard" />
      {n.waiting ? <Badge label={`${n.waiting} waiting review`} color={c.warning} icon="clock" /> : null}
      {n.flagged ? <Badge label={`${n.flagged} need a look`} color={c.danger} icon="alert-triangle" /> : null}
      {n.rejected ? <Badge label={`${n.rejected} sent back`} color={c.ink3} icon="corner-up-left" /> : null}
      {n.self ? <Badge label={`${n.self} self-reported`} color={c.lake} icon="home" /> : null}
    </Row>
  );
}

/** One big number with a label, for the top of each level. */
export function Tally({ items }: { items: { label: string; value: number; color: string }[] }) {
  const { c } = useTheme();
  return (
    <Row wrap gap={10}>
      {items.map(it => (
        <View key={it.label} style={{ flexGrow: 1, flexBasis: 90, backgroundColor: c.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.line }}>
          <Text v="number" color={it.color}>{it.value}</Text>
          <Text v="caption" muted>{it.label}</Text>
        </View>
      ))}
    </Row>
  );
}
