/**
 * A map of Ladakh drawn from the villages' own positions: each district's area is shaded
 * (the outline around its villages), each village is a dot — coloured by score and sized by
 * surveys when surveyed, small and grey when not. Tap a village for its score.
 * Plain SVG: works offline, on phones and the web, with no map service or key.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { DISTRICTS } from '@dyeskit/core';
import { FONT, RADIUS, districtColor, scoreColor, useTheme } from '@/theme';
import { useWidth } from './charts';
import { BandPill, Button, Row, Text, tap } from './ui';

export interface MapVillage {
  id: number; name: string; code: string; district: string; lat: number; lon: number;
  score: number | null; band: number | null; n: number; approximate: boolean;
}

type Pt = [number, number];
/** Convex hull (monotone chain), for each district's shaded area. */
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Grow a polygon a little around its centre, so a district's outline does not cut through its edge villages. */
const pad = (poly: Pt[], by: number): Pt[] => {
  if (!poly.length) return poly;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, y]) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; return [x + (dx / d) * by, y + (dy / d) * by]; });
};

export function LadakhMap({ villages, focus, height = 460 }: { villages: MapVillage[]; focus?: string; height?: number }) {
  const { c, isDark } = useTheme();
  const { w, onLayout } = useWidth();
  const [picked, setPicked] = useState<MapVillage | null>(null);
  const inView = focus ? villages.filter(v => v.district === focus) : villages;

  const geo = useMemo(() => {
    if (!inView.length) return null;
    const lats = inView.map(v => v.lat), lons = inView.map(v => v.lon);
    let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const padDeg = focus ? 0.06 : 0.15;
    minLat -= padDeg; maxLat += padDeg; minLon -= padDeg; maxLon += padDeg;
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);   // keep east–west distances true at this latitude
    const spanX = (maxLon - minLon) * k, spanY = maxLat - minLat;
    const scale = Math.min((w - 24) / spanX, (height - 24) / spanY);
    const ox = (w - spanX * scale) / 2, oy = (height - spanY * scale) / 2;
    const xy = (lat: number, lon: number): Pt => [ox + (lon - minLon) * k * scale, oy + (maxLat - lat) * scale];
    return { xy, scale };
  }, [inView, w, height, focus]);

  if (!geo) {
    return <Text v="small" muted center style={{ paddingVertical: 40 }}>No village in view has a location yet. Admins can add them in Villages & households.</Text>;
  }
  const areas = DISTRICTS.map(d => {
    const pts = inView.filter(v => v.district === d.id).map(v => geo.xy(v.lat, v.lon));
    return { d, poly: pad(hull(pts), 10), pts };
  }).filter(a => a.pts.length);

  return (
    <View onLayout={onLayout}>
      <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: isDark ? '#0E1530' : '#EEF3FA' }}>
        <Svg width={w} height={height}>
          {/* a faint grid, like lines of latitude and longitude */}
          {Array.from({ length: 7 }, (_, i) => <Line key={`h${i}`} x1={0} x2={w} y1={(i + 1) * height / 8} y2={(i + 1) * height / 8} stroke={c.line} strokeDasharray="2 8" />)}
          {Array.from({ length: 7 }, (_, i) => <Line key={`v${i}`} y1={0} y2={height} x1={(i + 1) * w / 8} x2={(i + 1) * w / 8} stroke={c.line} strokeDasharray="2 8" />)}
          {areas.map(({ d, poly }) => poly.length >= 3 ? (
            <Polygon key={d.id} points={poly.map(p => p.join(',')).join(' ')} fill={districtColor(d.id)} fillOpacity={0.12}
              stroke={districtColor(d.id)} strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round" />
          ) : null)}
          {/* unsurveyed villages first, so surveyed ones sit on top */}
          {[...inView].sort((a, b) => (a.n ? 1 : 0) - (b.n ? 1 : 0)).map(v => {
            const [x, y] = geo.xy(v.lat, v.lon);
            const r = v.n ? Math.max(5, Math.min(14, 3 + Math.sqrt(v.n) * 1.3)) : 2.6;
            const on = picked?.id === v.id;
            return (
              <G key={v.id} onPress={() => { tap(); setPicked(v); }}>
                {v.n ? <Circle cx={x} cy={y} r={r + 5} fill={scoreColor(v.score)} fillOpacity={0.18} /> : null}
                <Circle cx={x} cy={y} r={on ? r + 3 : r} fill={v.n ? scoreColor(v.score) : c.ink3} fillOpacity={v.n ? 1 : 0.55}
                  stroke={on ? c.ink : c.surface} strokeWidth={on ? 2.5 : v.n ? 1.6 : 0.8} />
                {/* a bigger invisible target, easier to tap */}
                <Circle cx={x} cy={y} r={Math.max(r, 9)} fill="transparent" />
              </G>
            );
          })}
          {areas.map(({ d, pts }) => {
            const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
            return <SvgText key={`l${d.id}`} x={cx} y={Math.min(height - 8, Math.max(14, cy - 12))} fill={districtColor(d.id)} fontSize={focus ? 14 : 12}
              fontFamily={FONT.heavy} textAnchor="middle" opacity={0.85}>{d.name.toUpperCase()}</SvgText>;
          })}
        </Svg>
      </View>

      {picked ? (
        <View style={{ marginTop: 10, backgroundColor: c.surface, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1, borderColor: c.line }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text v="h3">{picked.name} <Text v="small" faint>{picked.code}</Text></Text>
              <Text v="caption" muted>{DISTRICTS.find(d => d.id === picked.district)?.name} district
                {picked.n ? ` · ${picked.n} surveys` : ' · not surveyed yet'}{picked.approximate ? ' · location approximate' : ''}</Text>
            </View>
            {picked.n ? <BandPill band={picked.band} score={picked.score} size="sm" /> : null}
            <Pressable onPress={() => setPicked(null)} hitSlop={10}><Feather name="x" size={18} color={c.ink3} /></Pressable>
          </Row>
          <Button title="Open village" icon="arrow-right" small kind="secondary" style={{ marginTop: 10, alignSelf: 'flex-start' }}
            onPress={() => router.push(`/village/${picked.id}`)} />
        </View>
      ) : (
        <Text v="caption" faint center style={{ marginTop: 8 }}>Tap a village. Bigger dots have more surveys; colour shows the score.</Text>
      )}
    </View>
  );
}
