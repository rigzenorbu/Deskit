/**
 * The assistant's view of the raw answers: find a question from a number or plain words, and
 * summarise how the households in view answered it — counts, shares and average points only.
 * Free-text answers (B2a) and the village question are never summarised.
 */
import {
  AGE_GROUPS, BANDS, BMI_MIN_AGE, BMI_TABLE, DIMENSIONS, HOUSEHOLD_SIZES, ITEMS, NEUTRAL_POINTS, SECTIONS, ageGroupOf, bmiPoints,
  familyOf, householdSize, measuresOf, questionNo, round1, type Answers, type Item, type SurveyRow,
} from '@dyeskit/core';

export type QItem = Item & { section: string };

/** Questions the assistant can report on: everything except free text and the village. */
export const ASKABLE: QItem[] = Object.values(ITEMS).filter(i => i.type !== 'text' && i.type !== 'village');

const NO_TO_ID = new Map(Object.keys(ITEMS).map(id => [questionNo(id).toLowerCase(), id]));

/**
 * Extra words people use for a topic, so "loans" finds F11 and "literacy" finds G6. Keyed by the
 * stored id; the shown number can change, the id never does.
 */
export const TOPICS: Record<string, string> = {
  A4: 'years lived settled migrated', A5: 'respondent age', A6: 'gender respondent',
  A7: 'family size members people population male female men women boys girls children child age ages roster',
  A8: 'away migrated migration outside study abroad', A9: 'family type joint nuclear extended', A10: 'religion buddhist muslim hindu christian',
  A11: 'housing house kutcha pucca mud', A12: 'occupation earner farmer farming pastoralist livestock business government',
  A14: 'job jobs employed employment permanent temporary unemployed', A13: 'education schooling graduate degree',
  B1s: 'share height weight', B1: 'bmi height weight obese obesity overweight thin underweight nutrition malnutrition',
  B2: 'illness disease chronic diabetes blood pressure sick condition', B3: 'altitude breathlessness headache symptoms',
  B4: 'health facility hospital clinic doctor distance phc', B5: 'snow road blocked unable reach care emergency',
  B6: 'active activity exercise sedentary', B7: 'sleep', B8: 'toilet sanitation latrine', B9: 'drinking water source tap spring',
  B10: 'water quality clean safe drinking', B12: 'physical health rating rate', C1: 'mood emotional feeling', C2: 'emotional support',
  C3: 'stress worries coping', C8: 'get along harmony quarrel', C9: 'time together meals', C10: 'sad depressed depression worry anxiety',
  C11: 'mental counsellor counselling', C5: 'life satisfaction satisfied happy happiness', C6: 'isolated isolation winter lonely loneliness',
  C7: 'alcohol tobacco smoking drinking substance', D1: 'community participation festivals events', D2: 'trust',
  D3: 'tension conflict', D4: 'women equal say inclusion decisions', D5: 'elders youth respect young', D6: 'groups shg committee monastery support',
  D7: 'emergency neighbours', E1: 'water supply reliable shortage scarce', E2: 'glacier snowfall melt stream climate change',
  E3: 'food local packaged own-grown', E4: 'waste garbage plastic burning', E5: 'fuel cooking heating lpg dung firewood kerosene',
  E6: 'adaptation greenhouse storage climate measures', E7: 'tourist tourism waste', F1: 'income earnings money',
  F2: 'income cover needs enough', F3: 'savings assets', F11: 'loan loans debt borrow borrowed credit',
  F4: 'income sources', F5: 'earns from livelihoods sources', F6: 'seasonal income spread', F7: 'weather damage disaster flood crops livestock',
  F8: 'financial security secure future', F9: 'government scheme schemes livelihood', F10: 'bank account banking',
  G1: 'learning skill training', G2: 'digital skills online information computer', G3: 'civic rights entitlements',
  G4: 'climate change awareness', G5: 'education barriers', G6: 'read write literacy literate illiterate reading writing',
  G7: 'language languages english hindi urdu foreign speak understand', H8: 'prayer meditation religious practice',
  H3: 'ethical spiritual values', H4: 'inner peace contentment', H5: 'monastery mosque worship', H6: 'festival cultural participation',
  H7: 'ladakhi language culture younger losing', I1: 'smartphone phone mobile', I2: 'internet connectivity network 4g',
  I3: 'ai chatbot artificial intelligence', I4: 'phone assistant', I5: 'priorities priority development demands',
};

