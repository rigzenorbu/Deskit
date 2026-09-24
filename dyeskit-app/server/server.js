'use strict';
/**
 * DYESKIT platform server — zero external dependencies (node:http + node:sqlite).
 * Serves the JSON API and the static front-end.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const Q = require('./questionnaire');
const { buildInsights } = require('./insights');
const Assistant = require('./assistant');
const S = require('./scoring');
const D = require('./db');
const { db } = D;

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 7;

const SYSTEM_RULES = [
  'The assistant never produces a number itself — every figure comes from the scoring engine.',
  'Each answer shows the exact tables it was built from.',
  'If the data does not cover the question, the answer says so instead of estimating.',
  'No household-level or personal data is available to it.',
  'Villages below the minimum sample are labelled as not yet reliable.',
];

/* ------------------------------------------------------------ permissions */
const ROLE_RIGHTS = {
  admin:      { read: 'all', addData: true, editAny: true, delete: true, review: true, manageUsers: true, manageVillages: true, export: 'full', pii: true, audit: true },
  supervisor: { read: 'all', addData: true, editAny: true, delete: false, review: true, manageUsers: false, manageVillages: true, export: 'full', pii: true, audit: true },
  collector:  { read: 'assigned', addData: true, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'none', pii: true, audit: false },
  analyst:    { read: 'all', addData: false, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'anon', pii: false, audit: false },
  viewer:     { read: 'all', addData: false, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'none', pii: false, audit: false },
};
const rights = user => ROLE_RIGHTS[user.role] || ROLE_RIGHTS.viewer;

function assignedVillageIds(user) {
  return db.prepare('SELECT village_id FROM assignments WHERE user_id = ?').all(user.id).map(r => r.village_id);
}

/* --------------------------------------------------------------- sessions */
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(token, userId, D.now(), expires);
  return { token, expires };
}
function userFromRequest(req) {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('dyeskit='));
  if (!cookie) return null;
  const token = cookie.slice('dyeskit='.length);
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'`).get(token, D.now());
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, phone: row.phone };
}

/* ----------------------------------------------------------------- filters */
function parseFilters(query, user) {
  const f = {
    district: query.district || '',
    village_id: query.village_id ? String(query.village_id).split(',').map(Number).filter(Boolean) : [],
    status: query.status || '',
    from: query.from || '', to: query.to || '',
    gender: query.gender || '', religion: query.religion || '',
    age_min: query.age_min ? Number(query.age_min) : null,
    age_max: query.age_max ? Number(query.age_max) : null,
    band: query.band ? Number(query.band) : null,
    collector_id: query.collector_id ? Number(query.collector_id) : null,
    search: (query.search || '').trim(),
  };
  if (rights(user).read === 'assigned') {
    const allowed = assignedVillageIds(user);
    f.village_id = f.village_id.length ? f.village_id.filter(v => allowed.includes(v)) : allowed;
    if (!f.village_id.length) f.village_id = [-1];
  }
  return f;
}

/**
 * Build the WHERE clause for submissions. Answer-level filters (gender, religion, age)
 * use EXISTS sub-queries against the long-format answers table.
 */
