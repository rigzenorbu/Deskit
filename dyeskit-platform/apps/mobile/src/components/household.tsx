/**
 * Home for household members: their own household's survey and result, and the
 * Ladakh-wide picture. Nothing here identifies any other household or village — the
 * server only sends Ladakh-wide totals to this role.
 */
import React from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { BANDS, DIMENSIONS, type HouseholdScore } from '@dyeskit/core';
import { BAND_COLORS, DIM_COLORS, DIM_ICONS, FONT, GRADIENTS, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { useDashboard } from '@/lib/queries';
import { progressOf, useOutbox } from '@/lib/outbox';
import { bandLabel, districtName, firstName, fmtDate, fmtMonth, fmtScore, greeting } from '@/lib/format';
import { Badge, BandPill, Button, Card, ErrorBox, Loading, Progress, Rise, Row, Screen, SectionTitle, StatusBadge, Text } from './ui';
import { BarList, Radar, Ring, ShareBar, TrendChart } from './charts';
import { Hero, Logo } from './scenery';
import { AlertsBanner } from './AlertsBanner';
import { RoundChange } from './RoundChange';

interface Mine { total: number; rows: { id: string; householdCode: string; village: string; district: string; status: string; submittedAt: string; score: number | null; band: number | null; roundId: number; round: string }[] }

export function HouseholdHome() {
  const meta = useMeta();
  const { c } = useTheme();
  const { surveys } = useOutbox();
  const dash = useDashboard();
  const mine = useQuery({ queryKey: ['submissions', 'mine'], queryFn: () => api<Mine>('/api/submissions') });
  // this round's survey; an earlier round's one means it is time to share again
  const sent = mine.data?.rows.find(r => r.roundId === meta.currentRoundId) ?? null;
  const earlier = mine.data?.rows.find(r => r.roundId !== meta.currentRoundId) ?? null;
  const roundName = meta.rounds?.find(r => r.id === meta.currentRoundId)?.name ?? '';
  const detail = useQuery({
    queryKey: ['submission', sent?.id], enabled: !!sent,
    queryFn: () => api<{ score: HouseholdScore }>(`/api/submissions/${sent!.id}`),
  });
  const draft = surveys.find(s => s.status === 'draft');
  const waiting = surveys.find(s => s.status === 'queued' || s.status === 'failed');
  const d = dash.data;

  return (
    <Screen padded={false} refreshControl={<RefreshControl refreshing={dash.isRefetching || mine.isRefetching} onRefresh={() => { dash.refetch(); mine.refetch(); }} />}
      header={
        <Hero>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10}>
              <Logo size={38} />
              <View>
                <Text v="small" color="rgba(255,255,255,0.8)">{greeting()},</Text>
                <Text v="h2" color="#fff">{firstName(meta.user.name)} 🙏</Text>
              </View>
            </Row>
            <Badge label="Household member" color="#FFFFFF" icon="home" />
          </Row>
          <Text v="body" color="rgba(255,255,255,0.9)" style={{ marginTop: 18, maxWidth: 520 }}>
            Thank you for taking part. Your answers help Ladakh see what is working and what needs care.
          </Text>
        </Hero>
      }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        <AlertsBanner />
        {/* ------------------------------------------------ your household */}
        <SectionTitle title="Your household" />
        <Rise>
          {mine.isLoading ? <Card><Loading label="Checking your survey…" /></Card> : sent ? (
            <Card>
              <Row wrap gap={18} style={{ alignItems: 'center' }}>
                <Ring value={sent.score} size={130} label="your score" sub="out of 100" />
                <View style={{ flex: 1, minWidth: 190, gap: 8 }}>
                  <Row wrap gap={6}><StatusBadge status={sent.status} /><BandPill band={sent.band} size="sm" /></Row>
                  <Text v="h3">{bandLabel(sent.band)}</Text>
                  <Text v="small" muted>
                    Household {sent.householdCode} · {sent.village}, {districtName(sent.district)} · shared {fmtDate(sent.submittedAt)}
                  </Text>
                  <Text v="small" muted>
                    {sent.status === 'approved' ? 'Checked and included in the Ladakh picture.' : 'Received. A project supervisor will check it soon.'}
                  </Text>
                </View>
              </Row>
              {detail.data ? (
                <Radar axes={DIMENSIONS.map(x => ({ label: x.short, color: DIM_COLORS[x.id] }))}
                  series={[
                    ...(d ? [{ label: 'Ladakh average', values: DIMENSIONS.map(x => d.overall.dims[x.id]), color: c.ink3, dashed: true }] : []),
                    { label: 'Your household', values: DIMENSIONS.map(x => detail.data!.score.dims[x.id].score), color: c.lake },
                  ]} />
              ) : null}
              <Button title="View, edit or delete your answers" icon="file-text" kind="secondary" onPress={() => router.push(`/submission/${sent.id}`)} style={{ marginTop: SPACE.md }} />
            </Card>
          ) : waiting ? (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: waiting.status === 'failed' ? c.danger : c.warning }}>
              <Row gap={10}><Feather name={waiting.status === 'failed' ? 'alert-circle' : 'upload-cloud'} size={20} color={waiting.status === 'failed' ? c.danger : c.warning} />
                <Text v="h3" style={{ flex: 1 }}>{waiting.status === 'failed' ? 'Your survey could not be sent' : 'Saved — it will send when you are online'}</Text></Row>
              {waiting.error ? <Text v="small" muted style={{ marginTop: 6 }}>{waiting.error}</Text> : null}
            </Card>
          ) : draft ? (
            <Card>
              <Text v="h3">You have started your survey</Text>
              <Text v="small" muted style={{ marginTop: 4 }}>Everything you answered is saved on this phone.</Text>
              <View style={{ marginTop: 12 }}><Progress value={progressOf(draft)} color={c.apricot} /></View>
              <Button title={`Continue — ${progressOf(draft)}% done`} icon="arrow-right" gradient={GRADIENTS.sunrise} onPress={() => router.push(`/survey/${draft.id}`)} style={{ marginTop: SPACE.md }} />
            </Card>
          ) : (
            <Card tone={c.apricot + '14'}>
              <Row gap={14}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.apricot, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="edit-3" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text v="h3">{earlier ? `A new round has started (${roundName})` : 'Share your household’s details'}</Text>
                  <Text v="small" muted>About 20 minutes. Private, and for your own good.</Text>
                </View>
              </Row>
              <Button title="Start my survey" icon="arrow-right" gradient={GRADIENTS.sunrise} onPress={() => router.push('/collect')} style={{ marginTop: SPACE.md }} />
            </Card>
          )}
        </Rise>

        {/* -------------------------------------------- Ladakh at a glance */}
        {earlier && !sent ? (
          <Text v="small" muted style={{ marginTop: 8 }}>
            Thank you for taking part in {earlier.round} ({earlier.householdCode}). Please share how your household is doing this year — it shows whether life is getting better.
          </Text>
        ) : null}
        <SectionTitle title="Ladakh at a glance" sub="All households together — no one is named" />
        {dash.isLoading ? <Loading /> : dash.error ? <ErrorBox error={dash.error} onRetry={() => dash.refetch()} /> : d ? (
          <>
            <Rise><Card>
              <Row wrap gap={18} style={{ alignItems: 'center' }}>
                <Ring value={d.overall.score} size={130} label="Ladakh" sub={`${d.overall.n} households`} />
                <View style={{ flex: 1, minWidth: 190 }}>
                  <Text v="h3">{bandLabel(d.overall.band)}</Text>
                  <Text v="small" muted style={{ marginTop: 4 }}>The average well-being of every household that has taken part, out of 100.</Text>
                </View>
              </Row>
            </Card></Rise>

            <Row wrap gap={10} style={{ marginTop: SPACE.md }}>
              {DIMENSIONS.map((dim, i) => (
                <Rise key={dim.id} i={i} style={{ flexGrow: 1, flexBasis: 150 }}>
                  <View style={{ borderRadius: RADIUS.lg, padding: 12, backgroundColor: DIM_COLORS[dim.id] + '16', borderWidth: 1, borderColor: DIM_COLORS[dim.id] + '40' }}>
                    <Row gap={8}><Feather name={DIM_ICONS[dim.id]} size={16} color={DIM_COLORS[dim.id]} /><Text v="small" style={{ fontFamily: FONT.semibold }}>{dim.name}</Text></Row>
                    <Text v="h2" color={DIM_COLORS[dim.id]} style={{ marginTop: 4 }}>{fmtScore(d.overall.dims[dim.id])}</Text>
                  </View>
                </Rise>
              ))}
            </Row>

            <SectionTitle title="The seven districts" sub="Shown once a district has 10 or more surveys" />
            <Card>
              <BarList items={d.districts.map(x => ({ key: x.id, label: x.name, value: x.score, color: districtColor(x.id), right: x.score === null ? 'not enough yet' : undefined }))} />
            </Card>

            <SectionTitle title="How households are spread" />
            <Card>
              <ShareBar parts={BANDS.map(b => ({ key: String(b.band), label: `${b.band} ${b.short}`, value: d.overall.bands.find(x => x.band === b.band)?.count ?? 0, color: BAND_COLORS[b.band] }))} />
            </Card>

            {d.rounds && d.rounds.length > 1 ? (
              <View style={{ marginTop: SPACE.xl }}><RoundChange rounds={d.rounds} subject="Ladakh" /></View>
            ) : null}

            {d.trend.length > 1 ? (
              <>
                <SectionTitle title="Over time" />
                <Card><TrendChart points={d.trend.map(t => ({ label: fmtMonth(t.month), value: t.score }))} /></Card>
              </>
            ) : null}

            {d.priorities.length ? (
              <>
                <SectionTitle title="What people want most" />
                <Card>
                  <BarList items={d.priorities.slice(0, 5).map((p, i) => ({ key: p.key, label: `${i + 1}. ${p.label}`, value: p.points, right: `${p.points} pts`, color: [c.brand, c.lake, c.apricot, '#8A63F0', '#E064AA'][i] }))}
                    max={Math.max(...d.priorities.map(p => p.points))} />
                </Card>
              </>
            ) : null}

            <Row gap={8} style={{ marginTop: SPACE.xl, alignItems: 'flex-start' }}>
              <Feather name="lock" size={14} color={c.ink3} style={{ marginTop: 2 }} />
              <Text v="caption" faint style={{ flex: 1 }}>
                You see your own answers and Ladakh-wide totals only. Every other household’s answers stay private.
              </Text>
            </Row>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
