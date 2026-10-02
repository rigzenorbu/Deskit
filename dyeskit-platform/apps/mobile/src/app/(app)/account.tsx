import React, { useState } from 'react';
import { View } from 'react-native';
import { roleName } from '@dyeskit/core';
import { useAuth, useMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { SPACE, useTheme } from '@/theme';
import { Button, Card, Divider, Input, ListRow, Screen, SectionTitle, Sheet, Text, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';

export default function Account() {
  const meta = useMeta();
  const { signOut } = useAuth();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const village = meta.assigned.map(id => meta.villages.find(v => v.id === id)?.name).filter(Boolean);

  const del = async () => {
    setBusy(true);
    try {
      await api('/api/me', { method: 'DELETE', body: { password } });
      toast('Your account has been deleted');
      await signOut();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Account & privacy" />
      <Screen>
        <Card style={{ paddingVertical: 4 }}>
          <ListRow title={meta.user.name} sub="Name" chevron={false} />
          <Divider />
          <ListRow title={meta.user.email} sub="Email" chevron={false} />
          <Divider />
          <ListRow title={roleName(meta.user.role)} sub="Role — set by an admin" chevron={false} />
          {village.length ? <><Divider /><ListRow title={village.join(', ')} sub="Assigned villages" chevron={false} /></> : null}
        </Card>

        <SectionTitle title="Your data" />
        <Card>
          <Text v="small" muted style={{ lineHeight: 20 }}>
            Surveys are stored on the project server. Household names and phone numbers are visible only to admins, supervisors and the researcher who
            collected them, and are never included in analyst exports. Surveys not yet uploaded stay on this phone, kept separately for each account.
          </Text>
        </Card>

        <SectionTitle title="Delete account" />
        <Card>
          <Text v="small" muted>
            Deletes your name, email and phone number and signs you out everywhere. Surveys you collected stay in the project, no longer linked to you.
          </Text>
          <Button title="Delete my account" kind="danger" icon="trash-2" small onPress={() => setOpen(true)} style={{ marginTop: SPACE.md, alignSelf: 'flex-start' }} />
        </Card>
      </Screen>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Delete your account?"
        footer={<Button title="Delete permanently" kind="danger" loading={busy} disabled={!password} onPress={del} />}>
        <Text v="small" muted style={{ marginBottom: 12 }}>This cannot be undone. Enter your password to confirm.</Text>
        <Input label="Password" icon="lock" value={password} onChangeText={setPassword} secureTextEntry />
      </Sheet>
    </View>
  );
}
