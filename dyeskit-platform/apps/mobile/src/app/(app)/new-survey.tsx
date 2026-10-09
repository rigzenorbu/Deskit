import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DISTRICT_BY_ID, type DistrictId } from '@dyeskit/core';
import { FONT, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta, type VillageMeta } from '@/lib/auth';
import { startSurvey } from '@/lib/outbox';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { districtName, fmtDate } from '@/lib/format';
import { Button, Card, Input, Loading, Row, Screen, SearchBar, Sheet, Text, tap, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { VillagePicker } from '@/components/pickers';

export default function NewSurvey() {
  const meta = useMeta();
  const { c } = useTheme();
  const scope = meta.rights.read === 'assigned' ? meta.assigned : null;
  const mine = scope ? meta.villages.filter(v => scope.includes(v.id)) : [];
  const [village, setVillage] = useState<VillageMeta | null>(mine.length === 1 ? mine[0] : null);
  const [picking, setPicking] = useState(false);
  const own = meta.rights.read === 'own';   // a household member filling in their own survey
  const [head, setHead] = useState(own ? meta.user.name : '');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  // surveying a household from an earlier round again (keeps its code)
  const [repeat, setRepeat] = useState<null | { householdId: number; code: string; headName: string | null }>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const letter = village ? DISTRICT_BY_ID[village.district as DistrictId]?.letter : 'L';
  const begin = async () => {
    if (!village) return toast('Choose the village first', 'error');
    if (!consent) return toast('Consent is needed before the survey can start', 'error');
    setBusy(true);
    const s = await startSurvey(village.id, head.trim(), phone.trim(), repeat ? { householdId: repeat.householdId, code: repeat.code } : undefined);
    router.replace(`/survey/${s.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={own ? 'Your household survey' : 'New household survey'} sub={own ? 'Step 1 of 2 · where you live, and your agreement' : 'Step 1 of 2 · household and consent'} />
      <Screen>
        {scope && !mine.length ? (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: c.warning, marginBottom: SPACE.lg }}>
            <Text v="h3">No villages assigned yet</Text>
            <Text v="small" muted style={{ marginTop: 4 }}>Ask an admin to assign your villages before collecting.</Text>
          </Card>
        ) : null}

        <Text v="label" muted style={{ marginBottom: 8 }}>{own ? 'Your village' : 'Village'}</Text>
        <Pressable onPress={() => { tap(); setPicking(true); }}>
          <Card style={{ borderWidth: 2, borderColor: village ? districtColor(village.district) : c.line }}>
            {village ? (
              <Row gap={12}>
                <View style={{ width: 56, height: 40, borderRadius: 12, backgroundColor: districtColor(village.district), alignItems: 'center', justifyContent: 'center' }}>
                  <Text v="h3" color="#fff" style={{ fontFamily: FONT.heavy }}>{village.code}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text v="h2">{village.name}</Text>
                  <Text v="small" muted>{districtName(village.district)} district · {village.block} block</Text>
                </View>
                <Text v="small" color={c.brand}>Change</Text>
              </Row>
            ) : (
              <Row gap={12}>
                <Feather name="map-pin" size={22} color={c.brand} />
                <Text v="h3" style={{ flex: 1 }}>Tap to choose the village</Text>
                <Feather name="search" size={20} color={c.ink3} />
              </Row>
            )}
          </Card>
        </Pressable>
        {village && repeat ? (
          <Row gap={8} style={{ marginTop: 10, backgroundColor: c.success + '18', padding: 12, borderRadius: RADIUS.md }}>
            <Feather name="repeat" size={16} color={c.success} />
            <Text v="small" style={{ flex: 1 }}>
              Surveying again: <Text v="small" style={{ fontFamily: FONT.heavy }}>{repeat.code}</Text>{repeat.headName ? ` (${repeat.headName})` : ''} — it keeps its household code.
            </Text>
            <Pressable onPress={() => setRepeat(null)}><Text v="small" color={c.brand}>Change</Text></Pressable>
          </Row>
        ) : village ? (
          <>
            <Row gap={8} style={{ marginTop: 10, backgroundColor: c.brandSoft, padding: 12, borderRadius: RADIUS.md }}>
              <Feather name="hash" size={16} color={c.brand} />
              <Text v="small" color={c.brand} style={{ flex: 1 }}>
                A new household gets the code <Text v="small" color={c.brand} style={{ fontFamily: FONT.heavy }}>{letter}_{village.code}_…</Text> — the next free number, given when it uploads.
              </Text>
            </Row>
            {!own ? (
              <Button title="This household was surveyed before" icon="repeat" kind="ghost" small style={{ marginTop: 10, alignSelf: 'flex-start' }}
                onPress={() => setChoosing(true)} />
            ) : null}
          </>
        ) : null}

        <View style={{ gap: 14, marginTop: SPACE.xl }}>
          <Input label={own ? 'Head of your household (private)' : 'Household head (private — never shown to analysts)'} icon="user" value={head} onChangeText={setHead} placeholder="Optional" />
          <Input label="Phone (private, optional)" icon="phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91…" />
        </View>

        <Card style={{ marginTop: SPACE.xl, backgroundColor: c.surface2 }}>
          <Row gap={8}><Feather name="message-circle" size={18} color={c.brand} /><Text v="h3">{own ? 'Before you start, please read' : 'Read aloud before starting'}</Text></Row>
          <Text v="body" muted style={{ marginTop: 10, lineHeight: 23 }}>{meta.questionnaire.consent}</Text>
        </Card>
        <Pressable onPress={() => { tap(); setConsent(x => !x); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: SPACE.lg, padding: 4 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: consent ? c.success : c.ink3, backgroundColor: consent ? c.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {consent ? <Feather name="check" size={18} color="#fff" /> : null}
          </View>
          <Text v="h3" style={{ flex: 1 }}>{own ? 'I agree to take part' : 'The respondent agreed to take part'}</Text>
        </Pressable>

        <Button title="Begin survey" icon="play" loading={busy} disabled={!village || !consent} onPress={begin} style={{ marginTop: SPACE.xl }} />
      </Screen>
      <VillagePicker visible={picking} onClose={() => setPicking(false)} onPick={v => { if (v) { setVillage(v); setRepeat(null); } }} onlyIds={scope} />
      {village ? (
        <HouseholdPicker villageId={village.id} visible={choosing} onClose={() => setChoosing(false)}
          onPick={h => { setRepeat({ householdId: h.id, code: h.code, headName: h.headName }); if (h.headName && !head) setHead(h.headName); }} />
      ) : null}
    </View>
  );
}

interface PastHousehold { id: number; code: string; headName: string | null; lastSurveyAt: string; surveyedThisRound: boolean }

/** Households of a village surveyed in earlier rounds, searchable by code or head's name. */
function HouseholdPicker({ villageId, visible, onClose, onPick }: { villageId: number; visible: boolean; onClose: () => void; onPick: (h: PastHousehold) => void }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['households', villageId], enabled: visible,
    queryFn: () => api<{ rows: PastHousehold[] }>(`/api/households?village_id=${villageId}`) });
  const rows = (list.data?.rows ?? []).filter(h => !q || `${h.code} ${h.headName ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose} title="Which household?">
      <SearchBar value={q} onChange={setQ} placeholder="Household code or head’s name" />
      {list.isLoading ? <Loading /> : list.error ? <Text v="small" color={c.danger} style={{ marginTop: 12 }}>{(list.error as Error).message}</Text> : null}
      {rows.map(h => (
        <Pressable key={h.id} disabled={h.surveyedThisRound} onPress={() => { tap(); onPick(h); onClose(); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, opacity: h.surveyedThisRound ? 0.45 : 1 }}>
          <Text v="small" color={c.brand} style={{ fontFamily: FONT.heavy, width: 92 }}>{h.code}</Text>
          <View style={{ flex: 1 }}>
            <Text v="h3" numberOfLines={1}>{h.headName ?? 'Name not recorded'}</Text>
            <Text v="caption" muted>{h.surveyedThisRound ? 'Already surveyed this round' : `Last surveyed ${fmtDate(h.lastSurveyAt)}`}</Text>
          </View>
        </Pressable>
      ))}
      {list.data && !rows.length ? <Text v="small" muted center style={{ paddingVertical: 24 }}>No household matches.</Text> : null}
    </Sheet>
  );
}
