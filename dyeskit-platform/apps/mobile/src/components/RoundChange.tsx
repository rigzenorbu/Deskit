/** "Change since last round": the same group's score round by round, and each dimension's change. */
import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DIMENSIONS, type RoundScore } from '@dyeskit/core';
import { DIM_COLORS, FONT, scoreColor, useTheme } from '@/theme';
import { Card, Row, Text } from './ui';
import { Columns } from './charts';

export function RoundChange({ rounds, subject = 'this view' }: { rounds?: RoundScore[]; subject?: string }) {
  const { c } = useTheme();
  const withData = (rounds ?? []).filter(r => r.score !== null);
  if (withData.length < 2) return null;
  const now = withData[withData.length - 1], before = withData[withData.length - 2];
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10);
  const total = delta(now.score, before.score);
  const arrow = (d: number | null) => (d === null ? null : d > 0.5 ? 'arrow-up-right' : d < -0.5 ? 'arrow-down-right' : 'arrow-right');
  const tone = (d: number | null) => (d === null ? c.ink3 : d > 0.5 ? c.success : d < -0.5 ? c.danger : c.ink2);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text v="h3">Change since {before.name}</Text>
          <Text v="small" muted>{subject}, round by round</Text>
        </View>
        {total !== null ? (
          <Row gap={4} style={{ backgroundColor: tone(total) + '1A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Feather name={arrow(total)!} size={15} color={tone(total)} />
            <Text v="small" color={tone(total)} style={{ fontFamily: FONT.bold }}>{total > 0 ? '+' : ''}{total}</Text>
          </Row>
        ) : null}
      </Row>
      <View style={{ marginTop: 12 }}>
        <Columns data={withData.map(r => ({ key: String(r.id), label: r.name, value: r.score, color: scoreColor(r.score), sub: `${r.n} hh` }))} max={100} height={160}
          format={v => v.toFixed(1)} />
      </View>
      <View style={{ marginTop: 10, gap: 6 }}>
        {DIMENSIONS.map(d => {
          const ch = delta(now.dims[d.id], before.dims[d.id]);
          return (
            <Row key={d.id} gap={8}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DIM_COLORS[d.id] }} />
              <Text v="small" style={{ flex: 1 }}>{d.name}</Text>
              <Text v="small" muted>{before.dims[d.id]?.toFixed(0) ?? '—'} → {now.dims[d.id]?.toFixed(0) ?? '—'}</Text>
              {ch !== null ? (
                <Row gap={2} style={{ width: 58, justifyContent: 'flex-end' }}>
                  <Feather name={arrow(ch)!} size={13} color={tone(ch)} />
                  <Text v="small" color={tone(ch)} style={{ fontFamily: FONT.bold }}>{ch > 0 ? '+' : ''}{ch}</Text>
                </Row>
              ) : <View style={{ width: 58 }} />}
            </Row>
          );
        })}
      </View>
    </Card>
  );
}
