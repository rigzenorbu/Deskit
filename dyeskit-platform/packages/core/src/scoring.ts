/**
 * DYESKIT scoring — version v3 ("fixed points").
 *
 * The whole method in five steps:
 *   1. Each scored question gives fixed points (0–100) for the answer chosen.
 *      "Don't know" / "Prefer not to answer" gives 50. A skipped question is left out.
 *   2. Dimension score = the average of its answered questions.
 *      A dimension counts only if at least half of its questions are answered (and at least 2).
 *   3. Household score = the average of its counted dimensions (each dimension weighs the same).
 *      A household gets a score only if at least 5 of the 7 dimensions count.
 *   4. The household score falls into one of 7 bands (see BANDS).
 *   5. Village / district / filtered-group score = the average of the household scores in it.
 *      A village result is "reliable" once at least 30% of its households (and at least 10)
 *      have been surveyed.
 *
 * Raw answers are never changed here; running this again always reproduces every score.
 */

import {
  BANDS, BMI_OTHER_POINTS, BMI_TABLE, DIMENSIONS, DIM_ITEMS, ITEMS,
  type Band, type DimensionId, type Item,
} from './questionnaire';

export const SCORING_VERSION = 'v3-fixed-points';

export const NEUTRAL_POINTS = 50;
export const DIMENSION_MIN_SHARE = 0.5;
export const DIMENSION_MIN_QUESTIONS = 2;
export const HOUSEHOLD_MIN_DIMENSIONS = 5;
export const VILLAGE_MIN_SHARE = 0.3;
export const VILLAGE_MIN_HOUSEHOLDS = 10;
/** dimension averages below this are flagged ("below Basic") */
export const FLAG_BELOW = 43;
/** …and below this they are flagged as critical */
export const CRITICAL_BELOW = 29;

export type Answers = Record<string, unknown>;

export interface QuestionScore {
  dim: DimensionId;
  label: string;
  points: number | null;
  /** ok = scored from the answer, neutral = DK/PNA (50), missing = not answered (left out) */
  status: 'ok' | 'neutral' | 'missing';
  /** what produced the points, e.g. "BMI 21.4" or "2 kinds of support ticked" */
  detail?: string;
}

export interface DimensionScore {
  score: number | null;
  answered: number;
  total: number;
  counted: boolean;
}

