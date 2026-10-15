/**
 * The data assistant: staff ask a question in plain words and get an answer built only from
 * the surveys they are allowed to see.
 *
 * The same small set of tools answers in both modes:
 *  - with ANTHROPIC_API_KEY set, Claude reads the question, calls the tools it needs and writes
 *    the answer from what they return;
 *  - without a key (or if the call fails), a rule-based planner picks one tool from keywords.
 * Tools work on totals only — no household is ever named, coded or listed.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  AGE_GROUPS, BANDS, CRITICAL_BELOW, DIM_ITEMS, DIMENSIONS, DISTRICTS, FLAG_BELOW, HOUSEHOLD_MIN_DIMENSIONS, HOUSEHOLD_SIZES, ITEMS, NEUTRAL_POINTS,
  SCORING_VERSION, VILLAGE_MIN_HOUSEHOLDS, VILLAGE_MIN_SHARE, ageGroupOf, compareRounds, computeDashboard, computeInsights, districtName,
  householdSize, questionNo, scoreGroup, type SurveyRow, type VillageInfo,
} from '@dyeskit/core';
import { catalogue, conditionTest, findQuestion, questionTitle, searchQuestions, summarise, type Condition } from './assistant-data';
import type { LoadedRow } from './data';

export interface Evidence { title: string; columns: string[]; rows: (string | number | null)[][] }
export interface AssistantReply { answer: string; evidence: Evidence[]; mode: 'ai' | 'rules'; suggestions: string[] }
export interface ChatTurn { role: 'user' | 'assistant'; text: string }

export interface AssistantContext {
  rows: LoadedRow[];          // counted surveys, every round
  roundId: number | null;     // the round in view (null = all rounds)
  roundName: string;
  villages: VillageInfo[];    // villages this person can see
  villageCodes: Map<number, string>;
}

export const SUGGESTIONS = [
  'How are we doing overall?',
  'Which villages need the most help?',
  'Compare the districts',
  'What problems affect the most households?',
  'What did households ask for?',
  'What changed since the last round?',
  'Do women score differently from men?',
  'How is the score calculated?',
];

const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-5-5';
export const assistantMode = () => (process.env.ANTHROPIC_API_KEY ? 'ai' : 'rules') as 'ai' | 'rules';

/* ------------------------------------------------------------------ tools */

type Args = {
  district?: string; village?: string; order?: 'lowest' | 'highest'; limit?: number; by?: string;
  question?: string; search?: string; dimension?: string; conditions?: Condition[];
};
interface ToolOut { text: string; data: unknown; evidence?: Evidence }

const n1 = (x: number | null | undefined) => (x === null || x === undefined ? '—' : x.toFixed(1));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const bandName = (b: number | null) => BANDS.find(x => x.band === b)?.short ?? 'no band';
const dimName = (id: string) => DIMENSIONS.find(d => d.id === id)?.name ?? id;
const GROUPS = ['gender', 'age', 'religion', 'occupation', 'education', 'family', 'housing', 'size'] as const;
/** Fewer households than this and a sub-group's scores are not shown: too few to mean anything, and too close to one family. */
const MIN_GROUP = 5;

const label = (id: string, v: unknown) => ITEMS[id]?.options?.find(o => o.v === String(v))?.label ?? null;
/** How to split households for a breakdown: district, village or one of GROUPS. */
const SPLITS: Record<string, (r: LoadedRow) => string | null> = {
  district: r => districtName(r.district),
  village: r => r.village,
  gender: r => label('A6', r.answers.A6),
  age: r => AGE_GROUPS.find(g => g.id === ageGroupOf(r.answers.A5))?.label ?? null,
  religion: r => label('A10', r.answers.A10),
  occupation: r => label('A12', r.answers.A12),
  education: r => label('A13', r.answers.A13),
  family: r => label('A9', r.answers.A9),
  housing: r => label('A11', r.answers.A11),
  size: r => { const n = householdSize(r.answers); return n === null ? null : HOUSEHOLD_SIZES.find(s => n >= s.min && n <= s.max)?.label ?? null; },
};
const findDimension = (t: string | undefined) => {
  const x = (t ?? '').toLowerCase().trim();
  return DIMENSIONS.find(d => d.id === x || d.name.toLowerCase() === x || d.short.toLowerCase() === x || (x.length > 3 && d.name.toLowerCase().startsWith(x.slice(0, 4))));
};

/** Find a district from an id or a name ("Leh", "changthang", "Sham"). */
export function findDistrict(text: string | undefined) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  return DISTRICTS.find(d => d.id === t || d.name.toLowerCase() === t) ?? null;
}

/** Find a village the person can see, by name or code. */
export function findVillage(ctx: AssistantContext, text: string | undefined) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  return ctx.villages.find(v => v.name.toLowerCase() === t || ctx.villageCodes.get(v.id)?.toLowerCase() === t)
    ?? ctx.villages.find(v => v.name.toLowerCase().startsWith(t))
    ?? null;
}

/** The surveys and villages a tool call is about, plus a label such as "Stok" or "Leh district". */
function slice(ctx: AssistantContext, a: Args, opts: { allRounds?: boolean } = {}) {
  const v = a.village ? findVillage(ctx, a.village) : null;
  if (a.village && !v) throw new ToolError(`No village called “${a.village}” among the villages you can see.`);
  const d = !v && a.district ? findDistrict(a.district) : null;
  if (a.district && !v && !d) throw new ToolError(`“${a.district}” is not one of the 7 districts: ${DISTRICTS.map(x => x.name).join(', ')}.`);
  const rows = ctx.rows.filter(r => (opts.allRounds || !ctx.roundId || r.roundId === ctx.roundId)
    && (!v || r.villageId === v.id) && (!d || r.district === d.id));
  const villages = ctx.villages.filter(x => (!v || x.id === v.id) && (!d || x.district === d.id));
  const label = v ? v.name : d ? `${d.name} district` : 'all your villages';
  return { rows, villages, label, village: v, district: d };
}

