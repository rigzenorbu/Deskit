import React, { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { SPACE, useTheme } from '@/theme';
import { useAuth, useMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Input, Row, Screen, Sheet, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

/** Survey rounds: see them, and start the next one (admins). */
export default function Rounds() {
  const meta = useMeta();
  const { refresh } = useAuth();
  const { c } = useTheme();
  const qc = useQueryClient();
  const current = meta.rounds.find(r => r.id === meta.currentRoundId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(String(Number(current?.name) ? Number(current!.name) + 1 : new Date().getFullYear() + 1));
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await api('/api/rounds', { method: 'POST', body: { name } });
      await refresh();
      qc.invalidateQueries();
      toast(`Round ${name} has started`);
      setOpen(false);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Survey rounds" sub="Survey the same households again each round to see change" />
      <Screen>
        <Card tone={c.brandSoft}>
          <Text v="small" style={{ lineHeight: 20 }}>
            Each survey belongs to a round. Dashboards show the current round, and compare it with earlier ones. When households are
            surveyed again in a new round they keep their household code, so each one’s change can be followed.
          </Text>
        </Card>
        <View style={{ gap: 10, marginTop: SPACE.lg }}>
          {[...meta.rounds].reverse().map(r => (
            <Card key={r.id} style={{ borderLeftWidth: 4, borderLeftColor: r.id === meta.currentRoundId ? c.success : c.line }}>
              <Row>
                <Feather name={r.id === meta.currentRoundId ? 'play-circle' : 'archive'} size={20} color={r.id === meta.currentRoundId ? c.success : c.ink3} />
                <View style={{ flex: 1 }}>
                  <Text v="h3">Round {r.name}</Text>
                  <Text v="caption" muted>Started {fmtDate(r.started_at)}{r.closed_at ? ` · closed ${fmtDate(r.closed_at)}` : ''}</Text>
                </View>
                {r.id === meta.currentRoundId ? <Badge label="Current" color={c.success} /> : null}
              </Row>
              <Text v="small" style={{ marginTop: 8 }}>{r.surveys} survey{r.surveys === 1 ? '' : 's'}</Text>
            </Card>
          ))}
        </View>
        {meta.rights.manageUsers ? (
          <Button title="Start a new round" icon="plus" onPress={() => setOpen(true)} style={{ marginTop: SPACE.xl }} />
        ) : null}
      </Screen>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Start a new round?"
        footer={<Button title={`Start round ${name}`} loading={busy} disabled={!name.trim()} onPress={start} />}>
        <Input label="Name of the new round" value={name} onChangeText={setName} placeholder="e.g. 2027" />
        <Text v="small" muted style={{ marginTop: 12, lineHeight: 20 }}>
          Round {current?.name} closes: its surveys stay exactly as they are and can still be reviewed. From now on new surveys go into the
          new round, dashboards start from it, and every household — including households filling in their own — can be surveyed once in it.
        </Text>
      </Sheet>
    </View>
  );
}
