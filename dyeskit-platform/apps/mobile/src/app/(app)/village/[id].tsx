import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIMENSIONS } from '@dyeskit/core';
import { DIM_COLORS, FONT, LEVEL_COLOR, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { useDashboard, useInsights } from '@/lib/queries';
import { bandLabel, districtName, fmtDate, fmtMonth } from '@/lib/format';
import { Badge, BandPill, Button, Card, Chip, Empty, ErrorBox, IconButton, Input, Loading, Progress, Rise, Row, Screen, SectionTitle, Text, toast } from '@/components/ui';
import { BarList, Radar, Ring, TrendChart } from '@/components/charts';
import { Hero } from '@/components/scenery';

export default function VillageProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meta = useMeta();
  const { c } = useTheme();
  const qc = useQueryClient();
  const v = meta.villages.find(x => String(x.id) === id);
  const dash = useDashboard({ village_id: String(id), district: '', band: '' });
  const ins = useInsights({ village_id: String(id), district: '' });
  const all = useDashboard({ village_id: '', district: '', band: '' });
  const notes = useQuery({ queryKey: ['notes', id], queryFn: () => api<{ rows: { id: number; dim: string | null; note: string; created_at: string; author: string }[] }>(`/api/notes?village_id=${id}`) });
  const [note, setNote] = useState('');
  const [noteDim, setNoteDim] = useState('');
  const addNote = useMutation({
    mutationFn: () => api('/api/notes', { method: 'POST', body: { village_id: Number(id), dim: noteDim || null, note } }),
    onSuccess: () => { setNote(''); qc.invalidateQueries({ queryKey: ['notes', id] }); toast('Note added'); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  if (!v) return <Screen><Empty icon="map-pin" title="Village not found" action={<Button title="Back" onPress={() => router.back()} />} /></Screen>;
  const d = dash.data;
  const village = d?.villages[0];
  const flags = ins.data?.villages[0]?.flags ?? [];
  const showcases = ins.data?.villages[0]?.showcases ?? [];
  const inScope = meta.rights.read === 'all' || meta.assigned.includes(v.id);
  const col = districtColor(v.district);

  return (
    <Screen padded={false} header={
      <Hero compact colors={[col, '#16245A']}>
        <Row>
          <IconButton icon="arrow-left" bg="rgba(255,255,255,0.2)" color="#fff" onPress={() => router.back()} />
          <View style={{ flex: 1 }} />
          <Badge label={`${districtName(v.district)} district`} color="#fff" icon="map" />
        </Row>
        <Row gap={10} style={{ marginTop: 14 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text v="h3" color="#fff" style={{ fontFamily: FONT.heavy, letterSpacing: 1 }}>{v.code}</Text>
          </View>
          <Text v="title" color="#fff" style={{ flex: 1 }} numberOfLines={1}>{v.name}</Text>
        </Row>
        <Text v="small" color="rgba(255,255,255,0.85)" style={{ marginTop: 6 }}>
          {[v.block && `${v.block} block`, v.subdivision && `${v.subdivision} sub-division`, v.altitude_m && `${v.altitude_m} m`, v.gazette_name && `Gazette: “${v.gazette_name}”`].filter(Boolean).join(' · ')}
        </Text>
      </Hero>
    }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        {dash.isLoading ? <Loading /> : dash.error ? <ErrorBox error={dash.error} onRetry={() => dash.refetch()} /> : !village ? (
          <Empty icon="clipboard" title="No surveys here yet" sub={`Households in ${v.name} will appear once surveys are uploaded.`}
            action={meta.rights.addData && inScope ? <Button title="Start the first survey" icon="plus" onPress={() => router.push('/new-survey')} /> : undefined} />
        ) : (
          <>
            <Rise style={{ marginTop: SPACE.lg }}>
              <Card>
                <Row wrap gap={18} style={{ alignItems: 'center' }}>
                  <Ring value={village.score} size={140} label="village score" sub={`${village.n} households`} />
                  <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
                    <BandPill band={village.band} />
                    <Text v="h3">{bandLabel(village.band)}</Text>
                    {village.coverage ? (
                      <View>
                        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text v="small" muted>{village.coverage.surveyed} of {village.coverage.households} households surveyed</Text>
                          <Text v="small" style={{ fontFamily: FONT.bold }}>{village.coverage.percent}%</Text>
                        </Row>
                        <Progress value={(village.coverage.surveyed / village.coverage.required) * 100} color={village.coverage.reliable ? c.success : c.warning} />
                        <Text v="caption" color={village.coverage.reliable ? c.success : c.warning} style={{ marginTop: 6 }}>
                          {village.coverage.reliable ? '✓ Reliable — enough households surveyed' : `Not yet reliable: ${village.coverage.required - village.coverage.surveyed} more surveys needed (30% of households, at least 10)`}
                        </Text>
                      </View>
                    ) : <Text v="small" muted>Household count not recorded — an admin can add it to check reliability.</Text>}
                  </View>
                </Row>
              </Card>
            </Rise>

            <SectionTitle title="Seven dimensions" sub="Average out of 100; the shape below compares with all villages" />
            <Rise><Card>
              <BarList items={DIMENSIONS.map(dim => ({ key: dim.id, label: dim.name, value: village.dims[dim.id], color: DIM_COLORS[dim.id],
                sub: all.data?.overall.dims[dim.id] != null ? `all ${all.data.overall.dims[dim.id]!.toFixed(0)}` : undefined }))} />
              <Radar axes={DIMENSIONS.map(x => ({ label: x.short, color: DIM_COLORS[x.id] }))}
                series={[
                  ...(all.data ? [{ label: 'All villages', values: DIMENSIONS.map(x => all.data!.overall.dims[x.id]), color: c.ink3, dashed: true }] : []),
                  { label: v.name, values: DIMENSIONS.map(x => village.dims[x.id]), color: col },
                ]} />
            </Card></Rise>

            {flags.length ? (
              <>
                <SectionTitle title="Flags" sub="What needs attention here" />
                {flags.slice(0, 8).map((f, i) => (
                  <Rise key={i} i={i} style={{ marginBottom: 10 }}>
                    <Card style={{ borderLeftWidth: 4, borderLeftColor: LEVEL_COLOR[f.level] }}>
                      <Row><Text v="h3" style={{ flex: 1 }}>{f.name}</Text><Badge label={f.level} color={LEVEL_COLOR[f.level]} /></Row>
                      <Text v="small" muted style={{ marginTop: 4 }}>{f.why}</Text>
                      {'action' in f && f.action ? <Text v="small" color={c.brand} style={{ marginTop: 6 }}>→ {f.action}</Text> : null}
                    </Card>
                  </Rise>
                ))}
              </>
            ) : null}

            {showcases.length ? (
              <>
                <SectionTitle title="Bright spots" />
                <Row wrap gap={8}>{showcases.slice(0, 8).map((s, i) => <Badge key={i} label={s.name} color={DIM_COLORS[s.dim]} icon="star" />)}</Row>
              </>
            ) : null}

            <SectionTitle title="Lowest-scoring questions here" />
            <Card><BarList items={d!.questions.slice(0, 7).map(q => ({ key: q.id, label: q.label, value: q.points, color: DIM_COLORS[q.dim] }))} /></Card>

            {d!.trend.length > 1 ? (
              <>
                <SectionTitle title="Over time" />
                <Card><TrendChart points={d!.trend.map(t => ({ label: fmtMonth(t.month), value: t.score }))} color={col} /></Card>
              </>
            ) : null}

            {d!.priorities.length ? (
              <>
                <SectionTitle title="What households asked for" />
                <Card><BarList items={d!.priorities.slice(0, 5).map((p, i) => ({ key: p.key, label: `${i + 1}. ${p.label}`, value: p.points, right: `${p.points} pts`, color: col }))} max={Math.max(...d!.priorities.map(p => p.points))} /></Card>
              </>
            ) : null}
          </>
        )}

        <SectionTitle title="Field notes" sub="What researchers heard and saw" />
        {(meta.rights.addData || meta.rights.review) && inScope ? (
          <Card style={{ marginBottom: SPACE.md }}>
            <Row wrap gap={6} style={{ marginBottom: 10 }}>
              <Chip label="General" active={!noteDim} onPress={() => setNoteDim('')} />
              {DIMENSIONS.map(x => <Chip key={x.id} label={x.short} color={DIM_COLORS[x.id]} active={noteDim === x.id} onPress={() => setNoteDim(x.id)} />)}
            </Row>
            <Input value={note} onChangeText={setNote} placeholder="e.g. Stream dries by August; families depend on a tanker" multiline />
            <Button title="Add note" small icon="plus" disabled={!note.trim()} loading={addNote.isPending} onPress={() => addNote.mutate()} style={{ marginTop: 10, alignSelf: 'flex-end' }} />
          </Card>
        ) : null}
        {(notes.data?.rows ?? []).map(n => (
          <Card key={n.id} style={{ marginBottom: 10 }}>
            <Row gap={6}>
              <Feather name="message-square" size={14} color={n.dim ? DIM_COLORS[n.dim as keyof typeof DIM_COLORS] : c.ink3} />
              <Text v="caption" muted>{n.author} · {fmtDate(n.created_at)}{n.dim ? ` · ${DIMENSIONS.find(x => x.id === n.dim)?.name}` : ''}</Text>
            </Row>
            <Text v="body" style={{ marginTop: 6 }}>{n.note}</Text>
          </Card>
        ))}
        {notes.data && !notes.data.rows.length ? <Text v="small" muted>No notes yet.</Text> : null}

        {(meta.rights.review || meta.rights.editAny) && village ? (
          <Button title="Review all surveys in this village" icon="list" kind="secondary" style={{ marginTop: SPACE.xl }}
            onPress={() => router.push(`/data/village/${v.id}`)} />
        ) : null}
        {meta.rights.addData && inScope && village ? (
          <Button title={`Survey a household in ${v.name}`} icon="plus" style={{ marginTop: SPACE.xl, borderRadius: RADIUS.pill }} onPress={() => router.push('/new-survey')} />
        ) : null}
      </View>
    </Screen>
  );
}
