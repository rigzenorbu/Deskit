import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, IconButton, Input, Row, Text } from '@/components/ui';
import { CodeInput, KindChoice, PrivacyConsent, type Kind } from '@/components/accounts';
import { Hero } from '@/components/scenery';

/**
 * Register with email and password. When the server can send text messages, the phone number is
 * required and confirmed with a 6-digit code before the account is created.
 */
export default function Register() {
  const { c } = useTheme();
  const { signIn } = useAuth();
  const [kind, setKind] = useState<Kind>('household');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // phone confirmation: on when the server can send codes
  const [verify, setVerify] = useState(false);
  const [sent, setSent] = useState<null | { sentTo: string; devCode?: string }>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const upd = (k: keyof typeof f) => (v: string) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    api<{ phoneSignIn?: boolean }>('/api/health').then(h => setVerify(!!h.phoneSignIn)).catch(() => {});
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const h = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(h);
  }, [wait]);

  /** Check the form, then text a code to the phone (or create the account straight away when codes are off). */
  const next = async () => {
    setError(null);
    if (!f.name.trim() || !f.email.trim() || !f.password) return setError('Name, email and password are required.');
    // ask again: texting codes may have been switched on or off since this screen opened
    const h = await api<{ phoneSignIn?: boolean }>('/api/health').catch(() => null);
    const codes = h ? !!h.phoneSignIn : verify;
    setVerify(codes);
    if (codes && !f.phone.trim()) return setError('Please enter your mobile number. We text a code to confirm it.');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    if (!accepted) return setError('Please read and accept the privacy policy.');
    if (!codes) return create('', false);
    setBusy(true);
    try {
      setSent(await api('/api/auth/otp/send', { method: 'POST', body: { phone: f.phone, purpose: 'register' } }));
      setCode(''); setWait(30);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const create = async (c6: string, needCode = verify) => {
    setError(null);
    if (needCode && c6.length !== 6) return setError('Enter the 6-digit code.');
    setBusy(true);
    try {
      const r = await api<{ active: boolean }>('/api/auth/register', { method: 'POST', body: { name: f.name, email: f.email, phone: f.phone, code: c6, password: f.password, kind, acceptPrivacy: true } });
      // household members go straight in; staff wait for approval
      if (r.active) await signIn(f.email.trim(), f.password);
      else setDone(true);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Hero compact>
            <Row><IconButton icon="arrow-left" bg="rgba(255,255,255,0.18)" color="#fff" onPress={() => router.back()} /></Row>
            <Text v="title" color="#fff" style={{ marginTop: 14 }}>Create your account</Text>
            <Text v="body" color="rgba(255,255,255,0.85)" style={{ marginTop: 4, marginBottom: 30 }}>
              Fill in your household’s details yourself, or join as project staff.
            </Text>
          </Hero>
          <View style={{ padding: SPACE.lg, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
            {done ? (
              <Card style={{ alignItems: 'center', padding: SPACE.xxl }}>
                <Animated.View entering={ZoomIn.duration(500)} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.success + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={42} color={c.success} />
                </Animated.View>
                <Text v="title" center style={{ marginTop: 18 }}>Registration received</Text>
                <Text v="body" muted center style={{ marginTop: 8 }}>
                  Status: review in progress. Once an admin approves your account and assigns your villages, you can sign in with {f.email}.
                </Text>
                <Button title="Back to sign in" onPress={() => router.replace('/')} style={{ marginTop: SPACE.xl, alignSelf: 'stretch' }} />
              </Card>
            ) : sent ? (
              <Card style={{ padding: SPACE.xl, gap: 14 }}>
                <Row gap={8}><Feather name="shield" size={18} color={c.brand} /><Text v="h3" style={{ flex: 1 }}>Confirm your phone number</Text></Row>
                <Text v="small" muted>We sent a 6-digit code to <Text v="small" style={{ fontFamily: FONT.bold }}>{sent.sentTo}</Text>. Enter it to create your account.</Text>
                <CodeInput value={code} onChange={setCode} onDone={create} />
                {sent.devCode ? (
                  <Row gap={8} style={{ backgroundColor: c.warning + '1F', padding: 10, borderRadius: RADIUS.sm }}>
                    <Feather name="tool" size={14} color={c.warning} />
                    <Text v="caption" style={{ flex: 1 }}>Test mode (no SMS service yet): your code is <Text v="caption" style={{ fontFamily: FONT.heavy }}>{sent.devCode}</Text></Text>
                  </Row>
                ) : null}
                {error ? <Text v="small" color={c.danger}>{error}</Text> : null}
                <Button title={kind === 'household' ? 'Confirm and start' : 'Confirm and register'} icon="check" loading={busy} onPress={() => create(code)} />
                <Row style={{ justifyContent: 'space-between' }}>
                  <Pressable onPress={() => { setSent(null); setError(null); }}><Text v="small" color={c.brand}>Change details</Text></Pressable>
                  <Pressable disabled={wait > 0 || busy} onPress={next}>
                    <Text v="small" color={wait > 0 ? c.ink3 : c.brand}>{wait > 0 ? `Send again in ${wait}s` : 'Send the code again'}</Text>
                  </Pressable>
                </Row>
              </Card>
            ) : (
              <Card style={{ padding: SPACE.xl, gap: 14 }}>
                <KindChoice kind={kind} onChange={setKind} />
                <Input label="Full name" icon="user" value={f.name} onChangeText={upd('name')} placeholder="e.g. Stanzin Dolma" autoComplete="name" />
                <Input label="Email" icon="mail" value={f.email} onChangeText={upd('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.org" />
                <Input label={verify ? 'Mobile number' : 'Phone (optional)'} icon="phone" value={f.phone} onChangeText={upd('phone')} keyboardType="phone-pad" placeholder="+91…" />
                <Input label="Password" icon="lock" value={f.password} onChangeText={upd('password')} secureTextEntry placeholder="At least 8 characters, a letter and a number" />
                <Input label="Confirm password" icon="lock" value={f.confirm} onChangeText={upd('confirm')} secureTextEntry placeholder="Type it again" onSubmitEditing={next} />
                {verify ? <Text v="caption" faint>We’ll text a code to your mobile to confirm it is yours.</Text> : null}
                <PrivacyConsent accepted={accepted} onChange={setAccepted} />
                {error ? <Text v="small" color={c.danger}>{error}</Text> : null}
                <Button title={verify ? 'Send code' : kind === 'household' ? 'Create account and start' : 'Register'} icon={verify ? 'message-square' : 'user-plus'} loading={busy} onPress={next} style={{ marginTop: 6 }} />
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
