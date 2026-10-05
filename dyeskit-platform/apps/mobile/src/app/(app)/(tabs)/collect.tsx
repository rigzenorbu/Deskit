import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT, GRADIENTS, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { discardSurvey, progressOf, reopenSurvey, syncNow, useOutbox } from '@/lib/outbox';
import { fmtDateTime } from '@/lib/format';
import { BandPill, Button, Card, Empty, IconButton, Progress, Rise, Row, Screen, SectionTitle, Text, toast } from '@/components/ui';
import { Hero, Logo, Mountains, PrayerFlags } from '@/components/scenery';

export default function Collect() {
  const meta = useMeta();
  const { c } = useTheme();
  const { surveys, syncing, lastSync } = useOutbox();
  const village = (id: number) => meta.villages.find(v => v.id === id);
  const drafts = surveys.filter(s => s.status === 'draft');
  const waiting = surveys.filter(s => s.status === 'queued' || s.status === 'failed');
  const sent = surveys.filter(s => s.status === 'uploaded');
  const today = sent.filter(s => (s.submittedAt ?? '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  // the welcome shows every time the Collect button is tapped
  const [welcome, setWelcome] = useState(true);
  useFocusEffect(useCallback(() => { setWelcome(true); }, []));

  if (meta.rights.addData && welcome) {
    return <Welcome onBegin={() => { setWelcome(false); router.push('/new-survey'); }} onSkip={() => setWelcome(false)} />;
  }
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

/**
 * Shown when the Collect button is tapped: thanks the household and encourages them to
 * take part. Written so the researcher can also turn the phone round and let them read it.
 */
const PROMISES = [
  { icon: 'lock', title: 'Private and safe', text: 'Your name is never shown. Answers appear only as village totals.' },
  { icon: 'home', title: 'For your own good', text: 'Your answers help bring the right support — water, health, jobs — to your family and village.' },
  { icon: 'clock', title: 'About 20 minutes', text: 'Simple questions about everyday life, with no right or wrong answers.' },
  { icon: 'thumbs-up', title: 'Always your choice', text: 'Skip any question, or stop at any time.' },
] as const;

function Welcome({ onBegin, onSkip }: { onBegin: () => void; onSkip: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(390);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENTS.sunrise} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + 6, paddingBottom: 70, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' }}>
          <PrayerFlags width={w} count={15} />
          <View style={{ position: 'absolute', bottom: 0, left: 0 }}><Mountains width={w} height={110} /></View>
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 14, position: 'relative', zIndex: 1 }}>
            <Animated.View entering={ZoomIn.duration(550)}><Logo size={72} /></Animated.View>
            <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ alignItems: 'center' }}>
              <Text v="display" color="#fff" center style={{ marginTop: 14 }}>Julley! 🙏</Text>
              <Text v="h2" color="#fff" center style={{ marginTop: 6 }}>Your voice shapes your village</Text>
              <Text v="body" color="rgba(255,255,255,0.92)" center style={{ marginTop: 10, maxWidth: 420, lineHeight: 23 }}>
                Thank you for welcoming us. Kindly share a little about your household — it is for your own good,
                and for the good of your family and your neighbours.
              </Text>
            </Animated.View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: SPACE.lg, marginTop: -40, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <Animated.View entering={FadeInDown.delay(250).duration(500)}>
            <Card style={{ padding: SPACE.xl }}>
              <Text v="h3" center>Why your answers matter</Text>
              <Text v="small" muted center style={{ marginTop: 6, lineHeight: 20 }}>
                Every household that takes part helps Ladakh see clearly what is working and what needs care.
                Together, your answers become a voice that planners and leaders can hear.
              </Text>
              <View style={{ marginTop: SPACE.lg, gap: 14 }}>
                {PROMISES.map((p, i) => (
                  <Animated.View key={p.title} entering={FadeInDown.delay(350 + i * 90).duration(450)}>
                    <Row gap={12} style={{ alignItems: 'flex-start' }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.apricot + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={p.icon} size={18} color={c.apricot} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text v="h3">{p.title}</Text>
                        <Text v="small" muted style={{ marginTop: 2 }}>{p.text}</Text>
                      </View>
                    </Row>
                  </Animated.View>
                ))}
              </View>
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(750).duration(450)}>
            <Text v="body" center style={{ marginTop: SPACE.xl, fontFamily: FONT.semibold }}>Thank you for being part of a healthier, happier Ladakh. 🏔️</Text>
            <Button title="Begin a household survey" icon="arrow-right" gradient={GRADIENTS.sunrise} onPress={onBegin} style={{ marginTop: SPACE.lg }} />
            <Button title="See my surveys" kind="ghost" onPress={onSkip} style={{ marginTop: 10 }} />
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}
