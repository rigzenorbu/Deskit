import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { DISTRICTS } from '@dyeskit/core';
import { FONT, SPACE, districtColor, useTheme } from '@/theme';
import { useAuth, useMeta, type VillageMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { districtName } from '@/lib/format';
import { Badge, Button, Card, Chip, IconButton, Input, Row, Screen, SearchBar, Sheet, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { villageMatches } from '@/components/pickers';
import { currentPosition } from '@/lib/location';

export default function AdminVillages() {
  const meta = useMeta();
  const { refresh } = useAuth();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [edit, setEdit] = useState<VillageMeta | null>(null);
  const [hh, setHh] = useState('');
  const [alt, setAlt] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [locating, setLocating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nv, setNv] = useState({ name: '', district: 'leh', block: '', households: '' });
  const list = meta.villages.filter(v => (!district || v.district === district) && villageMatches(v, q));
  const missing = meta.villages.filter(v => !v.households).length;

  const save = async () => {
    try {
      const moved = lat !== (edit!.lat?.toString() ?? '') || lon !== (edit!.lon?.toString() ?? '');
      await api(`/api/villages/${edit!.id}`, { method: 'PATCH', body: {
        households: hh === '' ? undefined : Number(hh), altitude_m: alt === '' ? undefined : Number(alt),
        ...(moved && lat && lon ? { lat: Number(lat), lon: Number(lon) } : {}),
      } });
      await refresh(); toast(`${edit!.name} updated`); setEdit(null);
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const add = async () => {
    try {
      const r = await api<{ code: string }>('/api/villages', { method: 'POST', body: { ...nv, households: Number(nv.households) || 0 } });
      await refresh(); toast(`Added with code ${r.code}`); setAdding(false); setNv({ name: '', district: 'leh', block: '', households: '' });
    } catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Villages & households" sub={`${meta.villages.length} villages · ${missing} without a household count`}
        right={<IconButton icon="plus" onPress={() => setAdding(true)} bg={c.brandSoft} color={c.brand} />} />
      <Screen>
        <Card tone={c.brandSoft}>
          <Text v="small">The number of households in a village decides when its result is reliable (30% surveyed, at least 10). Official villages come from the 27 April 2026 notification and cannot be renamed here.</Text>
        </Card>
        <View style={{ marginTop: SPACE.md }}><SearchBar value={q} onChange={setQ} placeholder="Village, code or block" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: SPACE.md }} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={!district} onPress={() => setDistrict('')} />
          {DISTRICTS.map(d => <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={district === d.id} onPress={() => setDistrict(d.id)} />)}
        </ScrollView>
        {list.map(v => (
          <Card key={v.id} style={{ marginBottom: 8, padding: 12 }} onPress={() => { setEdit(v); setHh(v.households ? String(v.households) : ''); setAlt(v.altitude_m ? String(v.altitude_m) : '');
            setLat(v.lat?.toString() ?? ''); setLon(v.lon?.toString() ?? ''); }}>
            <Row>
              <Text v="small" color={districtColor(v.district)} style={{ fontFamily: FONT.heavy, width: 40 }}>{v.code}</Text>
              <View style={{ flex: 1 }}>
                <Text v="h3" numberOfLines={1}>{v.name}</Text>
                <Text v="caption" muted>{districtName(v.district)} · {v.block ?? '—'}{v.official ? '' : ' · added by hand'}</Text>
              </View>
              {v.households ? <Text v="small" style={{ fontFamily: FONT.bold }}>{v.households} hh</Text> : <Badge label="add count" color={c.warning} />}
            </Row>
          </Card>
        ))}
      </Screen>
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.name} (${edit.code})` : ''} footer={<Button title="Save" onPress={save} />}>
        <View style={{ gap: 12 }}>
          <Input label="Households in the village" value={hh} onChangeText={setHh} keyboardType="numeric" placeholder="e.g. 140" />
          <Input label="Altitude (metres, optional)" value={alt} onChangeText={setAlt} keyboardType="numeric" placeholder="e.g. 3500" />
          <Text v="label" muted style={{ marginTop: 6 }}>Position on the map</Text>
          <Text v="caption" faint>
            {edit?.location_source === 'manual' ? 'Set by hand.' : edit?.lat ? 'Approximate, from OpenStreetMap — please check.' : 'Not placed yet.'}
            {' '}Standing in the village? Use your phone’s location.
          </Text>
          <Row gap={10}>
            <Input label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" placeholder="34.16" style={{ flex: 1 }} />
            <Input label="Longitude" value={lon} onChangeText={setLon} keyboardType="numeric" placeholder="77.58" style={{ flex: 1 }} />
          </Row>
          <Button title="Use my current location" icon="crosshair" kind="secondary" small loading={locating} style={{ alignSelf: 'flex-start' }}
            onPress={async () => {
              setLocating(true);
              try { const p = await currentPosition(); setLat(p.lat.toFixed(5)); setLon(p.lon.toFixed(5)); toast(`Location found (within about ${Math.round(p.accuracy)} m)`); }
              catch (e: any) { toast(e.message, 'error'); } finally { setLocating(false); }
            }} />
        </View>
      </Sheet>
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add a village" footer={<Button title="Add village" disabled={!nv.name.trim()} onPress={add} />}>
        <Text v="small" muted style={{ marginBottom: 12 }}>For a hamlet or settlement not on the official list. A unique 3-letter code is created automatically.</Text>
        <View style={{ gap: 12 }}>
          <Input label="Name" value={nv.name} onChangeText={name => setNv({ ...nv, name })} />
          <Text v="label" muted>District</Text>
          <Row wrap gap={8}>{DISTRICTS.map(d => <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={nv.district === d.id} onPress={() => setNv({ ...nv, district: d.id })} />)}</Row>
          <Input label="Block (optional)" value={nv.block} onChangeText={block => setNv({ ...nv, block })} />
          <Input label="Households (optional)" value={nv.households} onChangeText={households => setNv({ ...nv, households })} keyboardType="numeric" />
        </View>
      </Sheet>
    </View>
  );
}
