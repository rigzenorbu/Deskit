import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DIMENSIONS } from '@dyeskit/core';
import { DIM_COLORS, DIM_ICONS, FONT, GRADIENTS, RADIUS, SPACE, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { serverUrl, setServerUrl } from '@/lib/config';
import { Button, Card, Input, Row, Sheet, Text } from '@/components/ui';
import { Logo, Mountains, PrayerFlags } from '@/components/scenery';

const DEMO = [
  { role: 'Admin', email: 'admin@dyeskit.org', password: 'Admin@123' },
  { role: 'Supervisor', email: 'supervisor@dyeskit.org', password: 'Super@123' },
  { role: 'Field Researcher', email: 'collector@dyeskit.org', password: 'Collect@123' },
  { role: 'Analyst', email: 'analyst@dyeskit.org', password: 'Analyst@123' },
  { role: 'Viewer', email: 'viewer@dyeskit.org', password: 'Viewer@123' },
];

export default function SignIn() {
  const { signIn } = useAuth();
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(390);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [server, setServer] = useState(serverUrl());

  const checkServer = () => api<{ demo: boolean }>('/api/health').then(h => setDemo(!!h.demo)).catch(() => setDemo(false));
  useEffect(() => { checkServer(); }, []);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try { await signIn(email.trim(), password); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          <LinearGradient colors={isDark ? GRADIENTS.heroDark : GRADIENTS.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + 8, paddingBottom: 90, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' }}>
            <PrayerFlags width={w} count={17} />
            <View style={{ position: 'absolute', bottom: 0, left: 0 }}><Mountains width={w} height={140} /></View>
            <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 18, position: 'relative', zIndex: 1 }}>
              <Animated.View entering={ZoomIn.duration(600)}><Logo size={84} /></Animated.View>
              <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ alignItems: 'center' }}>
                <Text v="display" color="#fff" style={{ marginTop: 16, letterSpacing: 4 }}>DYESKIT</Text>
                <Text v="body" color="rgba(255,255,255,0.85)" center style={{ marginTop: 4 }}>Village well-being across Ladakh</Text>
              </Animated.View>
              <Row gap={10} style={{ marginTop: 22 }}>
                {DIMENSIONS.map((d, i) => (
                  <Animated.View key={d.id} entering={FadeInUp.delay(300 + i * 70).duration(450)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: DIM_COLORS[d.id], alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }}>
                    <Feather name={DIM_ICONS[d.id]} size={16} color="#fff" />
                  </Animated.View>
                ))}
              </Row>
              <Text v="caption" color="rgba(255,255,255,0.7)" style={{ marginTop: 8 }}>Seven dimensions · Seven districts · One picture</Text>
            </View>
          </LinearGradient>

          <Animated.View entering={FadeInUp.delay(250).duration(500)} style={{ marginTop: -64, paddingHorizontal: SPACE.lg, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
            <Card style={{ padding: SPACE.xl }}>
              <Text v="title">Julley! 👋</Text>
              <Text v="body" muted style={{ marginTop: 4, marginBottom: SPACE.lg }}>Sign in to continue.</Text>
              <Input label="Email" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                autoComplete="email" placeholder="you@example.org" returnKeyType="next" />
              <View style={{ height: 14 }} />
              <Input label="Password" icon="lock" value={password} onChangeText={setPassword} secureTextEntry={!show}
                autoComplete="password" placeholder="Your password" returnKeyType="go" onSubmitEditing={submit} />
              <Pressable onPress={() => setShow(s => !s)} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                <Text v="small" color={c.brand}>{show ? 'Hide password' : 'Show password'}</Text>
              </Pressable>
              {error ? (
                <Row style={{ backgroundColor: c.danger + '18', borderRadius: RADIUS.md, padding: 12, marginTop: 12 }}>
                  <Feather name="alert-circle" size={16} color={c.danger} />
                  <Text v="small" color={c.danger} style={{ flex: 1 }}>{error}</Text>
                </Row>
              ) : null}
              <Button title="Sign in" icon="log-in" loading={busy} onPress={submit} style={{ marginTop: SPACE.lg }} />
              <Row style={{ justifyContent: 'center', marginTop: SPACE.lg }}>
                <Text v="small" muted>New field researcher?</Text>
                <Pressable onPress={() => router.push('/register')}><Text v="small" color={c.brand} style={{ fontFamily: FONT.bold }}>Register</Text></Pressable>
              </Row>
            </Card>

            {demo ? (
              <Card style={{ marginTop: SPACE.md }}>
                <Text v="label" muted>Demo accounts — tap to fill</Text>
                <Row wrap gap={8} style={{ marginTop: 10 }}>
                  {DEMO.map(d => (
                    <Pressable key={d.email} onPress={() => { setEmail(d.email); setPassword(d.password); }}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: c.brandSoft }}>
                      <Text v="small" color={c.brand} style={{ fontFamily: FONT.semibold }}>{d.role}</Text>
                    </Pressable>
                  ))}
                </Row>
              </Card>
            ) : null}

            <Pressable onPress={() => setServerOpen(true)} style={{ alignSelf: 'center', padding: 16, marginBottom: insets.bottom + 8 }}>
              <Row gap={6}><Feather name="server" size={13} color={c.ink3} /><Text v="caption" faint>Server: {serverUrl().replace(/^https?:\/\//, '')}</Text></Row>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={serverOpen} onClose={() => setServerOpen(false)} title="Server address">
        <Text v="small" muted style={{ marginBottom: 12 }}>
          Only change this if your coordinator asked you to — for example while testing on a phone on the same Wi-Fi as the server computer.
        </Text>
        <Input value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" placeholder="https://…" icon="globe" />
        <Row gap={10} style={{ marginTop: 16 }}>
          <Button title="Reset" kind="ghost" style={{ flex: 1 }} onPress={async () => { await setServerUrl(null); setServer(serverUrl()); checkServer(); setServerOpen(false); }} />
          <Button title="Save" style={{ flex: 1.4 }} onPress={async () => { await setServerUrl(server.trim() || null); checkServer(); setServerOpen(false); }} />
        </Row>
      </Sheet>
    </View>
  );
}
