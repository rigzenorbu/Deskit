/**
 * Dashboard analytics: every chart in the app is computed here, from the surveys that
 * match the current filters. Pure functions — the server loads the rows, this file
 * does the arithmetic (only counts and averages).
 */

import { DISTRICTS } from './districts';
import { DIMENSIONS, ITEMS, SCORED_ITEMS, type DimensionId } from './questionnaire';
import { round1, scoreGroup, type Answers, type GroupScore, type HouseholdScore } from './scoring';
import { buildInsights, signalShares, severityFor } from './insights';

export interface SurveyRow {
  id: string;
  villageId: number;
  village: string;
  district: string;
  households: number;
  submittedAt: string | null;
  durationMin: number | null;
  status: string;
  answers: Answers;
  score: HouseholdScore | null;
}

export interface VillageInfo { id: number; name: string; district: string; households: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const optionLabel = (itemId: string, v: unknown) => ITEMS[itemId]?.options?.find(o => o.v === String(v))?.label ?? String(v);

export const AGE_GROUPS = [
  { id: '18-29', label: '18–29', min: 18, max: 29 },
  { id: '30-44', label: '30–44', min: 30, max: 44 },
  { id: '45-59', label: '45–59', min: 45, max: 59 },
  { id: '60+', label: '60 and over', min: 60, max: 200 },
];
export const ageGroupOf = (age: unknown) => {
  const n = Number(age);
  return isFinite(n) && n > 0 ? AGE_GROUPS.find(g => n >= g.min && n <= g.max)?.id ?? null : null;
};

export const HOUSEHOLD_SIZES = [
  { id: '1-3', label: '1–3 people', min: 1, max: 3 },
  { id: '4-6', label: '4–6 people', min: 4, max: 6 },
  { id: '7+', label: '7 or more', min: 7, max: 999 },
];

export interface GroupRow { key: string; label: string; n: number; score: number | null; dims: Record<DimensionId, number | null> }

/** Average score for each value of a grouping (gender, age group, …). */
function breakdown(rows: SurveyRow[], keyOf: (r: SurveyRow) => string | null, labelOf: (k: string) => string, order?: string[]): GroupRow[] {
  const groups = new Map<string, SurveyRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null || k === undefined || k === '' || k === 'PNA') continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out = [...groups].map(([key, rs]) => {
    const g = scoreGroup(rs.map(r => r.score));
    return { key, label: labelOf(key), n: g.n, score: g.score, dims: g.dims };
  }).filter(g => g.n > 0);
  return order ? out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : out.sort((a, b) => b.n - a.n);
}

/** Share of households giving each answer to a single-choice question. */
function distribution(rows: SurveyRow[], itemId: string) {
  const counts = new Map<string, number>();
  let n = 0;
  for (const r of rows) {
    const v = r.answers[itemId];
    if (v === undefined || v === null || v === '') continue;
    n++;
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  }
  const opts = ITEMS[itemId]?.options ?? [];
  return { n, rows: opts.filter(o => counts.has(o.v)).map(o => ({ key: o.v, label: o.label, count: counts.get(o.v)!, share: round1((counts.get(o.v)! / n) * 100) })) };
}