const STOP = new Set(('the a an and or of in on for to is are was were do does did how many much what which who whom whose where when why ' +
  'have has had with by from at as about our your their there this that these those any some all each every most more less than ' +
  'household households family families village villages people person score scores overall doing well show tell me give number ' +
  'percent share proportion can could would should will not no yes').split(' '));
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '');
const wordsOf = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);

/** Questions matching some words, best first. `curated` limits matching to the TOPICS words (for the rule-based planner). */
export function searchQuestions(text: string, opts: { curated?: boolean; limit?: number } = {}) {
  const q = wordsOf(text);
  if (!q.length) return [];
  return ASKABLE.map(it => {
    const topic = new Set(wordsOf(TOPICS[it.id] ?? ''));
    const body = opts.curated ? new Set<string>() : new Set(wordsOf(`${it.q} ${it.indicator ?? ''} ${(it.options ?? []).map(o => o.label).join(' ')}`));
    const hits = q.filter(w => topic.has(w) || body.has(w));
    return { item: it, score: hits.reduce((s, w) => s + (topic.has(w) ? 2 : 1), 0) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 6);
}

/** A question from its shown number ("F4"), its stored id, or plain words. */
export function findQuestion(text: string | undefined): QItem | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const id = NO_TO_ID.get(t) ?? Object.keys(ITEMS).find(k => k.toLowerCase() === t);
  if (id) return ASKABLE.find(i => i.id === id) ?? null;
  return searchQuestions(t)[0]?.item ?? null;
}

/** How a question appears to people: "F4 Does the family have a loan at the moment?" */
export const questionTitle = (it: Item) => `${questionNo(it.id)} ${it.q}`;
export const dimName = (id: string | undefined) => DIMENSIONS.find(d => d.id === id)?.name ?? null;

/** The whole questionnaire in one compact block, for the AI's instructions. */
export function catalogue() {
  return SECTIONS.map(s => `${s.id}. ${s.title}\n` + s.items.filter(i => ASKABLE.some(x => x.id === i.id)).map(i => {
    const opts = i.type === 'single' || i.type === 'scale' || i.type === 'multi' || i.type === 'rank3'
      ? ` [${(i.options ?? []).filter(o => !o.neutral).map(o => o.points === undefined ? o.label : `${o.label}=${o.points}`).join('; ')}]` : '';
    const kind = i.dim ? `${dimName(i.dim)}` : 'not scored';
    return `  ${questionNo(i.id)} (${i.type}, ${kind}${i.showIf ? `, only if ${questionNo(i.showIf.item)}` : ''}) ${i.q}${opts}`;
  }).join('\n')).join('\n');
}

/* ------------------------------------------------------------- summaries */

const filled = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x: number | null) => (x === null ? null : round1(x));
const share = (k: number, n: number) => (n ? round1((k / n) * 100) : null);

export interface AnswerLine { answer: string; households: number; percent: number | null; points?: number | null }
export interface AnswerSummary {
  question: string; dimension: string | null; type: string;
  households: number;          // households in view
  answered: number;            // of them, households that answered
  averagePoints: number | null; // scored questions only, 0–100
  answers: AnswerLine[];
  stats?: Record<string, number | null>;
  note?: string;
}

const pointsOf = (r: SurveyRow, id: string) => {
  const p = r.score?.questions[id]?.points;
  return typeof p === 'number' ? p : null;
};

const AGE_BANDS = [
  { label: 'Under 15', min: 0, max: 14 }, { label: '15–17', min: 15, max: 17 },
  ...AGE_GROUPS.map(g => ({ label: g.label, min: g.min, max: g.max })),
];