function buildWhere(f, { includeDeleted = false } = {}) {
  const w = [], p = [];
  if (!includeDeleted) w.push('su.deleted_at IS NULL');
  if (f.district) { w.push('v.district = ?'); p.push(f.district); }
  if (f.village_id.length) { w.push(`su.village_id IN (${f.village_id.map(() => '?').join(',')})`); p.push(...f.village_id); }
  if (f.status) { w.push('su.status = ?'); p.push(f.status); }
  if (f.from) { w.push('COALESCE(su.submitted_at, su.started_at) >= ?'); p.push(f.from); }
  if (f.to) { w.push('COALESCE(su.submitted_at, su.started_at) <= ?'); p.push(f.to + 'T23:59:59Z'); }
  if (f.band) { w.push('sc.band = ?'); p.push(f.band); }
  if (f.collector_id) { w.push('su.collector_id = ?'); p.push(f.collector_id); }
  if (f.gender) { w.push("EXISTS (SELECT 1 FROM answers a WHERE a.submission_id = su.id AND a.item_id='A6' AND a.value = ?)"); p.push(JSON.stringify(f.gender)); }
  if (f.religion) { w.push("EXISTS (SELECT 1 FROM answers a WHERE a.submission_id = su.id AND a.item_id='A10' AND a.value = ?)"); p.push(JSON.stringify(f.religion)); }
  if (f.age_min !== null) { w.push("EXISTS (SELECT 1 FROM answers a WHERE a.submission_id = su.id AND a.item_id='A5' AND CAST(a.value AS REAL) >= ?)"); p.push(f.age_min); }
  if (f.age_max !== null) { w.push("EXISTS (SELECT 1 FROM answers a WHERE a.submission_id = su.id AND a.item_id='A5' AND CAST(a.value AS REAL) <= ?)"); p.push(f.age_max); }
  if (f.search) { w.push('(h.code LIKE ? OR v.name LIKE ?)'); p.push('%' + f.search + '%', '%' + f.search + '%'); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

const BASE_JOIN = `FROM submissions su
  JOIN villages v ON v.id = su.village_id
  JOIN households h ON h.id = su.household_id
  LEFT JOIN scores sc ON sc.submission_id = su.id`;

function selectScored(f) {
  const { sql, params } = buildWhere(f);
  return db.prepare(`SELECT su.id, su.status, su.submitted_at, su.duration_min, su.collector_id,
      v.id AS village_id, v.name AS village, v.district, v.households AS village_households,
      h.code AS household_code,
      sc.iwb, sc.pct, sc.band, sc.valid, sc.dims, sc.indicators
    ${BASE_JOIN} ${sql} ORDER BY su.submitted_at DESC`).all(...params);
}

const parseScore = r => (r.iwb === null || r.iwb === undefined ? null : {
  iwb: r.iwb, pct: r.pct, band: r.band, valid: !!r.valid,
  dims: JSON.parse(r.dims || '{}'), indicators: JSON.parse(r.indicators || '{}'),
});

/* ------------------------------------------------------------- dashboard */
function dashboard(f, user) {
  const rows = selectScored(f);
  const scored = rows.map(parseScore).filter(Boolean);

  // village-level rollups
  const byVillage = new Map();
  for (const r of rows) {
    if (!byVillage.has(r.village_id)) byVillage.set(r.village_id, { village_id: r.village_id, village: r.village, district: r.district, households: r.village_households, rows: [] });
    byVillage.get(r.village_id).rows.push(parseScore(r));
  }
  const villages = [...byVillage.values()].map(v => {
    const agg = S.aggregate(v.rows.filter(Boolean), { households: v.households });
    return { village_id: v.village_id, village: v.village, district: v.district, households: v.households,
      n: agg.n, vwbi: agg.vwbi, pct: agg.pct, band: agg.band, band_label: agg.band_label,
      dims: agg.dims, flags: agg.flags, coverage: agg.coverage };
  }).sort((a, b) => (b.pct || 0) - (a.pct || 0));

  const totalHouseholds = villages.reduce((s, v) => s + (v.households || 0), 0);
  const overall = S.aggregate(scored, { households: totalHouseholds });

  // indicator-level means (what is dragging a dimension down)
  const indMeans = {};
  for (const s of scored) {
    for (const [id, det] of Object.entries(s.indicators || {})) {
      if (det.score === null || det.score === undefined) continue;
      (indMeans[id] = indMeans[id] || { id, label: det.label, dim: det.dim, sum: 0, n: 0 });
      indMeans[id].sum += det.score; indMeans[id].n++;
    }
  }
  const indicators = Object.values(indMeans).map(i => ({ id: i.id, label: i.label, dim: i.dim, score: S.round(i.sum / i.n), n: i.n }))
    .sort((a, b) => a.score - b.score);

  // monthly trend of submissions + mean score
  const { sql, params } = buildWhere(f);
  const trend = db.prepare(`SELECT substr(COALESCE(su.submitted_at, su.started_at),1,7) AS month,
      COUNT(*) AS n, ROUND(AVG(sc.pct),1) AS pct ${BASE_JOIN} ${sql} GROUP BY month ORDER BY month`).all(...params)
    .filter(r => r.month);

  // diagnostic: development priorities (I5) and digital readiness (I2)
  const idList = rows.map(r => r.id);
  const priorities = {}, internet = {}, substances = {};
  if (idList.length) {
    const marks = idList.map(() => '?').join(',');
    for (const row of db.prepare(`SELECT value FROM answers WHERE item_id='I5' AND submission_id IN (${marks})`).all(...idList)) {
      let arr = []; try { arr = JSON.parse(row.value) || []; } catch {}
      arr.forEach((v, i) => { priorities[v] = (priorities[v] || 0) + (3 - i); });
    }
    for (const row of db.prepare(`SELECT value FROM answers WHERE item_id='I2' AND submission_id IN (${marks})`).all(...idList)) {
      let v = null; try { v = JSON.parse(row.value); } catch {}
      if (v) internet[v] = (internet[v] || 0) + 1;
    }
    for (const row of db.prepare(`SELECT value FROM answers WHERE item_id='C7' AND submission_id IN (${marks})`).all(...idList)) {
      let arr = []; try { arr = JSON.parse(row.value) || []; } catch {}
      arr.forEach(v => { if (v !== 'PNA') substances[v] = (substances[v] || 0) + 1; });
    }
  }
  const labelOf = (itemId, v) => {
    const op = (Q.ITEMS[itemId].options || []).find(x => x.v === v);
    return op ? op.label : v;
  };

  // data quality
  const quality = {
    total: rows.length,
    drafts: rows.filter(r => r.status === 'draft').length,
    submitted: rows.filter(r => r.status === 'submitted').length,
    approved: rows.filter(r => r.status === 'approved').length,
    invalid: scored.filter(s => !s.valid).length,
    fast: rows.filter(r => r.duration_min !== null && r.duration_min < 10).length,
    no_bmi: scored.filter(s => s.indicators && s.indicators.bmi && s.indicators.bmi.score === null).length,
  };

  return {
    overall, villages, indicators, trend, quality,
    priorities: Object.entries(priorities).map(([v, score]) => ({ key: v, label: labelOf('I5', v), score })).sort((a, b) => b.score - a.score),
    internet: Object.entries(internet).map(([v, count]) => ({ key: v, label: labelOf('I2', v), count })).sort((a, b) => b.count - a.count),
    substances: Object.entries(substances).map(([v, count]) => ({ key: v, label: labelOf('C7', v), count })).sort((a, b) => b.count - a.count),
    dimensions: Q.DIMENSIONS, bands: Q.BANDS, flag_threshold: S.FLAG_THRESHOLD,
  };
}

/* ----------------------------------------------------------------- export */
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCsv(kind, f, user) {
  const anon = !rights(user).pii;
  const rows = selectScored(f);
  const lines = [];

  if (kind === 'codebook') {
    lines.push(['column', 'section', 'question', 'type', 'dimension', 'codes'].join(','));
    for (const sec of Q.SECTIONS) {
      for (const it of sec.items) {
        const codes = (it.options || []).map(op => `${op.v}=${op.label}` + (op.pts !== undefined ? ` (${op.pts})` : '')).join(' | ');
        lines.push([it.id, sec.title, it.q, it.type, it.dim || '', codes].map(csvEscape).join(','));
      }
    }
    for (const d of Q.DIMENSIONS) lines.push([`score_${d.id}`, 'Scores', `${d.name} dimension score`, 'computed 0-1', d.id, ''].map(csvEscape).join(','));
    lines.push(['iwb', 'Scores', 'Individual Well-Being (0-1)', 'computed', '', ''].join(','));
    lines.push(['band', 'Scores', 'Band 1-7', 'computed', '', Q.BANDS.map(b => `${b.band}=${b.label}`).join(' | ')].map(csvEscape).join(','));
    return lines.join('\n');
  }

  if (kind === 'long') {
    lines.push(['submission_id', 'household_code', 'village', 'district', 'submitted_at', 'item_id', 'question', 'value'].join(','));
    for (const r of rows) {
      const answers = D.getAnswers(r.id);
      for (const [itemId, value] of Object.entries(answers)) {
        lines.push([r.id, anon ? '' : r.household_code, r.village, r.district, r.submitted_at, itemId,
          (Q.ITEMS[itemId] || {}).q || '', value].map(csvEscape).join(','));
      }
    }
    return lines.join('\n');
  }

  // wide: one row per submission
  const itemIds = Object.keys(Q.ITEMS);
  const header = ['submission_id', 'household_code', 'village', 'district', 'status', 'submitted_at', 'questionnaire_version', 'scoring_version',
    ...itemIds, ...Q.DIMENSIONS.map(d => `score_${d.id}`), 'iwb', 'pct', 'band', 'band_label', 'valid'];
  lines.push(header.join(','));
  for (const r of rows) {
    const a = D.getAnswers(r.id);
    const sc = parseScore(r) || { dims: {} };
    const band = Q.BANDS.find(b => b.band === r.band);
    const out = [r.id, anon ? '' : r.household_code, r.village, r.district, r.status, r.submitted_at, Q.QUESTIONNAIRE_VERSION, S.SCORING_VERSION];
    for (const id of itemIds) {
      const v = a[id];
      out.push(v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).map(([k, x]) => `${k}=${x}`).join('|') : v);
    }
    for (const d of Q.DIMENSIONS) out.push(sc.dims[d.id] ? sc.dims[d.id].score : '');
    out.push(r.iwb, r.pct, r.band, band ? band.label : '', r.valid ? 1 : 0);
    lines.push(out.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ http */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
};
const json = (res, code, obj, headers) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 4e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const user = userFromRequest(req);
  const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req).catch(() => ({})) : {};
  const need = (cond, msg = 'Not allowed') => { if (!cond) { const e = new Error(msg); e.code = 403; throw e; } };

  try {
    /* ---- public ---- */
    if (pathname === '/api/login' && req.method === 'POST') {
      const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(body.email || '').trim());
      if (!row || !D.verifyPassword(String(body.password || ''), row.salt, row.password_hash)) {
        D.audit(null, 'login_failed', 'user', body.email, null);
        return json(res, 401, { error: 'Email or password is not correct.' });
      }
      if (row.status !== 'active') return json(res, 403, { error: `Account status: ${row.status}. An admin must approve it.` });
      const { token, expires } = createSession(row.id);
      db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(D.now(), row.id);
      D.audit({ id: row.id, name: row.name }, 'login', 'user', row.id, null);
      return json(res, 200, { user: { id: row.id, name: row.name, email: row.email, role: row.role }, rights: ROLE_RIGHTS[row.role] },
        { 'Set-Cookie': `dyeskit=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expires).toUTCString()}` });
    }

    if (pathname === '/api/signup' && req.method === 'POST') {
      const { name, email, phone, password } = body;
      if (!name || !email || !password) return json(res, 400, { error: 'Name, email and password are required.' });
      if (db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(email)) return json(res, 409, { error: 'That email is already registered.' });
      const { hash, salt } = D.hashPassword(String(password));
      db.prepare('INSERT INTO users (name,email,phone,role,password_hash,salt,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(name, email, phone || null, 'collector', hash, salt, 'pending', D.now());
      D.audit(null, 'signup', 'user', email, { role: 'collector' });
      return json(res, 200, { ok: true, message: 'Registration received. Status: review in progress — an admin must approve your account.' });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('dyeskit='));
      if (cookie) db.prepare('DELETE FROM sessions WHERE token = ?').run(cookie.slice(8));
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'dyeskit=; HttpOnly; Path=/; Max-Age=0' });
    }

    /* ---- everything below requires a session ---- */
    if (!user) return json(res, 401, { error: 'Not signed in' });
    const R = rights(user);

    if (pathname === '/api/me') {
      return json(res, 200, { user, rights: R, assigned: assignedVillageIds(user) });
    }

    if (pathname === '/api/meta') {
      return json(res, 200, {
        user, rights: R,
        questionnaire: { version: Q.QUESTIONNAIRE_VERSION, sections: Q.SECTIONS, consent: Q.CONSENT_TEXT },
        dimensions: Q.DIMENSIONS, bands: Q.BANDS, indicators: S.INDICATORS,
        scoring_version: S.SCORING_VERSION, flag_threshold: S.FLAG_THRESHOLD,
        villages: db.prepare('SELECT id,name,block,district,households,altitude_m,lat,lon FROM villages WHERE deleted_at IS NULL ORDER BY district,name').all(),
        collectors: db.prepare("SELECT id,name FROM users WHERE role IN ('collector','supervisor','admin') AND status='active' ORDER BY name").all(),
      });
    }

    if (pathname === '/api/dashboard') {
      return json(res, 200, dashboard(parseFilters(query, user), user));
    }

    if (pathname === '/api/submissions' && req.method === 'GET') {
      const f = parseFilters(query, user);
      const rows = selectScored(f).slice(0, Number(query.limit || 500));
      return json(res, 200, {
        rows: rows.map(r => ({
          id: r.id, household_code: R.pii ? r.household_code : `HH-${r.id}`, village: r.village, village_id: r.village_id,
          district: r.district, status: r.status, submitted_at: r.submitted_at, duration_min: r.duration_min,
          iwb: r.iwb, pct: r.pct, band: r.band, valid: !!r.valid,
          dims: r.dims ? JSON.parse(r.dims) : null,
        })),
      });
    }

    if (pathname.match(/^\/api\/submissions\/\d+$/) && req.method === 'GET') {
      const id = Number(pathname.split('/').pop());
      const row = db.prepare(`SELECT su.*, v.name AS village, v.district, h.code AS household_code, h.head_name
        FROM submissions su JOIN villages v ON v.id=su.village_id JOIN households h ON h.id=su.household_id WHERE su.id = ?`).get(id);
      if (!row) return json(res, 404, { error: 'Not found' });
      if (R.read === 'assigned' && !assignedVillageIds(user).includes(row.village_id)) return json(res, 403, { error: 'Not your village' });
      const answers = D.getAnswers(id);
      const score = S.scoreSubmission(answers);
      const history = db.prepare('SELECT * FROM answer_history WHERE submission_id = ? ORDER BY id DESC LIMIT 50').all(id);
      return json(res, 200, {
        submission: { ...row, household_code: R.pii ? row.household_code : `HH-${id}`, head_name: R.pii ? row.head_name : null },
        answers, score, history,
      });
    }

    if (pathname === '/api/submissions' && req.method === 'POST') {
      need(R.addData, 'Your role cannot add data');
      const villageId = Number(body.village_id);
      if (R.read === 'assigned') need(assignedVillageIds(user).includes(villageId), 'Village not assigned to you');
      need(body.consent === true, 'Consent must be recorded before the survey opens');
      const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
      if (!village) return json(res, 400, { error: 'Unknown village' });
      const seq = db.prepare('SELECT COUNT(*) AS c FROM households').get().c + 1;
      const code = body.household_code || `${village.district.slice(0, 1).toUpperCase()}${String(village.id).padStart(2, '0')}-H${String(seq).padStart(4, '0')}`;
      db.prepare('INSERT INTO households (code,village_id,head_name,phone,lat,lon,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)')
        .run(code, villageId, body.head_name || null, body.phone || null, body.lat || null, body.lon || null, D.now(), user.id);
      const hhId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      db.prepare('INSERT INTO submissions (household_id,village_id,collector_id,questionnaire_version,status,consent,started_at) VALUES (?,?,?,?,?,?,?)')
        .run(hhId, villageId, user.id, Q.QUESTIONNAIRE_VERSION, 'draft', 1, D.now());
      const subId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      D.audit(user, 'create_submission', 'submission', subId, { village: village.name, code });
      return json(res, 200, { id: subId, household_code: code });
    }

    if (pathname.match(/^\/api\/submissions\/\d+$/) && req.method === 'PATCH') {
      const id = Number(pathname.split('/')[3]);
      const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
      if (!row) return json(res, 404, { error: 'Not found' });
      const isOwnDraft = row.collector_id === user.id && row.status === 'draft';
      need(R.editAny || isOwnDraft, 'After submission, only a supervisor or admin can change answers');
      if (row.status !== 'draft') need(body.reason && body.reason.length > 3, 'A reason is required to change a submitted record');
      D.saveAnswers(id, body.answers || {}, user, body.reason || (row.status === 'draft' ? 'draft edit' : null));
      const score = D.rescore(id);
      D.audit(user, 'edit_answers', 'submission', id, { fields: Object.keys(body.answers || {}).length, reason: body.reason || null });
      return json(res, 200, { ok: true, score });
    }

    if (pathname.match(/^\/api\/submissions\/\d+\/submit$/) && req.method === 'POST') {
      const id = Number(pathname.split('/')[3]);
      const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
      if (!row) return json(res, 404, { error: 'Not found' });
      need(R.editAny || row.collector_id === user.id, 'Not your submission');
      const started = row.started_at ? new Date(row.started_at).getTime() : Date.now();
      const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
      db.prepare("UPDATE submissions SET status='submitted', submitted_at=?, duration_min=? WHERE id=?").run(D.now(), minutes, id);
      D.rescore(id);
      D.audit(user, 'submit', 'submission', id, null);
      return json(res, 200, { ok: true });
    }

    if (pathname.match(/^\/api\/submissions\/\d+\/review$/) && req.method === 'POST') {
      need(R.review, 'Only a supervisor or admin can review');
      const id = Number(pathname.split('/')[3]);
      const decision = body.decision === 'approve' ? 'approved' : 'rejected';
      db.prepare('UPDATE submissions SET status=?, reviewed_at=?, reviewed_by=?, review_note=? WHERE id=?')
        .run(decision, D.now(), user.id, body.note || null, id);
      D.audit(user, 'review', 'submission', id, { decision, note: body.note || null });
      return json(res, 200, { ok: true, status: decision });
    }

    if (pathname.match(/^\/api\/submissions\/\d+$/) && req.method === 'DELETE') {
      need(R.delete, 'Only an admin can delete');
      const id = Number(pathname.split('/')[3]);
      need(body.reason && body.reason.length > 3, 'A reason is required');
      db.prepare('UPDATE submissions SET deleted_at=?, deleted_by=?, delete_reason=? WHERE id=?').run(D.now(), user.id, body.reason, id);
      D.audit(user, 'delete', 'submission', id, { reason: body.reason });
      return json(res, 200, { ok: true, message: 'Moved to recycle bin. Restorable for 30 days.' });
    }

    if (pathname.match(/^\/api\/submissions\/\d+\/restore$/) && req.method === 'POST') {
      need(R.delete, 'Only an admin can restore');
      const id = Number(pathname.split('/')[3]);
      db.prepare('UPDATE submissions SET deleted_at=NULL, deleted_by=NULL, delete_reason=NULL WHERE id=?').run(id);
      D.audit(user, 'restore', 'submission', id, null);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/recycle-bin') {
      need(R.delete, 'Admin only');
      const rows = db.prepare(`SELECT su.id, su.deleted_at, su.delete_reason, v.name AS village, h.code AS household_code, u.name AS deleted_by
        FROM submissions su JOIN villages v ON v.id=su.village_id JOIN households h ON h.id=su.household_id
        LEFT JOIN users u ON u.id=su.deleted_by WHERE su.deleted_at IS NOT NULL ORDER BY su.deleted_at DESC`).all();
      return json(res, 200, { rows });
    }

    if (pathname === '/api/export' && req.method === 'GET') {
      need(R.export !== 'none', 'Your role cannot export data');
      const kind = query.kind || 'wide';
      const csv = exportCsv(kind, parseFilters(query, user), user);
      D.audit(user, 'export', 'data', kind, { filters: query });
      return send(res, 200, csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dyeskit-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
    }

    /* ---- admin: users, villages, audit, notes ---- */
    if (pathname === '/api/users' && req.method === 'GET') {
      need(R.manageUsers, 'Admin only');
      const rows = db.prepare('SELECT id,name,email,phone,role,status,created_at,last_login FROM users ORDER BY status, name').all();
      for (const r of rows) r.villages = db.prepare('SELECT v.id, v.name FROM assignments a JOIN villages v ON v.id=a.village_id WHERE a.user_id=?').all(r.id);
      return json(res, 200, { rows });
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      need(R.manageUsers, 'Admin only');
      const { name, email, role, password } = body;
      if (!name || !email || !role || !password) return json(res, 400, { error: 'name, email, role and password are required' });
      const { hash, salt } = D.hashPassword(String(password));
      db.prepare('INSERT INTO users (name,email,phone,role,password_hash,salt,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(name, email, body.phone || null, role, hash, salt, 'active', D.now());
      D.audit(user, 'create_user', 'user', email, { role });
      return json(res, 200, { ok: true });
    }

    if (pathname.match(/^\/api\/users\/\d+$/) && req.method === 'PATCH') {
      need(R.manageUsers, 'Admin only');
      const id = Number(pathname.split('/')[3]);
      if (body.status) db.prepare('UPDATE users SET status=? WHERE id=?').run(body.status, id);
      if (body.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(body.role, id);
      if (Array.isArray(body.villages)) {
        db.prepare('DELETE FROM assignments WHERE user_id=?').run(id);
        const ins = db.prepare('INSERT OR IGNORE INTO assignments (user_id,village_id) VALUES (?,?)');
        body.villages.forEach(v => ins.run(id, Number(v)));
      }
      D.audit(user, 'update_user', 'user', id, body);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/villages' && req.method === 'POST') {
      need(R.manageVillages, 'Not allowed');
      const { name, block, district, households, altitude_m, lat, lon } = body;
      if (!name || !district) return json(res, 400, { error: 'name and district are required' });
      db.prepare('INSERT INTO villages (name,block,district,households,altitude_m,lat,lon,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(name, block || null, district, Number(households) || 0, Number(altitude_m) || null, lat || null, lon || null, D.now());
      D.audit(user, 'create_village', 'village', name, body);
      return json(res, 200, { ok: true });
    }

    if (pathname.match(/^\/api\/villages\/\d+$/) && req.method === 'PATCH') {
      need(R.manageVillages, 'Not allowed');
      const id = Number(pathname.split('/')[3]);
      const cur = db.prepare('SELECT * FROM villages WHERE id=?').get(id);
      if (!cur) return json(res, 404, { error: 'Not found' });
      db.prepare('UPDATE villages SET name=?, block=?, district=?, households=?, altitude_m=? WHERE id=?')
        .run(body.name ?? cur.name, body.block ?? cur.block, body.district ?? cur.district,
          body.households ?? cur.households, body.altitude_m ?? cur.altitude_m, id);
      D.audit(user, 'update_village', 'village', id, body);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/insights') {
      const scope = R.read === 'assigned' ? assignedVillageIds(user) : null;
      const only = query.village_id ? [Number(query.village_id)] : null;
      const ids = only ? (scope ? only.filter(v => scope.includes(v)) : only) : scope;
      return json(res, 200, buildInsights(ids));
    }

    if (pathname === '/api/assistant' && req.method === 'POST') {
      const scope = R.read === 'assigned' ? assignedVillageIds(user) : null;
      const answer = await Assistant.ask(body.question, { scope, pii: false }, body.history);
      D.audit(user, 'assistant_question', 'assistant', null,
        { question: String(body.question || '').slice(0, 300), planner: answer.planner, tools: answer.evidence.map(e => e.tool) });
      return json(res, 200, answer);
    }

    if (pathname === '/api/assistant/capabilities') {
      return json(res, 200, {
        tools: Assistant.catalogue(), model: Assistant.MODEL,
        llm_enabled: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
        rules: SYSTEM_RULES,
      });
    }

    if (pathname === '/api/audit') {
      need(R.audit, 'Not allowed');
      return json(res, 200, { rows: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all() });
    }

    if (pathname === '/api/notes' && req.method === 'GET') {
      const villageId = query.village_id ? Number(query.village_id) : null;
      const rows = villageId
        ? db.prepare('SELECT n.*, u.name AS author FROM field_notes n LEFT JOIN users u ON u.id=n.author_id WHERE n.village_id=? ORDER BY n.id DESC').all(villageId)
        : db.prepare('SELECT n.*, u.name AS author FROM field_notes n LEFT JOIN users u ON u.id=n.author_id ORDER BY n.id DESC LIMIT 100').all();
      return json(res, 200, { rows });
    }

    if (pathname === '/api/notes' && req.method === 'POST') {
      need(R.addData || R.review, 'Not allowed');
      db.prepare('INSERT INTO field_notes (village_id,submission_id,dim,note,author_id,created_at) VALUES (?,?,?,?,?,?)')
        .run(body.village_id || null, body.submission_id || null, body.dim || null, String(body.note || '').slice(0, 4000), user.id, D.now());
      D.audit(user, 'add_note', 'note', body.village_id || body.submission_id, null);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/rescore' && req.method === 'POST') {
      need(R.manageUsers, 'Admin only');
      const n = D.rescoreAll();
      D.audit(user, 'rescore_all', 'scores', null, { submissions: n });
      return json(res, 200, { ok: true, submissions: n, scoring_version: S.SCORING_VERSION });
    }

    return json(res, 404, { error: 'Unknown endpoint' });
  } catch (err) {
    const code = err.code === 403 ? 403 : 500;
    if (code === 500) console.error(err);
    return json(res, code, { error: err.message || 'Server error' });
  }
});

if (require.main === module) {
  const seeded = D.seedIfEmpty();
  server.listen(PORT, () => {
    console.log(`\n  DYESKIT platform running:  http://localhost:${PORT}`);
    console.log(`  database: ${D.DB_PATH}${seeded ? '  (demo data seeded)' : ''}`);
    console.log('  sign in as  admin@dyeskit.org / Admin@123   (see README for the other roles)\n');
  });
}

module.exports = { server, dashboard, exportCsv, ROLE_RIGHTS };
