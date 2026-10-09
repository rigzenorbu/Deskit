import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FONT, RADIUS, SPACE, useTheme } from '@/theme';
import { api } from '@/lib/api';
import { Button, Card, IconButton, Input, Row, Text, toast } from '@/components/ui';
import { Hero } from '@/components/scenery';
import { CodeInput } from '@/components/accounts';

/** Forgot password: a code goes to the phone number on the account; then choose a new password. */
export default function Forgot() {
  const { c } = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState<null | { message: string; sentTo?: string; devCode?: string }>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState({ next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null); setBusy(true);
    try {
      setSent(await api('/api/auth/otp/send', { method: 'POST', body: { identifier, purpose: 'reset' } }));
      setCode('');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const reset = async () => {
    setError(null);
    if (pw.next !== pw.again) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await api('/api/auth/password/reset', { method: 'POST', body: { identifier, code, password: pw.next } });
      toast('Password changed. Please sign in.');
      router.replace('/');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Hero compact>
            <Row><IconButton icon="arrow-left" bg="rgba(255,255,255,0.18)" color="#fff" onPress={() => router.back()} /></Row>
            <Text v="title" color="#fff" style={{ marginTop: 14 }}>Forgot your password?</Text>
            <Text v="body" color="rgba(255,255,255,0.85)" style={{ marginTop: 4, marginBottom: 30 }}>We’ll text a code to the phone number on your account.</Text>
          </Hero>
          <View style={{ padding: SPACE.lg, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
            <Card style={{ padding: SPACE.xl, gap: 14 }}>
              {!sent ? (
                <>
                  <Input label="Your email or phone number" icon="user" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" placeholder="you@example.org or 98765 43210" />
                  {error ? <Text v="small" color={c.danger}>{error}</Text> : null}
                  <Button title="Send code" icon="message-square" loading={busy} disabled={!identifier.trim()} onPress={send} />
                  <Text v="caption" faint>No phone number on your account? Ask your project admin to set a new password for you.</Text>
                </>
              ) : (
                <>
                  <Text v="small" muted>
                    {sent.sentTo ? <>A code was sent to <Text v="small" style={{ fontFamily: FONT.bold }}>{sent.sentTo}</Text>.</> : sent.message}
                  </Text>
                  <CodeInput value={code} onChange={setCode} />
                  {sent.devCode ? (
                    <Row gap={8} style={{ backgroundColor: c.warning + '1F', padding: 10, borderRadius: RADIUS.sm }}>
                      <Feather name="tool" size={14} color={c.warning} />
                      <Text v="caption" style={{ flex: 1 }}>Test mode (no SMS service yet): your code is <Text v="caption" style={{ fontFamily: FONT.heavy }}>{sent.devCode}</Text></Text>
                    </Row>
                  ) : null}
                  <Input label="New password" icon="lock" value={pw.next} onChangeText={next => setPw({ ...pw, next })} secureTextEntry placeholder="At least 8 characters, a letter and a number" />
                  <Input label="New password again" icon="lock" value={pw.again} onChangeText={again => setPw({ ...pw, again })} secureTextEntry />
                  {error ? <Text v="small" color={c.danger}>{error}</Text> : null}
                  <Button title="Set new password" icon="check" loading={busy} disabled={code.length !== 6 || !pw.next} onPress={reset} />
                  <Button title="Send the code again" kind="ghost" small onPress={send} />
                </>
              )}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
