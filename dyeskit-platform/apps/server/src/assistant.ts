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
  BANDS, CRITICAL_BELOW, DIMENSIONS, DISTRICTS, FLAG_BELOW, HOUSEHOLD_MIN_DIMENSIONS, NEUTRAL_POINTS, SCORING_VERSION,
  VILLAGE_MIN_HOUSEHOLDS, VILLAGE_MIN_SHARE, compareRounds, computeDashboard, computeInsights, districtName, type VillageInfo,
} from '@dyeskit/core';
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

type Args = { district?: string; village?: string; order?: 'lowest' | 'highest'; limit?: number; by?: string };
interface ToolOut { text: string; data: unknown; evidence?: Evidence }

const n1 = (x: number | null | undefined) => (x === null || x === undefined ? '—' : x.toFixed(1));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const bandName = (b: number | null) => BANDS.find(x => x.band === b)?.short ?? 'no band';
const dimName = (id: string) => DIMENSIONS.find(d => d.id === id)?.name ?? id;
const GROUPS = ['gender', 'age', 'religion', 'occupation', 'education', 'family', 'housing', 'size'] as const;

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
  const has = (re: RegExp) => re.test(q);

  if (has(/how .*(calculat|score[sd]? work|work)|formula|what (is|does) (a |the )?band|reliab|method|points? (for|mean)|explain .*scor/)) return { tool: 'scoring_rules', args: {} };
  if (has(/chang|improv|progress|since|last (year|round)|round|trend|better than before|worse than before|over time/)) return { tool: 'round_change', args: place };
  const group = has(/\b(women|men|gender|female|male)\b/) ? 'gender' : has(/\b(age|ages|young|youth|older|elder|elderly|old people)\b/) ? 'age'
    : has(/\b(religion|religious|buddhists?|muslims?|hindus?|christians?)\b/) ? 'religion'
    : has(/\b(occupation|jobs?|farmers?)\b/) ? 'occupation' : has(/\b(education|educated|schooling|literate)\b/) ? 'education'
    : has(/\b(joint|nuclear) famil|family type/) ? 'family' : has(/\b(housing|house type|kutcha|pucca)\b/) ? 'housing'
    : has(/household size|big families|large families/) ? 'size' : null;
  if (group) return { tool: 'compare_groups', args: { ...place, by: group } };
  if (has(/priorit|ask(ed)? for|want|demand|request/)) return { tool: 'priorities', args: place };
  if (has(/district/) && !district && has(/compar|which|best|worst|rank|all|each|versus|vs/)) return { tool: 'compare_districts', args: {} };
  if (!useVillage && has(/village/) && has(/help|lowest|worst|weak|poor|need|top|best|highest|strong|rank|which/))
    return { tool: 'list_villages', args: { ...(district ? { district: district.id } : {}), order: has(/best|top|highest|strong|doing well/) ? 'highest' : 'lowest' } };
  if (has(/problem|issue|concern|attention|action|what should|signal|struggl|challeng/)) return { tool: 'problems', args: place };
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
  };
  return next[tool] ?? SUGGESTIONS.slice(0, 2);
}

/* --------------------------------------------------------------- Claude */

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `You are the data assistant inside DYESKIT, a household well-being survey app used by project staff in Ladakh, India.
Answer questions about the survey results using only the tools provided. Every number you give must come from a tool result in this conversation; if the tools cannot answer, say what is missing.
The seven districts are ${DISTRICTS.map(d => d.name).join(', ')}. Scores run 0–100; the "Basic" level is ${FLAG_BELOW}.
The person asking can see only their own villages; the tools are already limited to those. Never guess about individual households — the tools only give totals.
Write for a busy field supervisor: 2–5 short sentences or a short list, plain words, no markdown headings or tables (tables are shown separately from the tool results). Mention when a result is not yet reliable or a group is too small.`;

const toolDefs = (): Anthropic.Beta.BetaTool[] => Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description + ' District: an id or name. Village: a name or 3-letter code.',
  input_schema: { type: 'object', properties: t.props as Record<string, unknown> },
}));

async function aiAnswer(ctx: AssistantContext, question: string, history: ChatTurn[]): Promise<AssistantReply> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-6).map(t => ({ role: t.role, content: t.text }) as Anthropic.Beta.BetaMessageParam),
    { role: 'user', content: `${question}\n\n(Round in view: ${ctx.roundName}.)` },
  ];
  // the history must start with a user turn and alternate
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const evidence: Evidence[] = [];
  const used: string[] = [];

  for (let step = 0; step < 6; step++) {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      tools: toolDefs(),
      messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
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

const dedupe = (e: Evidence[]) => e.filter((x, i) => e.findIndex(y => y.title === x.title) === i).slice(0, 4);

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
