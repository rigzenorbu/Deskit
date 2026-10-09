/**
 * Surveys on this phone.
 *
 *   draft     being filled in; saved on every answer, so nothing is lost if the app closes
 *   queued    finished and waiting for signal
 *   uploaded  stored on the server, which assigned the household code (e.g. L_CHL_014)
 *   failed    the server refused it (the reason is shown); can be fixed and sent again
 *
 * Kept per signed-in user, so two researchers sharing a phone never mix surveys.
 */
import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import { surveyProgress, type Answers } from '@dyeskit/core';
import { api } from './api';
import { getJson, setJson } from './storage';

export type LocalStatus = 'draft' | 'queued' | 'uploaded' | 'failed';
export interface LocalSurvey {
  id: string;
  villageId: number;
  headName: string;
  phone: string;
  consent: boolean;
  answers: Answers;
  status: LocalStatus;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
  householdCode?: string;
  score?: number | null;
  band?: number | null;
  error?: string;
  /** surveying a household again in a new round: which one (keeps its code) */
  householdId?: number;
  previousCode?: string;
}

let userKey = '';
let surveys: LocalSurvey[] = [];
let syncing = false;
export interface SyncResult { at: string; ok: boolean; message: string }
let lastSync: SyncResult | null = null;
const listeners = new Set<() => void>();
/** loaded: false until this user's surveys have been read from the phone */
let loaded = false;
let snapshot: { surveys: LocalSurvey[]; syncing: boolean; lastSync: SyncResult | null; loaded: boolean } = { surveys, syncing, lastSync, loaded };
const emit = () => { snapshot = { surveys, syncing, lastSync, loaded }; listeners.forEach(l => l()); };

// never write before loading: that would replace the phone's surveys with an empty list
const persist = () => (loaded ? setJson(`surveys:${userKey}`, surveys) : Promise.resolve());

export async function loadOutbox(userId: number) {
  if (loaded && userKey === String(userId)) return;
  loaded = false;
  userKey = String(userId);
  surveys = await getJson<LocalSurvey[]>(`surveys:${userKey}`, []);
  loaded = true;
  emit();
}

export function useOutbox() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => snapshot, () => snapshot);
}

export const getSurvey = (id: string) => surveys.find(s => s.id === id) ?? null;

export async function startSurvey(villageId: number, headName: string, phone: string, repeat?: { householdId: number; code: string }): Promise<LocalSurvey> {
  const now = new Date().toISOString();
  const s: LocalSurvey = { id: randomUUID(), villageId, headName, phone, consent: true, answers: {}, status: 'draft', startedAt: now, updatedAt: now,
    ...(repeat ? { householdId: repeat.householdId, previousCode: repeat.code } : {}) };
  surveys = [s, ...surveys];
  emit();
  await persist();
  return s;
}

export async function updateSurvey(id: string, patch: Partial<LocalSurvey>) {
  surveys = surveys.map(s => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s));
  emit();
  await persist();
}

export async function discardSurvey(id: string) {
  surveys = surveys.filter(s => s.id !== id);
  emit();
  await persist();
}

/** Mark a survey finished and try to upload it straight away. */
export async function finishSurvey(id: string) {
  await updateSurvey(id, { status: 'queued', submittedAt: new Date().toISOString(), error: undefined });
  return syncNow();
}

/** Upload everything waiting. Safe to call any time: the server ignores repeats. */
export async function syncNow(): Promise<{ uploaded: number; failed: number; offline: boolean }> {
  const waiting = surveys.filter(s => s.status === 'queued');
  if (!waiting.length || syncing) return { uploaded: 0, failed: 0, offline: false };
  syncing = true;
  emit();
  try {
    const r = await api<{ results: { ok: boolean; client_id: string; household_code?: string; score?: number | null; band?: number | null; error?: string }[] }>(
      '/api/sync', {
        method: 'POST',
        body: {
          surveys: waiting.map(s => ({
            client_id: s.id, village_id: s.villageId, household_id: s.householdId ?? null, head_name: s.headName || null, phone: s.phone || null, consent: s.consent,
            answers: s.answers, started_at: s.startedAt, submitted_at: s.submittedAt,
            duration_min: s.submittedAt ? Math.round((Date.parse(s.submittedAt) - Date.parse(s.startedAt)) / 60000) : null,
          })),
        },
      });
    let uploaded = 0, failed = 0;
    const byId = new Map(r.results.map(x => [x.client_id, x]));
    surveys = surveys.map(s => {
      const x = byId.get(s.id);
      if (!x) return s;
      if (x.ok) { uploaded++; return { ...s, status: 'uploaded', householdCode: x.household_code, score: x.score ?? null, band: x.band ?? null, error: undefined }; }
      failed++;
      return { ...s, status: 'failed', error: x.error };
    });
    // keep the 100 most recent uploads as a local history; drafts and unsent surveys are never dropped
    const sent = surveys.filter(s => s.status === 'uploaded');
    if (sent.length > 100) {
      const keep = new Set(sent.slice(0, 100).map(s => s.id));
      surveys = surveys.filter(s => s.status !== 'uploaded' || keep.has(s.id));
    }
    lastSync = { at: new Date().toISOString(), ok: !failed, message: failed ? `${failed} could not be sent` : `${uploaded} sent` };
    await persist();
    return { uploaded, failed, offline: false };
  } catch (e: any) {
    lastSync = { at: new Date().toISOString(), ok: false, message: e?.offline ? 'No connection — will retry' : String(e?.message ?? e) };
    return { uploaded: 0, failed: 0, offline: !!e?.offline };
  } finally {
    syncing = false;
    emit();
  }
}

/** Put a refused survey back to draft so it can be corrected. */
export const reopenSurvey = (id: string) => updateSurvey(id, { status: 'draft', error: undefined });

/** How far through the questionnaire a survey is, 0–100 (the questions showing for this household). */
export const progressOf = (s: LocalSurvey) => surveyProgress(s.answers).percent;
