/**
 * First-run setup.
 *
 *   SEED_DEMO=true (default when no DATABASE_URL): demo accounts and ~600 demo surveys spread
 *     across all seven districts, so every chart has something to show.
 *   SEED_DEMO=false (production): no demo data. If ADMIN_EMAIL and ADMIN_PASSWORD are set and
 *     there are no users yet, that one admin account is created.
 */

import {
  SECTIONS, QUESTIONNAIRE_VERSION, DIMENSIONS, type Item, type Answers,
} from '@dyeskit/core';
import { audit, type Db } from './db';
import { hashPassword } from './auth';
import { nextHouseholdCode, rescore, saveAnswers, newId } from './data';

export const DEMO_USERS = [
  { name: 'Project Admin', email: 'admin@dyeskit.org', role: 'admin', password: 'Admin@123' },
  { name: 'Field Supervisor', email: 'supervisor@dyeskit.org', role: 'supervisor', password: 'Super@123' },
  { name: 'Tsering Dolkar', email: 'collector@dyeskit.org', phone: '+911234500011', role: 'collector', password: 'Collect@123' },
  { name: 'Research Analyst', email: 'analyst@dyeskit.org', role: 'analyst', password: 'Analyst@123' },
  { name: 'Council Viewer', email: 'viewer@dyeskit.org', role: 'viewer', password: 'Viewer@123' },
] as const;

/** Demo villages: [district, village code, households, altitude m, lat, lon, well-being profile 0–1] */
const DEMO_VILLAGES: [string, string, number, number, number, number, number][] = [
  ['leh', 'STO', 210, 3500, 34.055, 77.545, 0.72],
  ['leh', 'CHL', 180, 3300, 34.105, 77.630, 0.66],
  ['leh', 'SKT', 150, 3800, 34.030, 77.820, 0.55],
  ['sham', 'ALC', 120, 3100, 34.225, 77.176, 0.64],
  ['sham', 'HES', 95, 3700, 34.360, 77.150, 0.58],
  ['sham', 'LMY', 110, 3510, 34.284, 76.776, 0.60],
  ['nubra', 'DSK', 160, 3140, 34.548, 77.551, 0.65],
  ['nubra', 'TUY', 130, 2900, 34.845, 76.828, 0.52],
  ['changthang', 'DRB', 140, 4000, 34.030, 78.220, 0.44],
  ['changthang', 'NYM', 120, 4180, 33.200, 78.650, 0.47],
  ['kargil', 'SNK', 220, 2800, 34.300, 76.100, 0.50],
  ['kargil', 'PNK', 105, 3000, 34.220, 75.940, 0.46],
  ['kargil', 'SHR', 90, 3100, 34.470, 76.320, 0.48],
  ['zanskar', 'PDM', 170, 3650, 33.466, 76.880, 0.50],
  ['drass', 'DRS', 260, 3280, 34.430, 75.760, 0.41],
];

const MUSLIM_MAJORITY = new Set(['kargil', 'drass']);

