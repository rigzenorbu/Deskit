import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  BANDS, CONSENT_TEXT, DIMENSIONS, DISTRICTS, ITEMS, QUESTIONNAIRE_VERSION, ROLES, ROLE_RIGHTS, SCORING_VERSION, SECTIONS,
  computeDashboard, computeInsights, scoreHousehold, type Role,
} from '@dyeskit/core';
import { audit, type Db } from './db';
import {
  PASSWORD_RULE, assignedVillageIds, bearer, createSession, endSession, hashPassword, passwordOk, rightsOf, scopeOf,
  userFromToken, verifyPassword, type SessionUser,
} from './auth';
import {
  applyFilters, getAnswers, loadRows, newVillageCode, parseFilters, rescore, rescoreOutdated, saveAnswers, storeUpload,
  villagesInfo, type UploadedSurvey,
} from './data';

declare module 'fastify' {
  interface FastifyRequest { user: SessionUser | null }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = process.env.WEB_DIR || path.join(HERE, '..', '..', 'mobile', 'dist');

const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
const need = (cond: unknown, message = 'Your role does not allow this.') => { if (!cond) throw fail(403, message); };
type Q = Record<string, string | undefined>;

export async function buildApp(db: Db, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024, trustProxy: true });
  await app.register(cors, { origin: true });

  app.decorateRequest('user', null);
  app.addHook('preHandler', async req => {
    if (req.url.startsWith('/api/')) req.user = await userFromToken(db, bearer(req.headers.authorization));
  });
  const signedIn = (req: FastifyRequest) => { if (!req.user) throw fail(401, 'Please sign in.'); return req.user; };

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (code === 500) req.log.error(err);
    reply.code(code).send({ error: code === 500 ? 'Something went wrong on the server.' : err.message });
  });

  /* ------------------------------------------------------------ health */
  app.get('/api/health', async () => {
    // demo: true when the demo accounts exist, so the sign-in screen can offer them
    const demo = (await db.query("SELECT 1 FROM users WHERE email = 'admin@dyeskit.org' AND status = 'active'")).rows.length > 0;
    return { ok: true, database: db.kind, scoring: SCORING_VERSION, questionnaire: QUESTIONNAIRE_VERSION, demo };
  });

  /* -------------------------------------------------------------- auth */
  app.post('/api/auth/login', async (req, reply) => {
    const b = (req.body ?? {}) as { email?: string; password?: string };
    const email = String(b.email ?? '').trim();
    const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [email]);
    const u = rows[0];
    if (!u || !verifyPassword(String(b.password ?? ''), u.password_hash)) {
      await audit(db, null, 'login_failed', 'user', email);
      return reply.code(401).send({ error: 'That email and password do not match.' });
    }
    if (u.status === 'pending') return reply.code(403).send({ error: 'Your registration is waiting for an admin to approve it.', status: 'pending' });
    if (u.status !== 'active') return reply.code(403).send({ error: 'This account has been disabled. Please contact your admin.', status: u.status });
    const token = await createSession(db, u.id);
    await db.query('UPDATE users SET last_login = now() WHERE id=$1', [u.id]);
    await audit(db, { id: u.id, name: u.name }, 'login', 'user', u.id);
    return { token, user: publicUser(u), rights: ROLE_RIGHTS[u.role as Role], assigned: await assignedVillageIds(db, u.id) };
  });

  app.post('/api/auth/register', async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; email?: string; phone?: string; password?: string };
    const name = String(b.name ?? '').trim(), email = String(b.email ?? '').trim().toLowerCase(), password = String(b.password ?? '');
    if (!name || !email || !password) return reply.code(400).send({ error: 'Name, email and password are required.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: 'Please enter a valid email address.' });
    if (!passwordOk(password)) return reply.code(400).send({ error: `Password: ${PASSWORD_RULE}` });
    const { rows } = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (rows.length) return reply.code(409).send({ error: 'That email is already registered.' });
    await db.query(`INSERT INTO users (name, email, phone, role, status, password_hash) VALUES ($1,$2,$3,'collector','pending',$4)`,
      [name, email, b.phone?.trim() || null, hashPassword(password)]);
    await audit(db, null, 'register', 'user', email, { role: 'collector' });
    return { ok: true, message: 'Registration received. An admin will review and approve your account.' };
  });

  app.post('/api/auth/logout', async req => {
    const token = bearer(req.headers.authorization);
    if (token) await endSession(db, token);
    return { ok: true };
  });

  app.get('/api/me', async req => {
    const u = signedIn(req);
    return { user: u, rights: rightsOf(u), assigned: await assignedVillageIds(db, u.id) };
  });

  /** Account deletion (required by Apple and Google): personal details are erased; surveys stay, unlinked. */
  app.delete('/api/me', async (req, reply) => {
    const u = signedIn(req);
    const b = (req.body ?? {}) as { password?: string };
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [u.id]);
    if (!verifyPassword(String(b.password ?? ''), rows[0].password_hash)) return reply.code(401).send({ error: 'Password is not correct.' });
    await db.tx(async q => {
      await q.query(`UPDATE users SET name='Deleted user', email=$1, phone=NULL, status='disabled', deleted_at=now(), password_hash='deleted' WHERE id=$2`,
        [`deleted-${u.id}@deleted.invalid`, u.id]);
      await q.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
      await q.query('DELETE FROM assignments WHERE user_id=$1', [u.id]);
      await audit(q, { id: u.id, name: 'Deleted user' }, 'delete_account', 'user', u.id);
    });
    return { ok: true };
  });

  /* -------------------------------------------------------------- meta */
  app.get('/api/meta', async req => {
    const u = signedIn(req);
    const villages = (await db.query(
      `SELECT v.id, v.district, v.code, v.name, v.gazette_name, v.subdivision, v.block, v.households, v.altitude_m, v.official,
              (SELECT count(*)::int FROM submissions s WHERE s.village_id = v.id AND s.deleted_at IS NULL) AS surveys
       FROM villages v WHERE v.archived_at IS NULL ORDER BY v.name`)).rows;
    const collectors = (await db.query(
      `SELECT id, name FROM users WHERE role IN ('collector','supervisor','admin') AND status='active' AND deleted_at IS NULL ORDER BY name`)).rows;
    return {
      user: u, rights: rightsOf(u), assigned: await assignedVillageIds(db, u.id),
      districts: DISTRICTS, villages, collectors, roles: ROLES,
      questionnaire: { version: QUESTIONNAIRE_VERSION, sections: SECTIONS, consent: CONSENT_TEXT },
      dimensions: DIMENSIONS, bands: BANDS, scoringVersion: SCORING_VERSION,
    };
  });

  /* --------------------------------------------------------- analytics */
  app.get('/api/dashboard', async req => {
    const u = signedIn(req);
    const scope = await scopeOf(db, u);
    const all = await loadRows(db, scope);
    const f = parseFilters(req.query as Q);
    const rows = applyFilters(all, f);
    let villages = await villagesInfo(db, scope);
    if (f.district) villages = villages.filter(v => v.district === f.district);
    if (f.villageIds.length) villages = villages.filter(v => f.villageIds.includes(v.id));
    const baseline = applyFilters(all, parseFilters({}));
    return computeDashboard(rows, villages, baseline);
  });

  app.get('/api/insights', async req => {
    const u = signedIn(req);
    const scope = await scopeOf(db, u);
    const rows = applyFilters(await loadRows(db, scope), parseFilters(req.query as Q));
    return computeInsights(rows, await villagesInfo(db, scope));
  });

  /* ------------------------------------------------------- submissions */
  app.get('/api/submissions', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    const q = req.query as Q;
    // the list shows every status, rejected included; dashboards leave rejected surveys out
    const rows = applyFilters(await loadRows(db, await scopeOf(db, u)), parseFilters(q), { allStatuses: true });
    const limit = Math.min(500, Number(q.limit) || 100), offset = Number(q.offset) || 0;
    return {
      total: rows.length,
      rows: rows.slice(offset, offset + limit).map(r => ({
        id: r.id, householdCode: R.pii ? r.householdCode : `HH-${r.id.slice(0, 6)}`, village: r.village, villageId: r.villageId,
        district: r.district, status: r.status, submittedAt: r.submittedAt, durationMin: r.durationMin,
        score: r.score?.score ?? null, band: r.score?.band ?? null, collectorId: r.collectorId,
      })),
    };
  });

  const loadSubmission = async (u: SessionUser, id: string) => {
    const { rows } = await db.query(
      `SELECT su.*, v.name AS village, v.district, v.code AS village_code, h.code AS household_code, h.head_name, h.phone,
              c.name AS collector_name, r.name AS reviewer_name
       FROM submissions su JOIN villages v ON v.id = su.village_id JOIN households h ON h.id = su.household_id
       LEFT JOIN users c ON c.id = su.collector_id LEFT JOIN users r ON r.id = su.reviewed_by
       WHERE su.id = $1`, [id]);
    const s = rows[0];
    if (!s) throw fail(404, 'Survey not found.');
    const scope = await scopeOf(db, u);
    if (scope && !scope.includes(s.village_id)) throw fail(403, 'This survey is outside your villages.');
    return s;
  };

  app.get('/api/submissions/:id', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    const s = await loadSubmission(u, (req.params as { id: string }).id);
    const answers = await getAnswers(db, s.id);
    const history = (await db.query(
      `SELECT h.item_id, h.old_value, h.new_value, h.changed_at, h.reason, u.name AS changed_by
       FROM answer_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.submission_id = $1 ORDER BY h.id DESC LIMIT 100`, [s.id])).rows;
    return {
      submission: {
        id: s.id, village: s.village, villageId: s.village_id, district: s.district, status: s.status,
        householdCode: R.pii ? s.household_code : `HH-${s.id.slice(0, 6)}`, headName: R.pii ? s.head_name : null, phone: R.pii ? s.phone : null,
        collector: s.collector_name, collectorId: s.collector_id, reviewer: s.reviewer_name, reviewNote: s.review_note,
        startedAt: s.started_at, submittedAt: s.submitted_at, durationMin: s.duration_min, deletedAt: s.deleted_at,
        questionnaireVersion: s.questionnaire_version,
      },
      answers, score: scoreHousehold(answers), history,
      canEdit: R.editAny || (s.collector_id === u.id && s.status !== 'approved'),
      canReview: R.review, canDelete: R.delete,
    };
  });

  /** Upload surveys collected on a phone (works for one or a whole offline batch). */
  app.post('/api/sync', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    need(R.addData, 'Your role cannot add surveys.');
    const surveys = ((req.body ?? {}) as { surveys?: UploadedSurvey[] }).surveys ?? [];
    const scope = await scopeOf(db, u);
    const results = [];
    for (const s of surveys.slice(0, 200)) {
      try {
        if (scope && !scope.includes(Number(s.village_id))) throw fail(403, 'This village is not assigned to you.');
        results.push({ ok: true, ...(await storeUpload(db, u, s)) });
      } catch (e) {
        results.push({ ok: false, client_id: s.client_id, error: (e as Error).message });
      }
    }
    return { results };
  });

  app.patch('/api/submissions/:id', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    const s = await loadSubmission(u, (req.params as { id: string }).id);
    need(R.editAny || (s.collector_id === u.id && s.status !== 'approved'), 'You cannot edit this survey.');
    const b = (req.body ?? {}) as { answers?: Record<string, unknown>; reason?: string; headName?: string; phone?: string };
    if (b.answers && !String(b.reason ?? '').trim()) throw fail(400, 'Please give a reason for the correction.');
    const score = await db.tx(async q => {
      if (b.answers) {
        const known = Object.fromEntries(Object.entries(b.answers).filter(([k]) => ITEMS[k]));
        await saveAnswers(q, s.id, known, u.id, String(b.reason));
      }
      if (R.pii && (b.headName !== undefined || b.phone !== undefined)) {
        await q.query('UPDATE households SET head_name = COALESCE($1, head_name), phone = COALESCE($2, phone) WHERE id = $3',
          [b.headName ?? null, b.phone ?? null, s.household_id]);
      }
      await q.query('UPDATE submissions SET updated_at = now() WHERE id=$1', [s.id]);
      await audit(q, u, 'edit_submission', 'submission', s.id, { items: Object.keys(b.answers ?? {}), reason: b.reason });
      return rescore(q, s.id);
    });
    return { ok: true, score };
  });

  app.post('/api/submissions/:id/review', async req => {
    const u = signedIn(req);
    need(rightsOf(u).review, 'Only supervisors and admins can review surveys.');
    const s = await loadSubmission(u, (req.params as { id: string }).id);
    const b = (req.body ?? {}) as { status?: string; note?: string };
    if (!['approved', 'rejected', 'submitted'].includes(String(b.status))) throw fail(400, 'Status must be approved, rejected or submitted.');
    if (b.status === 'rejected' && !String(b.note ?? '').trim()) throw fail(400, 'Please say why the survey is rejected.');
    await db.query('UPDATE submissions SET status=$1, review_note=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now() WHERE id=$4',
      [b.status, b.note?.trim() || null, u.id, s.id]);
    await audit(db, u, `review_${b.status}`, 'submission', s.id, { note: b.note });
    return { ok: true };
  });

  app.delete('/api/submissions/:id', async req => {
    const u = signedIn(req);
    need(rightsOf(u).delete, 'Only admins can delete surveys.');
    const s = await loadSubmission(u, (req.params as { id: string }).id);
    const reason = String(((req.body ?? {}) as { reason?: string }).reason ?? '').trim();
    if (!reason) throw fail(400, 'Please give a reason.');
    await db.query('UPDATE submissions SET deleted_at=now(), deleted_by=$1, delete_reason=$2 WHERE id=$3', [u.id, reason, s.id]);
    await audit(db, u, 'delete_submission', 'submission', s.id, { reason });
    return { ok: true };
  });

  app.post('/api/submissions/:id/restore', async req => {
    const u = signedIn(req);
    need(rightsOf(u).delete, 'Only admins can restore surveys.');
    const id = (req.params as { id: string }).id;
    await db.query('UPDATE submissions SET deleted_at=NULL, deleted_by=NULL, delete_reason=NULL WHERE id=$1', [id]);
    await audit(db, u, 'restore_submission', 'submission', id);
    return { ok: true };
  });

  app.get('/api/recycle-bin', async req => {
    const u = signedIn(req);
    need(rightsOf(u).delete);
    return { rows: (await db.query(
      `SELECT su.id, su.deleted_at, su.delete_reason, v.name AS village, h.code AS household_code, d.name AS deleted_by
       FROM submissions su JOIN villages v ON v.id = su.village_id JOIN households h ON h.id = su.household_id
       LEFT JOIN users d ON d.id = su.deleted_by WHERE su.deleted_at IS NOT NULL ORDER BY su.deleted_at DESC LIMIT 200`)).rows };
  });

  /* ------------------------------------------------------------- users */
  app.get('/api/users', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageUsers, 'Only admins can manage users.');
    const users = (await db.query(
      `SELECT id, name, email, phone, role, status, created_at, last_login FROM users WHERE deleted_at IS NULL
       ORDER BY (status = 'pending') DESC, name`)).rows;
    const assigned = (await db.query('SELECT a.user_id, v.id, v.name, v.district FROM assignments a JOIN villages v ON v.id = a.village_id')).rows;
    return { rows: users.map(x => ({ ...x, villages: assigned.filter(a => a.user_id === x.id).map(({ user_id, ...v }) => v) })) };
  });

  app.post('/api/users', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageUsers, 'Only admins can add users.');
    const b = (req.body ?? {}) as { name?: string; email?: string; phone?: string; role?: Role; password?: string };
    if (!b.name || !b.email || !b.password || !b.role) throw fail(400, 'Name, email, role and a temporary password are required.');
    if (!ROLE_RIGHTS[b.role]) throw fail(400, 'Unknown role.');
    if (!passwordOk(b.password)) throw fail(400, `Password: ${PASSWORD_RULE}`);
    const exists = await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [b.email]);
    if (exists.rows.length) throw fail(409, 'That email is already registered.');
    const r = await db.query(`INSERT INTO users (name, email, phone, role, status, password_hash) VALUES ($1,$2,$3,$4,'active',$5) RETURNING id`,
      [b.name.trim(), b.email.trim().toLowerCase(), b.phone || null, b.role, hashPassword(b.password)]);
    await audit(db, u, 'create_user', 'user', r.rows[0].id, { role: b.role });
    return { ok: true, id: r.rows[0].id };
  });

  app.patch('/api/users/:id', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageUsers, 'Only admins can change users.');
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { role?: Role; status?: string; villages?: number[]; password?: string };
    if (id === u.id && (b.status && b.status !== 'active' || b.role && b.role !== 'admin')) throw fail(400, 'You cannot demote or disable your own account.');
    await db.tx(async q => {
      if (b.role) { if (!ROLE_RIGHTS[b.role]) throw fail(400, 'Unknown role.'); await q.query('UPDATE users SET role=$1 WHERE id=$2', [b.role, id]); }
      if (b.status) {
        if (!['pending', 'active', 'disabled'].includes(b.status)) throw fail(400, 'Unknown status.');
        await q.query('UPDATE users SET status=$1 WHERE id=$2', [b.status, id]);
        if (b.status !== 'active') await q.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      }
      if (b.password) {
        if (!passwordOk(b.password)) throw fail(400, `Password: ${PASSWORD_RULE}`);
        await q.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(b.password), id]);
        await q.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      }
      if (Array.isArray(b.villages)) {
        await q.query('DELETE FROM assignments WHERE user_id=$1', [id]);
        for (const v of b.villages) await q.query('INSERT INTO assignments (user_id, village_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, Number(v)]);
      }
      await audit(q, u, 'update_user', 'user', id, { ...b, password: b.password ? '(changed)' : undefined });
    });
    return { ok: true };
  });

  /* ---------------------------------------------------------- villages */
  app.post('/api/villages', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageVillages, 'Only admins and supervisors can add villages.');
    const b = (req.body ?? {}) as { name?: string; district?: string; block?: string; households?: number; altitude_m?: number };
    if (!b.name?.trim() || !DISTRICTS.some(d => d.id === b.district)) throw fail(400, 'A name and a valid district are required.');
    const code = await newVillageCode(db, b.district!, b.name);
    const r = await db.query(`INSERT INTO villages (district, code, name, block, households, altitude_m, official) VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id`,
      [b.district, code, b.name.trim(), b.block?.trim() || null, Number(b.households) || 0, Number(b.altitude_m) || null]);
    await audit(db, u, 'create_village', 'village', r.rows[0].id, { ...b, code });
    return { ok: true, id: r.rows[0].id, code };
  });

  app.patch('/api/villages/:id', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageVillages, 'Only admins and supervisors can change villages.');
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { households?: number; altitude_m?: number | null };
    if (b.households !== undefined && (!Number.isInteger(Number(b.households)) || Number(b.households) < 0)) throw fail(400, 'Households must be a whole number.');
    await db.query('UPDATE villages SET households = COALESCE($1, households), altitude_m = COALESCE($2, altitude_m) WHERE id=$3',
      [b.households ?? null, b.altitude_m ?? null, id]);
    await audit(db, u, 'update_village', 'village', id, b);
    return { ok: true };
  });

  /* ------------------------------------------------------------- notes */
  app.get('/api/notes', async req => {
    const u = signedIn(req);
    const villageId = Number((req.query as Q).village_id);
    const scope = await scopeOf(db, u);
    if (scope && !scope.includes(villageId)) throw fail(403, 'This village is outside your assignment.');
    return { rows: (await db.query(
      `SELECT n.id, n.dim, n.note, n.created_at, u.name AS author FROM notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.village_id = $1 ORDER BY n.created_at DESC`, [villageId])).rows };
  });

  app.post('/api/notes', async req => {
    const u = signedIn(req);
    need(rightsOf(u).addData || rightsOf(u).review, 'Your role cannot add field notes.');
    const b = (req.body ?? {}) as { village_id?: number; dim?: string; note?: string };
    if (!b.village_id || !String(b.note ?? '').trim()) throw fail(400, 'A village and a note are required.');
    const scope = await scopeOf(db, u);
    if (scope && !scope.includes(Number(b.village_id))) throw fail(403, 'This village is outside your assignment.');
    await db.query('INSERT INTO notes (village_id, dim, note, author_id) VALUES ($1,$2,$3,$4)', [b.village_id, b.dim || null, b.note!.trim(), u.id]);
    return { ok: true };
  });

  /* ------------------------------------------------------------ export */
  app.get('/api/export.csv', async (req, reply) => {
    const u = signedIn(req);
    const R = rightsOf(u);
    need(R.export !== 'none', 'Your role cannot export data.');
    const anon = R.export === 'anon';
    const rows = applyFilters(await loadRows(db, await scopeOf(db, u)), parseFilters(req.query as Q));
    const items = SECTIONS.flatMap(s => s.items);
    const cell = (v: unknown) => {
      const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['survey_id', 'household_code', 'village', 'district', 'status', 'submitted_at', 'duration_min',
      'score', 'band', ...DIMENSIONS.map(d => `dim_${d.id}`), ...items.map(i => i.id)];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.id, anon ? '' : r.householdCode, r.village, r.district, r.status, r.submittedAt, r.durationMin,
        r.score?.score, r.score?.band, ...DIMENSIONS.map(d => r.score?.dims[d.id]?.score),
        ...items.map(i => r.answers[i.id])].map(cell).join(','));
    }
    await audit(db, u, 'export', 'submissions', null, { rows: rows.length, anon });
    reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="dyeskit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return lines.join('\n');
  });

  /* ------------------------------------------------------------- admin */
  app.get('/api/audit', async req => {
    const u = signedIn(req);
    need(rightsOf(u).audit, 'Your role cannot see the audit log.');
    return { rows: (await db.query('SELECT id, at, user_name, action, entity, entity_id, detail FROM audit ORDER BY id DESC LIMIT 300')).rows };
  });

  app.post('/api/rescore', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageUsers, 'Only admins can recalculate scores.');
    const n = await rescoreOutdated(db, true);
    await audit(db, u, 'rescore_all', 'scores', null, { n, version: SCORING_VERSION });
    return { ok: true, rescored: n, version: SCORING_VERSION };
  });

  /* ----------------------------------------------------- web dashboard */
  // The same app, built for the web (npm run build:web), is served from here for computers.
  if (fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
    // wildcard: serve whatever is in the build folder, including files added by a rebuild
    await app.register(fastifyStatic, { root: WEB_DIR });
    app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({ name: 'DYESKIT API', health: '/api/health', note: 'Build the web app with "npm run build:web" to serve it here.' }));
  }

  return app;
}

function publicUser(u: Record<string, any>) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status };
}