/** How the households in `rows` answered one question. */
export function summarise(it: QItem, rows: SurveyRow[]): AnswerSummary {
  const answeredRows = rows.filter(r => filled(r.answers[it.id]));
  const pts = answeredRows.map(r => pointsOf(r, it.id)).filter((p): p is number => p !== null);
  const base: AnswerSummary = {
    question: questionTitle(it), dimension: dimName(it.dim), type: it.type, households: rows.length, answered: answeredRows.length,
    averagePoints: it.dim ? r1(mean(pts)) : null, answers: [],
  };
  const n = answeredRows.length;
  const opts = it.options ?? [];

  if (it.type === 'single' || it.type === 'scale') {
    base.answers = opts.map(o => {
      const k = answeredRows.filter(r => String(r.answers[it.id]) === o.v).length;
      return { answer: o.label, households: k, percent: share(k, n), ...(it.dim ? { points: o.neutral ? NEUTRAL_POINTS : o.points ?? null } : {}) };
    }).filter(a => a.households);
    if (it.type === 'scale') base.stats = { averageOn1to5: r1(mean(answeredRows.map(r => Number(r.answers[it.id])).filter(x => x >= 1 && x <= 5))) };
  } else if (it.type === 'multi') {
    base.answers = opts.map(o => {
      const k = answeredRows.filter(r => Array.isArray(r.answers[it.id]) && (r.answers[it.id] as string[]).includes(o.v)).length;
      return { answer: o.label, households: k, percent: share(k, n) };
    }).filter(a => a.households).sort((a, b) => b.households - a.households);
    base.note = 'Households could pick more than one answer, so the percentages add up to more than 100.';
    if (it.countPoints) base.stats = { averageChosen: r1(mean(answeredRows.map(r => (r.answers[it.id] as string[]).filter(v => v !== 'none' && v !== 'DK' && v !== 'PNA').length))) };
  } else if (it.type === 'rank3') {
    base.answers = opts.map(o => {
      let pointsTotal = 0, first = 0, any = 0;
      for (const r of answeredRows) {
        const i = (r.answers[it.id] as string[]).slice(0, 3).indexOf(o.v);
        if (i >= 0) { pointsTotal += 3 - i; any++; if (i === 0) first++; }
      }
      return { answer: o.label, households: any, percent: share(any, n), points: pointsTotal, firstChoice: first } as AnswerLine;
    }).filter(a => a.households).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    base.note = 'points: 1st choice = 3, 2nd = 2, 3rd = 1; households = how many named it in their top 3.';
  } else if (it.type === 'number') {
    const xs = answeredRows.map(r => Number(r.answers[it.id])).filter(x => isFinite(x));
    base.stats = { average: r1(mean(xs)), median: median(xs), lowest: xs.length ? Math.min(...xs) : null, highest: xs.length ? Math.max(...xs) : null, total: xs.reduce((s, x) => s + x, 0) };
    const cap = it.countPoints ? it.countPoints.length - 1 : null;
    const steps = cap !== null ? Array.from({ length: cap + 1 }, (_, i) => ({ label: i === cap ? `${i} or more` : String(i), min: i, max: i === cap ? Infinity : i }))
      : it.id === 'A5' ? AGE_GROUPS.map(g => ({ label: g.label, min: g.min, max: g.max }))
      : [{ label: '0', min: 0, max: 0 }, { label: '1–2', min: 1, max: 2 }, { label: '3–5', min: 3, max: 5 }, { label: '6–10', min: 6, max: 10 }, { label: 'More than 10', min: 11, max: Infinity }];
    base.answers = steps.map(s => {
      const k = xs.filter(x => x >= s.min && x <= s.max).length;
      return { answer: `${s.label}${it.unit ? ` ${it.unit}` : ''}`, households: k, percent: share(k, xs.length) };
    }).filter(a => a.households);
  } else if (it.type === 'family') {
    const sizes = rows.map(r => householdSize(r.answers)).filter((x): x is number => x !== null);
    const fams = rows.map(r => familyOf(r.answers.A7)).filter(f => f !== null);
    const male = fams.reduce((s, f) => s + f!.male, 0), female = fams.reduce((s, f) => s + f!.female, 0);
    const ages = fams.flatMap(f => [...f!.ages.male, ...f!.ages.female]);
    base.answered = sizes.length;
    base.stats = { people: sizes.reduce((s, x) => s + x, 0), male, female, averageSize: r1(mean(sizes)), medianSize: median(sizes),
      largest: sizes.length ? Math.max(...sizes) : null, agesGiven: ages.filter(a => a !== null).length };
    base.answers = [
      ...HOUSEHOLD_SIZES.map(s => {
        const k = sizes.filter(x => x >= s.min && x <= s.max).length;
        return { answer: `Households of ${s.label}`, households: k, percent: share(k, sizes.length) };
      }),
      ...AGE_BANDS.map(b => {
        const k = ages.filter(a => a !== null && a >= b.min && a <= b.max).length;
        return { answer: `People aged ${b.label}`, households: k, percent: share(k, ages.filter(a => a !== null).length) };
      }),
    ].filter(a => a.households);
    base.note = 'Household-size lines count households; “People aged …” lines count people (percent of people whose age was given). '
      + 'The roster (males, females, ages) exists only in questionnaire v3.1; older surveys give the size only.';
  } else if (it.type === 'counts') {
    const fields = it.fields ?? [];
    base.stats = {};
    base.answers = fields.map(f => {
      const xs = answeredRows.map(r => Number((r.answers[it.id] as Record<string, unknown>)?.[f.k] ?? 0)).filter(x => isFinite(x));
      base.stats![`total_${f.k}`] = xs.reduce((s, x) => s + x, 0);
      base.stats![`average_${f.k}`] = r1(mean(xs));
      const k = xs.filter(x => x > 0).length;
      return { answer: `Households with at least one ${f.label.toLowerCase()}`, households: k, percent: share(k, n) };
    });
    const none = answeredRows.filter(r => fields.every(f => !Number((r.answers[it.id] as Record<string, unknown>)?.[f.k]))).length;
    base.answers.push({ answer: 'Households with nobody in a job', households: none, percent: share(none, n) });
  } else if (it.type === 'measure') {
    const people = rows.flatMap(r => measuresOf(r.answers as Answers)).filter(m => m.height_cm && m.weight_kg);
    const adults = people.filter(m => m.age === null || m.age >= BMI_MIN_AGE);
    const cats = [...BMI_TABLE.map(t => ({ label: t.label, test: (b: number) => b >= t.from && b <= t.to })),
      { label: 'Severely thin (below 16.0)', test: (b: number) => b < 16 }, { label: 'Obese, high (30.0 and above)', test: (b: number) => b >= 30 }];
    const bmis = adults.map(m => bmiPoints(m.height_cm, m.weight_kg)?.bmi).filter((b): b is number => typeof b === 'number');
    base.answered = rows.filter(r => measuresOf(r.answers as Answers).some(m => m.height_cm && m.weight_kg)).length;
    base.answers = cats.map(c => {
      const k = bmis.filter(c.test).length;
      return { answer: c.label, households: k, percent: share(k, bmis.length) };
    }).filter(a => a.households);
    base.stats = { peopleMeasured: people.length, adultsScored: bmis.length, childrenNotScored: people.length - adults.length, averageBmi: r1(mean(bmis)),
      familiesDeclined: rows.filter(r => r.answers.B1s === 'no').length };
    base.note = `BMI lines count adults (${BMI_MIN_AGE}+), not households; Asia-Pacific cut-offs.`;
  }
  return base;
}

