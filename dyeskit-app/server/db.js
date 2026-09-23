'use strict';
/**
 * Storage layer — SQLite (Node's built-in node:sqlite, no external dependency).
 *
 * Design notes that follow the plan document:
 *   • answers are stored ONE ROW PER ANSWER (long format) so new questions need no schema change
 *   • a wide "one row per household" view is generated on export
 *   • nothing is overwritten: edits write answer_history rows, deletes are soft (recycle bin)
 *   • personal details live in `households` (locked table) and never leave with analyst exports
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { SECTIONS, ITEMS, QUESTIONNAIRE_VERSION } = require('./questionnaire');
const { scoreSubmission, SCORING_VERSION } = require('./scoring');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DYESKIT_DB || path.join(DATA_DIR, 'dyeskit.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','collector','analyst','viewer')),
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','disabled')),
  created_at TEXT NOT NULL,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS villages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, block TEXT, district TEXT NOT NULL,
  households INTEGER DEFAULT 0, altitude_m INTEGER, lat REAL, lon REAL,
  created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS assignments (
  user_id INTEGER NOT NULL REFERENCES users(id),
  village_id INTEGER NOT NULL REFERENCES villages(id),
  PRIMARY KEY (user_id, village_id)
);
CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, village_id INTEGER NOT NULL REFERENCES villages(id),
  head_name TEXT, phone TEXT, lat REAL, lon REAL,
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id), deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id),
  village_id INTEGER NOT NULL REFERENCES villages(id),
  collector_id INTEGER REFERENCES users(id),
  questionnaire_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  consent INTEGER NOT NULL DEFAULT 0,
  started_at TEXT, submitted_at TEXT, reviewed_at TEXT, reviewed_by INTEGER REFERENCES users(id),
  review_note TEXT, duration_min REAL,
  deleted_at TEXT, deleted_by INTEGER, delete_reason TEXT
);
CREATE TABLE IF NOT EXISTS answers (
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  item_id TEXT NOT NULL, value TEXT,
  PRIMARY KEY (submission_id, item_id)
);
CREATE TABLE IF NOT EXISTS answer_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL, item_id TEXT NOT NULL,
  old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at TEXT NOT NULL, reason TEXT
);
CREATE TABLE IF NOT EXISTS scores (
  submission_id INTEGER PRIMARY KEY REFERENCES submissions(id),
  scoring_version TEXT NOT NULL, iwb REAL, pct REAL, band INTEGER, valid INTEGER,
  dims TEXT, indicators TEXT, computed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS field_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  village_id INTEGER REFERENCES villages(id), submission_id INTEGER REFERENCES submissions(id),
  dim TEXT, note TEXT NOT NULL, author_id INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL, user_id INTEGER, user_name TEXT, action TEXT NOT NULL,
  entity TEXT, entity_id TEXT, detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_village ON submissions(village_id);
CREATE INDEX IF NOT EXISTS idx_ans_sub ON answers(submission_id);
`);

/* ---------------------------------------------------------------- helpers */
const now = () => new Date().toISOString();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}
const verifyPassword = (password, salt, hash) => {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
};

function audit(user, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit (at,user_id,user_name,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?,?)')
    .run(now(), user ? user.id : null, user ? user.name : 'system', action, entity || null,
      entityId === undefined || entityId === null ? null : String(entityId), detail ? JSON.stringify(detail) : null);
}

function getAnswers(submissionId) {
  const rows = db.prepare('SELECT item_id, value FROM answers WHERE submission_id = ?').all(submissionId);
  const out = {};
  for (const r of rows) { try { out[r.item_id] = JSON.parse(r.value); } catch { out[r.item_id] = r.value; } }
  return out;
}

