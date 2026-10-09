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
  app = await buildApp(db, { rateLimits: false });   // limits have their own test below
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

test('staff registration waits for approval', async () => {
  const r = await call('POST', '/api/auth/register', undefined, { name: 'New Person', email: 'new@t.org', password: 'Secret123', kind: 'staff', acceptPrivacy: true });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'new@t.org', password: 'Secret123' })).status, 403);
  const users = (await call('GET', '/api/users', 'admin')).body.rows;
  const id = users.find((u: any) => u.email === 'new@t.org').id;
  assert.equal(users.find((u: any) => u.email === 'new@t.org').status, 'pending');
  await call('PATCH', `/api/users/${id}`, 'admin', { status: 'active' });
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'new@t.org', password: 'Secret123' })).status, 200);
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'X', email: 'new@t.org', password: 'Secret123', acceptPrivacy: true })).status, 409);
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'X', email: 'weak@t.org', password: 'short', acceptPrivacy: true })).status, 400);
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

/* ---------------------------------------------------------- household members */
test('household members sign in at once; staff registrations wait for approval', async () => {
  const hh = await call('POST', '/api/auth/register', undefined, { name: 'Tashi Angmo', email: 'tashi@t.org', password: 'Julley123', kind: 'household', acceptPrivacy: true });
  assert.equal(hh.body.active, true);
  const login = await call('POST', '/api/auth/login', undefined, { email: 'tashi@t.org', password: 'Julley123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'respondent');
  tokens.household = login.body.token;
  const staff = await call('POST', '/api/auth/register', undefined, { name: 'Staff Person', email: 'staff@t.org', password: 'Julley123', kind: 'staff', acceptPrivacy: true });
  assert.equal(staff.body.active, false);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'staff@t.org', password: 'Julley123' })).status, 403);
});

test('a household member submits one survey, for any village, marked self-reported', async () => {
  const padum = await villageId('zanskar', 'PDM');
  const r = (await call('POST', '/api/sync', 'household', { surveys: [{ client_id: randomUUID(), village_id: padum, consent: true, answers: fullAnswers }] })).body.results[0];
  assert.equal(r.ok, true);
  assert.match(r.household_code, /^Z_PDM_\d{3}$/);
  const second = (await call('POST', '/api/sync', 'household', { surveys: [{ client_id: randomUUID(), village_id: padum, consent: true, answers: fullAnswers }] })).body.results[0];
  assert.equal(second.ok, false);
  const mine = (await call('GET', '/api/submissions', 'household')).body;
  assert.equal(mine.total, 1);
  assert.equal(mine.rows[0].source, 'self');
  assert.equal(mine.rows[0].householdCode, r.household_code);   // their own code, not masked
  const detail = (await call('GET', `/api/submissions/${mine.rows[0].id}`, 'household')).body;
  assert.equal(detail.canEdit, true);
  assert.equal(detail.canReview, false);
  assert.ok(String((await call('GET', '/api/export.csv', 'admin')).body).includes(',self,'));
});

test("household members cannot see anyone else's data", async () => {
  const others = (await call('GET', '/api/submissions', 'admin')).body.rows.filter((r: any) => r.source !== 'self');
  assert.ok(others.length > 0);
  assert.equal((await call('GET', `/api/submissions/${others[0].id}`, 'household')).status, 403);
  assert.equal((await call('GET', '/api/insights', 'household')).status, 403);
  assert.equal((await call('GET', `/api/notes?village_id=${others[0].villageId}`, 'household')).status, 403);
  assert.equal((await call('POST', '/api/notes', 'household', { village_id: others[0].villageId, note: 'x' })).status, 403);
  assert.equal((await call('GET', '/api/export.csv', 'household')).status, 403);
  assert.equal((await call('GET', '/api/users', 'household')).status, 403);
  assert.equal((await call('POST', `/api/submissions/${others[0].id}/review`, 'household', { status: 'approved' })).status, 403);
  assert.deepEqual((await call('GET', '/api/meta', 'household')).body.collectors, []);
});

