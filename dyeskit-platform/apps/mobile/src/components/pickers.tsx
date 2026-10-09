import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AGE_GROUPS, BANDS, DISTRICTS } from '@dyeskit/core';
import { FONT, RADIUS, SPACE, bandColor, districtColor, useTheme } from '@/theme';
import { useMeta, type VillageMeta } from '@/lib/auth';
import { PERIODS, useFilters, type Filters } from '@/lib/filters';
import { districtName } from '@/lib/format';
import { Button, Chip, Row, SearchBar, Sheet, Text, tap } from './ui';

/** Does a village match a search? Name, notification spelling, code, block or sub-division. */
export const villageMatches = (v: VillageMeta, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || [v.name, v.gazette_name, v.code, v.block, v.subdivision, districtName(v.district)]
    .some(x => x && x.toLowerCase().includes(s));
};

/** Village picker: search plus district chips; shows each village's code. */
export function VillagePicker({ visible, onClose, onPick, onlyIds, allowAll, title = 'Choose a village' }: {
  visible: boolean; onClose: () => void; onPick: (v: VillageMeta | null) => void; onlyIds?: number[] | null; allowAll?: boolean; title?: string;
}) {
  const meta = useMeta();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const pool = useMemo(() => meta.villages.filter(v => !onlyIds || onlyIds.includes(v.id)), [meta.villages, onlyIds]);
  const list = pool.filter(v => (!district || v.district === district) && villageMatches(v, q));
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <SearchBar value={q} onChange={setQ} placeholder="Village, code or block" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" active={!district} onPress={() => setDistrict('')} count={pool.length} />
        {DISTRICTS.map(d => {
          const n = pool.filter(v => v.district === d.id).length;
          return n ? <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={district === d.id} count={n} onPress={() => setDistrict(d.id)} /> : null;
        })}
      </ScrollView>
      <Text v="caption" faint style={{ marginTop: 10 }}>{list.length} of {pool.length} villages</Text>
      {allowAll ? (
        <Pressable onPress={() => { tap(); onPick(null); onClose(); }} style={{ paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="globe" size={18} color={c.brand} /><Text v="h3" color={c.brand}>All villages</Text>
        </Pressable>
      ) : null}
      <FlatList data={list.slice(0, 300)} scrollEnabled={false} keyExtractor={v => String(v.id)}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line }} />}
        renderItem={({ item: v }) => (
          <Pressable onPress={() => { tap(); onPick(v); onClose(); setQ(''); }} style={({ pressed }) => ({ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 46, height: 30, borderRadius: 8, backgroundColor: districtColor(v.district) + '1F', alignItems: 'center', justifyContent: 'center' }}>
              <Text v="caption" color={districtColor(v.district)} style={{ fontFamily: FONT.bold }}>{v.code}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text v="h3" numberOfLines={1}>{v.name}{v.gazette_name ? <Text v="small" faint>  ({v.gazette_name})</Text> : null}</Text>
              <Text v="caption" muted>{districtName(v.district)} · {v.block ?? '—'}{v.surveys ? ` · ${v.surveys} surveys` : ''}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text v="small" muted center style={{ paddingVertical: 24 }}>No village matches “{q}”.</Text>}
      />
    </Sheet>
  );
}

