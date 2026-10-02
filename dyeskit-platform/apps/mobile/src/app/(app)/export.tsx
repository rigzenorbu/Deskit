import React, { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMeta } from '@/lib/auth';
import { api, qs } from '@/lib/api';
import { filterQuery, useFilters } from '@/lib/filters';
import { saveText } from '@/lib/download';
import { SPACE, useTheme } from '@/theme';
import { Button, Card, IconDisc, Row, Screen, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { FilterBar } from '@/components/pickers';

export default function ExportScreen() {
  const meta = useMeta();
  const { c } = useTheme();
  const { filters } = useFilters();
  const [busy, setBusy] = useState(false);
  const anon = meta.rights.export === 'anon';

  const run = async () => {
    setBusy(true);
    try {
      const csv = await api<string>('/api/export.csv' + qs(filterQuery(filters)), { raw: true });
      const rows = Math.max(0, csv.split('\n').length - 1);
      await saveText(`dyeskit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast(`${rows} surveys exported`);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Export to spreadsheet" sub="Opens in Excel, Google Sheets, SPSS or R" />
      <Screen>
        <Card>
          <Row gap={12}>
            <IconDisc icon="file-text" color={c.success} size={48} />
            <View style={{ flex: 1 }}>
              <Text v="h3">One row per household</Text>
              <Text v="small" muted>Village, district, status, score, band, the seven dimension scores, then every answer.</Text>
            </View>
          </Row>
          <Row gap={8} style={{ marginTop: SPACE.md, backgroundColor: (anon ? c.warning : c.brand) + '14', padding: 12, borderRadius: 12 }}>
            <Feather name={anon ? 'eye-off' : 'shield'} size={16} color={anon ? c.warning : c.brand} />
            <Text v="small" style={{ flex: 1 }}>
              {anon ? 'Your role exports anonymised data: household codes, names and phone numbers are left out.' : 'Includes household codes. Names and phone numbers are never exported.'}
            </Text>
          </Row>
        </Card>
        <Text v="label" muted style={{ marginTop: SPACE.xl }}>Which surveys</Text>
        <FilterBar show={['district', 'village', 'period', 'gender', 'age', 'religion', 'band', 'status']} />
        <Button title="Download CSV" icon="download" loading={busy} onPress={run} style={{ marginTop: SPACE.xl }} />
      </Screen>
    </View>
  );
}
