import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DISTRICTS, ROLES, roleName, type Role } from '@dyeskit/core';
import { FONT, RADIUS, SPACE, districtColor, useTheme } from '@/theme';
import { useMeta } from '@/lib/auth';
import { api } from '@/lib/api';
import { districtName, fmtDate } from '@/lib/format';
import { Badge, Button, Card, Chip, Empty, ErrorBox, IconButton, Input, Loading, Row, Screen, SearchBar, SectionTitle, Sheet, Text, tap, toast } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { villageMatches } from '@/components/pickers';

interface U { id: number; name: string; email: string | null; phone: string | null; role: Role; status: string; created_at: string; last_login: string | null; villages: { id: number; name: string; district: string }[] }

export default function Users() {
  const meta = useMeta();
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<{ rows: U[] }>('/api/users') });
  const [edit, setEdit] = useState<U | null>(null);
  const [assign, setAssign] = useState<U | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<U | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('User deleted'); setRemoving(null); setEdit(null); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => api(`/api/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Saved'); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const rows = (q.data?.rows ?? []).filter(u => !search || `${u.name} ${u.email ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const pending = rows.filter(u => u.status === 'pending');
  const others = rows.filter(u => u.status !== 'pending');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="Users & approvals" sub={q.data ? `${q.data.rows.length} accounts` : undefined}
        right={<IconButton icon="user-plus" onPress={() => setAdding(true)} bg={c.brandSoft} color={c.brand} />} />
      <Screen>
        <SearchBar value={search} onChange={setSearch} placeholder="Name or email" />
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
          <>
            {pending.length ? <SectionTitle title="Waiting for approval" sub="New field researchers who registered in the app" /> : null}
            {pending.map(u => (
              <Card key={u.id} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: c.warning }}>
                <Text v="h3">{u.name}</Text>
                <Text v="small" muted>{[u.email, u.phone].filter(Boolean).join(' · ')} · registered {fmtDate(u.created_at)}</Text>
                <Row gap={8} style={{ marginTop: 12 }} wrap>
                  <Button title="Approve" small icon="check" gradient={['#22B07D', '#14A3A8']} onPress={() => patch.mutate({ id: u.id, body: { status: 'active' } })} />
                  <Button title="Approve & assign villages" small kind="secondary" onPress={() => { patch.mutate({ id: u.id, body: { status: 'active' } }); setAssign(u); }} />
                  <Button title="Decline" small kind="ghost" onPress={() => patch.mutate({ id: u.id, body: { status: 'disabled' } })} />
                  <Button title="Delete" small kind="ghost" icon="trash-2" onPress={() => setRemoving(u)} />
                </Row>
              </Card>
            ))}
            <SectionTitle title="Accounts" />
            {others.map(u => (
              <Card key={u.id} style={{ marginBottom: 10 }} onPress={() => setEdit(u)}>
                <Row>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text v="h3" color={c.brand}>{u.name.split(' ').map(p => p[0]).slice(0, 2).join('')}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text v="h3" numberOfLines={1}>{u.name}</Text>
                    <Text v="caption" muted numberOfLines={1}>{u.email ?? u.phone}</Text>
                  </View>
                  <Badge label={u.status === 'active' ? roleName(u.role) : 'Disabled'} color={u.status === 'active' ? c.brand : c.danger} />
                </Row>
                {u.role === 'collector' ? (
                  <Text v="caption" muted style={{ marginTop: 8 }} numberOfLines={2}>
                    {u.villages.length ? `Villages: ${u.villages.map(v => v.name).join(', ')}` : 'No villages assigned yet'}
                  </Text>
                ) : null}
              </Card>
            ))}
            {!rows.length ? <Empty icon="users" title="No one matches" /> : null}
          </>
        )}
      </Screen>

      {/* ------------------------------------------------- edit one user */}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ''}>
        {edit ? (
          <>
            <Text v="small" muted>{edit.email ?? edit.phone} · last sign-in {edit.last_login ? fmtDate(edit.last_login) : 'never'}</Text>
            <Text v="label" muted style={{ marginTop: SPACE.lg, marginBottom: 8 }}>Role</Text>
            <View style={{ gap: 8 }}>
              {ROLES.map(r => (
                <Pressable key={r.id} disabled={edit.id === meta.user.id} onPress={() => { tap(); patch.mutate({ id: edit.id, body: { role: r.id } }); setEdit({ ...edit, role: r.id }); }}
                  style={{ padding: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: edit.role === r.id ? c.brand : c.line, backgroundColor: edit.role === r.id ? c.brandSoft : c.surface }}>
                  <Text v="h3">{r.name}</Text>
                  <Text v="caption" muted>{r.about}</Text>
                </Pressable>
              ))}
            </View>
            <Row wrap gap={8} style={{ marginTop: SPACE.lg }}>
              {edit.role === 'collector' ? <Button title="Assign villages" small icon="map-pin" kind="secondary" onPress={() => { setAssign(edit); setEdit(null); }} /> : null}
              {edit.id !== meta.user.id ? (
                edit.status === 'active'
                  ? <Button title="Disable" small kind="ghost" icon="slash" onPress={() => { patch.mutate({ id: edit.id, body: { status: 'disabled' } }); setEdit(null); }} />
                  : <Button title="Re-enable" small kind="secondary" icon="check" onPress={() => { patch.mutate({ id: edit.id, body: { status: 'active' } }); setEdit(null); }} />
              ) : <Text v="caption" faint>You cannot change your own role or status.</Text>}
            </Row>
            <ResetPassword onSave={pw => patch.mutate({ id: edit.id, body: { password: pw } })} />
            {edit.id !== meta.user.id ? (
              <View style={{ marginTop: SPACE.xl, paddingTop: SPACE.lg, borderTopWidth: 1, borderTopColor: c.line }}>
                <Text v="label" color={c.danger} style={{ marginBottom: 6 }}>Delete this user</Text>
                <Text v="small" muted style={{ marginBottom: 10 }}>Removes their name, email and phone and signs them out. Their surveys stay.</Text>
                <Button title="Delete user" kind="danger" small icon="trash-2" style={{ alignSelf: 'flex-start' }}
                  onPress={() => {
                    // close this panel first: iOS cannot open one pop-up over another
                    const target = edit;
                    setEdit(null);
                    setTimeout(() => setRemoving(target), 400);
                  }} />
              </View>
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ''}?`}
        footer={<Button title="Yes, delete this user" kind="danger" loading={remove.isPending} onPress={() => removing && remove.mutate(removing.id)} />}>
        <Text v="body">{removing?.email ?? removing?.phone}</Text>
        <Text v="small" muted style={{ marginTop: 10, lineHeight: 20 }}>
          Their name, email and phone number are erased and they are signed out on every device. Surveys they collected or filled in
          stay in the project, no longer linked to them, so no score changes. This cannot be undone; the email can register again later.
        </Text>
      </Sheet>
      <AssignVillages key={assign?.id ?? 'none'} user={assign} onClose={() => setAssign(null)} onSave={ids => { if (assign) patch.mutate({ id: assign.id, body: { villages: ids } }); setAssign(null); }} />
      <AddUser visible={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ['users'] }); }} />
    </View>
  );
}

function ResetPassword({ onSave }: { onSave: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <View style={{ marginTop: SPACE.xl }}>
      <Text v="label" muted style={{ marginBottom: 8 }}>Set a new temporary password</Text>
      <Row gap={8}>
        <Input value={pw} onChangeText={setPw} placeholder="At least 8 characters" style={{ flex: 1 }} />
        <Button title="Set" small disabled={pw.length < 8} onPress={() => { onSave(pw); setPw(''); }} />
      </Row>
    </View>
  );
}

function AssignVillages({ user, onClose, onSave }: { user: U | null; onClose: () => void; onSave: (ids: number[]) => void }) {
  const meta = useMeta();
  const { c } = useTheme();
  // the parent gives this a new key per user, so it starts from that user's villages
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(user?.villages.map(v => v.id) ?? []));
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const list = useMemo(() => meta.villages.filter(v => (!district || v.district === district) && villageMatches(v, q)), [meta.villages, district, q]);
  const toggle = (id: number) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Sheet visible={!!user} onClose={onClose} title={`Villages for ${user?.name ?? ''}`}
      footer={<Button title={`Save ${chosen.size} village${chosen.size === 1 ? '' : 's'}`} onPress={() => onSave([...chosen])} />}>
      <Text v="small" muted style={{ marginBottom: 10 }}>A field researcher can only collect and see surveys in the villages chosen here.</Text>
      <SearchBar value={q} onChange={setQ} placeholder="Village, code or block" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" active={!district} onPress={() => setDistrict('')} />
        {DISTRICTS.map(d => <Chip key={d.id} label={d.name} color={districtColor(d.id)} active={district === d.id} onPress={() => setDistrict(d.id)} />)}
      </ScrollView>
      <View style={{ marginTop: 10 }}>
        {list.map(v => {
          const on = chosen.has(v.id);
          return (
            <Pressable key={v.id} onPress={() => { tap(); toggle(v.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? c.brand : c.ink3, backgroundColor: on ? c.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Feather name="check" size={15} color="#fff" /> : null}
              </View>
              <Text v="caption" color={districtColor(v.district)} style={{ fontFamily: FONT.heavy, width: 36 }}>{v.code}</Text>
              <Text v="body" style={{ flex: 1 }}>{v.name}</Text>
              <Text v="caption" faint>{districtName(v.district)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

function AddUser({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'collector' as Role, password: 'Welcome@2026' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api('/api/users', { method: 'POST', body: f }); toast('Account created'); onDone(); setF({ ...f, name: '', email: '', phone: '' }); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a user" footer={<Button title="Create account" loading={busy} onPress={save} />}>
      <View style={{ gap: 12 }}>
        <Input label="Name" value={f.name} onChangeText={name => setF({ ...f, name })} />
        <Input label="Email (or give a phone below)" value={f.email} onChangeText={email => setF({ ...f, email })} autoCapitalize="none" keyboardType="email-address" />
        <Input label="Phone" value={f.phone} onChangeText={phone => setF({ ...f, phone })} keyboardType="phone-pad" />
        <Text v="label" muted>Role</Text>
        <Row wrap gap={8}>{ROLES.map(r => <Chip key={r.id} label={r.name} active={f.role === r.id} onPress={() => setF({ ...f, role: r.id })} />)}</Row>
        <Input label="Temporary password" value={f.password} onChangeText={password => setF({ ...f, password })} />
        <Text v="caption" faint>Share it with them privately; they can sign in straight away.</Text>
      </View>
    </Sheet>
  );
}
