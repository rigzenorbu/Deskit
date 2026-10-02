/**
 * One input per question type. Used by the survey and by supervisors correcting a survey.
 */
import React from 'react';
import { Pressable, TextInput, View, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { bmiPoints, type Item } from '@dyeskit/core';
import { FONT, RADIUS, scoreColor, useTheme } from '@/theme';
import { Row, Text, tap } from './ui';

type Value = unknown;
const EXCLUSIVE = ['none', 'PNA', 'DK'];

export function QuestionInput({ item, value, onChange, accent, villageName }: {
  item: Item; value: Value; onChange: (v: Value) => void; accent: string; villageName?: string;
}) {
  const { c } = useTheme();

  if (item.type === 'village') {
    return (
      <Row style={{ backgroundColor: c.surface2, borderRadius: RADIUS.md, padding: 14 }}>
        <Feather name="map-pin" size={18} color={accent} />
        <Text v="h3">{villageName ?? String(value ?? '')}</Text>
        <Text v="caption" faint style={{ marginLeft: 'auto' }}>from step 1</Text>
      </Row>
    );
  }

  if (item.type === 'single') {
    return (
      <View style={{ gap: 8 }}>
        {item.options!.map(op => {
          const on = value === op.v;
          return (
            <Pressable key={op.v} onPress={() => { tap(); onChange(on ? undefined : op.v); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADIUS.md, borderWidth: 1.5,
                borderColor: on ? accent : c.line, backgroundColor: on ? accent + '18' : c.surface, opacity: pressed ? 0.85 : 1,
              })}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? accent : c.ink3, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: accent }} /> : null}
              </View>
              <Text v="body" style={{ flex: 1, fontFamily: on ? FONT.semibold : FONT.regular }} muted={!!op.neutral && !on}>{op.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (item.type === 'scale') {
    const opts = item.options!;
    return (
      <View>
        <Row gap={6}>
          {opts.map((op, i) => {
            const on = value === op.v;
            return (
              <Pressable key={op.v} onPress={() => { tap(); onChange(on ? undefined : op.v); }}
                style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1.5,
                  borderColor: on ? accent : c.line, backgroundColor: on ? accent : c.surface, opacity: pressed ? 0.85 : 1 })}>
                <Text v="h2" color={on ? '#fff' : c.ink}>{i + 1}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <Text v="caption" faint>{opts[0].label}</Text>
          <Text v="caption" faint>{opts[opts.length - 1].label}</Text>
        </Row>
        {value ? <Text v="small" color={accent} center style={{ marginTop: 6, fontFamily: FONT.semibold }}>{opts.find(o => o.v === value)?.label}</Text> : null}
      </View>
    );
  }

  if (item.type === 'multi') {
    const cur = new Set(Array.isArray(value) ? (value as string[]) : []);
    const toggle = (v: string) => {
      tap();
      const next = new Set(cur);
      if (next.has(v)) next.delete(v);
      else if (EXCLUSIVE.includes(v)) { next.clear(); next.add(v); }
      else { EXCLUSIVE.forEach(x => next.delete(x)); next.add(v); }
      onChange([...next]);
    };
    return (
      <View style={{ gap: 8 }}>
        <Text v="caption" faint>Tick all that apply</Text>
        {item.options!.map(op => {
          const on = cur.has(op.v);
          return (
            <Pressable key={op.v} onPress={() => toggle(op.v)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADIUS.md, borderWidth: 1.5,
                borderColor: on ? accent : c.line, backgroundColor: on ? accent + '18' : c.surface, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? accent : c.ink3, backgroundColor: on ? accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Feather name="check" size={14} color="#fff" /> : null}
              </View>
              <Text v="body" style={{ flex: 1, fontFamily: on ? FONT.semibold : FONT.regular }}>{op.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (item.type === 'rank3') {
    const cur = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (v: string) => {
      tap();
      if (cur.includes(v)) onChange(cur.filter(x => x !== v));
      else if (cur.length < 3) onChange([...cur, v]);
    };
    return (
      <View>
        <Text v="caption" faint style={{ marginBottom: 8 }}>Tap in order of importance — {3 - cur.length} left</Text>
        <Row wrap gap={8}>
          {item.options!.map(op => {
            const rank = cur.indexOf(op.v);
            return (
              <Pressable key={op.v} onPress={() => toggle(op.v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.pill,
                  borderWidth: 1.5, borderColor: rank >= 0 ? accent : c.line, backgroundColor: rank >= 0 ? accent + '18' : c.surface }}>
                {rank >= 0 ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text v="caption" color="#fff" style={{ fontFamily: FONT.bold }}>{rank + 1}</Text>
                  </View>
                ) : null}
                <Text v="small" style={{ fontFamily: FONT.semibold }}>{op.label}</Text>
              </Pressable>
            );
          })}
        </Row>
      </View>
    );
  }

  if (item.type === 'number') {
    const n = value === undefined || value === null || value === '' ? null : Number(value);
    const clamp = (x: number) => Math.min(item.max ?? 9999, Math.max(item.min ?? 0, x));
    return (
      <View>
        <Row gap={10}>
          <StepButton icon="minus" onPress={() => onChange(clamp((n ?? (item.min ?? 0) + 1) - 1))} />
          <NumberField value={n} onChange={x => onChange(x === null ? undefined : clamp(x))} />
          <StepButton icon="plus" onPress={() => onChange(clamp((n ?? (item.min ?? 0) - 1) + 1))} />
        </Row>
        {item.unit ? <Text v="caption" faint center style={{ marginTop: 4 }}>{item.unit}</Text> : null}
      </View>
    );
  }

  if (item.type === 'measure') {
    const cur = (value ?? {}) as Record<string, number | undefined>;
    const bmi = bmiPoints(cur.height_cm, cur.weight_kg);
    return (
      <View>
        <Row gap={10}>
          {item.fields!.map(f => (
            <View key={f.k} style={{ flex: 1 }}>
              <Text v="caption" faint style={{ marginBottom: 4 }}>{f.label}</Text>
              <NumberField value={cur[f.k] ?? null} unit={f.unit} onChange={x => {
                const next = { ...cur, [f.k]: x ?? undefined };
                onChange(Object.values(next).some(v => v !== undefined) ? next : undefined);
              }} />
            </View>
          ))}
        </Row>
        {bmi ? (
          <Row style={{ marginTop: 10, backgroundColor: scoreColor(bmi.points) + '1C', padding: 10, borderRadius: RADIUS.md }}>
            <Feather name="activity" size={16} color={scoreColor(bmi.points)} />
            <Text v="small" color={scoreColor(bmi.points)} style={{ fontFamily: FONT.semibold }}>BMI {bmi.bmi} → {bmi.points} points</Text>
          </Row>
        ) : null}
      </View>
    );
  }

  // text
  return (
    <TextInput value={String(value ?? '')} onChangeText={t => onChange(t || undefined)} placeholder="Type here" placeholderTextColor={c.ink3} multiline
      style={{ minHeight: 70, borderWidth: 1.5, borderColor: c.line, borderRadius: RADIUS.md, padding: 12, fontFamily: FONT.regular, fontSize: 15, color: c.ink, backgroundColor: c.surface,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
  );
}

function StepButton({ icon, onPress }: { icon: 'minus' | 'plus'; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Feather name={icon} size={20} color={c.ink} />
    </Pressable>
  );
}

function NumberField({ value, onChange, unit }: { value: number | null; onChange: (n: number | null) => void; unit?: string }) {
  const { c } = useTheme();
  return (
    <Row style={{ flex: 1, height: 52, borderWidth: 1.5, borderColor: c.line, borderRadius: RADIUS.md, paddingHorizontal: 14, backgroundColor: c.surface }}>
      <TextInput value={value === null || value === undefined || Number.isNaN(value) ? '' : String(value)} keyboardType="numeric" placeholder="—" placeholderTextColor={c.ink3}
        onChangeText={t => { const x = t.replace(/[^\d.]/g, ''); onChange(x === '' ? null : Number(x)); }}
        style={{ flex: 1, fontFamily: FONT.bold, fontSize: 18, color: c.ink, textAlign: 'center', height: '100%', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
      {unit ? <Text v="small" faint>{unit}</Text> : null}
    </Row>
  );
}
