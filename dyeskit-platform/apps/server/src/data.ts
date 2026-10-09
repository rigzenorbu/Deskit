import crypto from 'node:crypto';
import {
  OFFICIAL_VILLAGES, VILLAGE_LOCATIONS, QUESTIONNAIRE_VERSION, findDuplicates, surveyIssues, type SurveyIssue, SCORING_VERSION, householdCode, scoreHousehold, ageGroupOf,
  type Answers, type HouseholdScore, type SurveyRow, type VillageInfo,
} from '@dyeskit/core';
import { audit, type Db, type Queryable } from './db';

/* ------------------------------------------------------------- villages */
/**
 * Bring the villages table in line with the official list in @dyeskit/core.
 * A village is matched by district + code (fixed forever), or — if it moved district in a
 * future notification — by name and block. Matches get the official details; new villages
 * are added; official villages that left the list are archived when they have no surveys.
 * Villages added by hand (official = false) are never touched.
 */
export async function syncVillages(db: Db) {
  const existing = (await db.query<{ id: number; district: string; code: string; name: string; block: string | null; official: boolean }>(
    'SELECT id, district, code, name, block, official FROM villages')).rows;
  const used = new Set<number>();
  let added = 0;
  for (const v of OFFICIAL_VILLAGES) {
    const row = existing.find(r => !used.has(r.id) && r.district === v.district && r.code === v.code)
      ?? existing.find(r => !used.has(r.id) && r.official && r.name.toLowerCase() === v.name.toLowerCase() && r.block === v.block);
    if (row) {
      used.add(row.id);
      await db.query(`UPDATE villages SET district=$1, code=$2, name=$3, gazette_name=$4, subdivision=$5, block=$6, official=true, archived_at=NULL
        WHERE id=$7`, [v.district, v.code, v.name, v.gazetteName, v.subdivision, v.block, row.id]);
    } else {
      await db.query(`INSERT INTO villages (district, code, name, gazette_name, subdivision, block) VALUES ($1,$2,$3,$4,$5,$6)`,
        [v.district, v.code, v.name, v.gazetteName, v.subdivision, v.block]);
      added++;
    }
  }
  const archived: string[] = [];
  for (const r of existing) {
    if (used.has(r.id) || !r.official) continue;
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM submissions WHERE village_id=$1', [r.id]);
    if (rows[0].n === 0) {
      await db.query('UPDATE villages SET archived_at = now() WHERE id=$1 AND archived_at IS NULL', [r.id]);
      archived.push(r.name);
    }
  }
  // map positions looked up on OpenStreetMap, for villages nobody has placed by hand
  for (const [key, loc] of Object.entries(VILLAGE_LOCATIONS)) {
    const [district, code] = key.split('/');
    await db.query(`UPDATE villages SET lat=$1, lon=$2, location_source='osm'
      WHERE district=$3 AND code=$4 AND (location_source IS NULL OR location_source = 'osm')`, [loc[0], loc[1], district, code]);
  }
  if (added || archived.length) await audit(db, null, 'sync_villages', 'villages', null, { added, archived });
  return { added, archived };
}

/** A three-letter code for a village added by hand, unique inside its district. */
export async function newVillageCode(db: Queryable, district: string, name: string) {
  const taken = new Set((await db.query<{ code: string }>('SELECT code FROM villages WHERE district=$1', [district])).rows.map(r => r.code));
  const L = name.toUpperCase().replace(/[^A-Z]/g, '');
  const cons = [...L.slice(1)].filter(c => !'AEIOU'.includes(c));
  const tries = [L.slice(0, 1) + cons.slice(0, 2).join(''), ...[...L.slice(1)].flatMap((a, i) => [...L.slice(i + 2)].map(b => L[0] + a + b))];
  for (const t of tries) if (t.length === 3 && !taken.has(t)) return t;
  for (let n = 0; n < 1000; n++) { const t = `X${String(n).padStart(2, '0')}`; if (!taken.has(t)) return t; }
  throw new Error('No free village code');
}

export async function villagesInfo(db: Queryable, ids?: number[] | null): Promise<VillageInfo[]> {
  const { rows } = await db.query<VillageInfo>(
    `SELECT id, name, district, households FROM villages WHERE archived_at IS NULL ${ids ? 'AND id = ANY($1)' : ''} ORDER BY name`,
    ids ? [ids] : []);
  return rows;
}

