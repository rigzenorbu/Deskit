/**
 * Who is signed in, and the reference data every screen needs (villages, questionnaire…).
 * Both are cached on the device, so the app opens and surveys can be collected offline.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { BANDS, DIMENSIONS, District, Rights, ROLES, Section } from '@dyeskit/core';
import { api, onSessionExpired, setToken } from './api';
import { getJson, setJson, kv } from './storage';
import { secure } from './secure';
import { loadServerOverride } from './config';

export interface User { id: number; name: string; email: string | null; phone: string | null; role: string; status: string }
export interface VillageMeta {
  id: number; district: string; code: string; name: string; gazette_name: string | null; subdivision: string | null;
  block: string | null; households: number; altitude_m: number | null; official: boolean; surveys: number;
  lat: number | null; lon: number | null; location_source: string | null;
}
export interface Meta {
  user: User; rights: Rights; assigned: number[];
  districts: District[]; villages: VillageMeta[]; collectors: { id: number; name: string }[]; roles: typeof ROLES;
  questionnaire: { version: string; sections: Section[]; consent: string };
  dimensions: typeof DIMENSIONS; bands: typeof BANDS; scoringVersion: string;
  rounds: { id: number; name: string; started_at: string; closed_at: string | null; surveys: number }[];
  currentRoundId: number;
}

type Status = 'loading' | 'signedOut' | 'signedIn';
interface AuthState {
  status: Status;
  meta: Meta | null;
  offline: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** sign in with a token already issued (phone code, or registration) */
  acceptToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const TOKEN = 'dyeskit-token';
const META = 'dyeskit-meta';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [offline, setOffline] = useState(false);

  const clear = useCallback(async () => {
    setToken(null);
    await secure.remove(TOKEN);
    await kv.remove(META);
    setMeta(null);
    setStatus('signedOut');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Meta>('/api/meta');
      setMeta(m);
      setOffline(false);
      await setJson(META, m);
    } catch (e: any) {
      if (e?.offline) setOffline(true);
      else throw e;
    }
  }, []);

  useEffect(() => {
    onSessionExpired(() => { clear(); });
    (async () => {
      await loadServerOverride();
      const token = await secure.get(TOKEN);
      if (!token) { setStatus('signedOut'); return; }
      setToken(token);
      const cached = await getJson<Meta | null>(META, null);
      if (cached) { setMeta(cached); setStatus('signedIn'); }
      try {
        await refresh();
        setStatus('signedIn');
      } catch {
        if (!cached) await clear();
      }
    })();
  }, [clear, refresh]);

  const acceptToken = useCallback(async (token: string) => {
    setToken(token);
    await secure.set(TOKEN, token);
    await refresh();
    setStatus('signedIn');
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
    await acceptToken(r.token);
  }, [acceptToken]);

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* offline: forget locally anyway */ }
    await clear();
  }, [clear]);

  const value = useMemo(() => ({ status, meta, offline, signIn, acceptToken, signOut, refresh }), [status, meta, offline, signIn, acceptToken, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** The signed-in meta; only use inside signed-in screens. */
export function useMeta() {
  const { meta } = useAuth();
  if (!meta) throw new Error('useMeta before sign-in');
  return meta;
}
