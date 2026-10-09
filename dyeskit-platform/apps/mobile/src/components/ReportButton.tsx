import React, { useState } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { useMeta } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import { shareReport } from '@/lib/report';
import { Button, toast } from './ui';

/** "Share report (PDF)" for a village or a district; staff only. */
export function ReportButton({ villageId, district, label, style }: { villageId?: number; district?: string; label?: string; style?: StyleProp<ViewStyle> }) {
  const meta = useMeta();
  const { filters } = useFilters();
  const [busy, setBusy] = useState(false);
  if (meta.rights.read === 'own') return null;
  const go = async () => {
    setBusy(true);
    try { await shareReport({ village_id: villageId, district, round: filters.round }); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Button title={label ?? (Platform.OS === 'web' ? 'Print report' : 'Share report (PDF)')} icon="printer" kind="secondary" small loading={busy} onPress={go} style={style} />;
}