class ToolError extends Error {}

const TOOLS: Record<string, { description: string; props: Record<string, unknown>; run: (ctx: AssistantContext, a: Args) => ToolOut }> = {
  overview: {
    description: 'Overall well-being score, band, households surveyed, coverage and the seven dimension scores, for everything or for one district or village.',
    props: { district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const s = slice(ctx, a);
      const d = computeDashboard(s.rows, s.villages);
      const o = d.overall;
      if (!o.n) return { text: `There are no counted surveys for ${s.label} in round ${ctx.roundName} yet.`, data: { surveys: 0 } };
      const dims = DIMENSIONS.map(x => ({ dimension: x.name, score: o.dims[x.id] })).sort((p, q) => (q.score ?? -1) - (p.score ?? -1));
      const best = dims[0], worst = dims.filter(x => x.score !== null).at(-1);
      const cov = o.coverage;
      const text = o.score === null
        ? `${s.label} has ${o.n} surveys in round ${ctx.roundName}, but not enough complete answers for a score yet.`
        : `${s.label} scores ${n1(o.score)} out of 100 (band ${o.band}, ${bandName(o.band)}) from ${o.n} households in round ${ctx.roundName}. `
          + `Strongest is ${best.dimension} (${n1(best.score)}), weakest is ${worst?.dimension} (${n1(worst?.score)}).`
          + (o.flags.length ? ` Below the Basic level of ${FLAG_BELOW}: ${o.flags.map(f => `${dimName(f.dim)} ${n1(f.score)}`).join(', ')}.` : '')
          + (cov ? ` Coverage: ${cov.percent}% of ${cov.households} households on record — ${cov.reliable ? 'reliable' : `not yet reliable, ${cov.required - cov.surveyed} more needed`}.` : '');
      return {
        text,
        data: { scope: s.label, round: ctx.roundName, households: o.n, score: o.score, band: o.band, bandLabel: o.bandLabel, coverage: cov, dimensions: dims, flags: o.flags, villagesSurveyed: d.headline.villagesSurveyed },
        evidence: { title: `${s.label} — dimensions`, columns: ['Dimension', 'Score'], rows: dims.map(x => [x.dimension, x.score]) },
      };
    },
  },

  list_villages: {
    description: 'Villages ranked by well-being score (lowest first by default), with households surveyed, band and whether the result is reliable. Optionally within one district.',
    props: { district: { type: 'string' }, order: { type: 'string', enum: ['lowest', 'highest'] }, limit: { type: 'integer' } },
    run(ctx, a) {
      const s = slice(ctx, { district: a.district });
      const vs = computeDashboard(s.rows, s.villages).villages.filter(v => v.score !== null);
      if (!vs.length) return { text: `No village in ${s.label} has a score yet in round ${ctx.roundName}.`, data: { villages: [] } };
      const sorted = [...vs].sort((p, q) => a.order === 'highest' ? q.score! - p.score! : p.score! - q.score!).slice(0, Math.min(25, a.limit ?? 8));
      const list = sorted.map(v => ({ village: v.name, district: districtName(v.district), score: v.score, band: v.band, households: v.n, reliable: v.coverage?.reliable ?? null, flags: v.flags.map(f => dimName(f.dim)) }));
      const top = list.slice(0, 3).map(v => `${v.village} (${n1(v.score)})`).join(', ');
      return {
        text: `${a.order === 'highest' ? 'Highest' : 'Lowest'}-scoring villages in ${s.label}, round ${ctx.roundName}: ${top}. ${vs.length} villages have a score.`,
        data: { scope: s.label, round: ctx.roundName, villagesWithScore: vs.length, villages: list },
        evidence: { title: `Villages in ${s.label}, ${a.order === 'highest' ? 'highest' : 'lowest'} first`, columns: ['Village', 'Score', 'Households', 'Reliable'],
          rows: list.map(v => [s.district ? v.village : `${v.village} (${v.district})`, v.score, v.households, v.reliable === null ? '—' : v.reliable ? 'yes' : 'no']) },
      };
    },
  },

  compare_districts: {
    description: 'The seven districts side by side: score, households surveyed, villages surveyed and weakest dimension.',
    props: {},
    run(ctx) {
      const s = slice(ctx, {});
      const ds = computeDashboard(s.rows, s.villages).districts.filter(d => d.n);
      if (!ds.length) return { text: `No district has surveys in round ${ctx.roundName} yet.`, data: { districts: [] } };
      const list = ds.map(d => {
        const weakest = DIMENSIONS.filter(x => d.dims[x.id] !== null).sort((p, q) => d.dims[p.id]! - d.dims[q.id]!)[0];
        return { district: d.name, score: d.score, band: d.band, households: d.n, villagesSurveyed: d.villagesSurveyed, weakest: weakest ? `${weakest.name} ${n1(d.dims[weakest.id])}` : null };
      }).sort((p, q) => (q.score ?? -1) - (p.score ?? -1));
      const scored = list.filter(x => x.score !== null);
      return {
        text: scored.length >= 2
          ? `In round ${ctx.roundName}, ${scored[0].district} scores highest (${n1(scored[0].score)}) and ${scored.at(-1)!.district} lowest (${n1(scored.at(-1)!.score)}).`
          : `Only ${list.map(x => x.district).join(', ')} has surveys in round ${ctx.roundName}.`,
        data: { round: ctx.roundName, districts: list },
        evidence: { title: 'Districts', columns: ['District', 'Score', 'Households', 'Villages', 'Weakest'], rows: list.map(x => [x.district, x.score, x.households, x.villagesSurveyed, x.weakest]) },
      };
    },
  },

  weakest_questions: {
    description: 'The questions with the lowest average points (0–100), i.e. the specific things households struggle with most.',
    props: { district: { type: 'string' }, village: { type: 'string' }, limit: { type: 'integer' } },
    run(ctx, a) {
      const s = slice(ctx, a);
      const qs = computeDashboard(s.rows, s.villages).questions.slice(0, Math.min(20, a.limit ?? 6));
      if (!qs.length) return { text: `No scored answers for ${s.label} yet.`, data: { questions: [] } };
      const list = qs.map(q => ({ question: q.label, dimension: dimName(q.dim), points: q.points, answered: q.answered }));
      return {
        text: `Lowest-scoring questions in ${s.label}: ${list.slice(0, 3).map(q => `${q.question} (${n1(q.points)})`).join('; ')}.`,
        data: { scope: s.label, round: ctx.roundName, questions: list },
        evidence: { title: `Lowest-scoring questions — ${s.label}`, columns: ['Question', 'Dimension', 'Points'], rows: list.map(q => [q.question, q.dimension, q.points]) },
      };
    },
  },

  problems: {
    description: 'Problems (signals) and the share of households affected, with the suggested action for each, plus the villages where each is worst.',
    props: { district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const s = slice(ctx, a);
      const ins = computeInsights(s.rows, s.villages);
      const list = ins.actions.slice(0, 8).map(x => ({ problem: x.label, households: x.households, of: x.of, share: x.share, level: x.level, action: x.action,
        worstVillages: s.village ? [] : x.villages.slice(0, 3).map(v => v.name) }));
      if (!list.length) return { text: `In ${s.label}, no problem affects 15% or more of households in round ${ctx.roundName}.`, data: { problems: [] } };
      return {
        text: `In ${s.label}, the most widespread problems are: ${list.slice(0, 3).map(p => `${p.problem} (${pct(p.share)} of households)`).join('; ')}. `
          + `Suggested first step: ${list[0].action}`,
        data: { scope: s.label, round: ctx.roundName, problems: list },
        evidence: { title: `Problems — ${s.label} (of ${list[0].of} households)`, columns: ['Problem', 'Count', 'Share', 'Level'], rows: list.map(p => [p.problem, p.households, pct(p.share), p.level]) },
      };
    },
  },

  priorities: {
    description: 'What households asked for: their top-3 development priorities (1st choice = 3 points, 2nd = 2, 3rd = 1).',
    props: { district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const s = slice(ctx, a);
      const p = computeDashboard(s.rows, s.villages).priorities.slice(0, 8);
      if (!p.length) return { text: `No priorities recorded for ${s.label} yet.`, data: { priorities: [] } };
      return {
        text: `Households in ${s.label} most often asked for: ${p.slice(0, 3).map(x => `${x.label} (${x.points} points)`).join(', ')}.`,
        data: { scope: s.label, round: ctx.roundName, priorities: p.map(x => ({ priority: x.label, points: x.points })) },
        evidence: { title: `Priorities — ${s.label}`, columns: ['Priority', 'Points'], rows: p.map(x => [x.label, x.points]) },
      };
    },
  },

  round_change: {
    description: 'Score and dimension scores in every survey round, oldest first, to show change over time.',
    props: { district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const s = slice(ctx, a, { allRounds: true });
      const rs = compareRounds(s.rows).filter(r => r.n);
      if (rs.length < 2) return { text: `${s.label} has surveys in ${rs.length ? 'only one round' : 'no round'} so far, so there is no change to show yet.`, data: { rounds: rs } };
      const [prev, last] = rs.slice(-2);
      const ch = last.score !== null && prev.score !== null ? last.score - prev.score : null;
      const moves = DIMENSIONS.map(x => ({ dimension: x.name, from: prev.dims[x.id], to: last.dims[x.id], change: last.dims[x.id] !== null && prev.dims[x.id] !== null ? Math.round((last.dims[x.id]! - prev.dims[x.id]!) * 10) / 10 : null }))
        .filter(m => m.change !== null).sort((p, q) => q.change! - p.change!);
      return {
        text: ch === null ? `Not enough scored surveys to compare rounds ${prev.name} and ${last.name} in ${s.label}.`
          : `${s.label} went from ${n1(prev.score)} in round ${prev.name} to ${n1(last.score)} in round ${last.name} (${ch >= 0 ? '+' : ''}${ch.toFixed(1)}). `
            + (moves.length ? `Biggest rise: ${moves[0].dimension} (${moves[0].change! >= 0 ? '+' : ''}${moves[0].change}); biggest fall: ${moves.at(-1)!.dimension} (${moves.at(-1)!.change}).` : ''),
        data: { scope: s.label, rounds: rs.map(r => ({ round: r.name, households: r.n, score: r.score, band: r.band })), dimensionChange: moves },
        evidence: { title: `Change between rounds — ${s.label}`, columns: ['Dimension', `Round ${prev.name}`, `Round ${last.name}`, 'Change'], rows: moves.map(m => [m.dimension, m.from, m.to, m.change]) },
      };
    },
  },

  compare_groups: {
    description: `Scores by type of household or respondent. "by" is one of: ${GROUPS.join(', ')}.`,
    props: { by: { type: 'string', enum: [...GROUPS] }, district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const by = (GROUPS as readonly string[]).includes(a.by ?? '') ? (a.by as (typeof GROUPS)[number]) : 'gender';
      const s = slice(ctx, a);
      const g = computeDashboard(s.rows, s.villages).groups[by].filter(x => x.n);
      if (!g.length) return { text: `No scored surveys in ${s.label} to compare by ${by}.`, data: { groups: [] } };
      const sorted = [...g].sort((p, q) => (q.score ?? -1) - (p.score ?? -1));
      return {
        text: `By ${by} in ${s.label}: ${sorted.map(x => `${x.label} ${n1(x.score)} (${x.n} households)`).join(', ')}.`
          + (sorted.some(x => x.n < 10) ? ' Groups with fewer than 10 households are too small to draw conclusions from.' : ''),
        data: { scope: s.label, by, groups: g.map(x => ({ group: x.label, households: x.n, score: x.score, dims: x.dims })) },
        evidence: { title: `By ${by} — ${s.label}`, columns: ['Group', 'Households', 'Score'], rows: sorted.map(x => [x.label, x.n, x.score]) },
      };
    },
  },

  scoring_rules: {
    description: 'How scores are calculated: points per answer, dimension and household averages, bands, flags and when a village result is reliable.',
    props: {},
    run() {
      const text = `Every answer gets fixed points from 0 to 100 (“don't know” or “prefer not to say” get ${NEUTRAL_POINTS}). `
        + `A dimension's score is the average of its answered questions; a household gets a score once at least ${HOUSEHOLD_MIN_DIMENSIONS} of the 7 dimensions can be scored, and that score is the average of them. `
        + `Villages and districts average their households. Scores fall into 7 bands, from Foundational (below 15) to Thriving (85 and above). `
        + `A dimension below ${FLAG_BELOW} is flagged; below ${CRITICAL_BELOW} it is critical. `
        + `A village result is reliable once ${Math.round(VILLAGE_MIN_SHARE * 100)}% of its households, and at least ${VILLAGE_MIN_HOUSEHOLDS}, are surveyed. Scoring version ${SCORING_VERSION}.`;
      return { text, data: { text, bands: BANDS.map(b => ({ band: b.band, label: b.label, from: b.min, to: Math.ceil(b.max) })) },
        evidence: { title: 'Bands', columns: ['Band', 'Name', 'From'], rows: BANDS.map(b => [b.band, b.label, b.min]) } };
    },
  },
  find_questions: {
    description: 'Search the questionnaire by words ("loan", "literacy", "toilet"). Returns each matching question\'s number, wording, dimension and answer choices. Use it before question_answers or count_households when unsure which question fits.',
    props: { search: { type: 'string' } },
    run(_ctx, a) {
      const hits = searchQuestions(a.search ?? '', { limit: 8 });
      if (!hits.length) return { text: `No question in the survey is about “${a.search}”.`, data: { questions: [] } };
      const list = hits.map(h => ({ number: questionNo(h.item.id), question: h.item.q, dimension: h.item.dim ? dimName(h.item.dim) : 'not scored', type: h.item.type,
        answers: (h.item.options ?? []).map(o => o.label) }));
      return {
        text: `Questions about “${a.search}”: ${list.slice(0, 4).map(q => `${q.number} ${q.question}`).join('; ')}.`,
        data: { questions: list },
        evidence: { title: `Questions about “${a.search}”`, columns: ['No.', 'Question', 'Dimension'], rows: list.map(q => [q.number, q.question, q.dimension]) },
      };
    },
  },

  question_answers: {
    description: 'How households answered ONE question: the number and percent giving each answer, average points (scored questions), and for numbers the average, median, lowest and highest. '
      + 'Works for every question, scored or not (loans, languages, literacy, jobs, family size and ages, BMI, water, fuel, smartphones, priorities…). '
      + '"question" is the question number as shown in the app (e.g. "F4") or a few words. Optional "by" splits the result by district, village, gender, age, religion, occupation, education, family, housing or size.',
    props: { question: { type: 'string' }, district: { type: 'string' }, village: { type: 'string' },
      by: { type: 'string', enum: ['district', 'village', ...GROUPS] } },
    run(ctx, a) {
      const it = findQuestion(a.question);
      if (!it) throw new ToolError(`No question matches “${a.question}”. Try find_questions.`);
      const s = slice(ctx, a);
      if (!s.rows.length) return { text: `There are no counted surveys for ${s.label} in round ${ctx.roundName}.`, data: { households: 0 } };
      const sum = summarise(it, s.rows);
      const head = `${questionTitle(it)} — ${s.label}, round ${ctx.roundName}: ${sum.answered} of ${sum.households} households answered.`;
      const top = sum.answers.slice(0, 4).map(x => `${x.answer} ${x.households} (${x.percent ?? '—'}%)`).join('; ');
      const out: ToolOut = {
        text: `${head} ${top}.${sum.averagePoints !== null ? ` Average ${n1(sum.averagePoints)} points out of 100.` : ''}`
          + (sum.answered < sum.households * 0.3 ? ` Only ${sum.answered} households answered (the question may be new, or asked only after another answer), so treat this with care.` : ''),
        data: { scope: s.label, round: ctx.roundName, ...sum },
        evidence: { title: `${questionNo(it.id)} — ${s.label} (${sum.answered} answered)`, columns: ['Answer', 'Count', '%'], rows: sum.answers.map(x => [x.answer, x.households, x.percent]) },
      };
      if (!a.by || !SPLITS[a.by]) return out;
      const groups = new Map<string, LoadedRow[]>();
      for (const r of s.rows) { const k = SPLITS[a.by](r); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); } }
      const split = [...groups].map(([group, rs]) => {
        const g = summarise(it, rs);
        const main = [...g.answers].sort((p, q) => q.households - p.households)[0];
        return { group, households: g.households, answered: g.answered, averagePoints: g.averagePoints, mostCommon: main ? `${main.answer} (${main.percent}%)` : null,
          answers: Object.fromEntries(g.answers.map(x => [x.answer, x.percent])), ...(g.stats ? { stats: g.stats } : {}) };
      }).filter(x => x.answered).sort((p, q) => q.answered - p.answered).slice(0, 30);
      return {
        text: `${out.text} Split by ${a.by}: ${split.slice(0, 5).map(x => `${x.group}: ${x.mostCommon ?? '—'}`).join('; ')}.`,
        data: { ...(out.data as object), by: a.by, groups: split, smallGroups: `Groups under ${MIN_GROUP} answers are too small to compare.` },
        evidence: { title: `${questionNo(it.id)} by ${a.by} — ${s.label}`, columns: [a.by[0].toUpperCase() + a.by.slice(1), 'Answered', it.dim ? 'Avg points' : 'Most common'],
          rows: split.map(x => [x.group, x.answered, it.dim ? x.averagePoints : x.mostCommon]) },
      };
    },
  },

  count_households: {
    description: 'Count the households matching ALL the given conditions, e.g. "families with a loan AND no savings" or "household size 7 or more AND income not covering needs". '
      + 'Each condition: {question: number or words, answers: [answer labels or values]} or, for numbers / family size / jobs, {question, min, max}. '
      + `Returns the count, the share of households, and (when ${MIN_GROUP}+ match) their average score and dimension scores next to everyone's.`,
    props: {
      conditions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, answers: { type: 'array', items: { type: 'string' } }, min: { type: 'number' }, max: { type: 'number' } }, required: ['question'] } },
      district: { type: 'string' }, village: { type: 'string' },
    },
    run(ctx, a) {
      const conds = (Array.isArray(a.conditions) ? a.conditions : []).slice(0, 5).map(conditionTest);
      if (!conds.length) throw new ToolError('Give at least one condition.');
      const bad = conds.find((c): c is string => typeof c === 'string');
      if (bad) throw new ToolError(bad);
      const tests = conds as Exclude<(typeof conds)[number], string>[];
      const s = slice(ctx, a);
      const match = s.rows.filter(r => tests.every(t => t.test(r.answers)));
      const all = scoreGroup(s.rows.map(r => r.score)), sub = scoreGroup(match.map(r => r.score));
      const show = match.length >= MIN_GROUP;
      const dims = DIMENSIONS.map(d => ({ dimension: d.name, matching: show ? sub.dims[d.id] : null, everyone: all.dims[d.id] }));
      const when = tests.map(t => t.text).join(' AND ');
      return {
        text: `${match.length} of ${s.rows.length} households in ${s.label} (${pct(s.rows.length ? match.length / s.rows.length : null)}) match: ${when}.`
          + (show ? ` Their average score is ${n1(sub.score)}, against ${n1(all.score)} for all households.` : match.length ? ` Too few to show their scores (fewer than ${MIN_GROUP}).` : ''),
        data: { scope: s.label, round: ctx.roundName, conditions: when, matching: match.length, of: s.rows.length, share: s.rows.length ? Math.round((match.length / s.rows.length) * 1000) / 10 : null,
          matchingScore: show ? sub.score : null, everyoneScore: all.score, dimensions: dims,
          byDistrict: s.district || s.village ? undefined : DISTRICTS.map(d => ({ district: d.name, matching: match.filter(r => r.district === d.id).length, of: s.rows.filter(r => r.district === d.id).length })).filter(x => x.of) },
        evidence: { title: `${match.length} households: ${when}`.slice(0, 120), columns: ['Dimension', 'Matching', 'Everyone'], rows: dims.map(x => [x.dimension, x.matching, x.everyone]) },
      };
    },
  },

  dimension_detail: {
    description: 'One dimension in depth: its score, and for each of its questions the average points, how many answered, the most common answer and the share of households scoring below 50 on it. '
      + 'Also the same dimension for all your villages, for comparison. Dimension: Physical, Emotional, Social, Environmental, Financial, Intellectual or Spiritual.',
    props: { dimension: { type: 'string' }, district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const dim = findDimension(a.dimension);
      if (!dim) throw new ToolError(`“${a.dimension}” is not a dimension. The seven are: ${DIMENSIONS.map(d => d.name).join(', ')}.`);
      const s = slice(ctx, a), everyone = slice(ctx, {});
      const g = scoreGroup(s.rows.map(r => r.score)), wide = scoreGroup(everyone.rows.map(r => r.score));
      const qs = DIM_ITEMS[dim.id].map(it => {
        const sum = summarise(it, s.rows);
        const pts = s.rows.map(r => r.score?.questions[it.id]?.points).filter((p): p is number => typeof p === 'number');
        const main = [...sum.answers].sort((p, q) => q.households - p.households)[0];
        return { number: questionNo(it.id), indicator: it.indicator ?? it.q, averagePoints: sum.averagePoints, answered: sum.answered,
          mostCommon: main ? `${main.answer} (${main.percent}%)` : null, below50: pts.length ? Math.round((pts.filter(p => p < 50).length / pts.length) * 100) : null };
      }).sort((p, q) => (p.averagePoints ?? 101) - (q.averagePoints ?? 101));
      const weak = qs.filter(q => q.averagePoints !== null).slice(0, 2);
      return {
        text: `${dim.name} in ${s.label}: ${n1(g.dims[dim.id])}${s.village || s.district ? ` (all your villages: ${n1(wide.dims[dim.id])})` : ''}, from ${g.n} households. `
          + (weak.length ? `Weakest parts: ${weak.map(q => `${q.indicator} ${n1(q.averagePoints)}`).join('; ')}.` : ''),
        data: { scope: s.label, round: ctx.roundName, dimension: dim.name, about: dim.about, score: g.dims[dim.id], allYourVillages: wide.dims[dim.id], households: g.n, questions: qs },
        evidence: { title: `${dim.name} — ${s.label}`, columns: ['Question', 'Avg points', '% below 50'], rows: qs.map(q => [`${q.number} ${q.indicator}`, q.averagePoints, q.below50 === null ? null : `${q.below50}%`]) },
      };
    },
  },

  profile: {
    description: 'Everything about one village or district at once: score and band, coverage, each dimension next to its district and all your villages, the main problems, what households asked for, and the weakest questions.',
    props: { district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      if (!a.village && !a.district) throw new ToolError('Name a village or a district.');
      const s = slice(ctx, a);
      const d = computeDashboard(s.rows, s.villages), o = d.overall;
      if (!o.n) return { text: `There are no counted surveys for ${s.label} in round ${ctx.roundName} yet.`, data: { surveys: 0 } };
      const parent = s.village ? slice(ctx, { district: s.village.district }) : null;
      const pg = parent ? scoreGroup(parent.rows.map(r => r.score)) : null, wide = scoreGroup(slice(ctx, {}).rows.map(r => r.score));
      const dims = DIMENSIONS.map(x => ({ dimension: x.name, here: o.dims[x.id], ...(pg ? { district: pg.dims[x.id] } : {}), allYourVillages: wide.dims[x.id] }));
      const problems = computeInsights(s.rows, s.villages).actions.slice(0, 5).map(x => ({ problem: x.label, households: x.households, of: x.of, share: x.share, action: x.action }));
      const cov = o.coverage;
      return {
        text: `${s.label}: ${n1(o.score)} out of 100 (band ${o.band}, ${bandName(o.band)}) from ${o.n} households`
          + (pg ? `; ${districtName(s.village!.district)} district ${n1(pg.score)}` : '') + `; all your villages ${n1(wide.score)}.`
          + (problems.length ? ` Main problem: ${problems[0].problem} (${pct(problems[0].share)}).` : '')
          + (cov ? ` Coverage ${cov.percent}% — ${cov.reliable ? 'reliable' : 'not yet reliable'}.` : ''),
        data: { scope: s.label, round: ctx.roundName, households: o.n, score: o.score, band: o.band, bandLabel: o.bandLabel, coverage: cov, flags: o.flags,
          districtScore: pg?.score ?? null, allYourVillagesScore: wide.score, dimensions: dims, problems,
          priorities: d.priorities.slice(0, 5).map(x => ({ priority: x.label, points: x.points })),
          weakestQuestions: d.questions.slice(0, 5).map(q => ({ question: `${questionNo(q.id)} ${q.label}`, points: q.points })),
          villages: s.village ? undefined : d.villages.filter(v => v.score !== null).map(v => ({ village: v.name, score: v.score, households: v.n })) },
        evidence: { title: `${s.label} compared`, columns: pg ? ['Dimension', s.label, 'District', 'All'] : ['Dimension', s.label, 'All'],
          rows: dims.map(x => pg ? [x.dimension, x.here, x.district ?? null, x.allYourVillages] : [x.dimension, x.here, x.allYourVillages]) },
      };
    },
  },

  demographics: {
    description: 'Who the surveyed households are: number of people, men and women, ages, family size, members away, family type, religion, occupation of the main earner, jobs, education, literacy and languages.',
    props: { district: { type: 'string' }, village: { type: 'string' } },
    run(ctx, a) {
      const s = slice(ctx, a);
      if (!s.rows.length) return { text: `There are no counted surveys for ${s.label} in round ${ctx.roundName}.`, data: { households: 0 } };
      const pick = (id: string) => { const it = findQuestion(questionNo(id))!; const x = summarise(it, s.rows);
        return { question: x.question, answered: x.answered, answers: x.answers.slice(0, 8).map(l => `${l.answer}: ${l.households} (${l.percent}%)`), ...(x.stats ? { stats: x.stats } : {}) }; };
      const fam = summarise(findQuestion(questionNo('A7'))!, s.rows);
      const st = fam.stats ?? {};
      const data = { scope: s.label, round: ctx.roundName, households: s.rows.length, family: { ...st, breakdown: fam.answers },
        away: pick('A8'), familyType: pick('A9'), religion: pick('A10'), housing: pick('A11'), occupation: pick('A12'), jobs: pick('A14'),
        education: pick('A13'), literacy: pick('G6'), languages: pick('G7') };
      return {
        text: `${s.label}: ${s.rows.length} households surveyed with ${st.people ?? '—'} people (${st.male ?? 0} male, ${st.female ?? 0} female where the roster was filled in); `
          + `average family size ${st.averageSize ?? '—'}.`,
        data,
        evidence: { title: `Who lives in ${s.label}`, columns: ['', 'Count', '%'], rows: fam.answers.map(x => [x.answer, x.households, x.percent]) },
      };
    },
  },

};

