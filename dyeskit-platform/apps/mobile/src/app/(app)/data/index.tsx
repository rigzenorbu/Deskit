import React from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SPACE, districtColor, useTheme } from '@/theme';
import { useDataSummary } from '@/lib/data';
import { useMeta } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';
import { Button, Card, Chip, ErrorBox, Loading, Rise, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { CountBadges, Tally } from '@/components/datacounts';

/** All data, level 1: every district, with what is waiting and what needs a look. */
export default function AllData() {
  const { c } = useTheme();
  const meta = useMeta();
  const { filters, set } = useFilters();
  const q = useDataSummary();
  const d = q.data;
  const total = d?.districts.reduce((s, x) => ({ surveys: s.surveys + x.surveys, waiting: s.waiting + x.waiting, flagged: s.flagged + x.flagged, self: s.self + x.self }),
    { surveys: 0, waiting: 0, flagged: 0, self: 0 });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="All data" sub="District → village → household" />
      <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d && total ? (
          <>
            {meta.rounds.length > 1 ? (
              <Row wrap gap={8} style={{ marginBottom: SPACE.md }}>
                {meta.rounds.map(r => (
                  <Chip key={r.id} label={r.id === meta.currentRoundId ? `Round ${r.name} (current)` : `Round ${r.name}`}
                    active={filters.round === String(r.id) || (!filters.round && r.id === meta.currentRoundId)}
                    onPress={() => set({ round: r.id === meta.currentRoundId ? '' : String(r.id) })} />
                ))}
                <Chip label="All rounds" active={filters.round === 'all'} onPress={() => set({ round: 'all' })} />
              </Row>
            ) : null}
            <Tally items={[
              { label: 'surveys in total', value: total.surveys, color: c.brand },
              { label: 'waiting review', value: total.waiting, color: c.warning },
              { label: 'need a look', value: total.flagged, color: c.danger },
              { label: 'self-reported', value: total.self, color: c.lake },
            ]} />
            <Row gap={10} wrap style={{ marginTop: SPACE.md }}>
              <Button title="Every survey that needs a look" icon="alert-triangle" small kind="secondary" onPress={() => router.push({ pathname: '/data/village/[id]', params: { id: 'all', flagged: '1' } })} />
              <Button title="Everything waiting review" icon="clock" small kind="ghost" onPress={() => router.push({ pathname: '/data/village/[id]', params: { id: 'all', status: 'submitted' } })} />
            </Row>

            <SectionTitle title="Districts" sub="Tap a district to see its villages" />
            {d.districts.map((x, i) => (
              <Rise key={x.id} i={i} style={{ marginBottom: 10 }}>
                <Card onPress={() => router.push(`/data/${x.id}`)} style={{ borderLeftWidth: 5, borderLeftColor: districtColor(x.id) }}>
                  <Row>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: districtColor(x.id), alignItems: 'center', justifyContent: 'center' }}>
                      <Text v="h3" color="#fff">{x.letter}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text v="h3">{x.name}</Text>
                      <Text v="caption" muted>
                        {x.villagesWithData} of {x.villages} villages have data{x.lastAt ? ` · latest ${fmtDate(x.lastAt)}` : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={c.ink3} />
                  </Row>
                  {x.surveys ? <CountBadges c={x} /> : <Text v="small" faint style={{ marginTop: 8 }}>No surveys yet</Text>}
                </Card>
              </Rise>
            ))}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
