import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, IconButton, Input, Row, Text } from '@/components/ui';
import { KindChoice, PrivacyConsent, type Kind } from '@/components/accounts';
import { Hero } from '@/components/scenery';


export default function Register() {
  const { c } = useTheme();
  const { signIn } = useAuth();
  const [kind, setKind] = useState<Kind>('household');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const upd = (k: keyof typeof f) => (v: string) => setF(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!f.name.trim() || !f.email.trim() || !f.password) return setError('Name, email and password are required.');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    if (!accepted) return setError('Please read and accept the privacy policy.');
    setBusy(true);
    try {
      const r = await api<{ active: boolean }>('/api/auth/register', { method: 'POST', body: { name: f.name, email: f.email, phone: f.phone, password: f.password, kind, acceptPrivacy: true } });
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
            ) : (
              <Card style={{ padding: SPACE.xl, gap: 14 }}>
                <KindChoice kind={kind} onChange={setKind} />
                <Input label="Full name" icon="user" value={f.name} onChangeText={upd('name')} placeholder="e.g. Stanzin Dolma" autoComplete="name" />
                <Input label="Email" icon="mail" value={f.email} onChangeText={upd('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.org" />
                <Input label="Phone (optional)" icon="phone" value={f.phone} onChangeText={upd('phone')} keyboardType="phone-pad" placeholder="+91…" />
                <Input label="Password" icon="lock" value={f.password} onChangeText={upd('password')} secureTextEntry placeholder="At least 8 characters, a letter and a number" />
                <Input label="Confirm password" icon="lock" value={f.confirm} onChangeText={upd('confirm')} secureTextEntry placeholder="Type it again" onSubmitEditing={submit} />
                <PrivacyConsent accepted={accepted} onChange={setAccepted} />
                {error ? <Text v="small" color={c.danger}>{error}</Text> : null}
                <Button title={kind === 'household' ? 'Create account and start' : 'Register'} icon="user-plus" loading={busy} onPress={submit} style={{ marginTop: 6 }} />
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