test('the household dashboard is Ladakh-wide only: no villages, no groups, small districts hidden', async () => {
  const d = (await call('GET', '/api/dashboard?district=leh&village_id=1', 'household')).body;
  const all = (await call('GET', '/api/dashboard', 'admin')).body;
  assert.equal(d.overall.n, all.overall.n);             // filters are ignored: always the whole picture
  assert.deepEqual(d.villages, []);
  assert.deepEqual(d.groups.gender, []);
  assert.equal(d.overall.coverage, null);
  assert.ok(d.districts.every((x: any) => x.n >= 10 || x.score === null));
  assert.equal(d.headline.villagesSurveyed, 0);
});

test('a household member can edit their survey at any time, and delete it to start again', async () => {
  const mine = (await call('GET', '/api/submissions', 'household')).body.rows[0];
  // a supervisor approves it…
  assert.equal((await call('POST', `/api/submissions/${mine.id}/review`, 'supervisor', { status: 'approved' })).status, 200);
  // …the household can still change it, without giving a reason, and it goes back for review
  const edit = await call('PATCH', `/api/submissions/${mine.id}`, 'household', { answers: { F10: 'no' } });
  assert.equal(edit.status, 200);
  const after = (await call('GET', `/api/submissions/${mine.id}`, 'household')).body;
  assert.equal(after.answers.F10, 'no');
  assert.equal(after.submission.status, 'submitted');
  assert.equal(after.history[0].reason, 'Updated by the household');
  assert.equal(after.canDelete, true);

  // they cannot delete anyone else's survey
  const other = (await call('GET', '/api/submissions', 'admin')).body.rows.find((r: any) => r.source !== 'self');
  assert.equal((await call('DELETE', `/api/submissions/${other.id}`, 'household', {})).status, 403);

  // deleting their own takes it out of every count, and lets them fill it in again
  const before = (await call('GET', '/api/submissions', 'admin')).body.total;
  assert.equal((await call('DELETE', `/api/submissions/${mine.id}`, 'household', {})).status, 200);
  assert.equal((await call('GET', '/api/submissions', 'admin')).body.total, before - 1);
  assert.equal((await call('GET', '/api/submissions', 'household')).body.total, 0);
  assert.equal((await call('PATCH', `/api/submissions/${mine.id}`, 'household', { answers: { F10: 'yes' } })).status, 403);
  const again = (await call('POST', '/api/sync', 'household', { surveys: [{ client_id: randomUUID(), village_id: await villageId('zanskar', 'PDM'), consent: true, answers: fullAnswers }] })).body.results[0];
  assert.equal(again.ok, true);
});

test('admins can delete a user; the person is erased but their surveys stay', async () => {
  const surveysBefore = (await call('GET', '/api/dashboard', 'admin')).body.headline.surveys;
  const users = (await call('GET', '/api/users', 'admin')).body.rows;
  const collector = users.find((x: any) => x.email === 'c@t.org');
  const me = users.find((x: any) => x.email === 'a@t.org');
  assert.equal((await call('DELETE', `/api/users/${collector.id}`, 'supervisor')).status, 403);
  assert.equal((await call('DELETE', `/api/users/${me.id}`, 'admin')).status, 400);          // not yourself
  assert.equal((await call('DELETE', `/api/users/${collector.id}`, 'admin')).status, 200);
  const after = (await call('GET', '/api/users', 'admin')).body.rows;
  assert.ok(!after.some((x: any) => x.id === collector.id));                              // gone from the list
  assert.equal((await call('GET', '/api/me', 'collector')).status, 401);                    // signed out everywhere
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'c@t.org', password: 'Passw0rd!' })).status, 401);
  assert.equal((await call('GET', '/api/dashboard', 'admin')).body.headline.surveys, surveysBefore);   // surveys stay
  // the email is free to register again
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'Back Again', email: 'c@t.org', password: 'Passw0rd1', kind: 'staff', acceptPrivacy: true })).status, 200);
  const audit = (await call('GET', '/api/audit', 'admin')).body.rows;
  assert.equal(audit[audit.findIndex((a: any) => a.action === 'delete_user')].entity_id, String(collector.id));
});

