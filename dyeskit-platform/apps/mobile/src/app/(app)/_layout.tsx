import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { loadOutbox, syncNow } from '@/lib/outbox';
import { useTheme } from '@/theme';

/** Signed-in area. Loads this user's surveys on the phone and keeps trying to upload waiting ones. */
export default function AppLayout() {
  const { meta } = useAuth();
  const { c } = useTheme();
  const userId = meta?.user.id;

  useEffect(() => {
    if (!userId) return;
    loadOutbox(userId).then(() => syncNow());
    const timer = setInterval(() => { syncNow(); }, 45_000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') syncNow(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [userId]);

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }} />;
}
