/**
 * Pieces shared by the ways of signing in and registering: the household/staff choice, the
 * privacy consent, and signing in with a phone number and a one-time code.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View, Platform } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Input, Row, Text, tap, toast, type IconName } from './ui';

export type Kind = 'household' | 'staff';
const KINDS: { id: Kind; icon: IconName; title: string; text: string }[] = [
  { id: 'household', icon: 'home', title: 'My household', text: 'I want to fill in my own household’s details. You can start right away.' },
  { id: 'staff', icon: 'briefcase', title: 'Project staff', text: 'I collect surveys for the project. An admin approves staff accounts first.' },
];

export function KindChoice({ kind, onChange }: { kind: Kind; onChange: (k: Kind) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text v="label" muted>I am registering for</Text>
      {KINDS.map(k => {
        const on = kind === k.id;
        return (
          <Pressable key={k.id} onPress={() => { tap(); onChange(k.id); }}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: RADIUS.md, borderWidth: 2,
              borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.surface }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: on ? c.brand : c.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={k.icon} size={19} color={on ? '#fff' : c.ink2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text v="h3">{k.title}</Text>
              <Text v="small" muted>{k.text}</Text>
            </View>
            <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? c.brand : c.ink3} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** The privacy consent tick box, with a link to read the policy. */
export function PrivacyConsent({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void }) {
  const { c } = useTheme();
  return (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <Pressable onPress={() => { tap(); onChange(!accepted); }} hitSlop={8}
        style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: accepted ? c.success : c.ink3, backgroundColor: accepted ? c.success : 'transparent',
          alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {accepted ? <Feather name="check" size={16} color="#fff" /> : null}
      </Pressable>
      <Text v="small" style={{ flex: 1, lineHeight: 20 }}>
        I have read and agree to the{' '}
        <Text v="small" color={c.brand} style={{ fontFamily: FONT.bold }} onPress={() => router.push('/privacy')}>privacy policy</Text>
        : my answers are private and are only shown as totals.
      </Text>
    </Row>
  );
}