/* ----------------------------------------------------- matching households */

export interface Condition { question: string; answers?: string[]; min?: number; max?: number }

/** A test for one condition, or an error message. */
export function conditionTest(c: Condition): { it: QItem; test: (a: Answers) => boolean; text: string } | string {
  const it = findQuestion(c.question);
  if (!it) return `No question matches “${c.question}”.`;
  const want = (c.answers ?? []).map(x => String(x).toLowerCase().trim());
  const values = (it.options ?? []).filter(o => want.some(w => w === o.v.toLowerCase() || w === o.label.toLowerCase()
    || (w.length > 3 && o.label.toLowerCase().includes(w)))).map(o => o.v);
  const range = (x: number | null) => x !== null && (c.min === undefined || x >= c.min) && (c.max === undefined || x <= c.max);
  const title = questionTitle(it);
  if (it.options && it.type !== 'rank3') {
    if (!values.length) return `For ${title}, the answers are: ${it.options.map(o => o.label).join('; ')}.`;
    const labels = it.options.filter(o => values.includes(o.v)).map(o => o.label).join(' or ');
    return { it, text: `${title} — ${labels}`,
      test: a => (Array.isArray(a[it.id]) ? (a[it.id] as string[]).some(v => values.includes(v)) : values.includes(String(a[it.id] ?? ''))) };
  }
  if (it.type === 'rank3') {
    if (!values.length) return `For ${title}, the choices are: ${(it.options ?? []).map(o => o.label).join('; ')}.`;
    return { it, text: `${title} — named in the top 3`, test: a => Array.isArray(a[it.id]) && (a[it.id] as string[]).slice(0, 3).some(v => values.includes(v)) };
  }
  if (c.min === undefined && c.max === undefined) return `For ${title}, give a min and/or max.`;
  const span = `${c.min ?? ''}${c.max === undefined ? ' or more' : c.min === undefined ? ` or fewer` : `–${c.max}`}`.replace(/^–/, 'up to ');
  if (it.type === 'number') return { it, text: `${title} — ${span}`, test: a => filled(a[it.id]) && range(Number(a[it.id])) };
  if (it.type === 'family') return { it, text: `household size ${span}`, test: a => range(householdSize(a)) };
  if (it.type === 'counts') return { it, text: `members with a job ${span}`,
    test: a => filled(a[it.id]) && range((it.fields ?? []).reduce((s, f) => s + (Number((a[it.id] as Record<string, unknown>)[f.k]) || 0), 0)) };
  return `${title} cannot be used as a condition.`;
}

export const bandOf = (score: number | null) => (score === null ? null : BANDS.find(b => score >= b.min && score <= b.max)?.band ?? null);
export { ageGroupOf };
