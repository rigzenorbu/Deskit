import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DISTRICT_BY_ID, type DistrictId } from '@dyeskit/core';
import { FONT, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta, type VillageMeta } from '@/lib/auth';
import { startSurvey } from '@/lib/outbox';
import { districtName } from '@/lib/format';
import { Button, Card, Input, Row, Screen, Text, tap, toast } from '@/components/ui';
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
  const [busy, setBusy] = useState(false);

  const letter = village ? DISTRICT_BY_ID[village.district as DistrictId]?.letter : 'L';
  const begin = async () => {
    if (!village) return toast('Choose the village first', 'error');
    if (!consent) return toast('Consent is needed before the survey can start', 'error');
    setBusy(true);
    const s = await startSurvey(village.id, head.trim(), phone.trim());
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
        {village ? (
          <Row gap={8} style={{ marginTop: 10, backgroundColor: c.brandSoft, padding: 12, borderRadius: RADIUS.md }}>
            <Feather name="hash" size={16} color={c.brand} />
            <Text v="small" color={c.brand} style={{ flex: 1 }}>
              Household code will be <Text v="small" color={c.brand} style={{ fontFamily: FONT.heavy }}>{letter}_{village.code}_{String(village.surveys + 1).padStart(3, '0')}</Text> or the next free number, given when it uploads.
            </Text>
          </Row>
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
      <VillagePicker visible={picking} onClose={() => setPicking(false)} onPick={v => v && setVillage(v)} onlyIds={scope} />
    </View>
  );
}