/** Deterministic random numbers, so the demo data is the same on every machine. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoAnswers(district: string, profile: number, rnd: () => number): Answers {
  const a: Answers = {};
  const near = (target: number) => Math.min(0.98, Math.max(0.03, target + (rnd() - 0.5) * 0.45));
  const pickByPoints = (item: Item, q: number) => {
    const opts = item.options!.filter(o => typeof o.points === 'number');
    const w = opts.map(o => Math.pow(1 - Math.abs(o.points! / 100 - q), 5) + 0.03);
    let r = rnd() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i].v; }
    return opts[opts.length - 1].v;
  };
  const any = (item: Item) => { const ops = item.options!.filter(o => !o.neutral); return ops[Math.floor(rnd() * ops.length)].v; };
  // each dimension leans a little differently, so villages have character
  const lean: Record<string, number> = Object.fromEntries(DIMENSIONS.map(d => [d.id, (rnd() - 0.5) * 0.25]));
  lean.spi += 0.15;

  for (const s of SECTIONS) for (const item of s.items) {
    const q = near(profile + (item.dim ? lean[item.dim] : 0));
    if (item.bmi) {
      if (rnd() < 0.1) continue;   // no measuring kit that day
      const h = Math.round(150 + rnd() * 25);
      a[item.id] = { height_cm: h, weight_kg: Math.round((18 + q * 5 + (rnd() - 0.5) * 6) * (h / 100) ** 2) };
    } else if (item.countPoints) {
      const idx = Math.min(item.countPoints.length - 1, Math.max(0, Math.round(q * (item.countPoints.length - 1) + (rnd() - 0.5))));
      const reversed = item.countPoints[0] > item.countPoints[item.countPoints.length - 1];
      const n = reversed ? item.countPoints.length - 1 - idx : idx;
      if (item.type === 'number') a[item.id] = n;
      else {
        const real = item.options!.filter(o => !o.neutral && o.v !== 'none').sort(() => rnd() - 0.5);
        a[item.id] = n === 0 ? ['none'] : real.slice(0, n + (n === item.countPoints.length - 1 && rnd() < 0.4 ? 1 : 0)).map(o => o.v);
      }
    } else if (item.dim && item.options) {
      a[item.id] = pickByPoints(item, q);
    }
  }

  a.A4 = Math.floor(5 + rnd() * 50);
  a.A5 = Math.floor(20 + rnd() * 55);
  a.A6 = rnd() < 0.48 ? 'female' : 'male';
  a.A7 = Math.floor(2 + rnd() * 7);
  a.A8 = rnd() < 0.45 ? Math.floor(1 + rnd() * 2) : 0;
  a.A9 = ['nuclear', 'joint', 'extended'][Math.floor(rnd() * 3)];
  a.A10 = MUSLIM_MAJORITY.has(district) ? (rnd() < 0.86 ? 'muslim' : 'buddhist') : (rnd() < 0.85 ? 'buddhist' : rnd() < 0.7 ? 'muslim' : 'hindu');
  a.A11 = ['traditional', 'concrete', 'hybrid'][Math.floor(rnd() * 3)];
  a.A12 = any(SECTIONS[0].items.find(i => i.id === 'A12')!);
  a.B9 = ['piped', 'yura', 'chumik', 'stream'].filter(() => rnd() < 0.4);
  if (!(a.B9 as string[]).length) a.B9 = ['piped'];
  a.C7 = rnd() < 0.6 ? ['none'] : ['tobacco', 'alcohol', 'chhang'].filter(() => rnd() < 0.4);
  a.D8 = Number(a.A8) > 0 ? 'yes' : 'no';
  if (a.D8 === 'yes') a.D8a = a.A8;
  a.E2 = rnd() < 0.6 ? 'large_dec' : rnd() < 0.7 ? 'some_dec' : 'no_change';
  a.E7 = String(Math.min(5, Math.max(1, Math.round(3.5 + (rnd() - 0.5) * 2))));
  a.F5 = ['farming', 'livestock', 'tourism', 'homestay', 'salary', 'daily_wage'].filter(() => rnd() < 0.35);
  a.I1 = rnd() < profile ? 'more_than_one' : rnd() < 0.7 ? 'one' : 'no';
  a.I2 = rnd() < profile ? 'reliable' : rnd() < 0.7 ? 'intermittent' : 'none';
  a.I3 = rnd() < profile * 0.6 ? 'use' : rnd() < 0.5 ? 'aware' : 'never';
  a.I4 = ['health', 'weather', 'schemes', 'farming', 'education'].filter(() => rnd() < 0.4);
  a.I5 = ['water', 'health', 'roads', 'education', 'jobs', 'energy', 'waste', 'tourism', 'culture', 'digital'].sort(() => rnd() - 0.5).slice(0, 3);
  if (rnd() < 0.06) a.F1 = 'PNA';
  if (rnd() < 0.04) a.C1 = 'PNA';
  return a;
}

const NAMES = ['Tsering', 'Dolma', 'Rigzin', 'Stanzin', 'Padma', 'Sonam', 'Mohd. Ali', 'Fatima', 'Nawang', 'Yangchen', 'Hussain', 'Zahra', 'Tashi', 'Kunzes'];

export async function seedIfEmpty(db: Db) {
  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return { seeded: false as const };

  const demo = (process.env.SEED_DEMO ?? (process.env.DATABASE_URL ? 'false' : 'true')) !== 'false';
  if (!demo) {
    const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await db.query(`INSERT INTO users (name, email, role, status, password_hash) VALUES ($1,$2,'admin','active',$3)`,
        [process.env.ADMIN_NAME || 'Administrator', email, hashPassword(password)]);
      await audit(db, null, 'create_first_admin', 'user', email);
      return { seeded: 'admin' as const };
    }
    return { seeded: false as const };
  }

  const ids: Record<string, number> = {};
  for (const u of DEMO_USERS) {
    const r = await db.query<{ id: number }>(
      `INSERT INTO users (name, email, phone, role, status, password_hash) VALUES ($1,$2,$3,$4,'active',$5) RETURNING id`,
      [u.name, u.email, 'phone' in u ? u.phone : null, u.role, hashPassword(u.password)]);
    ids[u.role] = r.rows[0].id;
  }
  await db.query(`INSERT INTO users (name, email, phone, role, status, password_hash) VALUES ($1,$2,$3,'collector','pending',$4)`,
    ['Dolma Angmo', 'dolma@dyeskit.org', '+911234500022', hashPassword('Pending@123')]);

  const rnd = mulberry32(20261002);
  const villageIds: number[] = [];
  let surveys = 0;
  for (const [district, code, households, altitude, lat, lon, profile] of DEMO_VILLAGES) {
    const v = await db.query<{ id: number; name: string }>(
      'UPDATE villages SET households=$1, altitude_m=$2, lat=$3, lon=$4 WHERE district=$5 AND code=$6 RETURNING id, name',
      [households, altitude, lat, lon, district, code]);
    if (!v.rows.length) throw new Error(`Demo village ${district}/${code} is not in the official list`);
    const villageId = v.rows[0].id;
    villageIds.push(villageId);
    const n = Math.max(12, Math.round(households * (0.3 + rnd() * 0.14)));
    await db.tx(async q => {
      for (let i = 0; i < n; i++) {
        const { seq, code: hhCode } = await nextHouseholdCode(q, villageId);
        const when = new Date(Date.now() - Math.floor(rnd() * 240) * 864e5 - Math.floor(rnd() * 8) * 36e5);
        const hh = await q.query<{ id: number }>('INSERT INTO households (code, village_id, seq, head_name, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [hhCode, villageId, seq, `${NAMES[Math.floor(rnd() * NAMES.length)]} household`, when, ids.collector]);
        const id = newId();
        const status = rnd() < 0.82 ? 'approved' : rnd() < 0.75 ? 'submitted' : 'rejected';
        const minutes = Math.round(14 + rnd() * 22);
        await q.query(`INSERT INTO submissions (id, household_id, village_id, collector_id, questionnaire_version, status, consent, started_at, submitted_at, duration_min, reviewed_by, reviewed_at, review_note)
          VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12)`,
          [id, hh.rows[0].id, villageId, ids.collector, QUESTIONNAIRE_VERSION, status, new Date(when.getTime() - minutes * 6e4), when, minutes,
            status === 'submitted' ? null : ids.supervisor, status === 'submitted' ? null : when,
            status === 'rejected' ? 'BMI looks mis-typed; please re-measure.' : null]);
        await saveAnswers(q, id, demoAnswers(district, profile, rnd), null, null, true);
        await rescore(q, id);
        surveys++;
      }
      await q.query('INSERT INTO notes (village_id, dim, note, author_id) VALUES ($1,$2,$3,$4)', [villageId, 'env',
        `${v.rows[0].name}: households describe the ${altitude > 3500 ? 'stream drying by late summer' : 'yura running low in August'}; ` +
        `${profile < 0.5 ? 'several families rely on a tanker in winter.' : 'storage tanks added in the last two years have helped.'}`, ids.collector]);
    });
  }
  // the demo field researcher covers one village in each of five districts
  for (const id of [villageIds[0], villageIds[3], villageIds[6], villageIds[8], villageIds[10]]) {
    await db.query('INSERT INTO assignments (user_id, village_id) VALUES ($1,$2)', [ids.collector, id]);
  }
  await audit(db, null, 'seed_demo', 'database', null, { villages: villageIds.length, surveys });
  return { seeded: 'demo' as const, surveys };
}
