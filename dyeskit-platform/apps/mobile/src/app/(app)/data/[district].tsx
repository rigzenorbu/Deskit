import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { districtName } from '@dyeskit/core';
import { FONT, SPACE, districtColor, useTheme } from '@/theme';
import { useDataSummary } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { Button, Card, Chip, Empty, ErrorBox, Loading, Rise, Row, Screen, SearchBar, Text } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { CountBadges, Tally } from '@/components/datacounts';

type Sort = 'flagged' | 'waiting' | 'surveys' | 'name';

/** All data, level 2: the villages of one district that have surveys. */
export default function DistrictData() {
  const { district } = useLocalSearchParams<{ district: string }>();
  const { c } = useTheme();
  const q = useDataSummary();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('flagged');
  const d = q.data?.districts.find(x => x.id === district);
  const villages = (q.data?.villages ?? [])
    .filter(v => v.district === district && (!search || `${v.name} ${v.code}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] - a[sort]) || a.name.localeCompare(b.name));
  const col = districtColor(String(district));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={`${districtName(String(district))} district`} sub="Villages with surveys" />
      <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
          <>
            <Tally items={[
              { label: 'surveys', value: d.surveys, color: col },
              { label: 'waiting review', value: d.waiting, color: c.warning },
              { label: 'need a look', value: d.flagged, color: c.danger },
              { label: 'self-reported', value: d.self, color: c.lake },
            ]} />
            <Button title={`Every survey in ${d.name}`} icon="list" small kind="secondary" style={{ marginTop: SPACE.md, alignSelf: 'flex-start' }}
              onPress={() => router.push({ pathname: '/data/village/[id]', params: { id: 'all', district: d.id } })} />
            <View style={{ marginTop: SPACE.lg }}><SearchBar value={search} onChange={setSearch} placeholder="Village or code" /></View>
            <Row wrap gap={8} style={{ marginVertical: SPACE.md }}>
              <Text v="caption" faint>Sort:</Text>
              {([['flagged', 'Needs a look'], ['waiting', 'Waiting'], ['surveys', 'Most surveys'], ['name', 'A–Z']] as const).map(([k, l]) =>
                <Chip key={k} label={l} active={sort === k} onPress={() => setSort(k)} />)}
            </Row>
            {villages.map((v, i) => (
              <Rise key={v.id} i={i} style={{ marginBottom: 10 }}>
                <Card onPress={() => router.push(`/data/village/${v.id}`)}>
                  <Row>
                    <Text v="small" color={col} style={{ fontFamily: FONT.heavy, width: 42 }}>{v.code}</Text>
                    <View style={{ flex: 1 }}>
                      <Text v="h3">{v.name}</Text>
                      <Text v="caption" muted>
                        {v.households ? `${v.households} households on record` : 'household count not recorded'}{v.lastAt ? ` · latest ${fmtDate(v.lastAt)}` : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={c.ink3} />
                  </Row>
                  <CountBadges c={v} />
                </Card>
              </Rise>
            ))}
            {!villages.length ? <Empty icon="map-pin" title={search ? 'No village matches' : 'No surveys in this district yet'} /> : null}
          </>
        ) : <Empty icon="map" title="District not found" />}
      </Screen>
    </View>
  );
}
