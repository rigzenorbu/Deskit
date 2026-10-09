import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { loadOutbox, syncNow } from '@/lib/outbox';
import { useTheme } from '@/theme';

const STAFF_ONLY = new Set(['villages', 'insights', 'explore', 'submissions', 'village', 'export', 'admin', 'data']);

/** Signed-in area. Loads this user's surveys on the phone and keeps trying to upload waiting ones. */
export default function AppLayout() {
  const { meta } = useAuth();
  const { c } = useTheme();
  const userId = meta?.user.id;
  const segments = useSegments() as string[];

  useEffect(() => {
    if (!userId) return;
    loadOutbox(userId).then(() => syncNow());
    const timer = setInterval(() => { syncNow(); }, 45_000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') syncNow(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [userId]);

  // household members only have Home, their survey and More; the server refuses the rest anyway
  if (meta?.rights.read === 'own' && segments.some(s => STAFF_ONLY.has(s))) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }} />;
}
