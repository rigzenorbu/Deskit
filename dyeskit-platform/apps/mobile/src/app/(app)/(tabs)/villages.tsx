import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DISTRICTS } from '@dyeskit/core';
import { FONT, RADIUS, SPACE, districtColor, scoreColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { useDashboard } from '@/lib/queries';
import { fmtScore } from '@/lib/format';
import { BandPill, Button, Card, Chip, Rise, Row, Screen, SearchBar, Text, tap } from '@/components/ui';
import { Hero } from '@/components/scenery';
import { villageMatches } from '@/components/pickers';

export default function Villages() {
  const meta = useMeta();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [onlySurveyed, setOnlySurveyed] = useState(false);
  // scores for every village, ignoring the village filter so the whole list has numbers
  const dash = useDashboard({ village_id: '', district: '' });
  const scores = useMemo(() => new Map((dash.data?.villages ?? []).map(v => [v.id, v])), [dash.data]);
  const scope = meta.rights.read === 'assigned' ? new Set(meta.assigned) : null;

  const pool = meta.villages.filter(v => !scope || scope.has(v.id));
  const list = pool.filter(v => (!district || v.district === district) && (!onlySurveyed || v.surveys > 0) && villageMatches(v, q));
  const groups = DISTRICTS.map(d => ({ d, villages: list.filter(v => v.district === d.id) })).filter(g => g.villages.length);

  return (
    <Screen padded={false} header={
      <Hero compact>
        <Text v="title" color="#fff">Villages</Text>
        <Text v="body" color="rgba(255,255,255,0.85)" style={{ marginTop: 2, marginBottom: 14 }}>
          {pool.length} villages across {new Set(pool.map(v => v.district)).size} districts{scope ? ' assigned to you' : ''}
        </Text>
        <SearchBar value={q} onChange={setQ} placeholder="Search name, code (CHL) or block" />
        <Button title="See them on the map" icon="map" kind="light" small onPress={() => router.push('/map')} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
      </Hero>
    }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACE.md }} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={!district} onPress={() => setDistrict('')} count={pool.length} />
          {DISTRICTS.map(d => {
            const n = pool.filter(v => v.district === d.id).length;
            return n ? <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={district === d.id} count={n} onPress={() => setDistrict(district === d.id ? '' : d.id)} /> : null;
          })}
        </ScrollView>
        <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <Text v="caption" faint>{list.length} of {pool.length} shown</Text>
          <Chip label="Surveyed only" icon="check" active={onlySurveyed} onPress={() => setOnlySurveyed(s => !s)} />
        </Row>

        {groups.map(({ d, villages }, gi) => {
          const scored = villages.map(v => scores.get(v.id)?.score).filter((x): x is number => x !== null && x !== undefined);
          const avg = scored.length ? scored.reduce((s, x) => s + x, 0) / scored.length : null;
          return (
            <View key={d.id} style={{ marginTop: SPACE.xl }}>
              <Rise i={gi}>
                <Row style={{ backgroundColor: districtColor(d.id) + '14', borderRadius: RADIUS.lg, padding: 14, marginBottom: 10 }} gap={12}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: districtColor(d.id), alignItems: 'center', justifyContent: 'center' }}>
                    <Text v="h2" color="#fff">{d.letter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text v="h2">{d.name}</Text>
                    <Text v="caption" muted>HQ {d.headquarters} · {villages.length} villages · {villages.filter(v => v.surveys).length} surveyed</Text>
                  </View>
                  {avg !== null ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text v="h2" color={scoreColor(avg)}>{avg.toFixed(1)}</Text>
                      <Text v="caption" faint>avg score</Text>
                    </View>
                  ) : null}
                </Row>
              </Rise>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {villages.map(v => {
                  const s = scores.get(v.id);
                  return (
                    <Pressable key={v.id} onPress={() => { tap(); router.push(`/village/${v.id}`); }}
                      style={({ pressed }) => ({ flexGrow: 1, flexBasis: 300, opacity: pressed ? 0.8 : 1 })}>
                      <Card style={{ padding: 14 }}>
                        <Row gap={12}>
                          <View style={{ width: 52, height: 34, borderRadius: 10, backgroundColor: districtColor(v.district) + '1F', alignItems: 'center', justifyContent: 'center' }}>
                            <Text v="small" color={districtColor(v.district)} style={{ fontFamily: FONT.heavy, letterSpacing: 1 }}>{v.code}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text v="h3" numberOfLines={1}>{v.name}</Text>
                            <Text v="caption" muted numberOfLines={1}>
                              {v.gazette_name ? `“${v.gazette_name}” · ` : ''}{v.block ?? '—'} block{v.households ? ` · ${v.households} hh` : ''}
                            </Text>
                          </View>
                          {s?.score !== undefined && s?.score !== null ? (
                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                              <Text v="h3" color={scoreColor(s.score)}>{fmtScore(s.score)}</Text>
                              <Text v="caption" faint>{s.n} surveys</Text>
                            </View>
                          ) : (
                            <Row gap={4}><Feather name="circle" size={10} color={c.ink3} /><Text v="caption" faint>Not surveyed</Text></Row>
                          )}
                        </Row>
                        {s?.score !== null && s?.score !== undefined ? (
                          <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
                            <BandPill band={s.band} size="sm" />
                            {s.coverage ? (
                              <Text v="caption" color={s.coverage.reliable ? c.success : c.warning}>
                                {s.coverage.reliable ? '✓ reliable' : `needs ${s.coverage.required - s.coverage.surveyed} more`}
                              </Text>
                            ) : <Text v="caption" faint>households not recorded</Text>}
                          </Row>
                        ) : null}
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        {!groups.length ? <Text v="body" muted center style={{ marginTop: 40 }}>No village matches “{q}”.</Text> : null}
      </View>
    </Screen>
  );
}
