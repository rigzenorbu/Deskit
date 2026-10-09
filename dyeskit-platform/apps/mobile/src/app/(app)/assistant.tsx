import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/filters';
import { useMeta } from '@/lib/auth';
import { Badge, Row, Text, tap } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

interface Evidence { title: string; columns: string[]; rows: (string | number | null)[][] }
interface Reply { answer: string; evidence: Evidence[]; mode: 'ai' | 'rules'; suggestions: string[] }
interface Turn { role: 'user' | 'assistant'; text: string; evidence?: Evidence[]; failed?: boolean }

const cell = (x: string | number | null) => (x === null ? '—' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : x);

function EvidenceTable({ e }: { e: Evidence }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: c.line, borderRadius: RADIUS.md, overflow: 'hidden' }}>
      <Text v="caption" style={{ fontFamily: FONT.bold, padding: 8, backgroundColor: c.surface2 }}>{e.title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <Row gap={0} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
            {e.columns.map((col, i) => <Text key={col} v="caption" faint style={{ width: i ? 74 : 150, padding: 6, textAlign: i ? 'right' : 'left' }}>{col}</Text>)}
          </Row>
          {e.rows.slice(0, 12).map((r, ri) => (
            <Row key={ri} gap={0}>
              {r.map((x, i) => <Text key={i} v="small" numberOfLines={2} style={{ width: i ? 74 : 150, padding: 6, textAlign: i ? 'right' : 'left', fontFamily: i ? FONT.bold : undefined }}>{cell(x)}</Text>)}
            </Row>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Ask the data: staff type a question and get an answer built only from the surveys they can see. */
export default function Assistant() {
  const { c } = useTheme();
  const meta = useMeta();
  const { filters } = useFilters();
  const info = useQuery({ queryKey: ['assistant-info'], queryFn: () => api<{ mode: 'ai' | 'rules'; suggestions: string[] }>('/api/assistant') });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<string[] | null>(null);
  const scroll = useRef<ScrollView>(null);
  const round = meta.rounds.find(r => String(r.id) === filters.round);
  const roundLabel = filters.round === 'all' ? 'all rounds' : `round ${round?.name ?? meta.rounds.find(r => r.id === meta.currentRoundId)?.name ?? ''}`;

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    tap();
    const history = turns.filter(t => !t.failed).map(t => ({ role: t.role, text: t.text }));
    setTurns(t => [...t, { role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const r = await api<Reply>('/api/assistant', { method: 'POST', body: { question: q, history, round: filters.round || undefined } });
      setTurns(t => [...t, { role: 'assistant', text: r.answer, evidence: r.evidence }]);
      setNext(r.suggestions);
    } catch (e) {
      setTurns(t => [...t, { role: 'assistant', text: e instanceof Error ? e.message : 'Something went wrong.', failed: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const chips = next ?? info.data?.suggestions ?? [];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title="Ask the data" sub={`Your villages · ${roundLabel}`} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 24, maxWidth: 820, width: '100%', alignSelf: 'center' }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {!turns.length ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: c.brand + '1A', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="message-circle" size={30} color={c.brand} />
            </View>
            <Text v="h2" center style={{ marginTop: 12 }}>Ask about your surveys</Text>
            <Text v="small" muted center style={{ marginTop: 4, maxWidth: 440 }}>
              Answers use only the totals of the villages you can see — never a single household. Every number comes with the table it was taken from.
            </Text>
            {info.data ? (
              <View style={{ marginTop: 10 }}>
                <Badge label={info.data.mode === 'ai' ? 'AI answers (Claude)' : 'Quick answers — AI not switched on'} color={info.data.mode === 'ai' ? c.brand : c.ink3} icon={info.data.mode === 'ai' ? 'zap' : 'list'} />
              </View>
            ) : null}
          </View>
        ) : null}

        {turns.map((t, i) => t.role === 'user' ? (
          <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: c.brand, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14 }}>
            <Text v="body" color="#fff">{t.text}</Text>
          </View>
        ) : (
          <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '96%', backgroundColor: c.surface, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14, marginTop: 14,
            borderWidth: 1, borderColor: t.failed ? c.danger : c.line }}>
            <Text v="body" color={t.failed ? c.danger : undefined}>{t.text}</Text>
            {t.evidence?.map((e, k) => <EvidenceTable key={k} e={e} />)}
          </View>
        ))}
        {busy ? (
          <Row style={{ marginTop: 14 }} gap={8}>
            <Feather name="loader" size={16} color={c.ink3} />
            <Text v="small" faint>Reading the surveys…</Text>
          </Row>
        ) : null}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 28 : 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: SPACE.lg }} keyboardShouldPersistTaps="handled">
          {chips.map(s => (
            <Pressable key={s} disabled={busy} onPress={() => send(s)}
              style={({ pressed }) => ({ borderWidth: 1, borderColor: c.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 7, opacity: pressed || busy ? 0.6 : 1, backgroundColor: c.bg })}>
              <Text v="caption">{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Row style={{ paddingHorizontal: SPACE.lg, marginTop: 8 }} gap={8}>
          <TextInput value={text} onChangeText={setText} placeholder="e.g. Which villages in Kargil need help?" placeholderTextColor={c.ink3}
            onSubmitEditing={() => send(text)} returnKeyType="send" maxLength={500} editable={!busy}
            style={{ flex: 1, backgroundColor: c.bg, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 11, color: c.ink, fontFamily: FONT.regular, fontSize: 15, borderWidth: 1, borderColor: c.line }} />
          <Pressable onPress={() => send(text)} disabled={busy || !text.trim()} accessibilityLabel="Send"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() && !busy ? c.brand : c.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="send" size={18} color={text.trim() && !busy ? '#fff' : c.ink3} />
          </Pressable>
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}
