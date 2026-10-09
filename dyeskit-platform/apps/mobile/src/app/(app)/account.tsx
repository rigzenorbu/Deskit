import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { roleName } from '@dyeskit/core';
import { useAuth, useMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { SPACE, useTheme } from '@/theme';
import { Button, Card, Divider, IconDisc, Input, ListRow, Screen, SectionTitle, Sheet, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

export default function Account() {
  const meta = useMeta();
  const { signOut } = useAuth();
  const { c } = useTheme();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ hasPassword: boolean }>('/api/me') });
  const hasPassword = me.data?.hasPassword ?? true;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [pwOpen, setPwOpen] = useState(false);
  const village = meta.assigned.map(id => meta.villages.find(v => v.id === id)?.name).filter(Boolean);

  const del = async () => {
    setBusy(true);
    try {
      await api('/api/me', { method: 'DELETE', body: { password } });
      toast('Your account has been deleted');
      await signOut();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (pw.next !== pw.again) return toast('The two new passwords do not match', 'error');
    setBusy(true);
    try {
      await api('/api/me/password', { method: 'POST', body: { current: pw.current, password: pw.next } });
      toast(hasPassword ? 'Password changed' : 'Password set — you can now also sign in with it');
      setPwOpen(false); setPw({ current: '', next: '', again: '' }); me.refetch();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Account & privacy" />
      <Screen>
        <Card style={{ paddingVertical: 4 }}>
          <ListRow title={meta.user.name} sub="Name" chevron={false} />
          {meta.user.phone ? <><Divider /><ListRow title={meta.user.phone} sub="Phone — you can sign in with a code sent to it" chevron={false} /></> : null}
          {meta.user.email ? <><Divider /><ListRow title={meta.user.email} sub="Email" chevron={false} /></> : null}
          <Divider />
          <ListRow title={roleName(meta.user.role)} sub="Role — set by an admin" chevron={false} />
          {village.length ? <><Divider /><ListRow title={village.join(', ')} sub="Assigned villages" chevron={false} /></> : null}
        </Card>

        <SectionTitle title="Password" />
        <Card style={{ paddingVertical: 4 }}>
          <ListRow title={hasPassword ? 'Change password' : 'Set a password'}
            sub={hasPassword ? 'You will stay signed in on this phone' : 'Optional: sign in with your phone number and a password, as well as a code'}
            left={<IconDisc icon="lock" color={c.brand} />} onPress={() => setPwOpen(true)} />
        </Card>

        <SectionTitle title="Your data" />
        <Card style={{ paddingVertical: 4 }}>
          <ListRow title="Privacy policy" sub="What we collect, who can see it, and your rights" left={<IconDisc icon="shield" color={c.lake} />}
            onPress={() => router.push('/privacy')} />
        </Card>

        <SectionTitle title="Delete account" />
        <Card>
          <Text v="small" muted>
            Deletes your name, phone and email and signs you out everywhere. Surveys you collected or filled in stay in the project, no longer linked to you.
          </Text>
          <Button title="Delete my account" kind="danger" icon="trash-2" small onPress={() => setOpen(true)} style={{ marginTop: SPACE.md, alignSelf: 'flex-start' }} />
        </Card>
      </Screen>

      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title={hasPassword ? 'Change password' : 'Set a password'}
        footer={<Button title="Save password" loading={busy} disabled={!pw.next || (hasPassword && !pw.current)} onPress={changePassword} />}>
        <View style={{ gap: 12 }}>
          {hasPassword ? <Input label="Current password" icon="lock" value={pw.current} onChangeText={current => setPw({ ...pw, current })} secureTextEntry /> : null}
          <Input label="New password" icon="lock" value={pw.next} onChangeText={next => setPw({ ...pw, next })} secureTextEntry placeholder="At least 8 characters, a letter and a number" />
          <Input label="New password again" icon="lock" value={pw.again} onChangeText={again => setPw({ ...pw, again })} secureTextEntry />
        </View>
      </Sheet>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Delete your account?"
        footer={<Button title="Delete permanently" kind="danger" loading={busy} disabled={hasPassword && !password} onPress={del} />}>
        <Text v="small" muted style={{ marginBottom: 12 }}>This cannot be undone.{hasPassword ? ' Enter your password to confirm.' : ''}</Text>
        {hasPassword ? <Input label="Password" icon="lock" value={password} onChangeText={setPassword} secureTextEntry /> : null}
      </Sheet>
    </View>
  );
}