test('an admin can delete another admin, never themselves', async () => {
  const r = await call('POST', '/api/users', 'admin', { name: 'Second Admin', email: 'a2@t.org', role: 'admin', password: 'Passw0rd!' });
  tokens.admin2 = (await call('POST', '/api/auth/login', undefined, { email: 'a2@t.org', password: 'Passw0rd!' })).body.token;
  const first = (await call('GET', '/api/users', 'admin')).body.rows.find((x: any) => x.email === 'a@t.org');
  assert.equal((await call('DELETE', `/api/users/${first.id}`, 'admin2')).status, 200);    // two admins: allowed
  assert.equal((await call('DELETE', `/api/users/${r.body.id}`, 'admin2')).status, 400);   // yourself
});

test('all data: counts by district and village, who filled each survey, and what needs a look', async () => {
  // a careless survey: 4 minutes, and a weight typed wrongly
  const chl = await villageId('leh', 'CHL');
  const bad = randomUUID();
  // (the first admin was deleted by the previous test; admin2 remains)
  await call('POST', '/api/sync', 'admin2', { surveys: [{ client_id: bad, village_id: chl, consent: true, duration_min: 4,
    answers: { ...fullAnswers, B1: { height_cm: 160, weight_kg: 610 } } }] });

  assert.equal((await call('GET', '/api/data/summary', 'analyst')).status, 403);
  assert.equal((await call('GET', '/api/data/summary', 'household')).status, 403);
  const sum = (await call('GET', '/api/data/summary', 'supervisor')).body;
  const leh = sum.districts.find((d: any) => d.id === 'leh');
  const chlRow = sum.villages.find((v: any) => v.id === chl);
  assert.ok(leh.surveys >= 3 && leh.flagged >= 1);
  assert.equal(chlRow.flagged, 1);
  assert.equal(sum.villages.reduce((n: number, v: any) => n + v.surveys, 0), sum.districts.reduce((n: number, d: any) => n + d.surveys, 0));

  const flagged = (await call('GET', `/api/submissions?village_id=${chl}&flagged=1`, 'supervisor')).body.rows;
  assert.equal(flagged.length, 1);
  assert.deepEqual(flagged[0].issues.map((i: any) => i.id).sort(), ['bmi', 'short']);
  assert.equal(flagged[0].collectorName, 'Second Admin');
  const self = (await call('GET', '/api/submissions?source=self', 'supervisor')).body.rows;
  assert.ok(self.length >= 1 && self.every((r: any) => r.source === 'self'));
  const detail = (await call('GET', `/api/submissions/${bad}`, 'supervisor')).body;
  assert.equal(detail.issues.length, 2);
});

test('approve all clean surveys at once — only waiting ones, never across villages one may not see', async () => {
  const waiting = (await call('GET', '/api/submissions?status=submitted', 'supervisor')).body.rows;
  const clean = waiting.filter((r: any) => !r.issues.length).map((r: any) => r.id);
  assert.ok(clean.length >= 1);
  assert.equal((await call('POST', '/api/submissions/review-bulk', 'collector', { ids: clean, status: 'approved' })).status, 401);
  assert.equal((await call('POST', '/api/submissions/review-bulk', 'supervisor', { ids: clean, status: 'rejected' })).status, 400);
  const r = (await call('POST', '/api/submissions/review-bulk', 'supervisor', { ids: [...clean, 'not-an-id'], status: 'approved' })).body;
  assert.equal(r.approved, clean.length);
  const again = (await call('POST', '/api/submissions/review-bulk', 'supervisor', { ids: clean, status: 'approved' })).body;
  assert.equal(again.approved, 0);                      // already approved: nothing changes
});