/** One row of filter chips, plus a sheet with every filter. */
export function FilterBar({ show = ['district', 'village', 'period', 'gender', 'age', 'religion', 'band'] }: { show?: string[] }) {
  const meta = useMeta();
  const { c } = useTheme();
  const { filters, set, reset, active } = useFilters();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const village = meta.villages.find(v => String(v.id) === filters.village_id);
  const scope = meta.rights.read === 'assigned' ? meta.assigned : null;
  const roundName = filters.round === 'all' ? 'all rounds' : meta.rounds?.find(r => String(r.id) === filters.round)?.name;
  const summary = [
    roundName && (filters.round === 'all' ? roundName : `round ${roundName}`),
    filters.district && districtName(filters.district), village?.name,
    filters.period && PERIODS.find(p => p.id === filters.period)?.label, filters.gender, filters.age_group && `age ${filters.age_group}`,
    filters.religion, filters.band && `band ${filters.band}`,
  ].filter(Boolean).join(' · ');

  return (
    <View style={{ marginTop: SPACE.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        <Chip label={active ? `Filters · ${active}` : 'Filters'} icon="sliders" active={!!active} onPress={() => setOpen(true)} />
        <Chip label="All districts" active={!filters.district} onPress={() => set({ district: '' })} />
        {DISTRICTS.map(d => <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={filters.district === d.id} onPress={() => set({ district: filters.district === d.id ? '' : d.id })} />)}
      </ScrollView>
      {summary ? <Text v="caption" muted style={{ marginTop: 8 }}>Showing: {summary}</Text> : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Filter the analysis"
        footer={<Row gap={10}><Button title="Clear all" kind="ghost" onPress={reset} style={{ flex: 1 }} /><Button title="Show results" onPress={() => setOpen(false)} style={{ flex: 1.4 }} /></Row>}>
        {(meta.rounds?.length ?? 0) > 1 ? <Group title="Survey round">
          {meta.rounds.map(r => (
            <Chip key={r.id} label={r.id === meta.currentRoundId ? `${r.name} (current)` : r.name}
              active={filters.round === String(r.id) || (!filters.round && r.id === meta.currentRoundId)}
              onPress={() => set({ round: r.id === meta.currentRoundId ? '' : String(r.id) })} />
          ))}
          <Chip label="All rounds" active={filters.round === 'all'} onPress={() => set({ round: 'all' })} />
        </Group> : null}
        {show.includes('district') ? <Group title="District">
          <Chip label="All" active={!filters.district} onPress={() => set({ district: '' })} />
          {DISTRICTS.map(d => <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={filters.district === d.id} onPress={() => set({ district: d.id })} />)}
        </Group> : null}
        {show.includes('village') ? <Group title="Village">
          <Pressable onPress={() => setPicking(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: RADIUS.md, padding: 14 }}>
            <Feather name="map-pin" size={18} color={c.brand} />
            <Text v="h3" style={{ flex: 1 }}>{village ? `${village.name} (${village.code})` : 'All villages'}</Text>
            <Feather name="search" size={18} color={c.ink3} />
          </Pressable>
        </Group> : null}
        {show.includes('period') ? <Group title="Period">
          {PERIODS.map(p => <Chip key={p.id || 'all'} label={p.label} active={filters.period === p.id} onPress={() => set({ period: p.id })} />)}
        </Group> : null}
        {show.includes('gender') ? <Group title="Respondent gender">
          {[['', 'Any'], ['female', 'Female'], ['male', 'Male'], ['other', 'Other']].map(([v, l]) => <Chip key={v || 'any'} label={l} active={filters.gender === v} onPress={() => set({ gender: v })} />)}
        </Group> : null}
        {show.includes('age') ? <Group title="Respondent age">
          <Chip label="Any" active={!filters.age_group} onPress={() => set({ age_group: '' })} />
          {AGE_GROUPS.map(g => <Chip key={g.id} label={g.label} active={filters.age_group === g.id} onPress={() => set({ age_group: g.id })} />)}
        </Group> : null}
        {show.includes('religion') ? <Group title="Religion">
          {[['', 'Any'], ['buddhist', 'Buddhist'], ['muslim', 'Muslim'], ['hindu', 'Hindu'], ['christian', 'Christian'], ['other', 'Other']].map(([v, l]) =>
            <Chip key={v || 'any'} label={l} active={filters.religion === v} onPress={() => set({ religion: v })} />)}
        </Group> : null}
        {show.includes('band') ? <Group title="Household band">
          <Chip label="Any" active={!filters.band} onPress={() => set({ band: '' })} />
          {BANDS.map(b => <Chip key={b.band} label={`${b.band} ${b.short}`} color={bandColor(b.band)} active={filters.band === String(b.band)} onPress={() => set({ band: String(b.band) })} />)}
        </Group> : null}
        {show.includes('status') ? <Group title="Review status">
          {[['', 'Submitted & approved'], ['submitted', 'Waiting review'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, l]) =>
            <Chip key={v || 'all'} label={l} active={filters.status === v} onPress={() => set({ status: v as Filters['status'] })} />)}
        </Group> : null}
      </Sheet>
      <VillagePicker visible={picking} onClose={() => setPicking(false)} allowAll onlyIds={scope}
        onPick={v => set(v ? { village_id: String(v.id), district: v.district } : { village_id: '' })} />
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: SPACE.lg }}>
      <Text v="label" muted style={{ marginBottom: 8 }}>{title}</Text>
      <Row wrap gap={8}>{children}</Row>
    </View>
  );
}
