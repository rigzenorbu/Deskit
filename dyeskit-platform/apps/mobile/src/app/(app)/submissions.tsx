import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FONT, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { api, qs } from '@/lib/api';
import { filterQuery, useFilters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';
import { BandPill, Card, Chip, Empty, ErrorBox, Loading, Row, SearchBar, StatusBadge, Text } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { FilterBar } from '@/components/pickers';

interface Row_ { id: string; householdCode: string; village: string; district: string; status: string; submittedAt: string; durationMin: number | null; score: number | null; band: number | null }
const STATUS = [['', 'All'], ['submitted', 'Waiting review'], ['approved', 'Approved'], ['rejected', 'Rejected']] as const;

export default function Submissions() {
  const { c } = useTheme();
  const { filters } = useFilters();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const q = useQuery({
    queryKey: ['submissions', filters, status, applied],
    queryFn: () => api<{ total: number; rows: Row_[] }>('/api/submissions' + qs({ ...filterQuery(filters), status, search: applied, limit: 300 })),
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Surveys" sub={q.data ? `${q.data.total} in view` : undefined} />
      <FlatList
        data={q.data?.rows ?? []}
        keyExtractor={r => r.id}
        contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ marginBottom: SPACE.md }}>
            <SearchBar value={search} onChange={t => { setSearch(t); if (!t) setApplied(''); }} onSubmit={() => setApplied(search)} placeholder="Household code (L_CHL_014) or village" />
            <FilterBar show={['district', 'village', 'period', 'gender', 'age', 'religion', 'band']} />
            <Row wrap gap={8} style={{ marginTop: SPACE.md }}>
              {STATUS.map(([v, l]) => <Chip key={v || 'all'} label={l} active={status === v} onPress={() => setStatus(v)} />)}
            </Row>
            {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/submission/${r.id}`)} style={{ padding: 14 }}>
            <Row>
              <View style={{ backgroundColor: districtColor(r.district) + '1F', borderRadius: RADIUS.sm, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text v="small" color={districtColor(r.district)} style={{ fontFamily: FONT.heavy, letterSpacing: 0.5 }}>{r.householdCode}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text v="small" style={{ fontFamily: FONT.semibold }} numberOfLines={1}>{r.village}</Text>
                <Text v="caption" muted>{fmtDate(r.submittedAt)}{r.durationMin ? ` · ${r.durationMin} min` : ''}</Text>
              </View>
              <StatusBadge status={r.status} />
            </Row>
            <View style={{ marginTop: 10 }}><BandPill band={r.band} score={r.score} size="sm" /></View>
          </Card>
        )}
        ListEmptyComponent={q.isLoading || q.error ? null : <Empty icon="clipboard" title="No surveys match" sub="Try clearing the search or filters." />}
      />
    </View>
  );
}