function runTool(ctx: AssistantContext, name: string, input: unknown): ToolOut {
  const tool = TOOLS[name];
  if (!tool) return { text: `Unknown tool ${name}.`, data: { error: `Unknown tool ${name}` } };
  try { return tool.run(ctx, (input ?? {}) as Args); }
  catch (e) {
    if (e instanceof ToolError) return { text: e.message, data: { error: e.message } };
    throw e;
  }
}

/* ------------------------------------------------------- rule-based planner */

/** Pick one tool and its arguments from the words of the question. */
export function plan(ctx: AssistantContext, question: string): { tool: string; args: Args } {
  const q = question.toLowerCase();
  const words = q.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  // longest names first, so "Leh" does not win over "Leh Gompa" style names
  const village = [...ctx.villages].sort((a, b) => b.name.length - a.name.length)
    .find(v => new RegExp(`\\b${v.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(words));
  const district = DISTRICTS.find(d => new RegExp(`\\b${d.name.toLowerCase()}\\b`).test(words));
  // a district's own name is often also its headquarters village ("Kargil", "Leh"): it means the
  // district unless the question says "Kargil village" or "village of Kargil"
  const sameName = district && village && district.name.toLowerCase() === village.name.toLowerCase();
  const n = village?.name.toLowerCase() ?? '';
  const useVillage = village && (!sameName || words.includes(`${n} village`) || words.includes(`village of ${n}`)) ? village : undefined;
  const place: Args = useVillage ? { village: useVillage.name } : district ? { district: district.id } : {};
  // keywords are matched with place names taken out: "Changthang" is not a "change"
  const bare = [useVillage?.name, district?.name].reduce<string>((t, name) => (name ? t.split(name.toLowerCase()).join(' ') : t), q);
  const has = (re: RegExp) => re.test(bare);

  if (has(/how .*(calculat|score[sd]? work|work)|formula|what (is|does) (a |the )?band|reliab|method|points? (for|mean)|explain .*scor/)) return { tool: 'scoring_rules', args: {} };
  if (has(/chang|improv|progress|since|last (year|round)|round|trend|better than before|worse than before|over time/)) return { tool: 'round_change', args: place };
  if ((useVillage || district) && has(/tell me about|profile|summary|summar|everything about|report on|how is .* doing|overview of/)) return { tool: 'profile', args: place };
  if (has(/population|how many people|family size|household size|demograph|how many (men|women|males|females|children|kids|elderly)|average age|ages of|who (are|lives)/) && !has(/scor/))
    return { tool: 'demographics', args: place };
  const group = has(/\b(women|men|gender|female|male)\b/) ? 'gender' : has(/\b(age|ages|young|youth|older|elder|elderly|old people)\b/) ? 'age'
    : has(/\b(religion|religious|buddhists?|muslims?|hindus?|christians?)\b/) ? 'religion'
    : has(/\b(occupation|jobs?|farmers?)\b/) ? 'occupation' : has(/\b(education|educated|schooling|literate)\b/) ? 'education'
    : has(/\b(joint|nuclear) famil|family type/) ? 'family' : has(/\b(housing|house type|kutcha|pucca)\b/) ? 'housing'
    : has(/household size|big families|large families/) ? 'size' : null;
  if (group) return { tool: 'compare_groups', args: { ...place, by: group } };
  if (has(/priorit|ask(ed)? for|want|demand|request/)) return { tool: 'priorities', args: place };
  const dim = DIMENSIONS.find(d => new RegExp(`\\b${d.name.toLowerCase()}|\\b${d.short.toLowerCase()}`).test(bare));
  if (dim && has(/dimension|wellness|well-being|wellbeing|side of|area|in detail|break.?down|why/)) return { tool: 'dimension_detail', args: { ...place, dimension: dim.name } };
  // a specific topic of the questionnaire: "How many families have a loan?", "Literacy by district"
  const topic = searchQuestions(bare, { curated: true })[0];
  if (topic && topic.score >= 2 && !has(/problem|issue|need.* help/)) {
    const by = has(/\b(by|each|every|per|which|across) district/) ? 'district' : (has(/\b(by|each|every|per|which|across) village|villages/) && !useVillage) ? 'village' : undefined;
    return { tool: 'question_answers', args: { ...place, question: questionNo(topic.item.id), ...(by ? { by } : {}) } };
  }
  if (has(/district/) && !district && has(/compar|which|best|worst|rank|all|each|versus|vs/)) return { tool: 'compare_districts', args: {} };
  if (!useVillage && has(/village/) && has(/help|lowest|worst|weak|poor|need|top|best|highest|strong|rank|which/))
    return { tool: 'list_villages', args: { ...(district ? { district: district.id } : {}), order: has(/best|top|highest|strong|doing well/) ? 'highest' : 'lowest' } };
  if (has(/problem|issue|concern|attention|action|what should|signal|struggl|challeng/)) return { tool: 'problems', args: place };
  if (dim) return { tool: 'dimension_detail', args: { ...place, dimension: dim.name } };
  if (has(/question|indicator|lowest|weak|worst/)) return { tool: 'weakest_questions', args: place };
  return { tool: 'overview', args: place };
}

function rulesAnswer(ctx: AssistantContext, question: string): AssistantReply {
  const p = plan(ctx, question);
  const out = runTool(ctx, p.tool, p.args);
  return { answer: out.text, evidence: out.evidence ? [out.evidence] : [], mode: 'rules', suggestions: followUps(p.tool) };
}

function followUps(tool: string) {
  const next: Record<string, string[]> = {
    overview: ['Which villages need the most help?', 'What problems affect the most households?'],
    list_villages: ['What problems affect the most households?', 'Compare the districts'],
    compare_districts: ['Which villages need the most help?', 'What changed since the last round?'],
    weakest_questions: ['What problems affect the most households?', 'What did households ask for?'],
    problems: ['What did households ask for?', 'Which villages need the most help?'],
    priorities: ['What problems affect the most households?', 'How are we doing overall?'],
    round_change: ['Compare the districts', 'Which villages need the most help?'],
    compare_groups: ['Does age make a difference?', 'How are we doing overall?'],
    scoring_rules: ['How are we doing overall?', 'Compare the districts'],
    find_questions: ['What problems affect the most households?', 'How are we doing overall?'],
    question_answers: ['Compare the districts', 'What problems affect the most households?'],
    count_households: ['Which villages need the most help?', 'What problems affect the most households?'],
    dimension_detail: ['Which villages need the most help?', 'What did households ask for?'],
    profile: ['What changed since the last round?', 'Compare the districts'],
    demographics: ['How many families have a loan?', 'How many family members can read and write?'],
  };
  return next[tool] ?? SUGGESTIONS.slice(0, 2);
}

/* --------------------------------------------------------------- Claude */

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `You are the data assistant inside DYESKIT, a household well-being survey app used by project staff in Ladakh, India.
Answer questions about the survey results using only the tools provided. Every number you give must come from a tool result in this conversation; never estimate or invent one. If the tools cannot answer, say exactly what is missing.

How to work:
- Think about which tools answer the question fully, then call them — several at once when they are independent. Questions often need more than one: e.g. "why is Stok low?" → profile + dimension_detail for its weakest dimension; "do families with loans do worse?" → count_households.
- Any question about a topic in the survey (loans, literacy, languages, jobs, family size, BMI, water, toilets, fuel, smartphones…) → question_answers with the question number below. For combinations of answers → count_households.
- Refer to questions by the number shown below (e.g. F4), the same numbers staff see in the app.
- Narrow to a district or village when the question names one. Compare with the wider picture (district, all villages) when it helps.

How to answer — for a busy field supervisor:
- Start with the direct answer in the first sentence, with the key number.
- Then give the precise detail: counts AND percentages ("23 of 140 households, 16%"), scores to one decimal, the base (how many households answered) and the round.
- Explain what the numbers mean in plain words, and name the most important difference or pattern. End with one practical suggestion when it fits.
- Use short paragraphs or "- " bullet lists; no markdown headings, bold or tables (tables from the tools are shown under the answer).
- Say clearly when a result is not yet reliable, a group is under 10 households, or few households answered a question.
- The person can see only their own villages; the tools are already limited to those. Never guess about individual households — the tools only give totals.

The seven districts: ${DISTRICTS.map(d => d.name).join(', ')}. The seven dimensions: ${DIMENSIONS.map(d => `${d.name} (${d.about})`).join('; ')}.
Scoring: each answer has fixed points 0–100 (Don't know / Prefer not to say = ${NEUTRAL_POINTS}); a dimension is the average of its answered questions; a household's score is the average of its dimensions (at least ${HOUSEHOLD_MIN_DIMENSIONS} of 7 needed); villages and districts average their households. Bands: ${BANDS.map(b => `${b.band} ${b.short} from ${b.min}`).join(', ')}. Below ${FLAG_BELOW} is flagged, below ${CRITICAL_BELOW} critical.

The questionnaire (number, type, dimension or "not scored", wording, [answers=points]):
${catalogue()}`;

const toolDefs = (): Anthropic.Beta.BetaTool[] => Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description + ' District: an id or name. Village: a name or 3-letter code.',
  input_schema: { type: 'object', properties: t.props as Record<string, unknown> },
}));

async function aiAnswer(ctx: AssistantContext, question: string, history: ChatTurn[]): Promise<AssistantReply> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-10).map(t => ({ role: t.role, content: t.text }) as Anthropic.Beta.BetaMessageParam),
    { role: 'user', content: `${question}\n\n(Round in view: ${ctx.roundName}.)` },
  ];
  // the history must start with a user turn and alternate
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const evidence: Evidence[] = [];
  const used: string[] = [];

  for (let step = 0; step < 10; step++) {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // the instructions and questionnaire are the same for every question: cache them
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: toolDefs(),
      messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // if a request is declined, the API re-runs it on Anthropic's recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new Error('The assistant declined this question.');
    if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !calls.length) {
      const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
      return { answer: text || 'I could not find an answer in the data.', evidence: dedupe(evidence), mode: 'ai', suggestions: followUps(used.at(-1) ?? 'overview') };
    }
    messages.push({ role: 'assistant', content: res.content });
    messages.push({
      role: 'user',
      content: calls.map(c => {
        const out = runTool(ctx, c.name, c.input);
        used.push(c.name);
        if (out.evidence) evidence.push(out.evidence);
        return { type: 'tool_result' as const, tool_use_id: c.id, content: JSON.stringify(out.data) };
      }),
    });
  }
  throw new Error('The assistant took too many steps.');
}

const dedupe = (e: Evidence[]) => e.filter((x, i) => e.findIndex(y => y.title === x.title) === i).slice(0, 6);

/** Answer one question. Falls back to the rule-based planner when no key is set or the API call fails. */
export async function ask(ctx: AssistantContext, question: string, history: ChatTurn[] = [], log?: (msg: string) => void): Promise<AssistantReply> {
  if (assistantMode() === 'ai') {
    try { return await aiAnswer(ctx, question, history); }
    catch (e) {
      const why = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.name}` : e instanceof Error ? e.message : String(e);
      log?.(`assistant: falling back to rules (${why})`);
      const r = rulesAnswer(ctx, question);
      return { ...r, answer: r.answer + (e instanceof Anthropic.RateLimitError ? ' (The AI assistant is busy; this is the quick answer.)' : '') };
    }
  }
  return rulesAnswer(ctx, question);
}
