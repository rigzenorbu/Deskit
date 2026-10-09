import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { districtName, type SurveyIssue } from '@dyeskit/core';
import { FONT, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { api, qs } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { BandPill, Button, Card, Chip, Empty, ErrorBox, Loading, Row, SearchBar, Sheet, StatusBadge, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

interface Item {
  id: string; householdCode: string; village: string; district: string; status: string; submittedAt: string; durationMin: number | null;
  score: number | null; band: number | null; source: string; collectorName: string | null; issues: SurveyIssue[];
}

const VIEWS = [
  { id: 'all', label: 'All' }, { id: 'flagged', label: 'Needs a look' }, { id: 'submitted', label: 'Waiting review' },
  { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Sent back' }, { id: 'self', label: 'Self-reported' }, { id: 'researcher', label: 'By staff' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

/** All data, level 3: every household survey in a village (or a district, or everywhere). */
export default function VillageData() {
  const p = useLocalSearchParams<{ id: string; district?: string; status?: string; flagged?: string }>();
  const meta = useMeta();
  const { c } = useTheme();
  const qc = useQueryClient();
  const village = p.id !== 'all' ? meta.villages.find(v => String(v.id) === p.id) : undefined;
  const [view, setView] = useState<ViewId>(p.flagged ? 'flagged' : p.status === 'submitted' ? 'submitted' : 'all');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [confirm, setConfirm] = useState(false);

  const params = {
    village_id: village?.id, district: p.district, search: applied, limit: 500,
    status: ['submitted', 'approved', 'rejected'].includes(view) ? view : '',
    source: view === 'self' || view === 'researcher' ? view : '',
    flagged: view === 'flagged' ? 1 : '',
  };
  const q = useQuery({ queryKey: ['submissions', 'data', params], queryFn: () => api<{ total: number; rows: Item[] }>('/api/submissions' + qs(params)) });
  // waiting surveys with no warnings in this place, for the one-tap approval
  const cleanQ = useQuery({
    queryKey: ['submissions', 'clean', village?.id, p.district], enabled: meta.rights.review,
    queryFn: () => api<{ rows: Item[] }>('/api/submissions' + qs({ village_id: village?.id, district: p.district, status: 'submitted', limit: 500 })),
  });
  const clean = (cleanQ.data?.rows ?? []).filter(r => !r.issues.length);
  const approveAll = useMutation({
    mutationFn: () => api<{ approved: number }>('/api/submissions/review-bulk', { method: 'POST', body: { ids: clean.map(r => r.id), status: 'approved' } }),
    onSuccess: r => {
      toast(`${r.approved} survey${r.approved === 1 ? '' : 's'} approved`);
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.invalidateQueries({ queryKey: ['data-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const title = village ? village.name : p.district ? `All of ${districtName(p.district)}` : 'All surveys';
  const sub = village ? `${districtName(village.district)} · ${village.code}` : p.flagged ? 'Surveys that need a look' : 'Every village';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={title} sub={sub} />
      <FlatList
        data={q.data?.rows ?? []}
        keyExtractor={r => r.id}
        contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <View style={{ marginBottom: SPACE.md }}>
            <SearchBar value={search} onChange={t => { setSearch(t); if (!t) setApplied(''); }} onSubmit={() => setApplied(search)} placeholder="Household code, e.g. L_CHL_014" />
            <Row wrap gap={8} style={{ marginTop: SPACE.md }}>
              {VIEWS.map(v => <Chip key={v.id} label={v.label} active={view === v.id} onPress={() => setView(v.id)}
                color={v.id === 'flagged' ? c.danger : v.id === 'submitted' ? c.warning : undefined} />)}
            </Row>
            {meta.rights.review && clean.length ? (
              <Card tone={c.success + '14'} style={{ marginTop: SPACE.md }}>
                <Row>
                  <Feather name="check-circle" size={20} color={c.success} />
                  <Text v="small" style={{ flex: 1 }}>{clean.length} survey{clean.length === 1 ? ' is' : 's are'} waiting with no warnings.</Text>
                  <Button title="Approve all clean" small gradient={['#22B07D', '#14A3A8']} onPress={() => setConfirm(true)} />
                </Row>
              </Card>
            ) : null}
            <Text v="caption" faint style={{ marginTop: SPACE.md }}>{q.data ? `${q.data.total} survey${q.data.total === 1 ? '' : 's'}` : ''} · tap one to see every answer, edit, approve or delete</Text>
            {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : null}
          </View>
        }
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/submission/${r.id}`)} style={{ padding: 14, borderLeftWidth: r.issues.length ? 4 : 0, borderLeftColor: c.danger }}>
            <Row>
              <View style={{ backgroundColor: districtColor(r.district) + '1F', borderRadius: RADIUS.sm, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text v="small" color={districtColor(r.district)} style={{ fontFamily: FONT.heavy, letterSpacing: 0.5 }}>{r.householdCode}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text v="small" style={{ fontFamily: FONT.semibold }} numberOfLines={1}>
                  {r.source === 'self' ? 'Self-reported by the household' : `By ${r.collectorName ?? 'a deleted user'}`}
                </Text>
                <Text v="caption" muted>{village ? '' : `${r.village} · `}{fmtDateTime(r.submittedAt)}{r.durationMin !== null ? ` · ${r.durationMin} min` : ''}</Text>
              </View>
              <StatusBadge status={r.status} />
            </Row>
            <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <BandPill band={r.band} score={r.score} size="sm" />
              {r.source === 'self' ? <Feather name="home" size={14} color={c.lake} /> : null}
            </Row>
            {r.issues.length ? (
              <View style={{ marginTop: 10, backgroundColor: c.danger + '12', borderRadius: RADIUS.sm, padding: 10, gap: 4 }}>
                {r.issues.map(i => (
                  <Row key={i.id} gap={6}><Feather name="alert-triangle" size={13} color={c.danger} /><Text v="caption" color={c.danger} style={{ flex: 1 }}>{i.label}</Text></Row>
                ))}
              </View>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={q.isLoading || q.error ? null : <Empty icon="check-circle" title="Nothing here" sub={view === 'flagged' ? 'No survey needs a look. 🎉' : 'No surveys match.'} />}
      />
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={`Approve ${clean.length} survey${clean.length === 1 ? '' : 's'}?`}
        footer={<Button title="Approve all clean surveys" loading={approveAll.isPending} gradient={['#22B07D', '#14A3A8']} onPress={() => approveAll.mutate()} />}>
        <Text v="small" muted style={{ lineHeight: 20 }}>
          These surveys are waiting for review and none of the checks found a problem (short interview, missing answers, impossible
          height/weight or age, a very large household, or the same answer to every agreement question). Surveys with warnings are left for you to look at one by one.
        </Text>
      </Sheet>
    </View>
  );
}