export function computeDashboard(rows: SurveyRow[], villagesInView: VillageInfo[], allRows?: SurveyRow[]) {
  const scored = rows.filter(r => r.score && r.score.score !== null);
  const householdsOnRecord = villagesInView.reduce((s, v) => s + (v.households || 0), 0);
  const overall = scoreGroup(rows.map(r => r.score), { households: householdsOnRecord || undefined });
  const baseline = allRows ? scoreGroup(allRows.map(r => r.score)) : null;

  /* ---- districts ---- */
  const districts = DISTRICTS.map(d => {
    const rs = rows.filter(r => r.district === d.id);
    const vs = villagesInView.filter(v => v.district === d.id);
    const g = scoreGroup(rs.map(r => r.score));
    return { id: d.id, name: d.name, letter: d.letter, villages: vs.length,
      villagesSurveyed: new Set(rs.map(r => r.villageId)).size, ...g };
  });

  /* ---- villages ---- */
  const byVillage = new Map<number, SurveyRow[]>();
  for (const r of rows) { if (!byVillage.has(r.villageId)) byVillage.set(r.villageId, []); byVillage.get(r.villageId)!.push(r); }
  const villages = [...byVillage].map(([id, rs]) => {
    const g = scoreGroup(rs.map(r => r.score), { households: rs[0].households });
    return { id, name: rs[0].village, district: rs[0].district, ...g };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  /* ---- trend by month ---- */
  const byMonth = new Map<string, SurveyRow[]>();
  for (const r of rows) {
    if (!r.submittedAt) continue;
    const m = r.submittedAt.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(r);
  }
  const trend = [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, rs]) => {
    const g = scoreGroup(rs.map(r => r.score));
    return { month, surveys: rs.length, score: g.score, dims: g.dims };
  });

  /* ---- who is doing better: breakdowns by respondent and household ---- */
  const groups = {
    gender: breakdown(scored, r => (r.answers.A6 as string) ?? null, k => optionLabel('A6', k), ['female', 'male', 'other']),
    age: breakdown(scored, r => ageGroupOf(r.answers.A5), k => AGE_GROUPS.find(g => g.id === k)!.label, AGE_GROUPS.map(g => g.id)),
    religion: breakdown(scored, r => (r.answers.A10 as string) ?? null, k => optionLabel('A10', k)),
    occupation: breakdown(scored, r => (r.answers.A12 as string) ?? null, k => optionLabel('A12', k)).slice(0, 8),
    education: breakdown(scored, r => (r.answers.A13 as string) ?? null, k => optionLabel('A13', k), (ITEMS.A13.options ?? []).map(o => o.v)),
    family: breakdown(scored, r => (r.answers.A9 as string) ?? null, k => optionLabel('A9', k), ['nuclear', 'joint', 'extended']),
    housing: breakdown(scored, r => (r.answers.A11 as string) ?? null, k => optionLabel('A11', k)),
    size: breakdown(scored, r => {
      const n = Number(r.answers.A7);
      return isFinite(n) && n > 0 ? HOUSEHOLD_SIZES.find(s => n >= s.min && n <= s.max)?.id ?? null : null;
    }, k => HOUSEHOLD_SIZES.find(s => s.id === k)!.label, HOUSEHOLD_SIZES.map(s => s.id)),
  };

  /* ---- score distribution: households per 10-point step ---- */
  const histogram = Array.from({ length: 10 }, (_, i) => ({
    from: i * 10, to: i * 10 + 10,
    count: scored.filter(r => r.score!.score! >= i * 10 && (i === 9 ? r.score!.score! <= 100 : r.score!.score! < i * 10 + 10)).length,
  }));

  /* ---- every scored question: average points, weakest first ---- */
  const questions = SCORED_ITEMS.map(item => {
    const pts = scored.map(r => r.score!.questions[item.id]?.points).filter((p): p is number => typeof p === 'number');
    const avg = mean(pts);
    return { id: item.id, dim: item.dim!, label: item.indicator ?? item.q, answered: pts.length, points: avg === null ? null : round1(avg) };
  }).filter(q => q.points !== null).sort((a, b) => a.points! - b.points!);

  /* ---- signals: share of households affected ---- */
  const shares = signalShares(rows.map(r => r.answers));
  const signals = Object.values(shares).filter(s => s.share !== null && s.share > 0)
    .sort((a, b) => b.share! - a.share!).map(s => ({ ...s, level: severityFor(s.share)?.level ?? null }));

  /* ---- development priorities: 1st choice = 3 points, 2nd = 2, 3rd = 1 ---- */
  const prio = new Map<string, number>();
  let prioResponses = 0;
  for (const r of rows) {
    const list = Array.isArray(r.answers.I5) ? (r.answers.I5 as string[]) : [];
    if (list.length) prioResponses++;
    list.slice(0, 3).forEach((k, i) => prio.set(k, (prio.get(k) ?? 0) + (3 - i)));
  }
  const priorities = [...prio].map(([key, points]) => ({ key, label: optionLabel('I5', key), points }))
    .sort((a, b) => b.points - a.points);

  /* ---- technology readiness and context ---- */
  const tech = { smartphone: distribution(rows, 'I1'), internet: distribution(rows, 'I2'), ai: distribution(rows, 'I3') };
  const context = {
    fuel: distribution(rows, 'E5'), water: distribution(rows, 'E1'), income: distribution(rows, 'F1'),
    glacier: distribution(rows, 'E2'),
  };

  /* ---- data quality ---- */
  const quality = {
    total: rows.length,
    byStatus: ['draft', 'submitted', 'approved', 'rejected'].map(s => ({ status: s, count: rows.filter(r => r.status === s).length })),
    notEnoughAnswers: rows.filter(r => !r.score || r.score.score === null).length,
    shortInterviews: rows.filter(r => r.durationMin !== null && r.durationMin < 10).length,
    noBmi: rows.filter(r => !(r.answers.B1 as { height_cm?: number } | undefined)?.height_cm).length,
  };

  /* ---- headline numbers ---- */
  const strongest = DIMENSIONS.filter(d => overall.dims[d.id] !== null).sort((a, b) => overall.dims[b.id]! - overall.dims[a.id]!);
  const headline = {
    surveys: rows.length,
    scored: scored.length,
    villagesSurveyed: byVillage.size,
    villagesInView: villagesInView.length,
    districtsSurveyed: new Set(rows.map(r => r.district)).size,
    strongest: strongest[0]?.id ?? null,
    weakest: strongest[strongest.length - 1]?.id ?? null,
    thisMonth: rows.filter(r => r.submittedAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
  };

  return { headline, overall, baseline, districts, villages, trend, groups, histogram, questions, signals, priorities, tech, context, quality };
}

export type Dashboard = ReturnType<typeof computeDashboard>;

/** Insights for the rows in view, grouped by village. */
export function computeInsights(rows: SurveyRow[], villages: VillageInfo[]) {
  const ids = new Set(rows.map(r => r.villageId));
  return buildInsights(villages.filter(v => ids.has(v.id)).map(v => ({
    id: v.id, name: v.name, district: v.district, households: v.households,
    surveys: rows.filter(r => r.villageId === v.id).map(r => ({ answers: r.answers, score: r.score })),
  })));
}

export type { GroupScore };
