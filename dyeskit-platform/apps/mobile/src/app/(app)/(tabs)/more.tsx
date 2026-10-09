import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { roleName, ROLES } from '@dyeskit/core';
import { FONT, GRADIENTS, SPACE, useTheme } from '@/theme';
import { useAuth, useMeta } from '@/lib/auth';
import { useAlerts } from '@/lib/alerts';
import { serverUrl } from '@/lib/config';
import { Badge, Card, Divider, IconDisc, ListRow, Rise, Row, Screen, SectionTitle, Text, type IconName } from '@/components/ui';
import { Hero } from '@/components/scenery';

interface Item { title: string; sub: string; icon: IconName; color: string; to?: Href; onPress?: () => void; badge?: number; badgeWord?: string; show?: boolean }

export default function More() {
  const meta = useMeta();
  const { signOut } = useAuth();
  const { c } = useTheme();
  const R = meta.rights;
  const alerts = useAlerts();
  const pendingCount = alerts.data?.pendingUsers ?? 0;
  const lookCount = alerts.data?.needsLook ?? 0;

  const groups: { title: string; items: Item[] }[] = [
    { title: 'Analysis', items: [
      { title: 'All data', sub: 'Every survey by district, village and household — check, correct or remove', icon: 'database', color: '#E2554F', to: '/data', show: R.review || R.editAny, badge: lookCount, badgeWord: 'to check' },
      { title: 'My survey', sub: 'Your household’s answers and score', icon: 'home', color: '#F59E4B', to: '/collect', show: R.read === 'own' },
      { title: 'Explore analysis', sub: 'Compare groups: gender, age, religion, occupation, education…', icon: 'bar-chart-2', color: '#3B8CF0', to: '/explore', show: R.read !== 'own' },
      { title: 'Surveys', sub: R.review ? 'Review, approve and correct surveys' : 'Every survey you can see', icon: 'clipboard', color: '#14A3A8', to: '/submissions', show: R.read !== 'own' },
      { title: 'How scores work', sub: 'Every point value, in plain words', icon: 'help-circle', color: '#8A63F0', to: '/scoring' },
    ] },
    { title: 'Data', items: [
      { title: 'Export to spreadsheet', sub: R.export === 'anon' ? 'Anonymised CSV of the filtered surveys' : 'CSV of the filtered surveys', icon: 'download', color: '#22B07D', to: '/export', show: R.export !== 'none' },
    ] },
    { title: 'Administration', items: [
      { title: 'Users & approvals', sub: 'Approve registrations, roles, assigned villages', icon: 'users', color: '#F27A36', to: '/admin/users', badge: pendingCount, show: R.manageUsers },
      { title: 'Survey rounds', sub: 'Start the next year’s round; compare rounds', icon: 'refresh-cw', color: '#22B07D', to: '/admin/rounds', show: R.manageUsers || R.review },
      { title: 'Villages & households', sub: 'Household counts used for the reliability check', icon: 'map', color: '#3B6CF0', to: '/admin/villages', show: R.manageVillages },
      { title: 'Audit log', sub: 'Every sign-in, edit, approval and export', icon: 'list', color: '#E064AA', to: '/admin/audit', show: R.audit },
      { title: 'Recycle bin', sub: 'Deleted surveys, restorable', icon: 'trash-2', color: '#EF5D60', to: '/admin/bin', show: R.delete },
    ] },
    { title: 'Account', items: [
      { title: 'Account & privacy', sub: 'Your details, delete your account', icon: 'user', color: '#4A5470', to: '/account' },
      { title: 'Sign out', sub: R.read === 'own' ? 'You can sign in again any time' : 'Unsent surveys stay on this phone for your next sign-in', icon: 'log-out', color: '#E2554F', onPress: () => signOut() },
    ] },
  ];

  return (
    <Screen padded={false} header={
      <Hero compact colors={GRADIENTS.hero}>
        <Row gap={14}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Text v="title" color="#fff">{meta.user.name.split(' ').map(p => p[0]).slice(0, 2).join('')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text v="h2" color="#fff">{meta.user.name}</Text>
            <Text v="small" color="rgba(255,255,255,0.85)">{meta.user.email ?? meta.user.phone}</Text>
            <View style={{ marginTop: 6 }}><Badge label={roleName(meta.user.role)} color="#FFFFFF" icon="shield" /></View>
          </View>
        </Row>
        <Text v="small" color="rgba(255,255,255,0.8)" style={{ marginTop: 12 }}>{ROLES.find(r => r.id === meta.user.role)?.about}</Text>
      </Hero>
    }>
      <View style={{ paddingHorizontal: SPACE.lg }}>
        {groups.map((g, gi) => {
          const items = g.items.filter(i => i.show !== false);
          if (!items.length) return null;
          return (
            <Rise key={g.title} i={gi}>
              <SectionTitle title={g.title} />
              <Card style={{ paddingVertical: 4 }}>
                {items.map((it, i) => (
                  <View key={it.title}>
                    {i ? <Divider /> : null}
                    <ListRow title={it.title} sub={it.sub} left={<IconDisc icon={it.icon} color={it.color} />}
                      right={it.badge ? <Badge label={`${it.badge} ${it.badgeWord ?? 'new'}`} color={c.danger} /> : undefined}
                      onPress={() => (it.to ? router.push(it.to) : it.onPress?.())} />
                  </View>
                ))}
              </Card>
            </Rise>
          );
        })}
        <Text v="caption" faint center style={{ marginTop: SPACE.xl }}>
          DYESKIT {Constants.expoConfig?.version ?? ''} · questionnaire {meta.questionnaire.version} · scoring {meta.scoringVersion}
        </Text>
        <Text v="caption" faint center style={{ fontFamily: FONT.medium }}>{serverUrl().replace(/^https?:\/\//, '')}</Text>
      </View>
    </Screen>
  );
}
