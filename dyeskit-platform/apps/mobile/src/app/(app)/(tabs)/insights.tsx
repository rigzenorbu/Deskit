import React from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DIMENSIONS, type DimensionId } from '@dyeskit/core';
import { DIM_COLORS, DIM_ICONS, FONT, GRADIENTS, LEVEL_COLOR, RADIUS, SPACE, useTheme } from '@/theme';
import { useInsights } from '@/lib/queries';
import { fmtPct } from '@/lib/format';
import { Badge, Card, Empty, ErrorBox, IconDisc, Loading, Rise, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { BarList } from '@/components/charts';
import { Hero } from '@/components/scenery';
import { FilterBar } from '@/components/pickers';

const LEVEL_WORD = { critical: 'Critical', serious: 'Serious', watch: 'Watch' } as const;
const dimName = (id: DimensionId) => DIMENSIONS.find(d => d.id === id)!.name;

export default function Insights() {
  const { c } = useTheme();
  const q = useInsights();
  const d = q.data;
  return (
    <Screen padded={false} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} header={
      <Hero compact colors={GRADIENTS.violet}>
        <Text v="title" color="#fff">Insights</Text>
        <Text v="body" color="rgba(255,255,255,0.88)" style={{ marginTop: 2 }}>
          Plain-language findings. Every one is a count you can check — no guessing, no AI.
        </Text>
      </Hero>
    }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        <FilterBar show={['district', 'village', 'period', 'gender', 'age', 'religion']} />
        {q.isLoading ? <Loading label="Reading the surveys…" /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !d || !d.villages.length ? (
          <Empty icon="search" title="No surveys in this view" sub="Change the filters to see insights." />
        ) : (
          <>
            <SectionTitle title="Priority actions" sub="Ranked by how many households are affected" />
            {d.actions.length ? d.actions.map((a, i) => (
              <Rise key={a.id} i={i} style={{ marginBottom: SPACE.md }}>
                <Card style={{ borderLeftWidth: 5, borderLeftColor: LEVEL_COLOR[a.level] }}>
                  <Row style={{ alignItems: 'flex-start' }} gap={12}>
                    <IconDisc icon={DIM_ICONS[a.dim]} color={DIM_COLORS[a.dim]} size={42} />
                    <View style={{ flex: 1 }}>
                      <Row wrap gap={6}>
                        <Badge label={LEVEL_WORD[a.level]} color={LEVEL_COLOR[a.level]} />
                        <Badge label={dimName(a.dim)} color={DIM_COLORS[a.dim]} />
                      </Row>
                      <Text v="h3" style={{ marginTop: 8 }}>{a.label}</Text>
                      <Text v="small" muted style={{ marginTop: 2 }}>
                        <Text v="small" style={{ fontFamily: FONT.bold }} color={LEVEL_COLOR[a.level]}>{a.households} of {a.of} households ({fmtPct(a.share)})</Text>
                      </Text>
                      <View style={{ height: 8, backgroundColor: c.surface2, borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                        <View style={{ width: `${(a.share ?? 0) * 100}%`, height: '100%', backgroundColor: LEVEL_COLOR[a.level] }} />
                      </View>
                      {a.villages.length ? (
                        <Row wrap gap={6} style={{ marginTop: 10 }}>
                          {a.villages.map(v => (
                            <Text key={v.id} v="caption" onPress={() => router.push(`/village/${v.id}`)}
                              style={{ backgroundColor: c.surface2, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' }}>
                              {v.name} {fmtPct(v.share)}
                            </Text>
                          ))}
                        </Row>
                      ) : null}
                      <Row gap={6} style={{ marginTop: 10, alignItems: 'flex-start' }}>
                        <Feather name="arrow-right-circle" size={15} color={c.brand} style={{ marginTop: 2 }} />
                        <Text v="small" color={c.brand} style={{ flex: 1 }}>{a.action}</Text>
                      </Row>
                    </View>
                  </Row>
                </Card>
              </Rise>
            )) : <Text v="small" muted>Nothing affects 15% or more of households here. 🎉</Text>}

            {d.matches.length ? (
              <>
                <SectionTitle title="Learn from each other" sub="A village with a problem, paired with one that has largely solved it" />
                {d.matches.slice(0, 6).map((m, i) => (
                  <Rise key={m.signal} i={i} style={{ marginBottom: SPACE.md }}>
                    <Card>
                      <Row gap={6}><Feather name={DIM_ICONS[m.dim]} size={15} color={DIM_COLORS[m.dim]} /><Text v="h3" style={{ flex: 1 }}>{m.name}</Text></Row>
                      <Row gap={10} style={{ marginTop: 12 }}>
                        <View style={{ flex: 1, backgroundColor: LEVEL_COLOR.critical + '14', borderRadius: RADIUS.md, padding: 12 }}>
                          <Text v="caption" muted>Needs help</Text>
                          <Text v="h3" onPress={() => router.push(`/village/${m.needs.id}`)}>{m.needs.name}</Text>
                          <Text v="h2" color={LEVEL_COLOR.critical}>{fmtPct(m.needs.share)}</Text>
                        </View>
                        <Feather name="repeat" size={20} color={c.ink3} />
                        <View style={{ flex: 1, backgroundColor: c.success + '14', borderRadius: RADIUS.md, padding: 12 }}>
                          <Text v="caption" muted>Can share how</Text>
                          <Text v="h3" onPress={() => router.push(`/village/${m.has.id}`)}>{m.has.name}</Text>
                          <Text v="h2" color={c.success}>{fmtPct(m.has.share)}</Text>
                        </View>
                      </Row>
                      <Text v="small" muted style={{ marginTop: 10 }}>Worth asking what {m.has.name} does differently.</Text>
                    </Card>
                  </Rise>
                ))}
              </>
            ) : null}

            <SectionTitle title="Bright spots" sub="Dimensions at band 6 or above, and problems that are almost absent" />
            <Row wrap gap={SPACE.md}>
              {d.villages.flatMap(v => v.showcases.filter(s => s.type === 'dimension').map(s => ({ v, s }))).slice(0, 8).map(({ v, s }, i) => (
                <Rise key={`${v.id}-${s.name}`} i={i} style={{ flexGrow: 1, flexBasis: 220 }}>
                  <Card onPress={() => router.push(`/village/${v.id}`)} tone={DIM_COLORS[s.dim] + '14'}>
                    <Row gap={8}><Feather name="star" size={16} color={DIM_COLORS[s.dim]} /><Text v="h3">{v.name}</Text></Row>
                    <Text v="small" muted style={{ marginTop: 4 }}>{s.why}</Text>
                  </Card>
                </Rise>
              ))}
            </Row>

            <SectionTitle title="Every warning sign" sub="Share of households where each one applies" />
            <Card>
              <BarList items={d.totals.slice(0, 14).map(t => ({ key: t.id, label: t.label, value: (t.share ?? 0) * 100, color: DIM_COLORS[t.dim], right: `${fmtPct(t.share)} · ${t.households}` }))} />
            </Card>

            <SectionTitle title="Villages with flags" sub="Tap to open the village profile" />
            {d.villages.filter(v => v.flags.length).slice(0, 12).map((v, i) => (
              <Rise key={v.id} i={i} style={{ marginBottom: 10 }}>
                <Card onPress={() => router.push(`/village/${v.id}`)}>
                  <Row>
                    <Text v="h3" style={{ flex: 1 }}>{v.name}</Text>
                    <Badge label={`${v.flags.length} flag${v.flags.length === 1 ? '' : 's'}`} color={LEVEL_COLOR[v.flags.some(f => f.level === 'critical') ? 'critical' : 'serious']} />
                  </Row>
                  <Text v="small" muted style={{ marginTop: 4 }} numberOfLines={2}>{v.flags.slice(0, 3).map(f => f.name).join(' · ')}</Text>
                </Card>
              </Rise>
            ))}
            <Text v="caption" faint style={{ marginTop: SPACE.lg }}>
              Rules: a dimension is flagged below {d.thresholds.flagBelow} (critical below {d.thresholds.criticalBelow}); a warning sign is “watch” at 15% of households, “serious” at 30%, “critical” at 50%.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