export interface HouseholdScore {
  version: string;
  dims: Record<DimensionId, DimensionScore>;
  questions: Record<string, QuestionScore>;
  score: number | null;
  band: number | null;
  bandLabel: string;
  valid: boolean;
  countedDimensions: number;
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const isNeutral = (item: Item, v: unknown) => {
  const one = Array.isArray(v) && v.length === 1 ? v[0] : v;
  return !!item.options?.find(op => op.v === one && op.neutral);
};

export const round1 = (x: number) => Math.round(x * 10) / 10;

/** Points from the fixed BMI table. */
export function bmiPoints(heightCm: unknown, weightKg: unknown): { points: number; bmi: number } | null {
  const h = Number(heightCm), w = Number(weightKg);
  if (!h || !w || !isFinite(h) || !isFinite(w)) return null;
  const bmi = round1(w / ((h / 100) ** 2));
  if (!isFinite(bmi) || bmi <= 0) return null;
  const row = BMI_TABLE.find(r => bmi >= r.from && bmi <= r.to);
  return { points: row ? row.points : BMI_OTHER_POINTS, bmi };
}

/** Points from a count table: table[n], with the last entry meaning "or more". */
export const countToPoints = (table: number[], n: number) => table[Math.min(Math.max(0, n), table.length - 1)];

/** Real (counted) choices in a multi-select: ignores "None", DK and PNA. */
export const countChoices = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter(x => !['none', 'PNA', 'DK'].includes(String(x))).length;

/** Score one question. Returns null when it was not answered. */
export function scoreQuestion(item: Item, answers: Answers): Omit<QuestionScore, 'dim' | 'label'> | null {
  const v = answers[item.id];

  if (item.bmi) {
    const m = (v || {}) as { height_cm?: unknown; weight_kg?: unknown };
    const r = bmiPoints(m.height_cm, m.weight_kg);
    return r ? { points: r.points, status: 'ok', detail: `BMI ${r.bmi}` } : null;
  }
  if (isBlank(v)) return null;
  if (isNeutral(item, v)) return { points: NEUTRAL_POINTS, status: 'neutral', detail: 'Don’t know / prefer not to answer' };

  if (item.countPoints) {
    const n = item.type === 'number' ? Number(v) : countChoices(v);
    if (!isFinite(n)) return null;
    return { points: countToPoints(item.countPoints, n), status: 'ok', detail: `${n} ${item.counts ?? ''}`.trim() };
  }

  const opt = item.options?.find(op => op.v === String(v));
  if (!opt || typeof opt.points !== 'number') return null;
  return { points: opt.points, status: 'ok', detail: opt.label };
}

export function bandFor(score: number | null): Band | null {
  if (score === null || !isFinite(score)) return null;
  return BANDS.find(b => score >= b.min && score <= b.max) ?? BANDS[BANDS.length - 1];
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Score one household from its raw answers. */
export function scoreHousehold(answers: Answers): HouseholdScore {
  const dims = {} as Record<DimensionId, DimensionScore>;
  const questions: Record<string, QuestionScore> = {};

  for (const d of DIMENSIONS) {
    const items = DIM_ITEMS[d.id];
    const pts: number[] = [];
    for (const item of items) {
      const r = scoreQuestion(item, answers);
      const label = item.indicator ?? item.q;
      if (!r) { questions[item.id] = { dim: d.id, label, points: null, status: 'missing' }; continue; }
      pts.push(r.points!);
      questions[item.id] = { dim: d.id, label, ...r };
    }
    const needed = Math.max(DIMENSION_MIN_QUESTIONS, Math.ceil(items.length * DIMENSION_MIN_SHARE));
    dims[d.id] = {
      score: pts.length ? round1(mean(pts)) : null,
      answered: pts.length,
      total: items.length,
      counted: pts.length >= needed,
    };
  }

  const counted = DIMENSIONS.filter(d => dims[d.id].counted);
  const valid = counted.length >= HOUSEHOLD_MIN_DIMENSIONS;
  // the band comes from the unrounded average; rounding is for display only
  const raw = valid ? mean(counted.map(d => dims[d.id].score!)) : null;
  const band = bandFor(raw);
  return {
    version: SCORING_VERSION,
    dims, questions,
    score: raw === null ? null : round1(raw),
    band: band?.band ?? null,
    bandLabel: band?.label ?? 'Not enough answers',
    valid,
    countedDimensions: counted.length,
  };
}

export interface GroupScore {
  n: number;
  score: number | null;
  band: number | null;
  bandLabel: string;
  dims: Record<DimensionId, number | null>;
  bands: { band: number; label: string; count: number }[];
  flags: { dim: DimensionId; score: number; level: 'critical' | 'serious' }[];
  coverage: null | { surveyed: number; households: number; required: number; percent: number; reliable: boolean };
}

/** Average a group of household scores (a village, a district, or any filtered set). */
export function scoreGroup(scores: (HouseholdScore | null | undefined)[], opts: { households?: number } = {}): GroupScore {
  const rows = scores.filter((s): s is HouseholdScore => !!s && s.score !== null);
  const dims = {} as Record<DimensionId, number | null>;
  for (const d of DIMENSIONS) {
    const vals = rows.map(r => r.dims[d.id]?.score).filter((v): v is number => v !== null && v !== undefined);
    dims[d.id] = vals.length ? round1(mean(vals)) : null;
  }
  const raw = rows.length ? mean(rows.map(r => r.score!)) : null;
  const band = bandFor(raw);
  let coverage: GroupScore['coverage'] = null;
  if (opts.households && opts.households > 0) {
    const required = Math.max(VILLAGE_MIN_HOUSEHOLDS, Math.ceil(opts.households * VILLAGE_MIN_SHARE));
    coverage = {
      surveyed: rows.length, households: opts.households, required,
      percent: round1((rows.length / opts.households) * 100), reliable: rows.length >= required,
    };
  }
  return {
    n: rows.length,
    score: raw === null ? null : round1(raw),
    band: band?.band ?? null,
    bandLabel: band?.label ?? 'No scores yet',
    dims,
    bands: BANDS.map(b => ({ band: b.band, label: b.label, count: rows.filter(r => r.band === b.band).length })),
    flags: DIMENSIONS
      .filter(d => dims[d.id] !== null && dims[d.id]! < FLAG_BELOW)
      .map(d => ({ dim: d.id, score: dims[d.id]!, level: dims[d.id]! < CRITICAL_BELOW ? 'critical' as const : 'serious' as const })),
    coverage,
  };
}

/** Which scored question an item id belongs to — used by the explanation screens. */
export const scoredQuestion = (id: string) => (ITEMS[id]?.dim ? ITEMS[id] : null);
