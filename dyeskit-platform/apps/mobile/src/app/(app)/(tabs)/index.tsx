import React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BANDS, DIMENSIONS, roleName } from '@dyeskit/core';
import { BAND_COLORS, DIM_COLORS, DIM_ICONS, FONT, RADIUS, SPACE, districtColor, scoreColor, useTheme } from '@/theme';
import { useAuth, useMeta } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import { useDashboard } from '@/lib/queries';
import { useOutbox } from '@/lib/outbox';
import { bandLabel, firstName, fmtMonth, fmtScore, greeting } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Loading, Rise, Row, Screen, SectionTitle, StatTile, Text, tap } from '@/components/ui';
import { BarList, Columns, Radar, Ring, ShareBar, TrendChart } from '@/components/charts';
import { Hero, Logo } from '@/components/scenery';
import { FilterBar } from '@/components/pickers';

export default function Home() {
  const meta = useMeta();
  const { offline } = useAuth();
  const { c } = useTheme();
  const { set } = useFilters();
  const { surveys, syncing } = useOutbox();
  const q = useDashboard();
  const d = q.data;
  const waiting = surveys.filter(s => s.status === 'queued').length;

  return (
    <Screen padded={false} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
      header={
        <Hero>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10}>
              <Logo size={38} />
              <View>
                <Text v="small" color="rgba(255,255,255,0.8)">{greeting()},</Text>
                <Text v="h2" color="#fff">{firstName(meta.user.name)} ✨</Text>
              </View>
            </Row>
            <Badge label={roleName(meta.user.role)} color="#FFFFFF" icon="shield" />
          </Row>
          <Row style={{ marginTop: 22, alignItems: 'center' }} gap={18} wrap>
            <Ring value={d?.overall.score ?? null} size={150} light label="well-being index" sub="out of 100" />
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text v="label" color="rgba(255,255,255,0.75)">In view</Text>
              <Text v="h2" color="#fff" style={{ marginTop: 4 }}>{d ? bandLabel(d.overall.band) : '…'}</Text>
              <Text v="small" color="rgba(255,255,255,0.8)" style={{ marginTop: 6 }}>
                {d ? `${d.overall.n} households · ${d.headline.villagesSurveyed} villages · ${d.headline.districtsSurveyed} districts` : 'Loading…'}
              </Text>
              {d?.headline.strongest ? (
                <Row wrap gap={6} style={{ marginTop: 12 }}>
                  <Badge label={`Strongest: ${DIMENSIONS.find(x => x.id === d.headline.strongest)!.name}`} color="#9BF0C8" icon="trending-up" />
                  <Badge label={`Needs care: ${DIMENSIONS.find(x => x.id === d.headline.weakest)!.name}`} color="#FFC6A8" icon="alert-triangle" />
                </Row>
              ) : null}
            </View>
          </Row>
          {(waiting || offline || syncing) ? (
            <Row gap={8} style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' }}>
              <Feather name={offline ? 'wifi-off' : syncing ? 'upload-cloud' : 'clock'} size={15} color="#fff" />
              <Text v="small" color="#fff">{offline ? 'Offline — showing saved data' : syncing ? 'Uploading surveys…' : `${waiting} survey${waiting === 1 ? '' : 's'} waiting to upload`}</Text>
            </Row>
          ) : null}
        </Hero>
      }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        <FilterBar />
        {q.isLoading ? <Loading label="Gathering the numbers…" /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
          <>
            <Row wrap gap={SPACE.md} style={{ marginTop: SPACE.lg }}>
              <StatTile i={0} label="Surveys" value={String(d.headline.surveys)} sub={`${d.headline.thisMonth} this month`} icon="clipboard" color={c.brand} />
              <StatTile i={1} label="Villages" value={String(d.headline.villagesSurveyed)} sub={`of ${d.headline.villagesInView} in view`} icon="map-pin" color={c.lake} />
              <StatTile i={2} label="Reliable" value={String(d.villages.filter(v => v.coverage?.reliable).length)} sub="villages with enough surveys" icon="check-circle" color={c.success} />
              <StatTile i={3} label="Flags" value={String(d.overall.flags.length)} sub="dimensions below 43" icon="flag" color={c.danger} />
            </Row>

            <SectionTitle title="Seven dimensions" sub="Average out of 100 — tap one to explore" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
              {DIMENSIONS.map((dim, i) => {
                const v = d.overall.dims[dim.id];
                return (
                  <Rise key={dim.id} i={i}>
                    <Pressable onPress={() => { tap(); router.push({ pathname: '/explore', params: { dim: dim.id } }); }}
                      style={{ width: 150, borderRadius: RADIUS.lg, padding: 14, backgroundColor: DIM_COLORS[dim.id] + '16', borderWidth: 1, borderColor: DIM_COLORS[dim.id] + '40' }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: DIM_COLORS[dim.id], alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={DIM_ICONS[dim.id]} size={18} color="#fff" />
                      </View>
                      <Text v="h3" style={{ marginTop: 10 }}>{dim.name}</Text>
                      <Text v="number" color={DIM_COLORS[dim.id]} style={{ marginTop: 2 }}>{fmtScore(v)}</Text>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: DIM_COLORS[dim.id] + '30', marginTop: 8, overflow: 'hidden' }}>
                        <View style={{ width: `${v ?? 0}%`, height: '100%', backgroundColor: DIM_COLORS[dim.id] }} />
                      </View>
                      {v !== null && v < 43 ? <Text v="caption" color={c.danger} style={{ marginTop: 6 }}>Below “Basic”</Text> : null}
                    </Pressable>
                  </Rise>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginTop: SPACE.xl }}>
              <Rise i={1} style={{ flex: 1, minWidth: 300 }}>
                <Card>
                  <Text v="h3">Well-being shape</Text>
                  <Text v="small" muted>This view against everything you can see</Text>
                  <Radar axes={DIMENSIONS.map(x => ({ label: x.short, color: DIM_COLORS[x.id] }))}
                    series={[
                      ...(d.baseline ? [{ label: 'All data', values: DIMENSIONS.map(x => d.baseline!.dims[x.id]), color: c.ink3, dashed: true }] : []),
                      { label: 'This view', values: DIMENSIONS.map(x => d.overall.dims[x.id]), color: c.brand },
                    ]} />
                </Card>
              </Rise>
              <Rise i={2} style={{ flex: 1, minWidth: 300 }}>
                <Card>
                  <Text v="h3">The seven districts</Text>
                  <Text v="small" muted style={{ marginBottom: 12 }}>Average household score · tap to focus</Text>
                  <BarList items={d.districts.map(x => ({
                    key: x.id, label: x.name, value: x.score, color: districtColor(x.id),
                    sub: x.n ? `${x.n} hh · ${x.villagesSurveyed}/${x.villages} villages` : 'no surveys yet',
                    onPress: () => set({ district: x.id }),
                  }))} reference={d.overall.score} />
                </Card>
              </Rise>
            </View>

            <SectionTitle title="How households are spread" sub="Number of households in each band" />
            <Rise><Card>
              <ShareBar parts={BANDS.map(b => ({ key: String(b.band), label: `${b.band} ${b.short}`, value: d.overall.bands.find(x => x.band === b.band)?.count ?? 0, color: BAND_COLORS[b.band] }))} />
              <View style={{ marginTop: 18 }}>
                <Columns data={d.histogram.map(h => ({ key: String(h.from), label: `${h.from}`, value: h.count, color: scoreColor(h.from + 5) }))} height={150} />
                <Text v="caption" faint center>Household scores in steps of 10 points</Text>
              </View>
            </Card></Rise>

            {d.trend.length > 1 ? (
              <>
                <SectionTitle title="Over time" sub="Monthly average, with surveys collected" />
                <Rise><Card>
                  <TrendChart points={d.trend.map(t => ({ label: fmtMonth(t.month), value: t.score }))}
                    secondary={{ label: 'Surveys', values: d.trend.map(t => t.surveys), color: c.lake }} />
                </Card></Rise>
              </>
            ) : null}

            <SectionTitle title="Villages" sub="Highest and lowest scores in view"
              right={<Pressable onPress={() => router.push('/villages')}><Text v="small" color={c.brand} style={{ fontFamily: FONT.bold }}>See all</Text></Pressable>} />
            <Row wrap gap={SPACE.md} style={{ alignItems: 'flex-start' }}>
              <Rise style={{ flex: 1, minWidth: 280 }}><Card>
                <Row gap={6} style={{ marginBottom: 12 }}><Feather name="award" size={16} color={c.success} /><Text v="h3">Doing best</Text></Row>
                <BarList items={d.villages.filter(v => v.score !== null).slice(0, 5).map(v => ({ key: String(v.id), label: v.name, value: v.score, sub: `${v.n} hh`, onPress: () => router.push(`/village/${v.id}`) }))} />
              </Card></Rise>
              <Rise i={1} style={{ flex: 1, minWidth: 280 }}><Card>
                <Row gap={6} style={{ marginBottom: 12 }}><Feather name="life-buoy" size={16} color={c.danger} /><Text v="h3">Needs most support</Text></Row>
                <BarList items={d.villages.filter(v => v.score !== null).slice(-5).reverse().map(v => ({ key: String(v.id), label: v.name, value: v.score, sub: `${v.n} hh`, onPress: () => router.push(`/village/${v.id}`) }))} />
              </Card></Rise>
            </Row>

            <SectionTitle title="Questions scoring lowest" sub="Average points on each question — where help matters most" />
            <Rise><Card>
              <BarList items={d.questions.slice(0, 6).map(x => ({ key: x.id, label: x.label, value: x.points, color: DIM_COLORS[x.dim], sub: DIMENSIONS.find(dd => dd.id === x.dim)!.name }))} />
            </Card></Rise>

            {d.priorities.length ? (
              <>
                <SectionTitle title="What villagers want most" sub="Top-3 priorities: 1st = 3 points, 2nd = 2, 3rd = 1" />
                <Rise><Card>
                  <BarList items={d.priorities.slice(0, 6).map((p, i) => ({ key: p.key, label: `${i + 1}. ${p.label}`, value: p.points, right: `${p.points} pts`, color: [c.brand, c.lake, c.apricot, '#8A63F0', '#E064AA', '#22B07D'][i] }))}
                    max={Math.max(...d.priorities.map(p => p.points))} />
                </Card></Rise>
              </>
            ) : null}

            <Rise style={{ marginTop: SPACE.xl }}>
              <Card tone={c.brandSoft}>
                <Row gap={14}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="bar-chart-2" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text v="h3">Explore deeper</Text>
                    <Text v="small" muted>Compare by gender, age, religion, occupation, education, family and more.</Text>
                  </View>
                </Row>
                <Button title="Open analysis" icon="arrow-right" onPress={() => router.push('/explore')} style={{ marginTop: 14 }} />
              </Card>
            </Rise>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
