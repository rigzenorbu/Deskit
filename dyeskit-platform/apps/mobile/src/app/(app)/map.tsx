import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BANDS, DISTRICTS } from '@dyeskit/core';
import { BAND_COLORS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { useDashboard } from '@/lib/queries';
import { Card, Chip, Loading, Row, Screen, Text } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { LadakhMap, type MapVillage } from '@/components/LadakhMap';

/** Every village on a map of Ladakh, coloured by its score this round. */
export default function MapScreen() {
  const meta = useMeta();
  const { c } = useTheme();
  const [focus, setFocus] = useState('');
  // scores for every village (the district and village filters do not apply to the map)
  const dash = useDashboard({ district: '', village_id: '' });
  const scope = useMemo(() => (meta.rights.read === 'assigned' ? new Set(meta.assigned) : null), [meta.rights.read, meta.assigned]);
  const villages = useMemo<MapVillage[]>(() => {
    const scores = new Map((dash.data?.villages ?? []).map(v => [v.id, v]));
    return meta.villages
      .filter(v => v.lat !== null && v.lon !== null && (!scope || scope.has(v.id)))
      .map(v => {
        const s = scores.get(v.id);
        return { id: v.id, name: v.name, code: v.code, district: v.district, lat: v.lat!, lon: v.lon!,
          score: s?.score ?? null, band: s?.band ?? null, n: s?.n ?? 0, approximate: v.location_source !== 'manual' };
      });
  }, [meta.villages, dash.data, scope]);
  const placed = villages.length, total = scope ? scope.size : meta.villages.length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Map of villages" sub={`${placed} of ${total} villages placed`} />
      <Screen>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: SPACE.md }}>
          <Chip label="All Ladakh" active={!focus} onPress={() => setFocus('')} />
          {DISTRICTS.map(d => villages.some(v => v.district === d.id)
            ? <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={focus === d.id} onPress={() => setFocus(focus === d.id ? '' : d.id)} /> : null)}
        </ScrollView>
        {dash.isLoading ? <Loading /> : <LadakhMap villages={villages} focus={focus || undefined} height={focus ? 420 : 520} />}
        <Card style={{ marginTop: SPACE.lg }}>
          <Text v="label" muted style={{ marginBottom: 8 }}>Score this round</Text>
          <Row wrap gap={10}>
            {BANDS.map(b => (
              <Row key={b.band} gap={5}><View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: BAND_COLORS[b.band] }} />
                <Text v="caption" muted>{b.short}</Text></Row>
            ))}
            <Row gap={5}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.ink3, opacity: 0.6 }} /><Text v="caption" muted>not surveyed</Text></Row>
          </Row>
          <Text v="caption" faint style={{ marginTop: 10, lineHeight: 17 }}>
            Shaded areas are drawn around each district’s villages; they are not official boundaries. Most positions come from
            OpenStreetMap (© OpenStreetMap contributors) and are approximate — admins can correct any village in Villages & households.
          </Text>
        </Card>
      </Screen>
    </View>
  );
}
