/**
 * Charts, drawn with react-native-svg and plain views so they look identical on
 * Android, iOS and the web. Each one animates in once when it first appears.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { FONT, RADIUS, scoreColor, useTheme } from '@/theme';
import { Row, Text, tap } from '../ui';

/** 0 → 1 over `ms`, eased; re-runs when `key` changes. */
export function useGrow(key: unknown = 0, ms = 950) {
  const [t, setT] = useState(0);
  useEffect(() => {
    // state is only set from animation frames (the first frame starts near 0)
    let raf = 0; const start = Date.now();
    const step = () => {
      const x = Math.min(1, (Date.now() - start) / ms);
      setT(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms]);
  return t;
}

export function useWidth(initial = 320) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.max(120, Math.round(e.nativeEvent.layout.width))) };
}

/* -------------------------------------------------------------- ring */
export function Ring({ value, size = 160, stroke = 14, color, track, label, sub, light }: {
  value: number | null; size?: number; stroke?: number; color?: string; track?: string; label?: string; sub?: string; light?: boolean;
}) {
  const { c } = useTheme();
  const t = useGrow(value);
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const col = color ?? scoreColor(value);
  const fg = light ? '#fff' : c.ink;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={col} stopOpacity="1" />
            <Stop offset="1" stopColor={col} stopOpacity="0.6" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? (light ? 'rgba(255,255,255,0.18)' : c.surface2)} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ring)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - (v / 100) * t)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text v="display" color={fg} style={{ fontSize: size * 0.24, lineHeight: size * 0.28 }}>{value === null ? '—' : (v * t).toFixed(1)}</Text>
      {label ? <Text v="caption" color={light ? 'rgba(255,255,255,0.8)' : c.ink2}>{label}</Text> : null}
      {sub ? <Text v="caption" color={light ? 'rgba(255,255,255,0.65)' : c.ink3}>{sub}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------- radar */
export function Radar({ axes, series, size: maxSize = 420 }: {
  axes: { label: string; color: string }[];
  series: { label: string; values: (number | null)[]; color: string; dashed?: boolean }[];
  size?: number;
}) {
  const { c } = useTheme();
  const { w, onLayout } = useWidth();
  const t = useGrow(JSON.stringify(series.map(s => s.values)));
  // as wide as the card allows; labels sit outside the web, so leave ~74px for "Intellectual" on each side
  const size = Math.min(w, maxSize);
  const cx = size / 2, cy = size / 2, R = Math.max(60, size / 2 - 74);
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
  };
  return (
    <View onLayout={onLayout} style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map(k => (
          <Polygon key={k} points={axes.map((_, i) => pt(i, k).join(',')).join(' ')} fill={k === 1 ? c.surface2 : 'none'} fillOpacity={0.5} stroke={c.line} strokeWidth={1} />
        ))}
        {axes.map((_, i) => { const [x, y] = pt(i, 1); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={c.line} strokeWidth={1} />; })}
        {series.map((s, si) => (
          <G key={si}>
            <Polygon points={s.values.map((v, i) => pt(i, ((v ?? 0) / 100) * t).join(',')).join(' ')}
              fill={s.color} fillOpacity={s.dashed ? 0 : 0.22} stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.4} strokeDasharray={s.dashed ? '5 4' : undefined} />
            {!s.dashed && s.values.map((v, i) => { const [x, y] = pt(i, ((v ?? 0) / 100) * t); return <Circle key={i} cx={x} cy={y} r={3.6} fill={axes[i].color} stroke={c.surface} strokeWidth={1.5} />; })}
          </G>
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 1.1);
          return <SvgText key={i} x={x} y={y + 4} fontSize={11} fontFamily={FONT.semibold} fill={a.color} textAnchor={x < cx - 8 ? 'end' : x > cx + 8 ? 'start' : 'middle'}>{a.label}</SvgText>;
        })}
      </Svg>
      {series.length > 1 ? (
        <Row gap={16} style={{ marginTop: 4 }}>
          {series.map(s => (
            <Row key={s.label} gap={6}>
              <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: s.color, opacity: s.dashed ? 0.6 : 1 }} />
              <Text v="caption" muted>{s.label}</Text>
            </Row>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------- bar list */
export interface BarItem { key: string; label: string; value: number | null; color?: string; sub?: string; right?: string; onPress?: () => void }

/** Horizontal bars on a 0–max scale, label above each bar. */
export function BarList({ items, max = 100, reference, format = (v: number) => v.toFixed(1), height = 10 }: {
  items: BarItem[]; max?: number; reference?: number | null; format?: (v: number) => string; height?: number;
}) {
  const { c } = useTheme();
  const t = useGrow(items.map(i => i.value).join(','));
  return (
    <View style={{ gap: 12 }}>
      {items.map(it => {
        const pct = it.value === null ? 0 : Math.max(0, Math.min(1, it.value / max));
        const content = (
          <View>
            <Row style={{ justifyContent: 'space-between', marginBottom: 5 }}>
              <Text v="small" style={{ flex: 1, fontFamily: FONT.semibold }} numberOfLines={1}>{it.label}</Text>
              {it.sub ? <Text v="caption" faint>{it.sub}  </Text> : null}
              <Text v="small" style={{ fontFamily: FONT.bold }} color={it.color ?? scoreColor(it.value)}>{it.right ?? (it.value === null ? '—' : format(it.value))}</Text>
            </Row>
            <View style={{ height, borderRadius: height, backgroundColor: c.surface2, overflow: 'hidden' }}>
              <View style={{ width: `${pct * t * 100}%`, height: '100%', borderRadius: height, backgroundColor: it.color ?? scoreColor(it.value) }} />
              {reference !== undefined && reference !== null ? (
                <View style={{ position: 'absolute', left: `${(reference / max) * 100}%`, top: -2, bottom: -2, width: 2, backgroundColor: c.ink2, opacity: 0.55 }} />
              ) : null}
            </View>
          </View>
        );
        return it.onPress ? <Pressable key={it.key} onPress={() => { tap(); it.onPress!(); }}>{content}</Pressable> : <View key={it.key}>{content}</View>;
      })}
    </View>
  );
}

/* ---------------------------------------------------------- columns */
export function Columns({ data, height = 170, max, color, showValues = true, format = (v: number) => String(Math.round(v)) }: {
  data: { key: string; label: string; value: number | null; color?: string; sub?: string }[];
  height?: number; max?: number; color?: string; showValues?: boolean; format?: (v: number) => string;
}) {
  const { c } = useTheme();
  const { w, onLayout } = useWidth();
  const t = useGrow(data.map(d => d.value).join(','));
  const top = max ?? Math.max(1, ...data.map(d => d.value ?? 0));
  const gap = 8, bw = Math.max(8, (w - gap * (data.length - 1)) / Math.max(1, data.length));
  const plotH = height - 34;
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Defs>
          {data.map((d, i) => (
            <LinearGradient key={i} id={`col${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={d.color ?? color ?? c.brand} stopOpacity="1" />
              <Stop offset="1" stopColor={d.color ?? color ?? c.brand} stopOpacity="0.55" />
            </LinearGradient>
          ))}
        </Defs>
        {data.map((d, i) => {
          const h = ((d.value ?? 0) / top) * (plotH - 16) * t;
          const x = i * (bw + gap);
          return (
            <G key={d.key}>
              <Rect x={x} y={plotH - h} width={bw} height={Math.max(h, 1)} rx={Math.min(8, bw / 3)} fill={`url(#col${i})`} />
              {showValues && d.value !== null ? (
                <SvgText x={x + bw / 2} y={plotH - h - 5} fontSize={10.5} fontFamily={FONT.bold} fill={c.ink2} textAnchor="middle">{format(d.value)}</SvgText>
              ) : null}
              <SvgText x={x + bw / 2} y={plotH + 15} fontSize={10.5} fontFamily={FONT.medium} fill={c.ink3} textAnchor="middle">
                {d.label.length > Math.max(4, bw / 6.5) ? d.label.slice(0, Math.max(3, Math.floor(bw / 6.5))) + '…' : d.label}
              </SvgText>
              {d.sub ? <SvgText x={x + bw / 2} y={plotH + 28} fontSize={9.5} fontFamily={FONT.regular} fill={c.ink3} textAnchor="middle">{d.sub}</SvgText> : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/* -------------------------------------------------------- line/area */
export function TrendChart({ points, height = 190, color, max = 100, min = 0, secondary }: {
  points: { label: string; value: number | null }[]; height?: number; color?: string; max?: number; min?: number;
  secondary?: { label: string; values: number[]; color: string };
}) {
  const { c } = useTheme();
  const { w, onLayout } = useWidth();
  const t = useGrow(points.map(p => p.value).join(','));
  const col = color ?? c.brand;
  const padL = 30, padB = 26, padT = 14;
  const plotW = w - padL - 8, plotH = height - padB - padT;
  const valid = points.map((p, i) => ({ ...p, i })).filter(p => p.value !== null);
  const x = (i: number) => padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH * t;
  const line = valid.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.value!)}`).join(' ');
  const area = valid.length ? `${line} L${x(valid[valid.length - 1].i)},${padT + plotH} L${x(valid[0].i)},${padT + plotH} Z` : '';
  const secMax = secondary ? Math.max(1, ...secondary.values) : 1;
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={col} stopOpacity="0.32" />
            <Stop offset="1" stopColor={col} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {[0, 25, 50, 75, 100].filter(g => g >= min && g <= max).map(g => (
          <G key={g}>
            <Line x1={padL} x2={w - 8} y1={padT + plotH - ((g - min) / (max - min)) * plotH} y2={padT + plotH - ((g - min) / (max - min)) * plotH} stroke={c.line} strokeDasharray="3 5" />
            <SvgText x={padL - 6} y={padT + plotH - ((g - min) / (max - min)) * plotH + 4} fontSize={10} fill={c.ink3} textAnchor="end" fontFamily={FONT.medium}>{g}</SvgText>
          </G>
        ))}
        {secondary ? points.map((p, i) => {
          const bh = (secondary.values[i] / secMax) * plotH * 0.45 * t;
          return <Rect key={i} x={x(i) - 7} y={padT + plotH - bh} width={14} height={bh} rx={4} fill={secondary.color} fillOpacity={0.22} />;
        }) : null}
        {area ? <Path d={area} fill="url(#area)" /> : null}
        {line ? <Path d={line} stroke={col} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {valid.map(p => <Circle key={p.i} cx={x(p.i)} cy={y(p.value!)} r={4.5} fill={c.surface} stroke={col} strokeWidth={2.5} />)}
        {points.map((p, i) => (points.length <= 8 || i % Math.ceil(points.length / 8) === 0) ? (
          <SvgText key={i} x={x(i)} y={height - 6} fontSize={10.5} fill={c.ink3} textAnchor="middle" fontFamily={FONT.medium}>{p.label}</SvgText>
        ) : null)}
      </Svg>
      {secondary ? (
        <Row gap={16} style={{ marginTop: 2 }}>
          <Row gap={6}><View style={{ width: 14, height: 3, backgroundColor: col, borderRadius: 2 }} /><Text v="caption" muted>Score</Text></Row>
          <Row gap={6}><View style={{ width: 10, height: 10, backgroundColor: secondary.color, opacity: 0.35, borderRadius: 3 }} /><Text v="caption" muted>{secondary.label}</Text></Row>
        </Row>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- donut */
export function Donut({ data, size = 150, stroke = 22, center, centerSub }: {
  data: { key: string; label: string; value: number; color: string }[]; size?: number; stroke?: number; center?: string; centerSub?: string;
}) {
  const { c } = useTheme();
  const t = useGrow(data.map(d => d.value).join(','));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  // where each segment starts, as a share of the circle (worked out before drawing)
  const starts = data.map((_, i) => data.slice(0, i).reduce((s, d) => s + d.value / total, 0));
  return (
    <Row gap={18} wrap style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surface2} strokeWidth={stroke} fill="none" />
          {data.map((d, i) => (
            <Circle key={d.key} cx={size / 2} cy={size / 2} r={r} stroke={d.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${Math.max(0, (d.value / total) * t * circ - 2)} ${circ}`} strokeDashoffset={-starts[i] * t * circ}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          ))}
        </Svg>
        {center ? <Text v="h2">{center}</Text> : null}
        {centerSub ? <Text v="caption" faint>{centerSub}</Text> : null}
      </View>
      <View style={{ flex: 1, minWidth: 140, gap: 7 }}>
        {data.map(d => (
          <Row key={d.key} gap={8}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: d.color }} />
            <Text v="small" style={{ flex: 1 }} numberOfLines={1}>{d.label}</Text>
            <Text v="small" style={{ fontFamily: FONT.bold }}>{Math.round((d.value / total) * 100)}%</Text>
          </Row>
        ))}
      </View>
    </Row>
  );
}

/* ----------------------------------------------------------- heatmap */
export function Heatmap({ rows, cols, onRowPress }: {
  rows: { key: string; label: string; values: (number | null)[]; id?: number }[];
  cols: { key: string; label: string; color: string }[];
  onRowPress?: (id: number) => void;
}) {
  const { c } = useTheme();
  return (
    <View>
      <Row gap={4} style={{ marginBottom: 6, paddingLeft: 108 }}>
        {cols.map(col => (
          <View key={col.key} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col.color, marginBottom: 2 }} />
            <Text v="caption" faint style={{ fontSize: 9.5 }} numberOfLines={1}>{col.label.slice(0, 4)}</Text>
          </View>
        ))}
      </Row>
      {rows.map(r => (
        <Pressable key={r.key} disabled={!onRowPress || r.id === undefined} onPress={() => { tap(); onRowPress?.(r.id!); }}>
          <Row gap={4} style={{ marginBottom: 4 }}>
            <Text v="caption" style={{ width: 104, fontFamily: FONT.semibold }} numberOfLines={1}>{r.label}</Text>
            {r.values.map((v, i) => (
              <View key={i} style={{ flex: 1, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                backgroundColor: v === null ? c.surface2 : scoreColor(v) + (v < 43 ? 'E6' : 'B3') }}>
                <Text v="caption" color={v === null ? c.ink3 : '#fff'} style={{ fontFamily: FONT.bold, fontSize: 10.5 }}>{v === null ? '–' : Math.round(v)}</Text>
              </View>
            ))}
          </Row>
        </Pressable>
      ))}
    </View>
  );
}

