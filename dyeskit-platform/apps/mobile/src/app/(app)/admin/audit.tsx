import React from 'react';
import { FlatList, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FONT, SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Card, ErrorBox, Loading, Row, Text } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

const WORDS: Record<string, string> = {
  login: 'signed in', login_failed: 'failed sign-in', register: 'registered', upload_survey: 'uploaded a survey', edit_submission: 'corrected a survey',
  review_approved: 'approved a survey', review_rejected: 'sent a survey back', delete_submission: 'deleted a survey', restore_submission: 'restored a survey',
  update_user: 'changed a user', create_user: 'created a user', export: 'exported data', update_village: 'changed a village', create_village: 'added a village',
  sync_villages: 'synced the official village list', seed_demo: 'created demo data', rescore_all: 'recalculated all scores', delete_account: 'deleted their account',
};

export default function Audit() {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<{ rows: { id: number; at: string; user_name: string; action: string; entity: string | null; entity_id: string | null }[] }>('/api/audit') });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Audit log" sub="The last 300 actions" />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <FlatList data={q.data!.rows} keyExtractor={r => String(r.id)} contentContainerStyle={{ padding: SPACE.lg, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' }}
          renderItem={({ item: a }) => (
            <Card style={{ padding: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text v="small" style={{ flex: 1 }}><Text v="small" style={{ fontFamily: FONT.bold }}>{a.user_name}</Text> {WORDS[a.action] ?? a.action}</Text>
                <Text v="caption" faint>{fmtDateTime(a.at)}</Text>
              </Row>
              {a.entity_id ? <Text v="caption" faint>{a.entity} {a.entity_id}</Text> : null}
            </Card>
          )} />
      )}
    </View>
  );
}