/* --------------------------------------------- phone sign-in, reset, privacy, limits */
const sendCode = async (body: object) => (await call('POST', '/api/auth/otp/send', undefined, body)).body;

test('a new phone number registers with a code, then signs in with a code', async () => {
  const sent = await sendCode({ phone: '98765 43210', purpose: 'signin' });
  assert.equal(sent.sentTo, '+91 ••••• 43210');
  assert.match(sent.devCode, /^\d{6}$/);                         // shown only outside production, with no SMS provider
  const v = (await call('POST', '/api/auth/otp/verify', undefined, { phone: '+91 98765-43210', code: sent.devCode })).body;
  assert.equal(v.needsAccount, true);
  assert.equal((await call('POST', '/api/auth/register-phone', undefined, { ticket: v.ticket, name: 'Sonam Dolma', kind: 'household' })).status, 400); // no consent
  const v2 = (await call('POST', '/api/auth/otp/verify', undefined, { phone: '9876543210', code: (await sendCode({ phone: '9876543210', purpose: 'signin' })).devCode })).body;
  const reg = (await call('POST', '/api/auth/register-phone', undefined, { ticket: v2.ticket, name: 'Sonam Dolma', kind: 'household', acceptPrivacy: true })).body;
  assert.equal(reg.active, true);
  assert.equal(reg.user.phone, '+919876543210');
  assert.ok(reg.token);
  // the ticket works once only
  assert.equal((await call('POST', '/api/auth/register-phone', undefined, { ticket: v2.ticket, name: 'Again', acceptPrivacy: true })).status, 400);
  // next time: the code signs straight in
  const again = (await call('POST', '/api/auth/otp/verify', undefined, { phone: '9876543210', code: (await sendCode({ phone: '9876543210', purpose: 'signin' })).devCode })).body;
  assert.equal(again.user.name, 'Sonam Dolma');
  assert.ok(again.token);
  tokens.sonam = again.token;            // used by later tests (codes per number are limited)
});

test('codes: wrong tries are limited, a code works once, and only 3 codes per 15 minutes', async () => {
  const phone = '9123456780';
  const { devCode } = await sendCode({ phone, purpose: 'signin' });
  const wrong = devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/otp/verify', undefined, { phone, code: wrong })).status, 400);
  assert.equal((await call('POST', '/api/auth/otp/verify', undefined, { phone, code: devCode })).status, 429);   // locked after 5 wrong
  const second = (await sendCode({ phone, purpose: 'signin' })).devCode;
  assert.equal((await call('POST', '/api/auth/otp/verify', undefined, { phone, code: second })).status, 200);
  assert.equal((await call('POST', '/api/auth/otp/verify', undefined, { phone, code: second })).status, 400);    // used
  assert.ok((await sendCode({ phone, purpose: 'signin' })).devCode);
  assert.equal((await call('POST', '/api/auth/otp/send', undefined, { phone, purpose: 'signin' })).status, 429); // 4th in 15 min
  assert.equal((await call('POST', '/api/auth/otp/send', undefined, { phone: '12345', purpose: 'signin' })).status, 400);
});

test('staff who register with a phone still wait for approval', async () => {
  const phone = '9988776655';
  const v = (await call('POST', '/api/auth/otp/verify', undefined, { phone, code: (await sendCode({ phone, purpose: 'signin' })).devCode })).body;
  const reg = (await call('POST', '/api/auth/register-phone', undefined, { ticket: v.ticket, name: 'Phone Staff', kind: 'staff', acceptPrivacy: true })).body;
  assert.equal(reg.active, false);
  assert.equal(reg.token, undefined);
  const later = await call('POST', '/api/auth/otp/verify', undefined, { phone, code: (await sendCode({ phone, purpose: 'signin' })).devCode });
  assert.equal(later.status, 403);
});

