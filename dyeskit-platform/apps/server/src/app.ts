import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import {
  BANDS, CONSENT_TEXT, DIMENSIONS, DISTRICTS, ITEMS, QUESTIONNAIRE_VERSION, ROLES, ROLE_RIGHTS, SCORING_VERSION, SECTIONS,
  PUBLIC_MIN_SURVEYS, compareRounds, districtName, ORGANISATION, PRIVACY_POLICY, PRIVACY_UPDATED, RESPONDENT_SURVEY_LIMIT, maskPhone, normalizePhone, surveyIssues, computeDashboard, computeInsights, publicDashboard, scoreHousehold, type Role,
} from '@dyeskit/core';
import { audit, type Db } from './db';
import { CODE_MINUTES, checkCode, createCode, createTicket, redeemTicket } from './otp';
import { phoneSignInAvailable, revealCodes, sendSms } from './sms';
import { reportHtml } from './report';
import { SUGGESTIONS, ask, assistantMode, type ChatTurn } from './assistant';
import {
  NO_PASSWORD, PASSWORD_RULE, assignedVillageIds, bearer, createSession, endSession, eraseUser, hashPassword, passwordOk, rightsOf, scopeOf,
  userFromToken, verifyPassword, type SessionUser,
} from './auth';
import {
  applyFilters, counts, currentRound, getAnswers, issueChecker, loadRows, newVillageCode, parseFilters, rescore, rescoreOutdated, saveAnswers, storeUpload,
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

export async function buildApp(db: Db, opts: { logger?: boolean; rateLimits?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024, trustProxy: true });
  // every method the API uses (the plugin's default leaves out PATCH and DELETE)
  await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  if (opts.rateLimits !== false) {
    // a generous cap for everything, and tight limits on sign-in and registration (see limit() below)
    await app.register(rateLimit, {
      max: 600, timeWindow: '1 minute',
      errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, message: `Too many attempts. Please wait ${ctx.after} and try again.` }),
    });
  }

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
    return { ok: true, database: db.kind, scoring: SCORING_VERSION, questionnaire: QUESTIONNAIRE_VERSION, demo, phoneSignIn: phoneSignInAvailable() };
  });

  /* -------------------------------------------------------------- auth */
  /** Sign-in limits per address (IP): a few tries, then wait. Off in tests that do not test them. */
  const limit = (max: number, minutes: number) => ({ config: { rateLimit: { max, timeWindow: `${minutes} minutes` } } });

  /** What a successful sign-in returns, by password or by phone code. */
  const startSession = async (u: Record<string, any>) => {
    const token = await createSession(db, u.id);
    await db.query('UPDATE users SET last_login = now() WHERE id=$1', [u.id]);
    await audit(db, { id: u.id, name: u.name }, 'login', 'user', u.id);
    return { token, user: publicUser(u), rights: ROLE_RIGHTS[u.role as Role], assigned: await assignedVillageIds(db, u.id) };
  };
  const statusBlock = (u: Record<string, any>) =>
    u.status === 'pending' ? { code: 403, body: { error: 'Your registration is waiting for an admin to approve it.', status: 'pending' } }
      : u.status !== 'active' ? { code: 403, body: { error: 'This account has been disabled. Please contact your admin.', status: u.status } }
        : null;
  /** A user by email or phone number, whichever was typed. */
  const findUser = async (identifier: string) => {
    const id = identifier.trim();
    if (id.includes('@')) return (await db.query('SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [id])).rows[0];
    const phone = normalizePhone(id);
    return phone ? (await db.query('SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL', [phone])).rows[0] : undefined;
  };
  const phoneTaken = async (phone: string) => (await db.query('SELECT 1 FROM users WHERE phone=$1 AND deleted_at IS NULL', [phone])).rows.length > 0;

  app.post('/api/auth/login', limit(10, 15), async (req, reply) => {
    const b = (req.body ?? {}) as { email?: string; password?: string };
    const identifier = String(b.email ?? '').trim();
    const u = await findUser(identifier);
    if (!u || !verifyPassword(String(b.password ?? ''), u.password_hash)) {
      await audit(db, null, 'login_failed', 'user', identifier);
      return reply.code(401).send({ error: 'That email (or phone) and password do not match.' });
    }
    const blocked = statusBlock(u);
    if (blocked) return reply.code(blocked.code).send(blocked.body);
    return startSession(u);
  });

  app.post('/api/auth/register', limit(5, 60), async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; email?: string; phone?: string; password?: string; kind?: string; acceptPrivacy?: boolean };
    const name = String(b.name ?? '').trim(), email = String(b.email ?? '').trim().toLowerCase(), password = String(b.password ?? '');
    // household members can sign in at once; staff wait for an admin
    const household = b.kind !== 'staff';
    if (!name || !email || !password) return reply.code(400).send({ error: 'Name, email and password are required.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: 'Please enter a valid email address.' });
    if (!passwordOk(password)) return reply.code(400).send({ error: `Password: ${PASSWORD_RULE}` });
    if (b.acceptPrivacy !== true) return reply.code(400).send({ error: 'Please read and accept the privacy policy.' });
    const phone = b.phone?.trim() ? normalizePhone(b.phone) : null;
    if (b.phone?.trim() && !phone) return reply.code(400).send({ error: 'Please enter a valid phone number, e.g. 98765 43210.' });
    const { rows } = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (rows.length) return reply.code(409).send({ error: 'That email is already registered.' });
    if (phone && await phoneTaken(phone)) return reply.code(409).send({ error: 'That phone number is already registered.' });
    const role = household ? 'respondent' : 'collector';
    await db.query(`INSERT INTO users (name, email, phone, role, status, password_hash, privacy_accepted_at) VALUES ($1,$2,$3,$4,$5,$6, now())`,
      [name, email, phone, role, household ? 'active' : 'pending', hashPassword(password)]);
    await audit(db, null, 'register', 'user', email, { role });
    return household
      ? { ok: true, active: true, message: 'Your account is ready. Sign in to fill in your household’s details.' }
      : { ok: true, active: false, message: 'Registration received. An admin will review and approve your account.' };
  });

  /* ---- phone: one-time codes by text message ---- */
  /**
   * purpose "signin": a code to the number typed (works for new and existing accounts).
   * purpose "reset": the number may be typed, or an email given — the code goes to the phone
   * number on that account. The answer is the same whether or not an account matches.
   */
  app.post('/api/auth/otp/send', limit(5, 15), async (req, reply) => {
    if (!phoneSignInAvailable()) return reply.code(503).send({ error: 'Signing in with a phone number is not available yet.' });
    const b = (req.body ?? {}) as { phone?: string; identifier?: string; purpose?: string };
    if (b.purpose === 'reset') {
      const u = await findUser(String(b.identifier ?? b.phone ?? ''));
      const generic = { ok: true, message: 'If an account matches, a code has been sent to the phone number on it.' };
      if (!u?.phone) return generic;
      const code = await createCode(db, u.phone, 'reset');
      await sendSms(u.phone, `Your DYESKIT code to reset your password is ${code}. It expires in ${CODE_MINUTES} minutes.`);
      return { ...generic, sentTo: maskPhone(u.phone), ...(revealCodes() ? { devCode: code } : {}) };
    }
    const phone = normalizePhone(b.phone);
    if (!phone) return reply.code(400).send({ error: 'Please enter a valid phone number, e.g. 98765 43210.' });
    const code = await createCode(db, phone, 'signin');
    await sendSms(phone, `Your DYESKIT sign-in code is ${code}. It expires in ${CODE_MINUTES} minutes. Do not share it.`);
    return { ok: true, sentTo: maskPhone(phone), ...(revealCodes() ? { devCode: code } : {}) };
  });

  /** A correct code signs in an existing account, or hands back a ticket to create one. */
  app.post('/api/auth/otp/verify', limit(10, 15), async (req, reply) => {
    const b = (req.body ?? {}) as { phone?: string; code?: string };
    const phone = normalizePhone(b.phone);
    if (!phone) return reply.code(400).send({ error: 'Please enter a valid phone number.' });
    await checkCode(db, phone, 'signin', String(b.code ?? ''));
    const u = (await db.query('SELECT * FROM users WHERE phone=$1 AND deleted_at IS NULL', [phone])).rows[0];
    if (!u) return { needsAccount: true, ticket: await createTicket(db, phone), phone: maskPhone(phone) };
    const blocked = statusBlock(u);
    if (blocked) return reply.code(blocked.code).send(blocked.body);
    return startSession(u);
  });

  /** Finish registering a verified phone number: name, kind, privacy consent. No password needed. */
  app.post('/api/auth/register-phone', limit(5, 60), async (req, reply) => {
    const b = (req.body ?? {}) as { ticket?: string; name?: string; kind?: string; acceptPrivacy?: boolean };
    const name = String(b.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'Please enter your name.' });
    if (b.acceptPrivacy !== true) return reply.code(400).send({ error: 'Please read and accept the privacy policy.' });
    const phone = await redeemTicket(db, String(b.ticket ?? ''));
    if (await phoneTaken(phone)) return reply.code(409).send({ error: 'That phone number is already registered. Please sign in.' });
    const household = b.kind !== 'staff';
    const role = household ? 'respondent' : 'collector';
    const r = await db.query(`INSERT INTO users (name, phone, role, status, password_hash, privacy_accepted_at) VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`,
      [name, phone, role, household ? 'active' : 'pending', NO_PASSWORD]);
    await audit(db, null, 'register', 'user', maskPhone(phone), { role, by: 'phone' });
    if (!household) return { ok: true, active: false, message: 'Registration received. An admin will review and approve your account.' };
    return { ok: true, active: true, ...(await startSession(r.rows[0])) };
  });

  /** Forgot password: the code sent to the account's phone, and a new password. */
  app.post('/api/auth/password/reset', limit(10, 15), async (req, reply) => {
    const b = (req.body ?? {}) as { identifier?: string; code?: string; password?: string };
    const password = String(b.password ?? '');
    if (!passwordOk(password)) return reply.code(400).send({ error: `Password: ${PASSWORD_RULE}` });
    const u = await findUser(String(b.identifier ?? ''));
    if (!u?.phone) return reply.code(400).send({ error: 'That code is not correct.' });
    await checkCode(db, u.phone, 'reset', String(b.code ?? ''));
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(password), u.id]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    await audit(db, { id: u.id, name: u.name }, 'password_reset', 'user', u.id);
    return { ok: true, message: 'Your password has been changed. Please sign in.' };
  });

  app.post('/api/auth/logout', async req => {
    const token = bearer(req.headers.authorization);
    if (token) await endSession(db, token);
    return { ok: true };
  });

  app.get('/api/me', async req => {
    const u = signedIn(req);
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [u.id]);
    return { user: u, rights: rightsOf(u), assigned: await assignedVillageIds(db, u.id), hasPassword: rows[0].password_hash !== NO_PASSWORD };
  });

  /** Change (or, for phone-only accounts, set) your password. */
  app.post('/api/me/password', limit(10, 15), async req => {
    const u = signedIn(req);
    const b = (req.body ?? {}) as { current?: string; password?: string };
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [u.id]);
    const hasPassword = rows[0].password_hash !== NO_PASSWORD;
    if (hasPassword && !verifyPassword(String(b.current ?? ''), rows[0].password_hash)) throw fail(401, 'Your current password is not correct.');
    if (!passwordOk(String(b.password ?? ''))) throw fail(400, `Password: ${PASSWORD_RULE}`);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(String(b.password)), u.id]);
    await audit(db, u, 'password_changed', 'user', u.id);
    return { ok: true };
  });

  /** Account deletion (required by Apple and Google): personal details are erased; surveys stay, unlinked. */
  app.delete('/api/me', async (req, reply) => {
    const u = signedIn(req);
    const b = (req.body ?? {}) as { password?: string };
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [u.id]);
    // accounts made with a phone number and no password confirm by being signed in
    if (rows[0].password_hash !== NO_PASSWORD && !verifyPassword(String(b.password ?? ''), rows[0].password_hash)) {
      return reply.code(401).send({ error: 'Password is not correct.' });
    }
    await db.tx(async q => {
      await eraseUser(q, u.id);
      await audit(q, { id: u.id, name: 'Deleted user' }, 'delete_account', 'user', u.id);
    });
    return { ok: true };
  });

  /* -------------------------------------------------------------- meta */
  app.get('/api/meta', async req => {
    const u = signedIn(req);
    const villages = (await db.query(
      `SELECT v.id, v.district, v.code, v.name, v.gazette_name, v.subdivision, v.block, v.households, v.altitude_m, v.official,
              v.lat, v.lon, v.location_source,
              (SELECT count(*)::int FROM submissions s WHERE s.village_id = v.id AND s.deleted_at IS NULL) AS surveys
       FROM villages v WHERE v.archived_at IS NULL ORDER BY v.name`)).rows;
    const collectors = rightsOf(u).read === 'own' ? [] : (await db.query(
      `SELECT id, name FROM users WHERE role IN ('collector','supervisor','admin') AND status='active' AND deleted_at IS NULL ORDER BY name`)).rows;
    return {
      user: u, rights: rightsOf(u), assigned: await assignedVillageIds(db, u.id),
      districts: DISTRICTS, villages, collectors, roles: ROLES,
      questionnaire: { version: QUESTIONNAIRE_VERSION, sections: SECTIONS, consent: CONSENT_TEXT },
      dimensions: DIMENSIONS, bands: BANDS, scoringVersion: SCORING_VERSION,
      rounds: (await db.query(
        `SELECT r.id, r.name, r.started_at, r.closed_at,
                (SELECT count(*)::int FROM submissions s WHERE s.round_id = r.id AND s.deleted_at IS NULL) AS surveys
         FROM rounds r ORDER BY r.started_at, r.id`)).rows,
      currentRoundId: (await currentRound(db)).id,
    };
  });

  /* --------------------------------------------------------- analytics */
  app.get('/api/dashboard', async req => {
    const u = signedIn(req);
    if (rightsOf(u).read === 'own') {
      // household members: the Ladakh-wide picture only, whatever filters are asked for
      const cur = (await currentRound(db)).id;
      const everyRound = applyFilters(await loadRows(db, null), parseFilters({}, null)).filter(counts);
      const rows = everyRound.filter(r => r.roundId === cur);
      return { ...publicDashboard(computeDashboard(rows, await villagesInfo(db, null))),
        rounds: compareRounds(everyRound).filter(r => r.n >= PUBLIC_MIN_SURVEYS) };
    }
    const scope = await scopeOf(db, u);
    const cur = (await currentRound(db)).id;
    const all = (await loadRows(db, scope)).filter(counts);
    const f = parseFilters(req.query as Q, cur);
    const rows = applyFilters(all, f);
    let villages = await villagesInfo(db, scope);
    if (f.district) villages = villages.filter(v => v.district === f.district);
    if (f.villageIds.length) villages = villages.filter(v => f.villageIds.includes(v.id));
    const baseline = applyFilters(all, parseFilters({}, f.round));
    // the same filters, every round: how this group changed over time
    const rounds = compareRounds(applyFilters(all, { ...f, round: null }));
    return { ...computeDashboard(rows, villages, baseline), rounds };
  });

  app.get('/api/insights', async req => {
    const u = signedIn(req);
    need(rightsOf(u).read !== 'own', 'Insights are for project staff.');
    const scope = await scopeOf(db, u);
    const rows = applyFilters(await loadRows(db, scope), parseFilters(req.query as Q, (await currentRound(db)).id)).filter(counts);
    return computeInsights(rows, await villagesInfo(db, scope));
  });

  /* --------------------------------------------------------- assistant */
  app.get('/api/assistant', async req => {
    need(rightsOf(signedIn(req)).read !== 'own', 'The assistant is for project staff.');
    return { mode: assistantMode(), suggestions: SUGGESTIONS };
  });

  app.post('/api/assistant', limit(30, 10), async req => {
    const u = signedIn(req);
    need(rightsOf(u).read !== 'own', 'The assistant is for project staff.');
    const b = (req.body ?? {}) as { question?: string; history?: ChatTurn[]; round?: string };
    const question = String(b.question ?? '').trim().slice(0, 500);
    if (!question) throw fail(400, 'Ask a question.');
    const history = (Array.isArray(b.history) ? b.history : [])
      .filter(t => (t?.role === 'user' || t?.role === 'assistant') && typeof t.text === 'string')
      .map(t => ({ role: t.role, text: t.text.slice(0, 2000) }));
    const scope = await scopeOf(db, u);
    const cur = await currentRound(db);
    const roundId = b.round === 'all' ? null : b.round ? Number(b.round) : cur.id;
    const roundName = roundId === null ? 'all rounds'
      : (await db.query<{ name: string }>('SELECT name FROM rounds WHERE id=$1', [roundId])).rows[0]?.name ?? cur.name;
    const codes = await db.query<{ id: number; code: string }>('SELECT id, code FROM villages');
    return ask({
      rows: (await loadRows(db, scope)).filter(r => counts(r) && r.status !== 'rejected'),
      roundId, roundName,
      villages: await villagesInfo(db, scope),
      villageCodes: new Map(codes.rows.map(r => [r.id, r.code])),
    }, question, history, msg => req.log.warn(msg));
  });

  /* ------------------------------------------------------- submissions */
  app.get('/api/submissions', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    const q = req.query as Q;
    // the list shows every status, rejected included; dashboards leave rejected surveys out
    const everything = await loadRows(db, await scopeOf(db, u));
    const issuesOf = issueChecker(everything);
    const rows = applyFilters(everything, parseFilters(q, R.read === 'own' ? null : (await currentRound(db)).id), { allStatuses: true })
      .filter(r => R.read !== 'own' || r.collectorId === u.id)
      .filter(r => !q.source || r.source === q.source)
      .map(r => ({ ...r, issues: issuesOf(r) }))
      .filter(r => !q.flagged || r.issues.length > 0);
    const limit = Math.min(500, Number(q.limit) || 100), offset = Number(q.offset) || 0;
    return {
      total: rows.length,
      rows: rows.slice(offset, offset + limit).map(r => ({
        id: r.id, householdCode: R.pii || r.collectorId === u.id ? r.householdCode : `HH-${r.id.slice(0, 6)}`, village: r.village, villageId: r.villageId,
        district: r.district, status: r.status, submittedAt: r.submittedAt, durationMin: r.durationMin,
        score: r.score?.score ?? null, band: r.score?.band ?? null, collectorId: r.collectorId, source: r.source,
        collectorName: R.read === 'all' || R.read === 'assigned' ? r.collectorName : null,
        round: r.roundName, roundId: r.roundId,
        issues: R.review || R.editAny ? r.issues : [],
      })),
    };
  });

  /** A household member and their own (not deleted) survey: they may edit or delete it at any time. */
  const householdOwns = (u: SessionUser, s: Record<string, any>) =>
    rightsOf(u).read === 'own' && s.collector_id === u.id && !s.deleted_at;

  const loadSubmission = async (u: SessionUser, id: string) => {
    const { rows } = await db.query(
      `SELECT su.*, v.name AS village, v.district, v.code AS village_code, h.code AS household_code, h.head_name, h.phone,
              c.name AS collector_name, r.name AS reviewer_name, rd.name AS round_name
       FROM submissions su JOIN villages v ON v.id = su.village_id JOIN households h ON h.id = su.household_id
       LEFT JOIN users c ON c.id = su.collector_id LEFT JOIN users r ON r.id = su.reviewed_by
       JOIN rounds rd ON rd.id = su.round_id
       WHERE su.id = $1`, [id]);
    const s = rows[0];
    if (!s) throw fail(404, 'Survey not found.');
    const scope = await scopeOf(db, u);
    if (scope && !scope.includes(s.village_id)) throw fail(403, 'This survey is outside your villages.');
    if (rightsOf(u).read === 'own' && s.collector_id !== u.id) throw fail(403, 'You can only see your own survey.');
    return s;
  };

  app.get('/api/submissions/:id', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    const s = await loadSubmission(u, (req.params as { id: string }).id);
    const pii = R.pii || s.collector_id === u.id;   // people always see what they entered themselves
    const answers = await getAnswers(db, s.id);
    const history = (await db.query(
      `SELECT h.item_id, h.old_value, h.new_value, h.changed_at, h.reason, u.name AS changed_by
       FROM answer_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.submission_id = $1 ORDER BY h.id DESC LIMIT 100`, [s.id])).rows;
    return {
      submission: {
        id: s.id, village: s.village, villageId: s.village_id, district: s.district, status: s.status,
        householdCode: pii ? s.household_code : `HH-${s.id.slice(0, 6)}`, headName: pii ? s.head_name : null, phone: pii ? s.phone : null,
        collector: s.collector_name, collectorId: s.collector_id, reviewer: s.reviewer_name, reviewNote: s.review_note,
        startedAt: s.started_at, submittedAt: s.submitted_at, durationMin: s.duration_min, deletedAt: s.deleted_at,
        questionnaireVersion: s.questionnaire_version, source: s.source, round: s.round_name,
      },
      answers, score: scoreHousehold(answers), history,
      issues: R.review || R.editAny ? await (async () => {
        const villageRows = await loadRows(db, [s.village_id]);
        const row = villageRows.find(r => r.id === s.id);
        return row ? issueChecker(villageRows)(row) : surveyIssues({ answers, score: scoreHousehold(answers), durationMin: s.duration_min });
      })() : [],
      canEdit: R.editAny || householdOwns(u, s) || (R.read !== 'own' && s.collector_id === u.id && s.status !== 'approved'),
      canReview: R.review, canDelete: R.delete || householdOwns(u, s),
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
        results.push({ ok: true, ...(await storeUpload(db, u, R.read === 'own' ? { ...s, household_id: null } : s, R.read === 'own'
          ? { source: 'self', limit: RESPONDENT_SURVEY_LIMIT, ownHousehold: true } : { source: 'researcher' })) });
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
    const household = householdOwns(u, s);
    // household members only through their own rule (never a deleted survey); researchers until approval
    need(R.editAny || household || (R.read !== 'own' && s.collector_id === u.id && s.status !== 'approved'), 'You cannot edit this survey.');
    const b = (req.body ?? {}) as { answers?: Record<string, unknown>; reason?: string; headName?: string; phone?: string };
    if (household && !String(b.reason ?? '').trim()) b.reason = 'Updated by the household';
    if (b.answers && !String(b.reason ?? '').trim()) throw fail(400, 'Please give a reason for the correction.');
    const score = await db.tx(async q => {
      if (b.answers) {
        const known = Object.fromEntries(Object.entries(b.answers).filter(([k]) => ITEMS[k]));
        await saveAnswers(q, s.id, known, u.id, String(b.reason));
      }
      if ((R.pii || household) && (b.headName !== undefined || b.phone !== undefined)) {
        await q.query('UPDATE households SET head_name = COALESCE($1, head_name), phone = COALESCE($2, phone) WHERE id = $3',
          [b.headName ?? null, b.phone ?? null, s.household_id]);
      }
      await q.query('UPDATE submissions SET updated_at = now() WHERE id=$1', [s.id]);
      // a household changing a checked survey, or anyone fixing their own sent-back survey,
      // puts it back in the queue for review
      if ((household && s.status !== 'submitted') || (s.collector_id === u.id && s.status === 'rejected')) {
        await q.query(`UPDATE submissions SET status='submitted', reviewed_by=NULL, reviewed_at=NULL, review_note=NULL WHERE id=$1`, [s.id]);
      }
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
    const s = await loadSubmission(u, (req.params as { id: string }).id);
    const household = householdOwns(u, s);
    need(rightsOf(u).delete || household, 'Only admins can delete surveys.');
    const reason = String(((req.body ?? {}) as { reason?: string }).reason ?? '').trim() || (household ? 'Deleted by the household' : '');
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

  /* ------------------------------------------------------------- alerts */
  /**
   * What needs the signed-in person's attention, for the red dot and the Home banners:
   * registrations to approve (admins), surveys to review (supervisors and admins), and the
   * person's own surveys that were sent back (field researchers and households).
   */
  app.get('/api/alerts', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    const out: { pendingUsers: number; waitingReview: number; needsLook: number; sentBack: { id: string; householdCode: string; village: string; note: string | null }[] } =
      { pendingUsers: 0, waitingReview: 0, needsLook: 0, sentBack: [] };
    if (R.manageUsers) {
      out.pendingUsers = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE status='pending' AND deleted_at IS NULL`)).rows[0].n;
    }
    if (R.review) {
      const everything = await loadRows(db, await scopeOf(db, u));
      const issuesOf = issueChecker(everything);
      const rows = everything.filter(r => r.status === 'submitted');   // every round: nothing is left unreviewed
      out.waitingReview = rows.length;
      out.needsLook = rows.filter(r => issuesOf(r).length).length;
    }
    if (R.addData) {
      out.sentBack = (await db.query(
        `SELECT su.id, h.code AS "householdCode", v.name AS village, su.review_note AS note
         FROM submissions su JOIN households h ON h.id = su.household_id JOIN villages v ON v.id = su.village_id
         WHERE su.collector_id = $1 AND su.status = 'rejected' AND su.deleted_at IS NULL ORDER BY su.reviewed_at DESC LIMIT 20`, [u.id])).rows as never;
    }
    return out;
  });

  /* ----------------------------------------------------------- all data */
  /**
   * Counts for reviewing data district by district and village by village: surveys, waiting
   * review, rejected, self-reported, and how many need a look (see packages/core/src/quality.ts).
   */
  app.get('/api/data/summary', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    need(R.review || R.editAny, 'Only admins and supervisors can review all data.');
    const q = req.query as Q;
    const round = q.round === 'all' ? null : q.round ? Number(q.round) : (await currentRound(db)).id;
    const everything = await loadRows(db, await scopeOf(db, u));
    const issuesOf = issueChecker(everything);
    const rows = everything.filter(r => !round || r.roundId === round).map(r => ({ ...r, flagged: issuesOf(r).length > 0 }));
    const villages = await db.query<{ id: number; name: string; code: string; district: string; households: number }>(
      'SELECT id, name, code, district, households FROM villages WHERE archived_at IS NULL');
    const count = (rs: typeof rows) => ({
      surveys: rs.length,
      waiting: rs.filter(r => r.status === 'submitted').length,
      rejected: rs.filter(r => r.status === 'rejected').length,
      self: rs.filter(r => r.source === 'self').length,
      flagged: rs.filter(r => r.flagged).length,
      lastAt: rs.reduce<string | null>((m, r) => (r.submittedAt && (!m || r.submittedAt > m) ? r.submittedAt : m), null),
    });
    return {
      districts: DISTRICTS.map(d => {
        const rs = rows.filter(r => r.district === d.id);
        return { id: d.id, name: d.name, letter: d.letter, villages: villages.rows.filter(v => v.district === d.id).length,
          villagesWithData: new Set(rs.map(r => r.villageId)).size, ...count(rs) };
      }),
      villages: villages.rows.map(v => ({ ...v, ...count(rows.filter(r => r.villageId === v.id)) })).filter(v => v.surveys > 0),
    };
  });

  /** Approve (or send back) several surveys at once — e.g. every clean survey waiting in a village. */
  app.post('/api/submissions/review-bulk', async req => {
    const u = signedIn(req);
    need(rightsOf(u).review, 'Only supervisors and admins can review surveys.');
    const b = (req.body ?? {}) as { ids?: string[]; status?: string };
    if (b.status !== 'approved') throw fail(400, 'Only bulk approval is supported; send surveys back one by one with a note.');
    const scope = await scopeOf(db, u);
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter(id => /^[0-9a-f-]{36}$/i.test(String(id))).slice(0, 1000);
    const { rows } = await db.query<{ id: string; village_id: number }>(
      `SELECT id, village_id FROM submissions WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND status = 'submitted'`, [ids]);
    const allowed = rows.filter(r => !scope || scope.includes(r.village_id)).map(r => r.id);
    if (allowed.length) {
      await db.query(`UPDATE submissions SET status='approved', reviewed_by=$1, reviewed_at=now(), updated_at=now() WHERE id = ANY($2::uuid[])`, [u.id, allowed]);
      await audit(db, u, 'review_approved_bulk', 'submission', null, { count: allowed.length });
    }
    return { ok: true, approved: allowed.length };
  });

  /* ----------------------------------------------------------- reports */
  /** A printable report for one village (?village_id=) or one district (?district=), totals only. */
  app.get('/api/report', async (req, reply) => {
    const u = signedIn(req);
    need(rightsOf(u).read !== 'own', 'Reports are for project staff.');
    const q = req.query as Q;
    const scope = await scopeOf(db, u);
    const cur = await currentRound(db);
    const f = parseFilters({ village_id: q.village_id, district: q.district, round: q.round }, cur.id);
    if (!f.villageIds.length && !f.district) throw fail(400, 'Choose a village or a district.');
    const all = (await loadRows(db, scope)).filter(counts);
    const rows = applyFilters(all, f);
    let villages = await villagesInfo(db, scope);
    villages = villages.filter(v => (f.villageIds.length ? f.villageIds.includes(v.id) : v.district === f.district));
    const roundName = f.round ? (await db.query<{ name: string }>('SELECT name FROM rounds WHERE id=$1', [f.round])).rows[0]?.name ?? cur.name : 'all rounds';
    let title: string, subtitle: string, households: number | null = null;
    if (f.villageIds.length) {
      const v = (await db.query('SELECT name, district, block, code, households FROM villages WHERE id=$1', [f.villageIds[0]])).rows[0];
      if (!v) throw fail(404, 'Village not found.');
      if (scope && !scope.includes(f.villageIds[0])) throw fail(403, 'This village is outside your assignment.');
      title = v.name;
      subtitle = [`${districtName(v.district)} district`, v.block && `${v.block} block`, `village code ${v.code}`].filter(Boolean).join(' · ');
      households = v.households || null;
    } else {
      title = `${districtName(f.district)} district`;
      subtitle = `${villages.length} villages${scope ? ' assigned to you' : ''} · ${new Set(rows.map(r => r.villageId)).size} with surveys this round`;
    }
    const html = reportHtml({
      title, subtitle, roundName, households,
      dashboard: computeDashboard(rows, villages),
      insights: computeInsights(rows, villages),
      rounds: compareRounds(applyFilters(all, { ...f, round: null })),
      generatedBy: u.name,
    });
    await audit(db, u, 'report', f.villageIds.length ? 'village' : 'district', f.villageIds[0] ?? f.district);
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return html;
  });

  /* ------------------------------------------------------------ rounds */
  /** Start a new survey round (e.g. "2027"). The current one closes; its surveys stay as they are. */
  app.post('/api/rounds', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageUsers, 'Only admins can start a new round.');
    const name = String(((req.body ?? {}) as { name?: string }).name ?? '').trim();
    if (!name || name.length > 40) throw fail(400, 'Give the round a short name, e.g. 2027.');
    const exists = await db.query('SELECT 1 FROM rounds WHERE lower(name) = lower($1)', [name]);
    if (exists.rows.length) throw fail(409, `There is already a round called ${name}.`);
    const r = await db.tx(async q => {
      await q.query('UPDATE rounds SET closed_at = now() WHERE closed_at IS NULL');
      return (await q.query<{ id: number }>('INSERT INTO rounds (name) VALUES ($1) RETURNING id', [name])).rows[0];
    });
    await audit(db, u, 'start_round', 'round', r.id, { name });
    return { ok: true, id: r.id, name };
  });

  /**
   * Households in a village, for surveying one again in a new round (staff who collect). Shows
   * whether each has already been surveyed in the current round.
   */
  app.get('/api/households', async req => {
    const u = signedIn(req);
    const R = rightsOf(u);
    need(R.addData && R.read !== 'own', 'Only project staff can look up households.');
    const villageId = Number((req.query as Q).village_id);
    const scope = await scopeOf(db, u);
    if (scope && !scope.includes(villageId)) throw fail(403, 'This village is not assigned to you.');
    const cur = (await currentRound(db)).id;
    const { rows } = await db.query(
      `SELECT h.id, h.code, h.head_name AS "headName",
              max(s.submitted_at) AS "lastSurveyAt",
              bool_or(s.round_id = $2) AS "surveyedThisRound"
       FROM households h JOIN submissions s ON s.household_id = h.id AND s.deleted_at IS NULL
       WHERE h.village_id = $1 GROUP BY h.id ORDER BY h.seq`, [villageId, cur]);
    return { rows: rows.map(r => ({ ...r, headName: R.pii ? r.headName : null })) };
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
    if (!b.name || (!b.email && !b.phone) || !b.password || !b.role) throw fail(400, 'Name, email or phone, role and a temporary password are required.');
    const phone = b.phone ? normalizePhone(b.phone) : null;
    if (b.phone && !phone) throw fail(400, 'Please enter a valid phone number.');
    if (phone && await phoneTaken(phone)) throw fail(409, 'That phone number is already registered.');
    if (!ROLE_RIGHTS[b.role]) throw fail(400, 'Unknown role.');
    if (!passwordOk(b.password)) throw fail(400, `Password: ${PASSWORD_RULE}`);
    if (b.email) {
      const exists = await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [b.email]);
      if (exists.rows.length) throw fail(409, 'That email is already registered.');
    }
    const r = await db.query(`INSERT INTO users (name, email, phone, role, status, password_hash) VALUES ($1,$2,$3,$4,'active',$5) RETURNING id`,
      [b.name.trim(), b.email ? b.email.trim().toLowerCase() : null, phone, b.role, hashPassword(b.password)]);
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

  /** Admins delete a person: erased as in "Delete my account"; their surveys stay. */
  app.delete('/api/users/:id', async req => {
    const u = signedIn(req);
    need(rightsOf(u).manageUsers, 'Only admins can delete users.');
    const id = Number((req.params as { id: string }).id);
    if (id === u.id) throw fail(400, 'You cannot delete your own account here — use Account & privacy.');
    const { rows } = await db.query('SELECT id, name, email, role FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    const target = rows[0];
    if (!target) throw fail(404, 'User not found.');
    if (target.role === 'admin') {
      const admins = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND status='active' AND deleted_at IS NULL`);
      if (admins.rows[0].n <= 1) throw fail(400, 'This is the last admin. Make someone else an admin first.');
    }
    await db.tx(async q => {
      await eraseUser(q, id);
      await audit(q, u, 'delete_user', 'user', id, { name: target.name, email: target.email, role: target.role });
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
    const b = (req.body ?? {}) as { households?: number; altitude_m?: number | null; lat?: number; lon?: number };
    if (b.households !== undefined && (!Number.isInteger(Number(b.households)) || Number(b.households) < 0)) throw fail(400, 'Households must be a whole number.');
    await db.query('UPDATE villages SET households = COALESCE($1, households), altitude_m = COALESCE($2, altitude_m) WHERE id=$3',
      [b.households ?? null, b.altitude_m ?? null, id]);
    if (b.lat !== undefined || b.lon !== undefined) {
      const lat = Number(b.lat), lon = Number(b.lon);
      // roughly Ladakh, with room to spare: catches swapped or mistyped numbers
      if (!(lat >= 31 && lat <= 37 && lon >= 74 && lon <= 81)) throw fail(400, 'That location is not in Ladakh. Check latitude (about 32–36) and longitude (about 75–80).');
      await db.query(`UPDATE villages SET lat=$1, lon=$2, location_source='manual' WHERE id=$3`, [lat, lon, id]);
    }
    await audit(db, u, 'update_village', 'village', id, b);
    return { ok: true };
  });

  /* ------------------------------------------------------------- notes */
  app.get('/api/notes', async req => {
    const u = signedIn(req);
    need(rightsOf(u).read !== 'own', 'Field notes are for project staff.');
    const villageId = Number((req.query as Q).village_id);
    const scope = await scopeOf(db, u);
    if (scope && !scope.includes(villageId)) throw fail(403, 'This village is outside your assignment.');
    return { rows: (await db.query(
      `SELECT n.id, n.dim, n.note, n.created_at, u.name AS author FROM notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.village_id = $1 ORDER BY n.created_at DESC`, [villageId])).rows };
  });

  app.post('/api/notes', async req => {
    const u = signedIn(req);
    need((rightsOf(u).addData || rightsOf(u).review) && rightsOf(u).read !== 'own', 'Your role cannot add field notes.');
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
    const rows = applyFilters(await loadRows(db, await scopeOf(db, u)), parseFilters(req.query as Q, (await currentRound(db)).id));
    const items = SECTIONS.flatMap(s => s.items);
    const cell = (v: unknown) => {
      const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['survey_id', 'round', 'household_code', 'village', 'district', 'status', 'source', 'submitted_at', 'duration_min',
      'score', 'band', ...DIMENSIONS.map(d => `dim_${d.id}`), ...items.map(i => i.id)];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.id, r.roundName, anon ? '' : r.householdCode, r.village, r.district, r.status, r.source, r.submittedAt, r.durationMin,
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

  /* ------------------------------------------------------ privacy page */
  // Public and plain HTML, so the app stores (and anyone) can read it without signing in.
  app.get('/privacy', async (_req, reply) => {
    const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy policy — ${esc(ORGANISATION.name)}</title>
<style>body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px 64px;color:#121A33;background:#F4F6FB}
h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 6px}p{margin:6px 0}.muted{color:#4A5470}
@media (prefers-color-scheme:dark){body{background:#0B1022;color:#EEF2FF}.muted{color:#B4BDD6}}</style></head><body>
<h1>Privacy policy</h1><p class="muted">${esc(ORGANISATION.name)} · last updated ${esc(PRIVACY_UPDATED)}</p>
${PRIVACY_POLICY.map(sec => `<h2>${esc(sec.title)}</h2>${sec.body.map(p => `<p>${esc(p)}</p>`).join('')}`).join('\n')}
</body></html>`;
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return html;
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
