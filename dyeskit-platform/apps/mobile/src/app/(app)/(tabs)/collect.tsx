import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT, GRADIENTS, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { discardSurvey, progressOf, reopenSurvey, syncNow, useOutbox } from '@/lib/outbox';
import { fmtDateTime } from '@/lib/format';
import { BandPill, Button, Card, Empty, IconButton, Progress, Rise, Row, Screen, SectionTitle, Text, toast } from '@/components/ui';
import { Hero } from '@/components/scenery';

export default function Collect() {
  const meta = useMeta();
  const { c } = useTheme();
  const { surveys, syncing, lastSync } = useOutbox();
  const village = (id: number) => meta.villages.find(v => v.id === id);
  const drafts = surveys.filter(s => s.status === 'draft');
  const waiting = surveys.filter(s => s.status === 'queued' || s.status === 'failed');
  const sent = surveys.filter(s => s.status === 'uploaded');
  const today = sent.filter(s => (s.submittedAt ?? '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  if (!meta.rights.addData) {
    return <Screen><Empty icon="lock" title="Collecting is not part of your role" sub="Field researchers, supervisors and admins collect surveys." /></Screen>;
  }

  const sync = async () => {
    const r = await syncNow();
    if (r.offline) toast('No connection — surveys stay safe on this phone', 'error');
    else if (r.uploaded) toast(`${r.uploaded} survey${r.uploaded === 1 ? '' : 's'} uploaded`);
    else if (r.failed) toast(`${r.failed} could not be sent — see below`, 'error');
  };

  return (
    <Screen padded={false} header={
      <Hero compact colors={GRADIENTS.sunrise}>
        <Text v="title" color="#fff">Collect</Text>
        <Text v="body" color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }}>Works without signal — surveys upload by themselves.</Text>
        <Row gap={10} style={{ marginTop: 16 }} wrap>
          {[['Drafts', drafts.length, 'edit-3'], ['Waiting', waiting.length, 'clock'], ['Sent today', today, 'check-circle']].map(([l, n, icon]) => (
            <View key={l as string} style={{ flex: 1, minWidth: 90, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.md, padding: 12 }}>
              <Feather name={icon as 'edit-3'} size={16} color="#fff" />
              <Text v="number" color="#fff" style={{ marginTop: 4 }}>{n as number}</Text>
              <Text v="caption" color="rgba(255,255,255,0.85)">{l as string}</Text>
            </View>
          ))}
        </Row>
      </Hero>
    }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        <Rise style={{ marginTop: SPACE.lg }}>
          <LinearGradient colors={GRADIENTS.lake} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: RADIUS.xl, padding: SPACE.xl }}>
            <Row gap={14}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="home" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text v="h2" color="#fff">New household survey</Text>
                <Text v="small" color="rgba(255,255,255,0.9)">About 20 minutes · 9 short sections</Text>
              </View>
            </Row>
            <Button title="Start" icon="arrow-right" kind="light" gradient={['#ffffff33', '#ffffff1a']} onPress={() => router.push('/new-survey')} style={{ marginTop: 16 }} />
          </LinearGradient>
        </Rise>

        {waiting.length || lastSync ? (
          <Card style={{ marginTop: SPACE.lg }}>
            <Row>
              <Feather name={syncing ? 'upload-cloud' : lastSync?.ok === false ? 'alert-circle' : 'cloud'} size={20} color={lastSync?.ok === false ? c.warning : c.brand} />
              <View style={{ flex: 1 }}>
                <Text v="h3">{syncing ? 'Uploading…' : waiting.length ? `${waiting.length} waiting to upload` : 'Everything is uploaded'}</Text>
                {lastSync ? <Text v="caption" muted>Last try {fmtDateTime(lastSync.at)} · {lastSync.message}</Text> : null}
              </View>
              <Button title="Sync now" small kind="secondary" icon="refresh-cw" loading={syncing} onPress={sync} />
            </Row>
          </Card>
        ) : null}

        <SectionTitle title="In progress" sub="Saved on this phone after every answer" />
        {drafts.length ? drafts.map((s, i) => {
          const v = village(s.villageId);
          return (
            <Rise key={s.id} i={i} style={{ marginBottom: 10 }}>
              <Card onPress={() => router.push(`/survey/${s.id}`)}>
                <Row>
                  <View style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, backgroundColor: districtColor(v?.district ?? '') }} />
                  <View style={{ flex: 1 }}>
                    <Text v="h3">{v?.name ?? 'Village'} {s.headName ? `· ${s.headName}` : ''}</Text>
                    <Text v="caption" muted>Started {fmtDateTime(s.startedAt)}</Text>
                    <View style={{ marginTop: 8 }}><Progress value={progressOf(s)} color={c.apricot} /></View>
                  </View>
                  <Text v="h3" color={c.apricot}>{progressOf(s)}%</Text>
                  <IconButton icon="trash-2" size={34} onPress={() => discardSurvey(s.id).then(() => toast('Draft deleted'))} />
                </Row>
              </Card>
            </Rise>
          );
        }) : <Text v="small" muted>No drafts.</Text>}

        {waiting.length ? (
          <>
            <SectionTitle title="Waiting for signal" />
            {waiting.map(s => (
              <Card key={s.id} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: s.status === 'failed' ? c.danger : c.warning }}>
                <Text v="h3">{village(s.villageId)?.name} {s.headName ? `· ${s.headName}` : ''}</Text>
                <Text v="caption" muted>Finished {fmtDateTime(s.submittedAt)}</Text>
                {s.status === 'failed' ? (
                  <>
                    <Text v="small" color={c.danger} style={{ marginTop: 6 }}>Not accepted: {s.error}</Text>
                    <Button title="Open and fix" small kind="secondary" style={{ marginTop: 10, alignSelf: 'flex-start' }}
                      onPress={async () => { await reopenSurvey(s.id); router.push(`/survey/${s.id}`); }} />
                  </>
                ) : null}
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle title="Recently uploaded" sub="Household codes are given by the server" />
        {sent.length ? sent.slice(0, 15).map(s => (
          <Card key={s.id} style={{ marginBottom: 10 }}>
            <Row>
              <View style={{ backgroundColor: c.brandSoft, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text v="small" color={c.brand} style={{ fontFamily: FONT.heavy, letterSpacing: 0.6 }}>{s.householdCode}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text v="small" style={{ fontFamily: FONT.semibold }}>{village(s.villageId)?.name}</Text>
                <Text v="caption" muted>{fmtDateTime(s.submittedAt)}</Text>
              </View>
              <BandPill band={s.band} score={s.score} size="sm" />
            </Row>
          </Card>
        )) : <Text v="small" muted>Nothing uploaded from this phone yet.</Text>}
      </View>
    </Screen>
  );
}
