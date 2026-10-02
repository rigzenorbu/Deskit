/**
 * API tests against a fresh in-memory database (PGlite) — run with: npm test
 * They exercise the rules people rely on: access by role, offline upload codes,
 * corrections with history, deletion, filters and account deletion.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HOUSEHOLD_CODE_PATTERN, OFFICIAL_VILLAGES } from '@dyeskit/core';
import { openDb, migrate, type Db } from './db';
import { buildApp } from './app';
import { syncVillages } from './data';
import { hashPassword } from './auth';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const tokens: Record<string, string> = {};

const call = async (method: string, url: string, who?: string, body?: unknown) => {
  const r = await app.inject({ method: method as 'GET', url, payload: body as object, headers: who ? { authorization: `Bearer ${tokens[who]}` } : {} });
  const json = r.headers['content-type']?.toString().includes('json') ? r.json() : r.body;
  return { status: r.statusCode, body: json as any };
};
const villageId = async (district: string, code: string) =>
  (await db.query<{ id: number }>('SELECT id FROM villages WHERE district=$1 AND code=$2', [district, code])).rows[0].id;
const fullAnswers = { A5: 40, A6: 'female', A7: 5, A13: 'secondary',
  B2: 'none', B3: 'never', B4: '1_10', B5: 'never', B6: 'active', B7: 'mostly', B8: 'proper', B10: 'safe', B11: '4',
  C1: 'stable', C2: ['family', 'religious'], C3: 'moderate', C4: '4', C5: '4', C6: '2',
  D1: 'regular', D2: '4', D3: 'moderate', D4: 'partial', D5: '4', D6: ['committee'], D7: '5',
  E1: 'scarce_1_3', E3: 'mixed', E4: 'partial', E5: 'lpg', E6: ['storage'],
  F1: '3_5', F2: 'basics', F3: 'limited', F4: 2, F6: 'two', F7: 'once', F8: '3', F9: 'aware', F10: 'yes',
  G1: 'occasional', G2: 'some_difficulty', G3: 'partly', G4: 'well', G5: ['none'],
  H1: 'daily', H2: '4', H3: '5', H4: '4', H5: 'in_village', H6: 'regular', H7: '3' };

before(async () => {
  process.env.SEED_DEMO = 'false';
  // TEST_DATABASE_URL runs the same tests on a real PostgreSQL; its name must contain "test",
  // because the schema is wiped first
  const url = process.env.TEST_DATABASE_URL;
  if (url && !/test/i.test(url)) throw new Error('TEST_DATABASE_URL must point at a database whose name contains "test"');
  db = await openDb(url, 'memory');
  if (url) await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  await syncVillages(db);
  for (const [role, email] of [['admin', 'a@t.org'], ['supervisor', 's@t.org'], ['collector', 'c@t.org'], ['analyst', 'an@t.org'], ['viewer', 'v@t.org']]) {
    await db.query(`INSERT INTO users (name, email, role, status, password_hash) VALUES ($1,$2,$3,'active',$4)`, [`${role} user`, email, role, hashPassword('Passw0rd!')]);
  }
  app = await buildApp(db);
  for (const [role, email] of [['admin', 'a@t.org'], ['supervisor', 's@t.org'], ['collector', 'c@t.org'], ['analyst', 'an@t.org'], ['viewer', 'v@t.org']]) {
    tokens[role] = (await call('POST', '/api/auth/login', undefined, { email, password: 'Passw0rd!' })).body.token;
  }
});
after(async () => { await app.close(); await db.close(); });

test('the official village list is in the database, per district', async () => {
  const { rows } = await db.query<{ district: string; n: number }>('SELECT district, count(*)::int AS n FROM villages GROUP BY district');
  const n = Object.fromEntries(rows.map(r => [r.district, r.n]));
  assert.deepEqual(n, { leh: 44, sham: 27, nubra: 30, changthang: 24, kargil: 81, zanskar: 26, drass: 19 });
  assert.equal(rows.reduce((s, r) => s + r.n, 0), OFFICIAL_VILLAGES.length);
  // running the sync again changes nothing
  assert.deepEqual(await syncVillages(db), { added: 0, archived: [] });
});

test('registration waits for approval', async () => {
  const r = await call('POST', '/api/auth/register', undefined, { name: 'New Person', email: 'new@t.org', password: 'Secret123' });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'new@t.org', password: 'Secret123' })).status, 403);
  const users = (await call('GET', '/api/users', 'admin')).body.rows;
  const id = users.find((u: any) => u.email === 'new@t.org').id;
  assert.equal(users.find((u: any) => u.email === 'new@t.org').status, 'pending');
  await call('PATCH', `/api/users/${id}`, 'admin', { status: 'active' });
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'new@t.org', password: 'Secret123' })).status, 200);
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'X', email: 'new@t.org', password: 'Secret123' })).status, 409);
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'X', email: 'weak@t.org', password: 'short' })).status, 400);
});

test('uploads get district_village_number codes, and repeats return the same code', async () => {
  const chl = await villageId('leh', 'CHL');
  const users = (await call('GET', '/api/users', 'admin')).body.rows;
  const collector = users.find((u: any) => u.email === 'c@t.org');
  await call('PATCH', `/api/users/${collector.id}`, 'admin', { villages: [chl] });

  const id = randomUUID();
  const survey = { client_id: id, village_id: chl, consent: true, answers: fullAnswers, head_name: 'Dolma' };
  const first = (await call('POST', '/api/sync', 'collector', { surveys: [survey] })).body.results[0];
  assert.ok(first.ok);
  assert.equal(first.household_code, 'L_CHL_001');
  assert.match(first.household_code, HOUSEHOLD_CODE_PATTERN);
  assert.ok(first.score > 0);
  const again = (await call('POST', '/api/sync', 'collector', { surveys: [survey] })).body.results[0];
  assert.equal(again.household_code, 'L_CHL_001');
  assert.equal(again.duplicate, true);
  const second = (await call('POST', '/api/sync', 'collector', { surveys: [{ ...survey, client_id: randomUUID() }] })).body.results[0];
  assert.equal(second.household_code, 'L_CHL_002');
});

test('a field researcher cannot upload outside their villages, or see other villages', async () => {
  const padum = await villageId('zanskar', 'PDM');
  await call('POST', '/api/sync', 'admin', { surveys: [{ client_id: randomUUID(), village_id: padum, consent: true, answers: fullAnswers }] });
  const r = (await call('POST', '/api/sync', 'collector', { surveys: [{ client_id: randomUUID(), village_id: padum, consent: true, answers: fullAnswers }] })).body.results[0];
  assert.equal(r.ok, false);
  const mine = (await call('GET', '/api/dashboard', 'collector')).body;
  assert.equal(mine.districts.find((d: any) => d.id === 'zanskar').n, 0);
  const all = (await call('GET', '/api/dashboard', 'admin')).body;
  assert.equal(all.districts.find((d: any) => d.id === 'zanskar').n, 1);
  assert.equal(all.headline.surveys, 3);
});

test('analysts see no household identity; viewers cannot export', async () => {
  const list = (await call('GET', '/api/submissions', 'analyst')).body.rows;
  assert.ok(list.every((r: any) => r.householdCode.startsWith('HH-')));
  const detail = (await call('GET', `/api/submissions/${list[0].id}`, 'analyst')).body;
  assert.equal(detail.submission.headName, null);
  assert.equal(detail.canEdit, false);
  const csv = await call('GET', '/api/export.csv', 'analyst');
  assert.equal(csv.status, 200);
  assert.ok(!String(csv.body).includes('L_CHL_'));
  assert.equal((await call('GET', '/api/export.csv', 'viewer')).status, 403);
  assert.ok(String((await call('GET', '/api/export.csv', 'admin')).body).includes('L_CHL_001'));
  assert.equal((await call('GET', '/api/users', 'analyst')).status, 403);
});

test('corrections need a reason, keep history and rescore', async () => {
  const id = (await call('GET', '/api/submissions?search=l_chl_001', 'supervisor')).body.rows[0].id;
  const before_ = (await call('GET', `/api/submissions/${id}`, 'supervisor')).body;
  assert.equal((await call('PATCH', `/api/submissions/${id}`, 'supervisor', { answers: { F10: 'no' } })).status, 400);
  const r = await call('PATCH', `/api/submissions/${id}`, 'supervisor', { answers: { F10: 'no' }, reason: 'checked bank passbook' });
  assert.equal(r.status, 200);
  const after_ = (await call('GET', `/api/submissions/${id}`, 'supervisor')).body;
  assert.equal(after_.answers.F10, 'no');
  assert.ok(after_.score.dims.fin.score < before_.score.dims.fin.score);
  assert.equal(after_.history[0].item_id, 'F10');
  assert.equal(after_.history[0].reason, 'checked bank passbook');
  // review
  assert.equal((await call('POST', `/api/submissions/${id}/review`, 'supervisor', { status: 'rejected' })).status, 400);
  assert.equal((await call('POST', `/api/submissions/${id}/review`, 'supervisor', { status: 'approved' })).status, 200);
  assert.equal((await call('POST', `/api/submissions/${id}/review`, 'collector', { status: 'approved' })).status, 403);
});

test('only admins delete; deleted surveys leave the scores and can be restored', async () => {
  const id = (await call('GET', '/api/submissions?search=l_chl_002', 'admin')).body.rows[0].id;
  assert.equal((await call('DELETE', `/api/submissions/${id}`, 'supervisor', { reason: 'dup' })).status, 403);
  assert.equal((await call('DELETE', `/api/submissions/${id}`, 'admin', { reason: 'duplicate' })).status, 200);
  assert.equal((await call('GET', '/api/dashboard', 'admin')).body.headline.surveys, 2);
  assert.equal((await call('GET', '/api/recycle-bin', 'admin')).body.rows.length, 1);
  await call('POST', `/api/submissions/${id}/restore`, 'admin');
  assert.equal((await call('GET', '/api/dashboard', 'admin')).body.headline.surveys, 3);
});

test('filters narrow the dashboard', async () => {
  assert.equal((await call('GET', '/api/dashboard?district=leh', 'admin')).body.overall.n, 2);
  assert.equal((await call('GET', '/api/dashboard?district=nubra', 'admin')).body.overall.n, 0);
  assert.equal((await call('GET', '/api/dashboard?gender=male', 'admin')).body.overall.n, 0);
  assert.equal((await call('GET', '/api/dashboard?age_group=30-44', 'admin')).body.overall.n, 3);
});

test('an account can be deleted by its owner', async () => {
  const t = (await call('POST', '/api/auth/login', undefined, { email: 'v@t.org', password: 'Passw0rd!' })).body.token;
  tokens.temp = t;
  assert.equal((await call('DELETE', '/api/me', 'temp', { password: 'wrong' })).status, 401);
  assert.equal((await call('DELETE', '/api/me', 'temp', { password: 'Passw0rd!' })).status, 200);
  assert.equal((await call('GET', '/api/me', 'temp')).status, 401);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'v@t.org', password: 'Passw0rd!' })).status, 401);
});