/* ----------------------------------------------------------- households */
/** Next household code in a village, e.g. L_CHL_014. Atomic: two uploads never share a number. */
export async function nextHouseholdCode(q: Queryable, villageId: number) {
  const { rows } = await q.query<{ district: string; code: string; next_household: number }>(
    'UPDATE villages SET next_household = next_household + 1 WHERE id=$1 RETURNING district, code, next_household', [villageId]);
  if (!rows.length) throw Object.assign(new Error('Unknown village'), { statusCode: 400 });
  return { seq: rows[0].next_household, code: householdCode(rows[0].district, rows[0].code, rows[0].next_household) };
}

/* ------------------------------------------------------- answers/scores */
export async function getAnswers(q: Queryable, submissionId: string): Promise<Answers> {
  const { rows } = await q.query<{ item_id: string; value: unknown }>('SELECT item_id, value FROM answers WHERE submission_id=$1', [submissionId]);
  return Object.fromEntries(rows.map(r => [r.item_id, r.value]));
}

/** Store answers. Changes to an existing answer are kept in answer_history. */
export async function saveAnswers(q: Queryable, submissionId: string, answers: Answers, userId: number | null, reason: string | null, initial = false) {
  const current = initial ? {} : await getAnswers(q, submissionId);
  for (const [itemId, value] of Object.entries(answers)) {
    const blank = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
    const before = current[itemId];
    if (JSON.stringify(before) === JSON.stringify(blank ? undefined : value)) continue;
    if (blank) {
      if (before === undefined) continue;
      await q.query('DELETE FROM answers WHERE submission_id=$1 AND item_id=$2', [submissionId, itemId]);
    } else {
      await q.query(`INSERT INTO answers (submission_id, item_id, value) VALUES ($1,$2,$3)
        ON CONFLICT (submission_id, item_id) DO UPDATE SET value = EXCLUDED.value`, [submissionId, itemId, JSON.stringify(value)]);
    }
    if (!initial) {
      await q.query('INSERT INTO answer_history (submission_id, item_id, old_value, new_value, changed_by, reason) VALUES ($1,$2,$3,$4,$5,$6)',
        [submissionId, itemId, before === undefined ? null : JSON.stringify(before), blank ? null : JSON.stringify(value), userId, reason]);
    }
  }
}

export async function rescore(q: Queryable, submissionId: string) {
  const s = scoreHousehold(await getAnswers(q, submissionId));
  await q.query(`INSERT INTO scores (submission_id, score, band, valid, version, detail) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (submission_id) DO UPDATE SET score=EXCLUDED.score, band=EXCLUDED.band, valid=EXCLUDED.valid, version=EXCLUDED.version, detail=EXCLUDED.detail`,
    [submissionId, s.score, s.band, s.valid, s.version, JSON.stringify(s)]);
  return s;
}