function saveAnswers(submissionId, answers, user, reason) {
  const existing = getAnswers(submissionId);
  const ins = db.prepare('INSERT INTO answers (submission_id,item_id,value) VALUES (?,?,?) ' +
    'ON CONFLICT(submission_id,item_id) DO UPDATE SET value = excluded.value');
  const hist = db.prepare('INSERT INTO answer_history (submission_id,item_id,old_value,new_value,changed_by,changed_at,reason) VALUES (?,?,?,?,?,?,?)');
  for (const [itemId, value] of Object.entries(answers)) {
    if (!ITEMS[itemId]) continue;
    const before = existing[itemId];
    const json = JSON.stringify(value);
    if (JSON.stringify(before) === json) continue;
    if (before !== undefined) hist.run(submissionId, itemId, JSON.stringify(before), json, user ? user.id : null, now(), reason || null);
    ins.run(submissionId, itemId, json);
  }
}

function rescore(submissionId) {
  const answers = getAnswers(submissionId);
  const s = scoreSubmission(answers);
  db.prepare('INSERT INTO scores (submission_id,scoring_version,iwb,pct,band,valid,dims,indicators,computed_at) VALUES (?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT(submission_id) DO UPDATE SET scoring_version=excluded.scoring_version, iwb=excluded.iwb, pct=excluded.pct, ' +
    'band=excluded.band, valid=excluded.valid, dims=excluded.dims, indicators=excluded.indicators, computed_at=excluded.computed_at')
    .run(submissionId, s.scoring_version, s.iwb, s.pct, s.band, s.valid ? 1 : 0,
      JSON.stringify(s.dims), JSON.stringify(s.indicators), now());
  return s;
}

function rescoreAll() {
  const ids = db.prepare('SELECT id FROM submissions WHERE deleted_at IS NULL').all().map(r => r.id);
  ids.forEach(rescore);
  return ids.length;
}

/* ------------------------------------------------------------------- seed */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_VILLAGES = [
  { name: 'Nimmoo', block: 'Khaltse', district: 'leh', households: 160, altitude_m: 3150, lat: 34.185, lon: 77.336, profile: 0.68 },
  { name: 'Alchi', block: 'Khaltse', district: 'leh', households: 120, altitude_m: 3100, lat: 34.225, lon: 77.176, profile: 0.64 },
  { name: 'Hemis Shukpachan', block: 'Khaltse', district: 'leh', households: 95, altitude_m: 3700, lat: 34.360, lon: 77.150, profile: 0.58 },
  { name: 'Stok', block: 'Leh', district: 'leh', households: 210, altitude_m: 3500, lat: 34.055, lon: 77.545, profile: 0.72 },
  { name: 'Sakti', block: 'Chuchot', district: 'leh', households: 180, altitude_m: 3800, lat: 34.030, lon: 77.820, profile: 0.55 },
  { name: 'Durbuk', block: 'Durbuk', district: 'leh', households: 140, altitude_m: 4000, lat: 34.030, lon: 78.220, profile: 0.44 },
  { name: 'Turtuk', block: 'Nubra', district: 'leh', households: 130, altitude_m: 2900, lat: 34.845, lon: 76.828, profile: 0.52 },
  { name: 'Sankoo', block: 'Sankoo', district: 'kargil', households: 220, altitude_m: 2800, lat: 34.300, lon: 76.100, profile: 0.50 },
  { name: 'Panikhar', block: 'Sankoo', district: 'kargil', households: 105, altitude_m: 3000, lat: 34.220, lon: 75.940, profile: 0.46 },
  { name: 'Drass', block: 'Drass', district: 'kargil', households: 260, altitude_m: 3280, lat: 34.430, lon: 75.760, profile: 0.41 },
  { name: 'Shargole', block: 'Shargole', district: 'kargil', households: 90, altitude_m: 3100, lat: 34.470, lon: 76.320, profile: 0.48 },
  { name: 'Chiktan', block: 'Shargole', district: 'kargil', households: 110, altitude_m: 3200, lat: 34.500, lon: 76.450, profile: 0.43 },
];

