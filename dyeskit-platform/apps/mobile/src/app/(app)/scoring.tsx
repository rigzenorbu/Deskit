import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  BANDS, BMI_OTHER_POINTS, BMI_TABLE, CRITICAL_BELOW, DIMENSIONS, DIM_ITEMS, DIMENSION_MIN_QUESTIONS, FLAG_BELOW,
  HOUSEHOLD_MIN_DIMENSIONS, NEUTRAL_POINTS, VILLAGE_MIN_HOUSEHOLDS, VILLAGE_MIN_SHARE, type Item,
} from '@dyeskit/core';
import { BAND_COLORS, DIM_COLORS, DIM_ICONS, FONT, RADIUS, SPACE, scoreColor, useTheme } from '@/theme';
import { Card, Rise, Row, Screen, SectionTitle, Text, tap } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

const STEPS = [
  { icon: 'check-square', title: 'Each answer has fixed points', text: `Every scored question gives a set number of points from 0 to 100 for the answer chosen — no formulas. "Don't know" or "Prefer not to answer" gives ${NEUTRAL_POINTS}. A skipped question is simply left out.` },
  { icon: 'layers', title: 'Dimension score = average of its questions', text: `Add the points of the answered questions in a dimension and divide by how many were answered. A dimension counts only if at least half of its questions (and at least ${DIMENSION_MIN_QUESTIONS}) are answered.` },
  { icon: 'user', title: 'Household score = average of the 7 dimensions', text: `Each dimension weighs the same. A household gets a score once at least ${HOUSEHOLD_MIN_DIMENSIONS} of the 7 dimensions count.` },
  { icon: 'bar-chart', title: 'The score falls into one of 7 bands', text: 'From "Foundational Support Needed" (below 15) to "Thriving" (85 and above). See the bands below.' },
  { icon: 'map-pin', title: 'Village, district or any group = average of its households', text: `A village result is called reliable once at least ${Math.round(VILLAGE_MIN_SHARE * 100)}% of its households (and at least ${VILLAGE_MIN_HOUSEHOLDS}) are surveyed. A dimension average below ${FLAG_BELOW} is flagged; below ${CRITICAL_BELOW} it is critical.` },
] as const;

export default function Scoring() {
  const { c } = useTheme();
  const [open, setOpen] = useState<string | null>('fin');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="How scores work" sub="The whole method, with every point value" />
      <Screen>
        <Card tone={c.brandSoft}>
          <Text v="h3">In one sentence</Text>
          <Text v="body" style={{ marginTop: 6 }}>
            Every answer is worth fixed points out of 100; averages of those points give each dimension, each household, and each village.
          </Text>
        </Card>

        <SectionTitle title="Five steps" />
        {STEPS.map((s, i) => (
          <Rise key={s.title} i={i} style={{ marginBottom: 10 }}>
            <Card>
              <Row style={{ alignItems: 'flex-start' }} gap={12}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                  <Text v="h3" color="#fff">{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text v="h3">{s.title}</Text>
                  <Text v="small" muted style={{ marginTop: 4, lineHeight: 20 }}>{s.text}</Text>
                </View>
              </Row>
            </Card>
          </Rise>
        ))}

        <SectionTitle title="Worked example" sub="Financial dimension of one household" />
        <Card>
          {[['Income ₹1–3 lakh', 25], ['Covers basics only', 50], ['No savings', 0], ['1 income source', 50], ['Income in two seasons', 50],
            ['Weather damage once', 50], ['"Agree" feels secure', 75], ['Aware of schemes, not using', 50], ['Has a bank account', 100]].map(([l, p]) => (
            <Row key={l as string} style={{ paddingVertical: 4 }}>
              <Text v="small" style={{ flex: 1 }}>{l as string}</Text>
              <Text v="small" style={{ fontFamily: FONT.bold }} color={scoreColor(p as number)}>{p as number}</Text>
            </Row>
          ))}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 8 }} />
          <Text v="small">450 points ÷ 9 questions = <Text v="small" style={{ fontFamily: FONT.bold }}>50</Text> → Financial score 50 (band 4, Basic).</Text>
        </Card>

        <SectionTitle title="The seven bands" />
        <Card style={{ gap: 8 }}>
          {BANDS.map(b => (
            <Row key={b.band} gap={10}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: BAND_COLORS[b.band], alignItems: 'center', justifyContent: 'center' }}>
                <Text v="h3" color="#fff">{b.band}</Text>
              </View>
              <Text v="small" style={{ flex: 1, fontFamily: FONT.semibold }}>{b.label}</Text>
              <Text v="small" muted>{b.min}–{b.band === 7 ? 100 : Math.floor(b.max)}</Text>
            </Row>
          ))}
        </Card>

        <SectionTitle title="Every question and its points" sub="Tap a dimension to open it" />
        {DIMENSIONS.map(d => (
          <Card key={d.id} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: DIM_COLORS[d.id] }}>
            <Pressable onPress={() => { tap(); setOpen(open === d.id ? null : d.id); }}>
              <Row gap={10}>
                <Feather name={DIM_ICONS[d.id]} size={18} color={DIM_COLORS[d.id]} />
                <Text v="h3" style={{ flex: 1 }}>{d.name}</Text>
                <Text v="caption" faint>{DIM_ITEMS[d.id].length} questions</Text>
                <Feather name={open === d.id ? 'chevron-up' : 'chevron-down'} size={18} color={c.ink3} />
              </Row>
            </Pressable>
            {open === d.id ? DIM_ITEMS[d.id].map(item => <QuestionPoints key={item.id} item={item} color={DIM_COLORS[d.id]} />) : null}
          </Card>
        ))}
        <Text v="caption" faint style={{ marginTop: SPACE.md }}>
          Questions in the household profile (except education) and the technology & priorities section are not scored; they describe households and feed the comparisons.
        </Text>
      </Screen>
    </View>
  );
}

function QuestionPoints({ item, color }: { item: Item; color: string }) {
  const { c } = useTheme();
  const rows: [string, number | string][] = item.bmi
    ? [...BMI_TABLE.map(r => [r.label, r.points] as [string, number]), ['Below 16.0 or 30.0 and above', BMI_OTHER_POINTS]]
    : item.countPoints
      ? item.countPoints.map((p, n) => [`${n}${n === item.countPoints!.length - 1 ? ' or more' : ''} ${item.counts ?? ''}`, p] as [string, number])
      : (item.options ?? []).filter(o => typeof o.points === 'number' || o.neutral).map(o => [o.label, o.neutral ? NEUTRAL_POINTS : o.points!] as [string, number]);
  return (
    <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line }}>
      <Row gap={8} style={{ alignItems: 'flex-start' }}>
        <Text v="caption" color={color} style={{ fontFamily: FONT.bold, width: 30 }}>{item.id}</Text>
        <View style={{ flex: 1 }}>
          <Text v="small" style={{ fontFamily: FONT.semibold }}>{item.indicator}</Text>
          <Text v="caption" muted>{item.q}</Text>
        </View>
      </Row>
      <View style={{ marginTop: 8, marginLeft: 38, gap: 4 }}>
        {rows.map(([label, pts]) => (
          <Row key={label} gap={8}>
            <Text v="caption" style={{ flex: 1 }}>{label}</Text>
            <View style={{ minWidth: 38, paddingVertical: 2, borderRadius: RADIUS.sm, backgroundColor: scoreColor(Number(pts)) + '22', alignItems: 'center' }}>
              <Text v="caption" color={scoreColor(Number(pts))} style={{ fontFamily: FONT.bold }}>{pts}</Text>
            </View>
          </Row>
        ))}
      </View>
    </View>
  );
}