test('forgot password: a code to the phone on the account, then a new password', async () => {
  await call('POST', '/api/auth/register', undefined, { name: 'Forgetful', email: 'forget@t.org', phone: '9811122233', password: 'OldPass123', kind: 'household', acceptPrivacy: true });
  const t = (await call('POST', '/api/auth/login', undefined, { email: 'forget@t.org', password: 'OldPass123' })).body.token;
  const r = await sendCode({ identifier: 'forget@t.org', purpose: 'reset' });
  assert.equal(r.sentTo, '+91 ••••• 22233');
  const nobody = await sendCode({ identifier: 'nobody@t.org', purpose: 'reset' });
  assert.equal(nobody.ok, true);                                   // same answer: does not reveal who is registered
  assert.equal(nobody.devCode, undefined);
  assert.equal((await call('POST', '/api/auth/password/reset', undefined, { identifier: 'forget@t.org', code: '000000', password: 'NewPass456' })).status, 400);
  assert.equal((await call('POST', '/api/auth/password/reset', undefined, { identifier: 'forget@t.org', code: r.devCode, password: 'NewPass456' })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'forget@t.org', password: 'OldPass123' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: '98111 22233', password: 'NewPass456' })).status, 200);  // phone + password works too
  tokens.old = t;
  assert.equal((await call('GET', '/api/me', 'old')).status, 401);            // old sessions are ended
});

test('change your password; phone-only accounts can set one', async () => {
  tokens.forget = (await call('POST', '/api/auth/login', undefined, { email: 'forget@t.org', password: 'NewPass456' })).body.token;
  assert.equal((await call('POST', '/api/me/password', 'forget', { current: 'wrong', password: 'Third789x' })).status, 401);
  assert.equal((await call('POST', '/api/me/password', 'forget', { current: 'NewPass456', password: 'Third789x' })).status, 200);
  const phone = '9876543210';   // Sonam, registered by phone with no password (signed in by the first phone test)
  assert.equal((await call('GET', '/api/me', 'sonam')).body.hasPassword, false);
  assert.equal((await call('POST', '/api/me/password', 'sonam', { password: 'Sonam2026' })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: phone, password: 'Sonam2026' })).status, 200);
});

test('registration needs the privacy policy accepted, and the policy is public', async () => {
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'X', email: 'x@t.org', password: 'Passw0rd1' })).status, 400);
  const page = await app.inject({ method: 'GET', url: '/privacy' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Your rights/);
  assert.match(page.body, /Digital Personal Data Protection Act/);
});

test('self-reported surveys count in dashboards only after approval', async () => {
  const before = (await call('GET', '/api/dashboard', 'supervisor')).body.headline.surveys;
  const up = (await call('POST', '/api/sync', 'sonam', { surveys: [{ client_id: randomUUID(), village_id: await villageId('nubra', 'DSK'), consent: true, answers: fullAnswers }] })).body.results[0];
  assert.equal(up.ok, true);
  assert.equal((await call('GET', '/api/dashboard', 'supervisor')).body.headline.surveys, before);        // not yet
  await call('POST', `/api/submissions/${up.client_id}/review`, 'supervisor', { status: 'approved' });
  assert.equal((await call('GET', '/api/dashboard', 'supervisor')).body.headline.surveys, before + 1);    // now it counts
});

test('too many sign-in attempts from one address are refused for a while', async () => {
  const limited = await buildApp(db);          // the real limits
  let last = 0;
  for (let i = 0; i < 11; i++) {
    last = (await limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'v@t.org', password: 'wrong' } })).statusCode;
  }
  assert.equal(last, 429);
  const r = await limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'v@t.org', password: 'wrong' } });
  assert.match(r.json().error, /Too many attempts/);
  await limited.close();
});
