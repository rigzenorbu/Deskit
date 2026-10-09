import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Dimensions, Easing, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DIMENSIONS, ITEMS, MIN_FILLED_TO_FINISH, PROGRESS_MILESTONES, SECTIONS, isShown, milestoneFor, scoreHousehold, surveyProgress, type Answers, type Section } from '@dyeskit/core';
import { DIM_COLORS, FONT, PRAYER_FLAGS, RADIUS, SPACE, bandColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { finishSurvey, getSurvey, updateSurvey, useOutbox } from '@/lib/outbox';
import { bandLabel, districtName } from '@/lib/format';
import { BandPill, Button, Card, IconButton, Loading, Row, Sheet, Text, success, toast } from '@/components/ui';
import { QuestionInput } from '@/components/questions';
import { Radar, Ring } from '@/components/charts';

const SECTION_COLOR: Record<string, string> = {
  A: '#3B6CF0', B: DIM_COLORS.phy, C: DIM_COLORS.emo, D: DIM_COLORS.soc, E: DIM_COLORS.env, F: DIM_COLORS.fin, G: DIM_COLORS.int, H: DIM_COLORS.spi, I: '#14A3A8',
};
const REQUIRED = SECTIONS.flatMap(s => s.items).filter(i => i.required && i.type !== 'village');

export default function SurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meta = useMeta();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // read from the outbox's live state, not a plain function call: the React Compiler
  // would otherwise keep the first (not yet loaded) result
  const { loaded, surveys } = useOutbox();
  const survey = surveys.find(x => x.id === id) ?? null;
  const [answers, setAnswers] = useState<Answers>(survey?.answers ?? {});
  // take the answers from the phone once they are loaded (the screen can open before that)
  const ready = useRef(!!survey);
  useEffect(() => { if (survey && !ready.current) { ready.current = true; setAnswers(survey.answers); } }, [survey]);
  const [step, setStep] = useState(0);            // 0..SECTIONS.length-1 = sections, SECTIONS.length = review
  const [done, setDone] = useState<null | { code?: string; offline: boolean; error?: string }>(null);
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const village = meta.villages.find(v => v.id === survey?.villageId);

  // save after every change (a short pause batches quick taps)
  useEffect(() => {
    if (!survey || !ready.current || survey.status !== 'draft') return;
    const h = setTimeout(() => updateSurvey(survey.id, { answers }), 350);
    return () => clearTimeout(h);
  }, [answers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready.current && village && !answers.A1) setAnswers(a => ({ ...a, A1: village.name })); }, [village, survey]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = useMemo(() => scoreHousehold(answers), [answers]);
  const fill = useMemo(() => surveyProgress(answers), [answers]);
  const [askFinish, setAskFinish] = useState(false);
  // cheer each milestone as it is passed (not the ones already passed when the survey opens)
  const passed = useRef<number | null>(null);
  useEffect(() => {
    if (!ready.current) return;
    const m = milestoneFor(fill.percent).at;
    if (passed.current === null) { passed.current = m; return; }
    if (m > passed.current) { success(); toast(`${fill.percent === 100 ? '🎉' : '⛰️'} ${milestoneFor(fill.percent).title}`); }
    passed.current = m;
  }, [fill.percent]);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><Loading label="Opening the survey…" /></View>;
  if (!survey || !village) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><Text v="h3">This survey is not on this phone.</Text><Button title="Back" onPress={() => router.back()} style={{ marginTop: 16 }} /></View>;
  }
  if (done) return <Celebration result={done} villageName={village.name} score={score.score} band={score.band} own={meta.rights.read === 'own'} />;

  const isReview = step === SECTIONS.length;
  const section: Section | null = isReview ? null : SECTIONS[step];
  const accent = section ? SECTION_COLOR[section.id] : '#14A3A8';
  const missing = REQUIRED.filter(i => answers[i.id] === undefined || answers[i.id] === '');
  const go = (n: number) => { setStep(n); scroller.current?.scrollTo({ y: 0, animated: false }); };
  const set = (itemId: string) => (v: unknown) => setAnswers(a => {
    const next = { ...a };
    if (v === undefined) delete next[itemId]; else next[itemId] = v;
    // clear follow-up answers whose condition no longer holds
    for (const it of SECTIONS.flatMap(s => s.items)) if (it.showIf?.item === itemId && !isShown(it, next)) delete next[it.id];
    return next;
  });

  const firstOpen = () => go(Math.max(0, fill.sections.findIndex(x => x.missing.length)));
  const finish = async (confirmed = false) => {
    if (missing.length) { toast(`Please answer: ${missing.map(m => m.q).join(', ')}`, 'error'); return; }
    if (fill.percent < MIN_FILLED_TO_FINISH) {
      toast(`Fill at least ${MIN_FILLED_TO_FINISH}% to finish — ${fill.percent}% so far`, 'error');
      firstOpen();
      return;
    }
    if (fill.left && !confirmed) { setAskFinish(true); return; }
    setAskFinish(false);
    setSending(true);
    await updateSurvey(survey.id, { answers });
    const r = await finishSurvey(survey.id);
    const after = getSurvey(survey.id);
    success();
    setDone({ code: after?.householdCode, offline: r.offline || after?.status === 'queued', error: after?.status === 'failed' ? after.error : undefined });
    setSending(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={[accent, accent + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 8, paddingBottom: 16, paddingHorizontal: SPACE.lg, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }}>
        <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
          <Row>
            <IconButton icon="x" bg="rgba(255,255,255,0.2)" color="#fff" onPress={() => { toast('Saved as a draft'); router.back(); }} />
            <View style={{ flex: 1 }}>
              <Text v="caption" color="rgba(255,255,255,0.85)">{village.name} · {districtName(village.district)}{survey.headName ? ` · ${survey.headName}` : ''}</Text>
              <Text v="h2" color="#fff" numberOfLines={1}>{section ? section.title : 'Review & finish'}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text v="h3" color="#fff">{score.score === null ? '—' : score.score.toFixed(0)}</Text>
              <Text v="caption" color="rgba(255,255,255,0.8)" style={{ fontSize: 9.5 }}>so far</Text>
            </View>
          </Row>
          <Summit progress={fill.percent} />
          <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
            <Text v="caption" color="#fff" style={{ fontFamily: FONT.bold }}>{fill.percent}% filled</Text>
            <Text v="caption" color="rgba(255,255,255,0.85)">{fill.left ? `${fill.left} question${fill.left === 1 ? '' : 's'} left` : 'all answered'}</Text>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
            {[...SECTIONS, null].map((s, i) => (
              <Pressable key={s?.id ?? 'review'} onPress={() => go(i)}
                style={{ paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center',
                  backgroundColor: i === step ? '#fff' : i < step ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)' }}>
                <Row gap={4}>
                  {s && fill.sections[i].total && !fill.sections[i].missing.length ? <Feather name="check" size={12} color={i === step ? accent : '#fff'} /> : null}
                  <Text v="caption" color={i === step ? accent : '#fff'} style={{ fontFamily: FONT.bold }}>{s ? s.short : 'Finish'}</Text>
                </Row>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </LinearGradient>

      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 140, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        {section ? (
          <Animated.View key={section.id} entering={FadeInRight.duration(320)}>
            <Encourage percent={fill.percent} left={fill.left} />
            {section.note ? (
              <Row style={{ backgroundColor: accent + '16', borderRadius: RADIUS.md, padding: 12, marginBottom: SPACE.md }}>
                <Feather name="info" size={16} color={accent} /><Text v="small" style={{ flex: 1 }}>{section.note}</Text>
              </Row>
            ) : null}
            {section.items.filter(it => isShown(it, answers)).map((it, i) => {
              const answered = answers[it.id] !== undefined;
              return (
                <Animated.View key={it.id} entering={FadeInDown.delay(i * 40).duration(300)}>
                  <Card style={{ marginBottom: SPACE.md, borderLeftWidth: 4, borderLeftColor: answered ? accent : c.line }}>
                    <Row style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                      <View style={{ minWidth: 34, height: 24, borderRadius: 8, backgroundColor: answered ? accent : c.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                        <Text v="caption" color={answered ? '#fff' : c.ink2} style={{ fontFamily: FONT.bold }}>{it.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text v="h3">{it.q}{it.required ? <Text v="h3" color={c.danger}> *</Text> : null}</Text>
                        {it.help ? <Text v="small" muted style={{ marginTop: 4 }}>{it.help}</Text> : null}
                      </View>
                    </Row>
                    <QuestionInput item={it} value={answers[it.id]} onChange={set(it.id)} accent={accent} villageName={village.name} />
                  </Card>
                </Animated.View>
              );
            })}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInRight.duration(320)}>
            <Card style={{ alignItems: 'center' }}>
              <Ring value={score.score} size={170} label="household score" sub={score.valid ? bandLabel(score.band) : 'needs more answers'} />
              <View style={{ marginTop: 10 }}><BandPill band={score.band} /></View>
            </Card>
            <Card style={{ marginTop: SPACE.md }}>
              <Text v="h3">This household’s shape</Text>
              <Radar axes={DIMENSIONS.map(d => ({ label: d.short, color: DIM_COLORS[d.id] }))} series={[{ label: 'Household', values: DIMENSIONS.map(d => score.dims[d.id].score), color: '#14A3A8' }]} />
              {DIMENSIONS.map(d => (
                <Row key={d.id} style={{ marginTop: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DIM_COLORS[d.id] }} />
                  <Text v="small" style={{ flex: 1 }}>{d.name}</Text>
                  <Text v="caption" faint>{score.dims[d.id].answered}/{score.dims[d.id].total} answered</Text>
                  <Text v="small" style={{ fontFamily: FONT.bold, width: 44, textAlign: 'right' }} color={score.dims[d.id].counted ? DIM_COLORS[d.id] : c.ink3}>
                    {score.dims[d.id].score === null ? '—' : score.dims[d.id].score!.toFixed(0)}
                  </Text>
                </Row>
              ))}
            </Card>
            <View style={{ marginTop: SPACE.md }}><Encourage percent={fill.percent} left={fill.left} /></View>
            {fill.left && !missing.length ? (
              <Card style={{ borderLeftWidth: 4, borderLeftColor: c.warning }}>
                <Text v="h3">Questions not answered yet ({fill.left})</Text>
                <Text v="small" muted style={{ marginTop: 2 }}>Tap one to answer it. “Don’t know” is an answer too.</Text>
                {fill.sections.filter(x => x.missing.length).map(x => {
                  const i = SECTIONS.findIndex(sec => sec.id === x.id);
                  return (
                    <Pressable key={x.id} onPress={() => go(i)} style={{ marginTop: 10 }}>
                      <Text v="small" style={{ fontFamily: FONT.bold }} color={SECTION_COLOR[x.id]}>{SECTIONS[i].title} · {x.missing.length} left →</Text>
                      <Text v="caption" muted numberOfLines={2}>{x.missing.slice(0, 3).map(id => ITEMS[id]?.q).join(' · ')}{x.missing.length > 3 ? ' …' : ''}</Text>
                    </Pressable>
                  );
                })}
              </Card>
            ) : null}
            {missing.length ? (
              <Card style={{ marginTop: SPACE.md, borderLeftWidth: 4, borderLeftColor: c.danger }}>
                <Text v="h3">Still needed</Text>
                {missing.map(m => (
                  <Pressable key={m.id} onPress={() => go(SECTIONS.findIndex(s => s.items.includes(m)))}>
                    <Text v="small" color={c.brand} style={{ marginTop: 6 }}>{m.id} · {m.q} →</Text>
                  </Pressable>
                ))}
              </Card>
            ) : (
              <Row style={{ marginTop: SPACE.md, backgroundColor: c.success + '18', borderRadius: RADIUS.md, padding: 14 }}>
                <Feather name="check-circle" size={18} color={c.success} />
                <Text v="small" style={{ flex: 1 }}>All required questions answered. Finishing uploads it now, or as soon as there is signal.</Text>
              </Row>
            )}
          </Animated.View>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 12, paddingTop: 12, paddingHorizontal: SPACE.lg, backgroundColor: c.bg + 'F2', borderTopWidth: 1, borderTopColor: c.line }}>
        <Row gap={10} style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
          <Button title="Back" kind="ghost" icon="chevron-left" disabled={step === 0} onPress={() => go(step - 1)} style={{ flex: 1 }} />
          {isReview
            ? <Button title={fill.percent < MIN_FILLED_TO_FINISH ? `Fill ${MIN_FILLED_TO_FINISH}% to finish` : 'Finish & upload'} icon="upload-cloud" loading={sending} onPress={() => finish()} style={{ flex: 2 }}
                gradient={fill.percent < MIN_FILLED_TO_FINISH ? ['#8A94AD', '#6B7590'] : ['#22B07D', '#14A3A8']} />
            : <Button title={step === SECTIONS.length - 1 ? 'Review' : `Next: ${SECTIONS[step + 1].short}`} icon="chevron-right" onPress={() => go(step + 1)} style={{ flex: 2 }}
                gradient={[accent, SECTION_COLOR[SECTIONS[Math.min(step + 1, SECTIONS.length - 1)].id]]} />}
        </Row>
      </View>

      <Sheet visible={askFinish} onClose={() => setAskFinish(false)} title={`${fill.left} question${fill.left === 1 ? '' : 's'} still open`}
        footer={<View style={{ gap: 10 }}>
          <Button title="Answer the rest" icon="edit-3" onPress={() => { setAskFinish(false); firstOpen(); }} />
          <Button title="Finish anyway" kind="ghost" onPress={() => finish(true)} />
        </View>}>
        <Text v="body">You have filled {fill.percent}% of the survey. A complete survey gives the fairest score — and it takes only a minute or two more.</Text>
      </Sheet>
    </View>
  );
}

/** A short word of encouragement, matched to how far the survey has got. */
function Encourage({ percent, left }: { percent: number; left: number }) {
  const { c } = useTheme();
  const m = milestoneFor(percent);
  const next = PROGRESS_MILESTONES.find(x => x.at > percent);
  const color = percent >= 100 ? c.success : percent >= MIN_FILLED_TO_FINISH ? c.lake : c.apricot;
  return (
    <Row style={{ backgroundColor: color + '18', borderRadius: RADIUS.md, padding: 12, marginBottom: SPACE.md, alignItems: 'flex-start' }} gap={10}>
      <Feather name={percent >= 100 ? 'award' : 'trending-up'} size={18} color={color} />
      <View style={{ flex: 1 }}>
        <Text v="small" style={{ fontFamily: FONT.bold }} color={color}>{m.title} — {percent}%</Text>
        <Text v="caption" muted style={{ marginTop: 2 }}>{m.text}{next && left && next.at > MIN_FILLED_TO_FINISH ? ` Next stop: ${next.at}%.` : ''}</Text>
      </View>
    </Row>
  );
}

/** The progress bar as a climb: a small mountain marker walks to the summit. */
function Summit({ progress }: { progress: number }) {
  return (
    <View style={{ marginTop: 14, height: 22, justifyContent: 'center' }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' }}>
        <View style={{ width: `${Math.max(3, progress)}%`, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
      </View>
      <View style={{ position: 'absolute', left: `${Math.min(94, Math.max(0, progress - 3))}%`, top: -1 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="triangle" size={12} color="#16245A" />
        </View>
      </View>
      <View style={{ position: 'absolute', right: -2, top: 1 }}><Feather name="flag" size={18} color="#fff" /></View>
    </View>
  );
}

/** Falling prayer-flag confetti and the result. */
function Celebration({ result, villageName, score, band, own }: {
  result: { code?: string; offline: boolean; error?: string }; villageName: string; score: number | null; band: number | null; own: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  // created once (a lazy initial state may be random); then only animated
  const [pieces] = useState(() => Array.from({ length: 36 }, (_, i) => ({
    x: Math.random() * width, delay: Math.random() * 600, color: PRAYER_FLAGS[i % 5] === '#F4F6FB' ? '#9DB4FF' : PRAYER_FLAGS[i % 5],
    rot: Math.random() * 360, duration: 2200 + Math.random() * 900, y: new RNAnimated.Value(0),
  })));
  useEffect(() => {
    RNAnimated.stagger(25, pieces.map(p => RNAnimated.timing(p.y, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }))).start();
  }, [pieces]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {pieces.map((p, i) => (
        <RNAnimated.View key={i} pointerEvents="none" style={{ position: 'absolute', left: p.x, top: -20, width: 10, height: 14, borderRadius: 2, backgroundColor: p.color,
          transform: [{ translateY: p.y.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) }, { rotate: `${p.rot}deg` }],
          opacity: p.y.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }) }} />
      ))}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl }}>
        <Animated.View entering={ZoomIn.duration(500)} style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: (result.error ? c.danger : c.success) + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={result.error ? 'alert-triangle' : result.offline ? 'clock' : 'check'} size={54} color={result.error ? c.danger : result.offline ? c.warning : c.success} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(200)} style={{ alignItems: 'center' }}>
          <Text v="title" center style={{ marginTop: 22 }}>{result.error ? 'Not accepted yet' : result.offline ? 'Saved on this phone' : 'Survey uploaded!'}</Text>
          <Text v="body" muted center style={{ marginTop: 8, maxWidth: 340 }}>
            {result.error ? result.error : result.offline ? `${villageName}: it will upload by itself as soon as there is signal.`
              : own ? 'Thank you for sharing your household’s details. Your voice helps shape a better Ladakh.'
              : `Thank you — ${villageName} is one household closer to a full picture.`}
          </Text>
          {result.code ? (
            <View style={{ marginTop: 22, backgroundColor: c.brandSoft, borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 26, alignItems: 'center' }}>
              <Text v="label" color={c.brand}>Household code</Text>
              <Text v="display" color={c.brand} style={{ letterSpacing: 2 }}>{result.code}</Text>
            </View>
          ) : null}
          {score !== null ? (
            <Row style={{ marginTop: 18 }}>
              <Text v="small" muted>Score</Text><Text v="h3" color={bandColor(band)}>{score.toFixed(1)}</Text><BandPill band={band} size="sm" />
            </Row>
          ) : null}
        </Animated.View>
      </View>
      <View style={{ padding: SPACE.lg, paddingBottom: insets.bottom + SPACE.lg, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        {own ? (
          <Button title="Done" icon="home" onPress={() => router.replace('/')} />
        ) : (
          <>
            <Button title="Next household" icon="plus" onPress={() => router.replace('/new-survey')} />
            <Button title="Done" kind="ghost" onPress={() => router.replace('/collect')} />
          </>
        )}
      </View>
    </View>
  );
}