const DEMO_USERS = [
  { name: 'Project Admin', email: 'admin@dyeskit.org', role: 'admin', password: 'Admin@123' },
  { name: 'Field Supervisor', email: 'supervisor@dyeskit.org', role: 'supervisor', password: 'Super@123' },
  { name: 'Tsering (Field Researcher)', email: 'collector@dyeskit.org', phone: '+911234500011', role: 'collector', password: 'Collect@123' },
  { name: 'Research Analyst', email: 'analyst@dyeskit.org', role: 'analyst', password: 'Analyst@123' },
  { name: 'Council Viewer', email: 'viewer@dyeskit.org', role: 'viewer', password: 'Viewer@123' },
];

/** Pick an option biased toward high-scoring choices when `q` (0..1) is high. */
function pickScored(itemId, q, rnd) {
  const item = ITEMS[itemId];
  const opts = item.options.filter(op => typeof op.pts === 'number');
  if (!opts.length) return item.options[Math.floor(rnd() * item.options.length)].v;
  const weights = opts.map(op => Math.pow(1 - Math.abs(op.pts - q), 6) + 0.02);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rnd() * total;
  for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) return opts[i].v; }
  return opts[opts.length - 1].v;
}

const pickAny = (itemId, rnd) => { const op = ITEMS[itemId].options; return op[Math.floor(rnd() * op.length)].v; };

function pickMulti(itemId, q, rnd, maxN = 3) {
  const opts = ITEMS[itemId].options.filter(op => !op.pna && op.v !== 'none');
  const n = Math.max(0, Math.round(q * maxN + (rnd() - 0.5)));
  if (n === 0) {
    const none = ITEMS[itemId].options.find(op => op.v === 'none');
    return none ? ['none'] : [];
  }
  const shuffled = [...opts].sort(() => rnd() - 0.5);
  return shuffled.slice(0, Math.min(n, opts.length)).map(op => op.v);
}

const likert = (q, rnd) => Math.min(5, Math.max(1, Math.round(1 + q * 4 + (rnd() - 0.5) * 1.6)));

