import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIMENSIONS, SECTIONS, isShown, scoreHousehold, type Answers, type HouseholdScore } from '@dyeskit/core';
import { DIM_COLORS, FONT, RADIUS, SPACE, scoreColor, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { useMeta } from '@/lib/auth';
import { answerText, bandLabel, fmtDateTime } from '@/lib/format';
import { BandPill, Button, Card, ErrorBox, Input, Loading, Row, Screen, SectionTitle, Sheet, StatusBadge, Text, toast } from '@/components/ui';
import { BarList, Ring } from '@/components/charts';
import { QuestionInput } from '@/components/questions';
import { TopBar } from '@/components/TopBar';

interface Detail {
  submission: { id: string; village: string; villageId: number; district: string; status: string; householdCode: string; headName: string | null; phone: string | null;
    collector: string | null; reviewer: string | null; reviewNote: string | null; submittedAt: string; durationMin: number | null; deletedAt: string | null; source?: string };
  answers: Answers; score: HouseholdScore;
  history: { item_id: string; old_value: unknown; new_value: unknown; changed_at: string; reason: string | null; changed_by: string | null }[];
  canEdit: boolean; canReview: boolean; canDelete: boolean;
  issues?: { id: string; label: string }[];
}

export default function SubmissionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const own = useMeta().rights.read === 'own';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['submission', id], queryFn: () => api<Detail>(`/api/submissions/${id}`) });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Answers>({});
  const [reason, setReason] = useState('');
  const [sheet, setSheet] = useState<null | 'reject' | 'delete' | 'save'>(null);
  const [note, setNote] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['submission', id] }); qc.invalidateQueries({ queryKey: ['submissions'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };

  const review = useMutation({
    mutationFn: (status: string) => api(`/api/submissions/${id}/review`, { method: 'POST', body: { status, note } }),
    onSuccess: (_, status) => { toast(status === 'approved' ? 'Approved' : status === 'rejected' ? 'Sent back with your note' : 'Updated'); setSheet(null); setNote(''); refresh(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const save = useMutation({
    mutationFn: (why: string) => api(`/api/submissions/${id}`, { method: 'PATCH', body: { answers: changed(), reason: why } }),
    onSuccess: () => { toast('Correction saved and rescored'); setEditing(false); setSheet(null); setReason(''); refresh(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/submissions/${id}`, { method: 'DELETE', body: { reason: note } }),
    onSuccess: () => {
      toast(own ? 'Your survey has been deleted' : 'Moved to the recycle bin');
      refresh();
      if (own) router.replace('/'); else router.back();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: c.bg }}><TopBar title="Survey" /><Loading /></View>;
  if (q.error || !q.data) return <View style={{ flex: 1, backgroundColor: c.bg }}><TopBar title="Survey" /><Screen><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Screen></View>;
  const { submission: s, answers, history } = q.data;
  const shown = editing ? draft : answers;
  const score = editing ? scoreHousehold(draft) : q.data.score;
  const changed = () => {
    const out: Answers = {};
    for (const k of new Set([...Object.keys(answers), ...Object.keys(draft)])) {
      if (JSON.stringify(answers[k]) !== JSON.stringify(draft[k])) out[k] = draft[k] ?? null;
    }
    return out;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={s.householdCode} sub={`${s.village} · ${fmtDateTime(s.submittedAt)}`} right={<StatusBadge status={s.status} />} />
      <Screen>
        {q.data.issues?.length ? (
          <Card style={{ marginBottom: SPACE.md, borderLeftWidth: 4, borderLeftColor: c.danger }}>
            <Text v="h3">Needs a look</Text>
            {q.data.issues.map(i => (
              <Row key={i.id} gap={6} style={{ marginTop: 6 }}><Feather name="alert-triangle" size={14} color={c.danger} /><Text v="small" style={{ flex: 1 }}>{i.label}</Text></Row>
            ))}
            <Text v="caption" faint style={{ marginTop: 8 }}>Check the answers below, then correct, approve, send back or delete.</Text>
          </Card>
        ) : null}
        <Card>
          <Row wrap gap={16} style={{ alignItems: 'center' }}>
            <Ring value={score.score} size={130} label={editing ? 'new score' : 'household score'} />
            <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
              <BandPill band={score.band} />
              <Text v="h3">{bandLabel(score.band)}</Text>
              <Text v="small" muted>
                {s.source === 'self' ? 'Filled in by the household itself' : `Collected by ${s.collector ?? 'a deleted user'}`}
                {s.durationMin ? ` in ${s.durationMin} minutes` : ''}
              </Text>
              {s.headName ? <Text v="small" muted>Head of household: {s.headName}{s.phone ? ` · ${s.phone}` : ''}</Text> : null}
              {s.reviewNote ? (
                <Row style={{ backgroundColor: c.warning + '18', borderRadius: RADIUS.sm, padding: 8, marginTop: 4 }}>
                  <Feather name="message-square" size={14} color={c.warning} /><Text v="small" style={{ flex: 1 }}>{s.reviewer}: {s.reviewNote}</Text>
                </Row>
              ) : null}
            </View>
          </Row>
          <View style={{ marginTop: SPACE.lg }}>
            <BarList items={DIMENSIONS.map(d => ({ key: d.id, label: d.name, value: score.dims[d.id].score, color: DIM_COLORS[d.id], sub: `${score.dims[d.id].answered}/${score.dims[d.id].total}` }))} height={8} />
          </View>
        </Card>

        {(q.data.canReview || q.data.canEdit || q.data.canDelete) && !s.deletedAt ? (
          <Row wrap gap={10} style={{ marginTop: SPACE.md }}>
            {q.data.canReview && s.status !== 'approved' && !editing ? <Button title="Approve" icon="check" small gradient={['#22B07D', '#14A3A8']} onPress={() => review.mutate('approved')} loading={review.isPending} /> : null}
            {q.data.canReview && s.status !== 'rejected' && !editing ? <Button title="Send back" icon="corner-up-left" small kind="secondary" onPress={() => setSheet('reject')} /> : null}
            {q.data.canEdit && !editing ? <Button title={own ? 'Edit my answers' : 'Correct answers'} icon="edit-2" small kind={own ? 'secondary' : 'ghost'} onPress={() => { setDraft({ ...answers }); setEditing(true); }} /> : null}
            {editing ? <Button title="Save correction" icon="save" small onPress={() => !Object.keys(changed()).length ? toast('Nothing changed')
              // households correcting their own answers are not asked for a reason
              : own ? save.mutate('Updated by the household') : setSheet('save')} /> : null}
            {editing ? <Button title="Cancel" small kind="ghost" onPress={() => setEditing(false)} /> : null}
            {q.data.canDelete && !editing ? <Button title={own ? 'Delete my survey' : 'Delete'} icon="trash-2" small kind="ghost" onPress={() => setSheet('delete')} /> : null}
          </Row>
        ) : null}

        {SECTIONS.map(sec => (
          <View key={sec.id}>
            <SectionTitle title={sec.title} />
            <Card style={{ gap: 2 }}>
              {sec.items.filter(it => isShown(it, shown)).map(it => {
                const qs_ = score.questions[it.id];
                return (
                  <View key={it.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
                    <Row style={{ alignItems: 'flex-start' }}>
                      <Text v="caption" faint style={{ width: 32, fontFamily: FONT.bold }}>{it.id}</Text>
                      <View style={{ flex: 1 }}>
                        <Text v="small" muted>{it.q}</Text>
                        {!editing || it.type === 'village' ? <Text v="body" style={{ fontFamily: FONT.semibold, marginTop: 2 }}>{answerText(it.id, shown[it.id])}</Text> : null}
                      </View>
                      {qs_ && qs_.points !== null ? (
                        <View style={{ minWidth: 40, paddingVertical: 3, borderRadius: RADIUS.sm, backgroundColor: scoreColor(qs_.points) + '22', alignItems: 'center' }}>
                          <Text v="caption" color={scoreColor(qs_.points)} style={{ fontFamily: FONT.bold }}>{qs_.points}</Text>
                        </View>
                      ) : null}
                    </Row>
                    {editing && it.type !== 'village' ? (
                      <View style={{ marginTop: 10, marginLeft: 32 }}>
                        <QuestionInput item={it} value={draft[it.id]} accent={c.brand} villageName={s.village}
                          onChange={v => setDraft(d => { const n = { ...d }; if (v === undefined) delete n[it.id]; else n[it.id] = v; return n; })} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </View>
        ))}

        {history.length ? (
          <>
            <SectionTitle title="Change history" sub="Every correction, never overwritten" />
            <Card style={{ gap: 10 }}>
              {history.map((h, i) => (
                <View key={i}>
                  <Text v="small" style={{ fontFamily: FONT.semibold }}>{h.item_id}: {answerText(h.item_id, h.old_value)} → {answerText(h.item_id, h.new_value)}</Text>
                  <Text v="caption" muted>{h.changed_by ?? 'system'} · {fmtDateTime(h.changed_at)}{h.reason ? ` · “${h.reason}”` : ''}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>

      <Sheet visible={sheet === 'reject'} onClose={() => setSheet(null)} title="Send back to the researcher"
        footer={<Button title="Send back" kind="danger" loading={review.isPending} disabled={!note.trim()} onPress={() => review.mutate('rejected')} />}>
        <Input label="What needs fixing?" value={note} onChangeText={setNote} multiline placeholder="e.g. Weight looks mis-typed; please re-measure" />
      </Sheet>
      <Sheet visible={sheet === 'save'} onClose={() => setSheet(null)} title="Save correction"
        footer={<Button title="Save and rescore" loading={save.isPending} disabled={!reason.trim()} onPress={() => save.mutate(reason)} />}>
        <Text v="small" muted style={{ marginBottom: 10 }}>{Object.keys(changed()).length} answer(s) changed. The old values are kept in the history.</Text>
        <Input label="Reason (required)" value={reason} onChangeText={setReason} placeholder="e.g. Corrected after a phone call with the household" />
      </Sheet>
      <Sheet visible={sheet === 'delete'} onClose={() => setSheet(null)} title={own ? 'Delete your survey?' : 'Delete this survey?'}
        footer={<Button title={own ? 'Yes, delete my survey' : 'Move to recycle bin'} kind="danger" loading={remove.isPending} disabled={!own && !note.trim()} onPress={() => remove.mutate()} />}>
        {own ? (
          <Text v="small" muted>
            Your household’s answers will be removed from every count straight away. You can fill in your survey again afterwards if you wish.
          </Text>
        ) : (
          <>
            <Text v="small" muted style={{ marginBottom: 10 }}>It stops counting in every score. An admin can restore it from the recycle bin.</Text>
            <Input label="Reason (required)" value={note} onChangeText={setNote} placeholder="e.g. Duplicate of L_CHL_014" />
          </>
        )}
      </Sheet>
    </View>
  );
}