/* ------------------------------------------------- stacked share bar */
export function ShareBar({ parts, height = 16 }: { parts: { key: string; label: string; value: number; color: string }[]; height?: number }) {
  const { c } = useTheme();
  const t = useGrow(parts.map(p => p.value).join(','));
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <View>
      <View style={{ flexDirection: 'row', height, borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: c.surface2 }}>
        {parts.map(p => <View key={p.key} style={{ width: `${(p.value / total) * 100 * t}%`, backgroundColor: p.color }} />)}
      </View>
      <Row wrap gap={12} style={{ marginTop: 10 }}>
        {parts.filter(p => p.value).map(p => (
          <Row key={p.key} gap={5}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: p.color }} />
            <Text v="caption" muted>{p.label} · {p.value}</Text>
          </Row>
        ))}
      </Row>
    </View>
  );
}

/* --------------------------------------------------------- sparkline */
export function Sparkline({ values, width = 90, height = 30, color }: { values: (number | null)[]; width?: number; height?: number; color?: string }) {
  const { c } = useTheme();
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...v) - 2, hi = Math.max(...v) + 2;
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * width},${height - ((x - lo) / (hi - lo)) * height}`).join(' ');
  return <Svg width={width} height={height}><Path d={d} stroke={color ?? c.brand} strokeWidth={2.2} fill="none" strokeLinecap="round" /></Svg>;
}
