import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DIMENSIONS, type DimensionId } from '@dyeskit/core';
import { DIM_COLORS, DIM_ICONS, SPACE, districtColor, scoreColor, useTheme } from '@/theme';
import { useDashboard } from '@/lib/queries';
import { fmtScore } from '@/lib/format';
import { Card, Chip, ErrorBox, Loading, Rise, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { BarList, Columns, Donut, Heatmap, ShareBar } from '@/components/charts';
import { TopBar } from '@/components/TopBar';
import { FilterBar } from '@/components/pickers';

const GROUPS = [
  { id: 'gender', label: 'Gender', icon: 'user' }, { id: 'age', label: 'Age group', icon: 'clock' },
  { id: 'religion', label: 'Religion', icon: 'sun' }, { id: 'occupation', label: 'Occupation', icon: 'briefcase' },
  { id: 'education', label: 'Education', icon: 'book-open' }, { id: 'family', label: 'Family type', icon: 'users' },
  { id: 'housing', label: 'Housing', icon: 'home' }, { id: 'size', label: 'Household size', icon: 'grid' },
  { id: 'district', label: 'District', icon: 'map' }, { id: 'village', label: 'Village', icon: 'map-pin' },
] as const;
type GroupId = (typeof GROUPS)[number]['id'];

const PALETTE = ['#3B6CF0', '#14A3A8', '#F27A36', '#8A63F0', '#E064AA', '#22B07D', '#F0A030', '#EF5D60', '#4A5470', '#9DB4FF'];

export default function Explore() {
  const params = useLocalSearchParams<{ dim?: string }>();
  const { c } = useTheme();
  const [by, setBy] = useState<GroupId>('gender');
  const [dim, setDim] = useState<DimensionId>((params.dim as DimensionId) || 'phy');
  const q = useDashboard();
  const d = q.data;

  const groupRows = !d ? [] : by === 'district'
    ? d.districts.filter(x => x.n).map(x => ({ key: x.id, label: x.name, n: x.n, score: x.score, dims: x.dims, color: districtColor(x.id) }))
    : by === 'village'
      ? d.villages.filter(x => x.n).slice(0, 25).map(x => ({ key: String(x.id), label: x.name, n: x.n, score: x.score, dims: x.dims, color: undefined as string | undefined }))
      : d.groups[by].map((g, i) => ({ ...g, color: PALETTE[i % PALETTE.length] as string | undefined }));

  const dimQuestions = d?.questions.filter(x => x.dim === dim).sort((a, b) => (a.points ?? 0) - (b.points ?? 0)) ?? [];
  const dimVillages = d ? [...d.villages].filter(v => v.dims[dim] !== null).sort((a, b) => (b.dims[dim] ?? 0) - (a.dims[dim] ?? 0)) : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Explore analysis" sub="Every chart follows the filters" />
      <Screen>
        <FilterBar />
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
          <>
            <Text v="small" muted style={{ marginTop: SPACE.md }}>{d.overall.n} households in this view · average {fmtScore(d.overall.score)}</Text>

            {/* ------------------------------------------------ compare groups */}
            <SectionTitle title="Who is doing better?" sub="Average household score for each group" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {GROUPS.map(g => <Chip key={g.id} label={g.label} icon={g.icon} active={by === g.id} onPress={() => setBy(g.id)} />)}
            </ScrollView>
            <Rise key={by} style={{ marginTop: SPACE.md }}>
              <Card>
                {groupRows.length ? (
                  <>
                    <BarList items={groupRows.map(g => ({ key: g.key, label: g.label, value: g.score, color: g.color ?? scoreColor(g.score), sub: `${g.n} hh` }))} reference={d.overall.score} />
                    <Text v="caption" faint style={{ marginTop: 10 }}>The thin line marks the average of everyone in view ({fmtScore(d.overall.score)}).</Text>
                  </>
                ) : <Text v="small" muted>No answers for this grouping in view.</Text>}
              </Card>
            </Rise>
            {groupRows.length ? (
              <Rise key={by + 'h'} style={{ marginTop: SPACE.md }}>
                <Card>
                  <Text v="h3" style={{ marginBottom: 12 }}>By dimension</Text>
                  <Heatmap cols={DIMENSIONS.map(x => ({ key: x.id, label: x.short, color: DIM_COLORS[x.id] }))}
                    rows={groupRows.slice(0, 15).map(g => ({ key: g.key, label: g.label, values: DIMENSIONS.map(x => g.dims[x.id]) }))} />
                </Card>
              </Rise>
            ) : null}

            {/* ------------------------------------------------- one dimension */}
            <SectionTitle title="Focus on one dimension" sub="Which questions pull it down, and where" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {DIMENSIONS.map(x => <Chip key={x.id} label={x.name} color={DIM_COLORS[x.id]} icon={DIM_ICONS[x.id]} active={dim === x.id} onPress={() => setDim(x.id)} />)}
            </ScrollView>
            <Rise key={dim} style={{ marginTop: SPACE.md }}>
              <Card tone={DIM_COLORS[dim] + '10'}>
                <Row gap={12}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: DIM_COLORS[dim], alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={DIM_ICONS[dim]} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text v="h2">{DIMENSIONS.find(x => x.id === dim)!.name}</Text>
                    <Text v="small" muted>{DIMENSIONS.find(x => x.id === dim)!.about}</Text>
                  </View>
                  <Text v="number" color={DIM_COLORS[dim]}>{fmtScore(d.overall.dims[dim])}</Text>
                </Row>
                <Text v="label" muted style={{ marginTop: SPACE.lg, marginBottom: 10 }}>Average points per question</Text>
                <BarList items={dimQuestions.map(x => ({ key: x.id, label: x.label, value: x.points, color: DIM_COLORS[dim], sub: x.id }))} />
                <Text v="label" muted style={{ marginTop: SPACE.xl, marginBottom: 6 }}>By district</Text>
                <Columns data={d.districts.filter(x => x.n).map(x => ({ key: x.id, label: x.name, value: x.dims[dim], color: districtColor(x.id) }))} max={100} />
                {dimVillages.length > 1 ? (
                  <Row wrap gap={SPACE.md} style={{ marginTop: SPACE.lg, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, minWidth: 220 }}>
                      <Text v="label" color={c.success} style={{ marginBottom: 8 }}>Strongest villages</Text>
                      <BarList items={dimVillages.slice(0, 4).map(v => ({ key: String(v.id), label: v.name, value: v.dims[dim], onPress: () => router.push(`/village/${v.id}`) }))} />
                    </View>
                    <View style={{ flex: 1, minWidth: 220 }}>
                      <Text v="label" color={c.danger} style={{ marginBottom: 8 }}>Weakest villages</Text>
                      <BarList items={dimVillages.slice(-4).reverse().map(v => ({ key: String(v.id), label: v.name, value: v.dims[dim], onPress: () => router.push(`/village/${v.id}`) }))} />
                    </View>
                  </Row>
                ) : null}
              </Card>
            </Rise>

            {/* ------------------------------------------------------ heatmap */}
            {d.villages.length > 1 ? (
              <>
                <SectionTitle title="Villages at a glance" sub="Each square is a dimension's average; tap a village to open it" />
                <Card>
                  <Heatmap cols={DIMENSIONS.map(x => ({ key: x.id, label: x.short, color: DIM_COLORS[x.id] }))}
                    rows={d.villages.slice(0, 30).map(v => ({ key: String(v.id), id: v.id, label: v.name, values: DIMENSIONS.map(x => v.dims[x.id]) }))}
                    onRowPress={id => router.push(`/village/${id}`)} />
                </Card>
              </>
            ) : null}

            {/* ------------------------------------------------------- context */}
            <SectionTitle title="Life in the villages" sub="How households answered key questions" />
            <Row wrap gap={SPACE.md} style={{ alignItems: 'flex-start' }}>
              {([['fuel', 'Main cooking & heating fuel'], ['water', 'Water through the year'], ['income', 'Yearly household income'], ['glacier', 'Glacier & stream change (10 years)']] as const).map(([k, title], i) => {
                const dist = d.context[k];
                return dist.n ? (
                  <Rise key={k} i={i} style={{ flex: 1, minWidth: 300 }}>
                    <Card>
                      <Text v="h3" style={{ marginBottom: 12 }}>{title}</Text>
                      <Donut size={130} stroke={20} center={String(dist.n)} centerSub="answers" data={dist.rows.map((r, j) => ({ key: r.key, label: r.label, value: r.count, color: PALETTE[j % PALETTE.length] }))} />
                    </Card>
                  </Rise>
                ) : null;
              })}
            </Row>

            <SectionTitle title="Technology readiness" sub="Could a phone-based service reach these households?" />
            <Card style={{ gap: SPACE.lg }}>
              {([['smartphone', 'Smartphone at home'], ['internet', 'Internet access'], ['ai', 'Heard of / used AI tools']] as const).map(([k, title]) => (
                <View key={k}>
                  <Text v="small" style={{ marginBottom: 8 }}>{title}</Text>
                  <ShareBar parts={d.tech[k].rows.map((r, j) => ({ key: r.key, label: r.label, value: r.count, color: [c.success, c.warning, c.danger, c.ink3][j] ?? c.ink3 }))} />
                </View>
              ))}
            </Card>

            <SectionTitle title="Data quality" sub="Things a supervisor may want to check" />
            <Row wrap gap={SPACE.md}>
              {[
                ['Waiting review', d.quality.byStatus.find(s => s.status === 'submitted')?.count ?? 0, 'clock', c.warning],
                ['Approved', d.quality.byStatus.find(s => s.status === 'approved')?.count ?? 0, 'check-circle', c.success],
                ['Under 10 minutes', d.quality.shortInterviews, 'zap', c.danger],
                ['No BMI measured', d.quality.noBmi, 'activity', c.ink3],
                ['Not enough answers', d.quality.notEnoughAnswers, 'alert-circle', c.apricot],
              ].map(([label, n, icon, color]) => (
                <Card key={label as string} style={{ flexGrow: 1, flexBasis: 150 }}>
                  <Feather name={icon as 'clock'} size={18} color={color as string} />
                  <Text v="number" style={{ marginTop: 6 }}>{n as number}</Text>
                  <Text v="caption" muted>{label as string}</Text>
                </Card>
              ))}
            </Row>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
