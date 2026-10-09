/** Banners at the top of Home: approvals waiting, surveys to review, surveys sent back. */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { RADIUS, SPACE, useTheme } from '@/theme';
import { useAlerts } from '@/lib/alerts';
import { Button, Card, Row, Text } from './ui';

export function AlertsBanner() {
  const { c } = useTheme();
  const { data: a } = useAlerts();
  if (!a) return null;
  const items: React.ReactNode[] = [];

  if (a.pendingUsers) {
    items.push(
      <Card key="users" onPress={() => router.push('/admin/users')} style={{ borderLeftWidth: 4, borderLeftColor: c.danger }}>
        <Row>
          <Feather name="user-plus" size={20} color={c.danger} />
          <Text v="h3" style={{ flex: 1 }}>{a.pendingUsers} {a.pendingUsers === 1 ? 'person is' : 'people are'} waiting for approval</Text>
          <Feather name="chevron-right" size={18} color={c.ink3} />
        </Row>
      </Card>,
    );
  }
  if (a.waitingReview) {
    items.push(
      <Card key="review" onPress={() => router.push({ pathname: '/data/village/[id]', params: { id: 'all', ...(a.needsLook ? { flagged: '1' } : { status: 'submitted' }) } })}
        style={{ borderLeftWidth: 4, borderLeftColor: a.needsLook ? c.danger : c.warning }}>
        <Row>
          <Feather name={a.needsLook ? 'alert-triangle' : 'clock'} size={20} color={a.needsLook ? c.danger : c.warning} />
          <View style={{ flex: 1 }}>
            <Text v="h3">{a.waitingReview} survey{a.waitingReview === 1 ? '' : 's'} waiting review</Text>
            {a.needsLook ? <Text v="small" color={c.danger}>{a.needsLook} need a look</Text> : null}
          </View>
          <Feather name="chevron-right" size={18} color={c.ink3} />
        </Row>
      </Card>,
    );
  }
  for (const s of a.sentBack.slice(0, 3)) {
    items.push(
      <Card key={s.id} style={{ borderLeftWidth: 4, borderLeftColor: c.warning }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="corner-up-left" size={20} color={c.warning} />
          <View style={{ flex: 1 }}>
            <Text v="h3">Survey {s.householdCode} was sent back</Text>
            <Text v="small" muted>{s.village}{s.note ? ` — “${s.note}”` : ''}</Text>
          </View>
        </Row>
        <Button title="Open and fix" small kind="secondary" icon="edit-2" onPress={() => router.push(`/submission/${s.id}`)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      </Card>,
    );
  }
  if (!items.length) return null;
  return <View style={{ gap: 10, marginTop: SPACE.lg, borderRadius: RADIUS.lg }}>{items}</View>;
}