/** Rescore every survey whose stored score came from an older scoring version. */
export async function rescoreOutdated(db: Db, all = false) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT su.id FROM submissions su LEFT JOIN scores sc ON sc.submission_id = su.id ${all ? '' : 'WHERE sc.version IS DISTINCT FROM $1'}`,
    all ? [] : [SCORING_VERSION]);
  for (const r of rows) await rescore(db, r.id);
  return rows.length;
}

/* -------------------------------------------------------------- uploads */
/** The round new surveys go into: the newest one not closed. */
export async function currentRound(q: Queryable) {
  const { rows } = await q.query<{ id: number; name: string }>('SELECT id, name FROM rounds WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1');
  if (rows[0]) return rows[0];
  const r = await q.query<{ id: number; name: string }>('INSERT INTO rounds (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET closed_at = NULL RETURNING id, name',
    [String(new Date().getFullYear())]);
  return r.rows[0];
}

export interface UploadedSurvey {
  client_id: string;
  village_id: number;
  /** a household surveyed in an earlier round, surveyed again (keeps its household code) */
  household_id?: number | null;
  head_name?: string | null;
  phone?: string | null;
  consent: boolean;
  answers: Answers;
  started_at?: string | null;
  submitted_at?: string | null;
  duration_min?: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Store one survey uploaded from a phone. Idempotent: the phone's own id (client_id) is the
 * submission id, so a retry after a dropped connection returns the same household code
 * instead of creating a duplicate.
 */
export async function storeUpload(db: Db, user: { id: number; name: string }, s: UploadedSurvey,
  opts: { source?: 'researcher' | 'self'; limit?: number; ownHousehold?: boolean } = {}) {
  if (!UUID.test(String(s.client_id))) throw Object.assign(new Error('Bad survey id'), { statusCode: 400 });
  if (!s.consent) throw Object.assign(new Error('Consent is required'), { statusCode: 400 });
  const dup = await db.query<{ code: string; score: number | null; band: number | null }>(
    `SELECT h.code, sc.score, sc.band FROM submissions su JOIN households h ON h.id = su.household_id
     LEFT JOIN scores sc ON sc.submission_id = su.id WHERE su.id = $1`, [s.client_id]);
  if (dup.rows.length) return { client_id: s.client_id, household_code: dup.rows[0].code, score: dup.rows[0].score, band: dup.rows[0].band, duplicate: true };
  const round = await currentRound(db);
  if (opts.limit !== undefined) {
    const mine = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM submissions WHERE collector_id=$1 AND round_id=$2 AND deleted_at IS NULL', [user.id, round.id]);
    if (mine.rows[0].n >= opts.limit) throw Object.assign(new Error(`Your household’s survey for ${round.name} has already been received — thank you!`), { statusCode: 409 });
  }
  // the household: one chosen from an earlier round, the member's own household, or a new one
  let householdId = s.household_id ? Number(s.household_id) : null;
  if (!householdId && opts.ownHousehold) {
    const prev = await db.query<{ household_id: number }>(
      `SELECT su.household_id FROM submissions su WHERE su.collector_id=$1 AND su.village_id=$2 AND su.deleted_at IS NULL ORDER BY su.submitted_at DESC LIMIT 1`,
      [user.id, s.village_id]);
    householdId = prev.rows[0]?.household_id ?? null;
  }
  if (householdId) {
    const hh = await db.query<{ village_id: number }>('SELECT village_id FROM households WHERE id=$1', [householdId]);
    if (!hh.rows[0]) throw Object.assign(new Error('That household was not found.'), { statusCode: 400 });
    if (hh.rows[0].village_id !== Number(s.village_id)) throw Object.assign(new Error('That household belongs to another village.'), { statusCode: 400 });
    const done = await db.query('SELECT 1 FROM submissions WHERE household_id=$1 AND round_id=$2 AND deleted_at IS NULL', [householdId, round.id]);
    if (done.rows.length) throw Object.assign(new Error(`This household has already been surveyed in the ${round.name} round.`), { statusCode: 409 });
  }

  return db.tx(async q => {
    let code: string, hhId: number;
    if (householdId) {
      // surveyed again: same household, same code; update the head's details if new ones were given
      const hh = await q.query<{ id: number; code: string }>(
        'UPDATE households SET head_name = COALESCE($1, head_name), phone = COALESCE($2, phone) WHERE id=$3 RETURNING id, code',
        [s.head_name || null, s.phone || null, householdId]);
      code = hh.rows[0].code; hhId = hh.rows[0].id;
    } else {
      const next = await nextHouseholdCode(q, Number(s.village_id));
      const hh = await q.query<{ id: number }>(
        'INSERT INTO households (code, village_id, seq, head_name, phone, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [next.code, s.village_id, next.seq, s.head_name || null, s.phone || null, user.id]);
      code = next.code; hhId = hh.rows[0].id;
    }
    await q.query(`INSERT INTO submissions (id, household_id, village_id, collector_id, questionnaire_version, status, consent, started_at, submitted_at, duration_min, source, round_id)
      VALUES ($1,$2,$3,$4,$5,'submitted',true,$6,$7,$8,$9,$10)`,
      [s.client_id, hhId, s.village_id, user.id, QUESTIONNAIRE_VERSION, s.started_at || null, s.submitted_at || new Date().toISOString(),
        s.duration_min ?? null, opts.source ?? 'researcher', round.id]);
    await saveAnswers(q, s.client_id, s.answers || {}, user.id, null, true);
    const score = await rescore(q, s.client_id);
    await audit(q, user, 'upload_survey', 'submission', s.client_id, { household: code, round: round.name, repeat: !!householdId });
    return { client_id: s.client_id, household_code: code, score: score.score, band: score.band, duplicate: false, round: round.name };
  });
}

/* --------------------------------------------------------------- filters */
export interface Filters {
  district: string;
  villageIds: number[];
  status: string;
  from: string;
  to: string;
  gender: string;
  religion: string;
  ageGroup: string;
  band: number | null;
  collectorId: number | null;
  search: string;
  /** a round id, or null for every round */
  round: number | null;
}

/**
 * Filters from a query string. `round`: a round id, or "all"; when not given, `defaultRound`
 * (callers pass the current round, so numbers are never mixed across years by accident).
 */
export function parseFilters(q: Record<string, string | undefined>, defaultRound: number | null = null): Filters {
  return {
    round: q.round === 'all' ? null : q.round ? Number(q.round) : defaultRound,
    district: q.district || '',
    villageIds: q.village_id ? String(q.village_id).split(',').map(Number).filter(Boolean) : [],
    status: q.status || '',
    from: q.from || '',
    to: q.to || '',
    gender: q.gender || '',
    religion: q.religion || '',
    ageGroup: q.age_group || '',
    band: q.band ? Number(q.band) : null,
    collectorId: q.collector_id ? Number(q.collector_id) : null,
    search: (q.search || '').trim().toLowerCase(),
  };
}

export interface LoadedRow extends SurveyRow {
  householdCode: string; collectorId: number | null; collectorName: string | null; startedAt: string | null; source: string;
  roundId: number; roundName: string; householdId: number; headName: string | null; householdPhone: string | null;
  collectorPhone: string | null;
  roundStartedAt: string | null;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);

/** All surveys the user may see (scope = village ids, or null for everything). */
export async function loadRows(db: Queryable, scope: number[] | null, includeDeleted = false): Promise<LoadedRow[]> {
  const { rows } = await db.query(
    `SELECT su.id, su.village_id, v.name AS village, v.district, v.households, su.submitted_at, su.started_at, su.duration_min,
            su.status, su.collector_id, c.name AS collector_name, su.source, h.code AS household_code, sc.detail AS score,
            su.round_id, rd.name AS round_name, rd.started_at AS round_started_at, su.household_id, h.head_name, h.phone AS household_phone, c.phone AS collector_phone,
            COALESCE((SELECT jsonb_object_agg(a.item_id, a.value) FROM answers a WHERE a.submission_id = su.id), '{}'::jsonb) AS answers
     FROM submissions su JOIN villages v ON v.id = su.village_id JOIN households h ON h.id = su.household_id
     LEFT JOIN scores sc ON sc.submission_id = su.id
     LEFT JOIN users c ON c.id = su.collector_id
     JOIN rounds rd ON rd.id = su.round_id
     WHERE ${includeDeleted ? 'true' : 'su.deleted_at IS NULL'} ${scope ? 'AND su.village_id = ANY($1)' : ''}
     ORDER BY su.submitted_at DESC NULLS LAST`, scope ? [scope] : []);
  return rows.map(r => ({
    id: r.id, villageId: r.village_id, village: r.village, district: r.district, households: r.households,
    submittedAt: iso(r.submitted_at), startedAt: iso(r.started_at), durationMin: r.duration_min, status: r.status,
    collectorId: r.collector_id, collectorName: r.collector_name, householdCode: r.household_code, source: r.source,
    roundId: r.round_id, roundName: r.round_name, householdId: r.household_id, headName: r.head_name, householdPhone: r.household_phone,
    collectorPhone: r.collector_phone, roundStartedAt: iso(r.round_started_at),
    answers: r.answers as Answers, score: (r.score as HouseholdScore) ?? null,
  }));
}

/** Apply the filters. Rejected surveys are left out unless asked for by status (or allStatuses). */
export function applyFilters(rows: LoadedRow[], f: Filters, opts: { allStatuses?: boolean } = {}) {
  return rows.filter(r =>
    (f.status ? r.status === f.status : opts.allStatuses || r.status !== 'rejected')
    && (!f.round || r.roundId === f.round)
    && (!f.district || r.district === f.district)
    && (!f.villageIds.length || f.villageIds.includes(r.villageId))
    && (!f.from || (r.submittedAt ?? '') >= f.from)
    && (!f.to || (r.submittedAt ?? '') <= f.to + 'T23:59:59Z')
    && (!f.gender || r.answers.A6 === f.gender)
    && (!f.religion || r.answers.A10 === f.religion)
    && (!f.ageGroup || ageGroupOf(r.answers.A5) === f.ageGroup)
    && (!f.band || r.score?.band === f.band)
    && (!f.collectorId || r.collectorId === f.collectorId)
    && (!f.search || r.householdCode.toLowerCase().includes(f.search) || r.village.toLowerCase().includes(f.search)));
}

export const newId = () => crypto.randomUUID();

/**
 * "Needs a look" for each survey: the checks on its own answers, plus likely duplicates among
 * the rows given (pass every row in scope, so a duplicate in another filter is still found).
 */
export function issueChecker(rows: LoadedRow[]) {
  const dup = findDuplicates(rows.map(r => ({
    id: r.id, villageId: r.villageId, roundId: r.roundId, householdId: r.householdId, householdCode: r.householdCode,
    headName: r.headName, phone: r.householdPhone || (r.source === 'self' ? r.collectorPhone : null),
  })));
  return (r: LoadedRow): SurveyIssue[] => [...surveyIssues(r), ...(dup.get(r.id) ?? [])];
}

/**
 * Which surveys count in dashboards and insights: everything submitted by staff, but surveys a
 * household filled in itself only once a supervisor has approved them — anyone can register, so
 * self-reported answers are checked before they move any number.
 */
export const counts = (r: { source: string; status: string }) => r.source !== 'self' || r.status === 'approved';