/** Six boxes for a six-digit code (one hidden input underneath). */
export function CodeInput({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone?: (code: string) => void }) {
  const { c } = useTheme();
  return (
    <View>
      <Row gap={8} style={{ justifyContent: 'center' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={{ width: 44, height: 54, borderRadius: 12, borderWidth: 2, borderColor: i === value.length ? c.brand : c.line,
            backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="title">{value[i] ?? ''}</Text>
          </View>
        ))}
      </Row>
      <TextInput value={value} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6}
        onChangeText={t => { const d = t.replace(/\D/g, '').slice(0, 6); onChange(d); if (d.length === 6) onDone?.(d); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
    </View>
  );
}

type Step = 'phone' | 'code' | 'account' | 'pending';

/** Sign in or register with a phone number and a code sent by text message. */
export function PhoneSignIn() {
  const { acceptToken } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('household');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const h = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(h);
  }, [wait]);

  const run = async (fn: () => Promise<void>) => {
    setError(null); setBusy(true);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const send = () => run(async () => {
    const r = await api<{ sentTo: string; devCode?: string }>('/api/auth/otp/send', { method: 'POST', body: { phone, purpose: 'signin' } });
    setSentTo(r.sentTo); setDevCode(r.devCode ?? null); setCode(''); setStep('code'); setWait(30);
  });

  const verify = (c6 = code) => run(async () => {
    if (c6.length !== 6) throw new Error('Enter the 6-digit code.');
    const r = await api<{ token?: string; needsAccount?: boolean; ticket?: string }>('/api/auth/otp/verify', { method: 'POST', body: { phone, code: c6 } });
    if (r.needsAccount && r.ticket) { setTicket(r.ticket); setStep('account'); return; }
    if (r.token) await acceptToken(r.token);
  });

  const register = () => run(async () => {
    if (!name.trim()) throw new Error('Please enter your name.');
    if (!accepted) throw new Error('Please read and accept the privacy policy.');
    const r = await api<{ active: boolean; token?: string }>('/api/auth/register-phone', { method: 'POST', body: { ticket, name, kind, acceptPrivacy: true } });
    if (r.active && r.token) { toast('Welcome! Your account is ready.'); await acceptToken(r.token); }
    else setStep('pending');
  });

  const errorBox = error ? (
    <Row style={{ backgroundColor: c.danger + '18', borderRadius: RADIUS.md, padding: 12, marginTop: 12 }}>
      <Feather name="alert-circle" size={16} color={c.danger} /><Text v="small" color={c.danger} style={{ flex: 1 }}>{error}</Text>
    </Row>
  ) : null;

  if (step === 'pending') {
    return (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: SPACE.md }}>
        <Feather name="clock" size={40} color={c.warning} />
        <Text v="h2" center>Registration received</Text>
        <Text v="small" muted center>An admin will review your staff account. Sign in with your phone number once it is approved.</Text>
        <Button title="Back" kind="ghost" onPress={() => { setStep('phone'); setCode(''); }} style={{ alignSelf: 'stretch', marginTop: SPACE.md }} />
      </View>
    );
  }

  if (step === 'account') {
    return (
      <View style={{ gap: 14 }}>
        <Row gap={8}><Feather name="check-circle" size={18} color={c.success} /><Text v="h3" style={{ flex: 1 }}>Number verified — {sentTo}</Text></Row>
        <Text v="small" muted>This number is new to DYESKIT. Tell us your name to create your account.</Text>
        <Input label="Your name" icon="user" value={name} onChangeText={setName} placeholder="e.g. Stanzin Dolma" autoComplete="name" />
        <KindChoice kind={kind} onChange={setKind} />
        <PrivacyConsent accepted={accepted} onChange={setAccepted} />
        {errorBox}
        <Button title={kind === 'household' ? 'Create account and start' : 'Register'} icon="user-plus" loading={busy} onPress={register} />
      </View>
    );
  }

  if (step === 'code') {
    return (
      <View>
        <Text v="small" muted style={{ marginBottom: 14 }}>We sent a 6-digit code to <Text v="small" style={{ fontFamily: FONT.bold }}>{sentTo}</Text>.</Text>
        <CodeInput value={code} onChange={setCode} onDone={v => verify(v)} />
        {devCode ? (
          <Row gap={8} style={{ marginTop: 12, backgroundColor: c.warning + '1F', padding: 10, borderRadius: RADIUS.sm }}>
            <Feather name="tool" size={14} color={c.warning} />
            <Text v="caption" style={{ flex: 1 }}>Test mode (no SMS service yet): your code is <Text v="caption" style={{ fontFamily: FONT.heavy }}>{devCode}</Text></Text>
          </Row>
        ) : null}
        {errorBox}
        <Button title="Verify and continue" icon="check" loading={busy} onPress={() => verify()} style={{ marginTop: SPACE.lg }} />
        <Row style={{ justifyContent: 'space-between', marginTop: SPACE.md }}>
          <Pressable onPress={() => { setStep('phone'); setError(null); }}><Text v="small" color={c.brand}>Change number</Text></Pressable>
          <Pressable disabled={wait > 0 || busy} onPress={send}>
            <Text v="small" color={wait > 0 ? c.ink3 : c.brand}>{wait > 0 ? `Send again in ${wait}s` : 'Send the code again'}</Text>
          </Pressable>
        </Row>
      </View>
    );
  }

  return (
    <View>
      <Text v="label" muted style={{ marginBottom: 6 }}>Mobile number</Text>
      <Row style={{ backgroundColor: c.surface, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: c.line, paddingHorizontal: 14, height: 52 }}>
        <Text v="h3" muted>+91</Text>
        <View style={{ width: 1, height: 24, backgroundColor: c.line }} />
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98765 43210"
          placeholderTextColor={c.ink3} onSubmitEditing={send} returnKeyType="send"
          style={{ flex: 1, fontFamily: FONT.semibold, fontSize: 17, color: c.ink, height: '100%', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
      </Row>
      <Text v="caption" faint style={{ marginTop: 6 }}>We’ll text you a code. No password needed. New here? This also creates your account.</Text>
      {errorBox}
      <Button title="Send code" icon="message-square" loading={busy} disabled={phone.replace(/\D/g, '').length < 10} onPress={send} style={{ marginTop: SPACE.lg }} />
    </View>
  );
}
