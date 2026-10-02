import React from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FONT, SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Button, Card, Empty, ErrorBox, Loading, Row, Screen, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

export default function RecycleBin() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['bin'], queryFn: () => api<{ rows: { id: string; deleted_at: string; delete_reason: string; village: string; household_code: string; deleted_by: string }[] }>('/api/recycle-bin') });
  const restore = useMutation({
    mutationFn: (id: string) => api(`/api/submissions/${id}/restore`, { method: 'POST' }),
    onSuccess: () => { toast('Restored — it counts in the scores again'); qc.invalidateQueries(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Recycle bin" sub="Deleted surveys do not count in any score" />
      <Screen>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data!.rows.length ? (
          <Empty icon="trash-2" title="The bin is empty" />
        ) : q.data!.rows.map(r => (
          <Card key={r.id} style={{ marginBottom: SPACE.sm }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text v="h3" style={{ fontFamily: FONT.heavy }}>{r.household_code} <Text v="small" muted>{r.village}</Text></Text>
                <Text v="caption" muted>Deleted by {r.deleted_by} · {fmtDateTime(r.deleted_at)}</Text>
                <Text v="small" style={{ marginTop: 4 }}>“{r.delete_reason}”</Text>
              </View>
              <Button title="Restore" small kind="secondary" icon="rotate-ccw" onPress={() => restore.mutate(r.id)} />
            </Row>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