function makeAnswers(village, q, rnd) {
  const jitter = () => Math.min(0.98, Math.max(0.05, q + (rnd() - 0.5) * 0.3));
  const a = {};
  a.A1 = village.name; a.A2 = village.block; a.A3 = village.district;
  a.A4 = Math.floor(5 + rnd() * 45);
  a.A5 = Math.floor(22 + rnd() * 50);
  a.A6 = rnd() < 0.46 ? 'male' : 'female';
  a.A7 = Math.floor(2 + rnd() * 7);
  a.A8 = rnd() < 0.45 ? Math.floor(rnd() * 3) : 0;
  a.A9 = ['nuclear', 'joint', 'extended'][Math.floor(rnd() * 3)];
  a.A10 = village.district === 'leh' ? (rnd() < 0.82 ? 'buddhist' : rnd() < 0.7 ? 'muslim' : 'hindu')
    : (rnd() < 0.85 ? 'muslim' : 'buddhist');
  a.A11 = pickAny('A11', rnd);
  a.A12 = pickAny('A12', rnd);
  a.A13 = pickScored('A13', jitter(), rnd);

  // Physical
  const height = Math.round(150 + rnd() * 25);
  const bmiTarget = 18 + jitter() * 6 + (rnd() - 0.5) * 4;
  a.B1 = { height_cm: height, weight_kg: Math.round(bmiTarget * Math.pow(height / 100, 2)) };
  for (const id of ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']) a[id] = pickScored(id, jitter(), rnd);
  a.B9 = pickMulti('B9', 0.6, rnd, 2);
  a.B10 = pickScored('B10', jitter(), rnd);
  a.B11 = likert(jitter(), rnd);

  // Emotional
  a.C1 = pickScored('C1', jitter(), rnd);
  a.C2 = pickMulti('C2', jitter(), rnd, 4);
  a.C3 = pickScored('C3', jitter(), rnd);
  a.C4 = likert(jitter(), rnd); a.C5 = likert(jitter(), rnd);
  a.C6 = 6 - likert(jitter(), rnd);
  a.C7 = rnd() < 0.55 ? ['none'] : pickMulti('C7', 0.4, rnd, 2);

  // Social
  for (const id of ['D1', 'D3', 'D4']) a[id] = pickScored(id, jitter(), rnd);
  a.D2 = likert(jitter(), rnd); a.D5 = likert(jitter(), rnd); a.D7 = likert(jitter(), rnd);
  a.D6 = pickMulti('D6', jitter(), rnd, 3);
  a.D8 = a.A8 > 0 ? 'yes' : 'no';
  if (a.D8 === 'yes') a.D8a = a.A8;

  // Environmental
  const env = jitter();
  a.E1 = env > 0.7 ? 'reliable' : env > 0.3 ? 'scarce' : 'severe';
  if (a.E1 === 'scarce') a.E1a = Math.max(1, Math.round((1 - env) * 7));
  a.E2 = rnd() < 0.62 ? 'large_dec' : rnd() < 0.7 ? 'some_dec' : 'no_change';
  a.E3 = pickScored('E3', env, rnd);
  a.E4 = pickScored('E4', env, rnd);
  a.E5 = env > 0.6 ? ['lpg', 'solar'] : env > 0.35 ? ['lpg', 'firewood'] : ['dung', 'firewood'];
  a.E6 = pickMulti('E6', env, rnd, 3);
  a.E7 = likert(0.75, rnd);

  // Financial
  const fin = jitter();
  for (const id of ['F1', 'F2', 'F3', 'F7', 'F9', 'F10']) a[id] = pickScored(id, fin, rnd);
  a.F4 = Math.max(0, Math.round(fin * 3 + (rnd() - 0.5)));
  a.F5 = pickMulti('F5', 0.5, rnd, 3);
  a.F6 = fin > 0.7 ? ['even'] : rnd() < 0.6 ? ['q2', 'q3'] : ['q3'];
  a.F8 = likert(fin, rnd);

  // Intellectual & Spiritual
  for (const id of ['G1', 'G2', 'G3', 'G4']) a[id] = pickScored(id, jitter(), rnd);
  a.G5 = pickMulti('G5', 1 - jitter(), rnd, 3);
  a.H1 = pickScored('H1', Math.min(0.95, jitter() + 0.18), rnd);
  a.H2 = likert(jitter() + 0.1, rnd); a.H3 = likert(jitter() + 0.15, rnd); a.H4 = likert(jitter(), rnd);
  a.H5 = pickScored('H5', jitter() + 0.1, rnd);
  a.H6 = pickScored('H6', jitter() + 0.1, rnd);
  a.H7 = pickScored('H7', 1 - jitter(), rnd);

  // Technology (diagnostic)
  a.I1 = pickAny('I1', rnd); a.I2 = pickAny('I2', rnd); a.I3 = pickAny('I3', rnd);
  a.I4 = pickMulti('I4', 0.5, rnd, 3);
  const prio = ['water', 'health', 'roads', 'education', 'jobs', 'energy', 'waste', 'tourism', 'culture', 'digital']
    .sort(() => rnd() - 0.5).slice(0, 3);
  a.I5 = prio;

  // Occasional real-world gaps: no BMI kit, refusals
  if (rnd() < 0.12) delete a.B1;
  if (rnd() < 0.06) a.F1 = 'PNA';
  if (rnd() < 0.05) a.C1 = 'PNA';
  return a;
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return false;

  const rnd = mulberry32(20260923);
  const insUser = db.prepare('INSERT INTO users (name,email,phone,role,password_hash,salt,status,created_at) VALUES (?,?,?,?,?,?,?,?)');
  const userIds = {};
  for (const u of DEMO_USERS) {
    const { hash, salt } = hashPassword(u.password);
    insUser.run(u.name, u.email, u.phone || null, u.role, hash, salt, 'active', now());
    userIds[u.role] = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email).id;
  }
  // a pending field researcher, waiting for approval (shows the approval flow)
  const pend = hashPassword('Pending@123');
  insUser.run('Dolma (awaiting approval)', 'dolma@dyeskit.org', '+911234500022', 'collector', pend.hash, pend.salt, 'pending', now());

  const insVillage = db.prepare('INSERT INTO villages (name,block,district,households,altitude_m,lat,lon,created_at) VALUES (?,?,?,?,?,?,?,?)');
  const villages = [];
  for (const v of SEED_VILLAGES) {
    insVillage.run(v.name, v.block, v.district, v.households, v.altitude_m, v.lat, v.lon, now());
    const id = db.prepare('SELECT id FROM villages WHERE name = ?').get(v.name).id;
    villages.push({ ...v, id });
  }

  // the demo field researcher covers a cluster of five villages (the rest are unassigned,
  // which is what makes the "assigned villages only" rule visible in the demo)
  villages.slice(0, 5).forEach(v =>
    db.prepare('INSERT OR IGNORE INTO assignments (user_id,village_id) VALUES (?,?)').run(userIds.collector, v.id));

  const insHh = db.prepare('INSERT INTO households (code,village_id,head_name,phone,lat,lon,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)');
  const insSub = db.prepare('INSERT INTO submissions (household_id,village_id,collector_id,questionnaire_version,status,consent,started_at,submitted_at,duration_min) VALUES (?,?,?,?,?,?,?,?,?)');
  const NAMES = ['Tsering', 'Dolma', 'Rigzin', 'Stanzin', 'Padma', 'Sonam', 'Mohd. Ali', 'Fatima', 'Nawang', 'Yangchen', 'Hussain', 'Zahra'];

  let hhSeq = 0;
  for (const v of villages) {
    const n = Math.max(12, Math.round(v.households * (0.30 + rnd() * 0.12)));
    for (let i = 0; i < n; i++) {
      hhSeq++;
      const code = `${v.district.slice(0, 1).toUpperCase()}${String(v.id).padStart(2, '0')}-H${String(hhSeq).padStart(4, '0')}`;
      const daysAgo = Math.floor(rnd() * 120);
      const when = new Date(Date.now() - daysAgo * 864e5).toISOString();
      insHh.run(code, v.id, `${NAMES[Math.floor(rnd() * NAMES.length)]} household`, null,
        v.lat + (rnd() - 0.5) * 0.02, v.lon + (rnd() - 0.5) * 0.02, when, userIds.collector);
      const hhId = db.prepare('SELECT id FROM households WHERE code = ?').get(code).id;
      const status = rnd() < 0.86 ? 'approved' : rnd() < 0.6 ? 'submitted' : 'draft';
      insSub.run(hhId, v.id, userIds.collector, QUESTIONNAIRE_VERSION, status, 1, when, when, Math.round(18 + rnd() * 16));
      const subId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      const answers = makeAnswers(v, v.profile, rnd);
      saveAnswers(subId, answers, null, 'seed');
      rescore(subId);
    }
    db.prepare('INSERT INTO field_notes (village_id,dim,note,author_id,created_at) VALUES (?,?,?,?,?)').run(
      v.id, 'env',
      `${v.name}: households describe the ${v.altitude_m > 3500 ? 'stream drying by late summer' : 'yura running low in August'}; ` +
      `${v.profile < 0.5 ? 'several families depend on tanker supply in winter' : 'storage tanks added in the last two years have helped'}.`,
      userIds.collector, now());
  }
  audit(null, 'seed', 'database', null, { villages: villages.length, households: hhSeq });
  return true;
}

module.exports = {
  db, now, hashPassword, verifyPassword, audit, getAnswers, saveAnswers, rescore, rescoreAll,
  seedIfEmpty, DB_PATH, QUESTIONNAIRE_VERSION, SCORING_VERSION,
};
