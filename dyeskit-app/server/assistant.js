'use strict';
/**
 * The assistant — natural-language questions about village data.
 *
 * ACCURACY IS THE WHOLE DESIGN. The rules are:
 *
 *   1. The language model NEVER produces a number. It may only choose which of the
 *      tools below to run, with which arguments, and then phrase what they returned.
 *   2. Every tool is deterministic code over the database. Same question, same numbers.
 *   3. Every answer carries its evidence: the tool called, the arguments, and the rows.
 *      The interface shows those rows under the answer, so any claim can be checked.
 *   4. If the tools return nothing, the answer is "no data" — never a guess.
 *   5. No personal data reaches the model: villages, scores and counts only.
 *   6. Village-level results below the minimum sample are labelled as such.
 *
 * Two planners implement step 1:
 *   • LLM planner   — Claude chooses the tools (needs ANTHROPIC_API_KEY)
 *   • Rule planner  — keyword matching chooses the tools (always available)
 * Both run the SAME tools, so the numbers are identical either way; only the
 * language around them differs.
 */

const { db, getAnswers } = require('./db');
const S = require('./scoring');
const Q = require('./questionnaire');
const { buildInsights, SIGNALS, SIGNAL_BY_ID, severityFor } = require('./insights');
const { DISTRICTS } = require('./villages');

const DISTRICT_IDS = DISTRICTS.map(d => d.id);
const districtName = id => (DISTRICTS.find(d => d.id === id) || {}).name || id;

const MODEL = process.env.DYESKIT_MODEL || 'claude-opus-5';
const pct = v => (v === null || v === undefined ? '—' : (v * 100).toFixed(0) + '%');

/* ----------------------------------------------------------- data helpers */
let cache = { at: 0, data: null };
function insights(scope) {
  const key = scope ? scope.join(',') : 'all';
  if (cache.data && cache.key === key && Date.now() - cache.at < 20000) return cache.data;
  const data = buildInsights(scope);
  cache = { at: Date.now(), key, data };
  return data;
}
const clearCache = () => { cache = { at: 0, data: null }; };

const nameToVillage = (name, scope) => {
  if (!name) return null;
  const rows = db.prepare('SELECT id, name, district FROM villages WHERE deleted_at IS NULL').all();
  const hit = rows.find(v => v.name.toLowerCase() === String(name).toLowerCase())
    || rows.find(v => v.name.toLowerCase().includes(String(name).toLowerCase()));
  if (!hit) return null;
  if (scope && !scope.includes(hit.id)) return null;
  return hit;
};

const inScope = (list, scope) => (scope ? list.filter(v => scope.includes(v.village_id)) : list);

/* ------------------------------------------------------------------ tools */
/** Each tool returns { summary, columns, rows } — rows are the evidence shown to the user. */
const TOOLS = {
  village_scores: {
    description: 'Well-being score, band, survey count and sample coverage for villages. Use for "which villages are lowest/highest", rankings, or a single village overview.',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        village: { type: 'string', description: 'Village name, optional' },
        district: { type: 'string', enum: DISTRICT_IDS, description: 'Optional district filter' },
        dimension: { type: 'string', enum: Q.DIMENSIONS.map(d => d.id), description: 'Rank by this dimension instead of the overall index' },
        order: { type: 'string', enum: ['lowest', 'highest'], description: 'Sort direction, default highest' },
        limit: { type: 'integer', description: 'How many villages to return, default 12' },
      },
      required: [],
    },
    run: (a, ctx) => {
      let rows = inScope(insights(ctx.scope).villages, ctx.scope);
      if (a.district) rows = rows.filter(v => v.district === a.district);
      if (a.village) {
        const v = nameToVillage(a.village, ctx.scope);
        rows = v ? rows.filter(r => r.village_id === v.id) : [];
      }
      const key = a.dimension ? (r => r.dims[a.dimension]) : (r => r.vwbi);
      rows = rows.filter(r => key(r) !== null && key(r) !== undefined)
        .sort((x, y) => (a.order === 'lowest' ? key(x) - key(y) : key(y) - key(x)))
        .slice(0, a.limit || 12);
      return {
        summary: rows.length ? `${rows.length} village(s), ranked by ${a.dimension ? Q.DIMENSIONS.find(d => d.id === a.dimension).name : 'overall index'}.` : 'No villages match.',
        columns: ['Village', 'District', 'Surveys', 'Coverage', a.dimension ? Q.DIMENSIONS.find(d => d.id === a.dimension).name : 'Index', 'Band', 'Sample'],
        rows: rows.map(r => [r.village, districtName(r.district), r.n,
          r.coverage ? r.coverage.percent + '%' : '—', pct(key(r)), r.band || '—',
          r.coverage && !r.coverage.sufficient ? 'BELOW MINIMUM' : 'sufficient']),
      };
    },
  },

  dimension_scores: {
    description: 'All seven dimension scores for one village, a district, or everything in view.',
    schema: { type: 'object', additionalProperties: false,
      properties: { village: { type: 'string' }, district: { type: 'string', enum: DISTRICT_IDS } }, required: [] },
    run: (a, ctx) => {
      let rows = inScope(insights(ctx.scope).villages, ctx.scope);
      if (a.district) rows = rows.filter(v => v.district === a.district);
      if (a.village) { const v = nameToVillage(a.village, ctx.scope); rows = v ? rows.filter(r => r.village_id === v.id) : []; }
      if (!rows.length) return { summary: 'No data for that selection.', columns: [], rows: [] };
      const out = Q.DIMENSIONS.map(d => {
        const vals = rows.map(r => r.dims[d.id]).filter(v => v !== null && v !== undefined);
        const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
        return [d.name, pct(mean), mean !== null && mean < S.FLAG_THRESHOLD ? 'FLAGGED (below 43%)' : ''];
      });
      return { summary: `Dimension scores across ${rows.length} village(s), ${rows.reduce((s, r) => s + r.n, 0)} households.`,
        columns: ['Dimension', 'Score', 'Status'], rows: out };
    },
  },

  weakest_indicators: {
    description: 'The lowest-scoring indicators (the detail inside the dimensions) for a village or district.',
    schema: { type: 'object', additionalProperties: false,
      properties: { village: { type: 'string' }, district: { type: 'string', enum: DISTRICT_IDS }, limit: { type: 'integer' } }, required: [] },
    run: (a, ctx) => {
      const ids = submissionIds(a, ctx);
      if (!ids.length) return { summary: 'No surveys match.', columns: [], rows: [] };
      const sums = {};
      for (const id of ids) {
        const sc = S.scoreSubmission(getAnswers(id));
        for (const [k, det] of Object.entries(sc.indicators)) {
          if (det.score === null) continue;
          (sums[k] = sums[k] || { label: det.label, dim: det.dim, sum: 0, n: 0 });
          sums[k].sum += det.score; sums[k].n++;
        }
      }
      const rows = Object.values(sums).map(i => ({ ...i, mean: i.sum / i.n }))
        .sort((x, y) => x.mean - y.mean).slice(0, a.limit || 8);
      return { summary: `Weakest indicators across ${ids.length} households.`,
        columns: ['Indicator', 'Dimension', 'Mean score', 'Households'],
        rows: rows.map(r => [r.label, Q.DIMENSIONS.find(d => d.id === r.dim).name, pct(r.mean), r.n]) };
    },
  },

  signal_prevalence: {
    description: 'How many households are affected by a named problem (a "signal"), village by village. Call list_signals first if unsure of the id.',
    schema: { type: 'object', additionalProperties: false,
      properties: { signal_id: { type: 'string', description: 'Signal id from list_signals' },
        village: { type: 'string' }, district: { type: 'string', enum: DISTRICT_IDS } },
      required: ['signal_id'] },
    run: (a, ctx) => {
      const sig = SIGNAL_BY_ID[a.signal_id];
      if (!sig) return { summary: `Unknown signal "${a.signal_id}". Call list_signals for valid ids.`, columns: [], rows: [] };
      let villages = inScope(insights(ctx.scope).villages, ctx.scope);
      if (a.district) villages = villages.filter(v => v.district === a.district);
      if (a.village) { const v = nameToVillage(a.village, ctx.scope); villages = v ? villages.filter(r => r.village_id === v.id) : []; }
      const rows = villages.map(v => ({ v, s: v.shares[a.signal_id] }))
        .filter(x => x.s && x.s.share !== null)
        .sort((x, y) => y.s.share - x.s.share);
      const tot = rows.reduce((s, x) => s + x.s.households, 0), of = rows.reduce((s, x) => s + x.s.of, 0);
      return {
        summary: `${sig.label}: ${tot} of ${of} households (${of ? Math.round(tot / of * 100) : 0}%) across ${rows.length} village(s).`,
        columns: ['Village', 'Households affected', 'Surveyed', 'Share', 'Level'],
        rows: rows.map(x => [x.v.village, x.s.households, x.s.of, pct(x.s.share),
          (severityFor(x.s.share) || { level: 'ok' }).level]),
        note: sig.action,
      };
    },
  },

  list_signals: {
    description: 'The catalogue of problems the system can count, with their ids. Use this to translate a question ("water stress", "no bank account") into a signal id.',
    schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    run: () => ({ summary: `${SIGNALS.length} signals available.`, columns: ['id', 'Means', 'Dimension'],
      rows: SIGNALS.map(s => [s.id, s.label, Q.DIMENSIONS.find(d => d.id === s.dim).name]) }),
  },

  village_flags: {
    description: 'Everything flagged in one village, plus what that village does well (showcases).',
    schema: { type: 'object', additionalProperties: false, properties: { village: { type: 'string' } }, required: ['village'] },
    run: (a, ctx) => {
      const v = nameToVillage(a.village, ctx.scope);
      if (!v) return { summary: `No village called "${a.village}" in your access scope.`, columns: [], rows: [] };
      const row = insights(ctx.scope).villages.find(x => x.village_id === v.id);
      if (!row) return { summary: 'No surveys for that village.', columns: [], rows: [] };
      const rows = [
        ...row.flags.map(f => ['FLAG', f.name, f.why, f.level]),
        ...row.showcases.map(s => ['SHOWCASE', s.name, s.why, 'good']),
      ];
      return { summary: `${row.village}: index ${pct(row.vwbi)} (band ${row.band}), ${row.n} surveys, ` +
          `${row.flags.length} flag(s), ${row.showcases.length} showcase(s).`,
        columns: ['Type', 'Item', 'Why', 'Level'], rows };
    },
  },

  matches: {
    description: 'Pairs a village that has a problem with a village that does not, so the second can be asked what it does differently.',
    schema: { type: 'object', additionalProperties: false, properties: { signal_id: { type: 'string' }, limit: { type: 'integer' } }, required: [] },
    run: (a, ctx) => {
      let m = insights(ctx.scope).matches;
      if (a.signal_id) m = m.filter(x => x.signal === a.signal_id);
      m = m.slice(0, a.limit || 8);
      return { summary: m.length ? `${m.length} pairing(s).` : 'No pairings meet the 20-point gap threshold.',
        columns: ['Problem', 'Village needing help', 'Village to learn from', 'Gap'],
        rows: m.map(x => [x.name, `${x.needs.village} (${pct(x.needs.share)})`, `${x.has.village} (${pct(x.has.share)})`, pct(x.gap)]) };
    },
  },

  compare_villages: {
    description: 'Side-by-side dimension scores for two or more named villages.',
    schema: { type: 'object', additionalProperties: false,
      properties: { villages: { type: 'array', items: { type: 'string' }, description: 'Village names' } }, required: ['villages'] },
    run: (a, ctx) => {
      const picked = (a.villages || []).map(n => nameToVillage(n, ctx.scope)).filter(Boolean);
      if (picked.length < 1) return { summary: 'None of those villages were found in your access scope.', columns: [], rows: [] };
      const data = insights(ctx.scope).villages.filter(v => picked.some(p => p.id === v.village_id));
      const rows = Q.DIMENSIONS.map(d => [d.name, ...data.map(v => pct(v.dims[d.id]))]);
      rows.push(['Overall index', ...data.map(v => pct(v.vwbi))]);
      rows.push(['Band', ...data.map(v => String(v.band || '—'))]);
      rows.push(['Surveys', ...data.map(v => String(v.n))]);
      return { summary: `Comparing ${data.map(v => v.village).join(' and ')}.`,
        columns: ['Measure', ...data.map(v => v.village)], rows };
    },
  },

  priorities: {
    description: 'What households themselves ranked as their top development priorities.',
    schema: { type: 'object', additionalProperties: false,
      properties: { village: { type: 'string' }, district: { type: 'string', enum: DISTRICT_IDS } }, required: [] },
    run: (a, ctx) => {
      const ids = submissionIds(a, ctx);
      if (!ids.length) return { summary: 'No surveys match.', columns: [], rows: [] };
      const score = {};
      const marks = ids.map(() => '?').join(',');
      for (const r of db.prepare(`SELECT value FROM answers WHERE item_id='I5' AND submission_id IN (${marks})`).all(...ids)) {
        let arr = []; try { arr = JSON.parse(r.value) || []; } catch {}
        arr.forEach((v, i) => { score[v] = (score[v] || 0) + (3 - i); });
      }
      const opts = Q.ITEMS.I5.options;
      const rows = Object.entries(score).sort((x, y) => y[1] - x[1])
        .map(([k, v], i) => [String(i + 1), (opts.find(o => o.v === k) || {}).label || k, v]);
      return { summary: `Priorities weighted across ${ids.length} households (first choice = 3 points).`,
        columns: ['Rank', 'Priority', 'Weighted points'], rows };
    },
  },

  field_notes: {
    description: 'Qualitative field notes recorded by researchers. Use when the question asks why something is happening.',
    schema: { type: 'object', additionalProperties: false,
      properties: { village: { type: 'string' }, contains: { type: 'string' } }, required: [] },
    run: (a, ctx) => {
      let rows = db.prepare(`SELECT n.note, n.dim, n.created_at, v.name AS village, v.id AS village_id
        FROM field_notes n LEFT JOIN villages v ON v.id = n.village_id ORDER BY n.id DESC LIMIT 200`).all();
      if (ctx.scope) rows = rows.filter(r => ctx.scope.includes(r.village_id));
      if (a.village) { const v = nameToVillage(a.village, ctx.scope); rows = v ? rows.filter(r => r.village_id === v.id) : []; }
      if (a.contains) rows = rows.filter(r => r.note.toLowerCase().includes(a.contains.toLowerCase()));
      return { summary: `${rows.length} field note(s).`, columns: ['Village', 'Dimension', 'Note'],
        rows: rows.slice(0, 10).map(r => [r.village || '—', r.dim ? Q.DIMENSIONS.find(d => d.id === r.dim).name : 'General', r.note]) };
    },
  },

  definitions: {
    description: 'How the scoring works: bands, thresholds, validity floors, what a dimension contains. Use for "what does band 4 mean" or "how is X calculated".',
    schema: { type: 'object', additionalProperties: false, properties: { term: { type: 'string' } }, required: [] },
    run: (a) => {
      const rows = [
        ...Q.BANDS.map(b => [`Band ${b.band}`, `${b.min}–${Math.round(b.max)}%`, b.label]),
        ['Flag threshold', pct(S.FLAG_THRESHOLD), 'A dimension below this is flagged (bottom of band 4)'],
        ['Minimum village sample', `30% or ${S.MIN_SAMPLE_ABS}`, 'Whichever is larger, before a village score is reported'],
        ['Dimension score', 'mean of indicators', 'Never multiplied, so one weak answer cannot zero it'],
        ['Household index', 'mean of 7 dimensions', 'Each dimension weighted 1/7'],
        ['Village index (VWBI)', 'mean of household indexes', 'Households are not weighted by size'],
        ['Missing data', 'NC excluded, DK/PNA = 0.5', 'Not collected is never scored as zero'],
        ...Q.DIMENSIONS.map(d => [d.name, `${S.INDICATORS[d.id].length} indicators`,
          S.INDICATORS[d.id].map(i => i.label).join(', ')]),
      ];
      const filtered = a.term ? rows.filter(r => r.join(' ').toLowerCase().includes(a.term.toLowerCase())) : rows;
      return { summary: 'Scoring definitions, read from the scoring engine.', columns: ['Term', 'Value', 'Meaning'],
        rows: filtered.length ? filtered : rows };
    },
  },
};

function submissionIds(a, ctx) {
  const w = ['su.deleted_at IS NULL'], p = [];
  if (ctx.scope) { w.push(`su.village_id IN (${ctx.scope.map(() => '?').join(',')})`); p.push(...ctx.scope); }
  if (a.district) { w.push('v.district = ?'); p.push(a.district); }
  if (a.village) {
    const v = nameToVillage(a.village, ctx.scope);
    if (!v) return [];
    w.push('su.village_id = ?'); p.push(v.id);
  }
  return db.prepare(`SELECT su.id FROM submissions su JOIN villages v ON v.id = su.village_id
    WHERE ${w.join(' AND ')}`).all(...p).map(r => r.id);
}

/* -------------------------------------------------------- rule-based plan */
const DIM_WORDS = {
  phy: ['physical', 'health', 'bmi', 'illness', 'sleep', 'sanitation'],
  fin: ['financial', 'income', 'money', 'economic', 'livelihood', 'savings', 'poverty'],
  emo: ['emotional', 'mental', 'stress', 'happiness', 'wellbeing of mind', 'isolation'],
  soc: ['social', 'community', 'trust', 'institution', 'inclusion', 'women'],
  env: ['environment', 'environmental', 'water', 'waste', 'fuel', 'climate', 'food'],
  int: ['intellectual', 'education', 'school', 'digital', 'learning', 'literacy'],
  spi: ['spiritual', 'culture', 'cultural', 'religion', 'festival', 'worship', 'language'],
};
const SIGNAL_WORDS = {
  water_unsafe: ['unsafe water', 'water quality', 'drinking water', 'contaminated'],
  water_scarce: ['water stress', 'water scarcity', 'water shortage', 'scarce water', 'no water', 'water problem', 'water issue'],
  no_bank: ['bank account', 'unbanked', 'bank'],
  no_savings: ['savings', 'debt', 'assets'],
  income_one_season: ['seasonal income', 'one season', 'tourist season income', 'seasonality'],
  income_insufficient: ['income insufficient', 'cannot cover', 'not enough income'],
  healthcare_far: ['health facility', 'clinic far', 'healthcare access', 'hospital distance'],
  winter_cutoff: ['cut off', 'winter access', 'road closed', 'snow'],
  no_toilet: ['toilet', 'sanitation', 'open defecation'],
  dirty_fuel: ['dung', 'kerosene', 'fuel', 'firewood'],
  open_waste: ['waste', 'garbage', 'rubbish', 'dumping'],
  digital_excluded: ['digital', 'internet', 'phone use', 'digital literacy'],
  education_barriers: ['education barrier', 'school barrier', 'dropout'],
  culture_loss: ['culture loss', 'language loss', 'tradition', 'young people losing'],
  youth_left: ['migration', 'youth leaving', 'outmigration', 'young people left'],
  no_institution: ['institution', 'committee', 'governance'],
  emotional_challenges: ['stress', 'anxiety', 'mental health'],
  no_support: ['support system', 'isolated', 'lonely'],
  climate_shock: ['flood', 'landslide', 'weather damage', 'disaster', 'shock'],
  scheme_unaware: ['scheme', 'mgnrega', 'pm-kisan', 'subsidy'],
  exclusion: ['exclusion', 'discrimination', 'women excluded'],
  worship_far: ['monastery', 'mosque', 'worship'],
  no_adaptation: ['adaptation', 'ice stupa', 'greenhouse', 'storage tank'],
};

function rulePlan(question, ctx) {
  const q = question.toLowerCase();
  const allVillages = db.prepare('SELECT id, name, aka FROM villages WHERE deleted_at IS NULL').all();
  // whole words only: with 250 villages, short names like Sani or Tia hide inside ordinary words
  const says = name => new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(q);
  const districtSaid = DISTRICTS.find(d => says(d.name));
  // Kargil and Drass are villages as well as districts: "villages in Kargil" means the district
  const meansDistrict = districtSaid && /(villages|district)/.test(q);
  const mentioned = allVillages.filter(v => (says(v.name) || (v.aka && says(v.aka)))
    && !(meansDistrict && v.name.toLowerCase() === districtSaid.name.toLowerCase()));
  const named = mentioned.filter(v => !ctx.scope || ctx.scope.includes(v.id)).map(v => v.name);
  const blocked = mentioned.filter(v => ctx.scope && !ctx.scope.includes(v.id)).map(v => v.name);

  // A village was named that this user may not see — say so, run nothing.
  if (blocked.length && !named.length) {
    return { refuse: `${blocked.join(' and ')} ${blocked.length > 1 ? 'are' : 'is'} outside the villages assigned to you, so I cannot report on ${blocked.length > 1 ? 'them' : 'it'}.`, calls: [] };
  }

  const district = districtSaid && (meansDistrict || !mentioned.length) ? districtSaid.id : undefined;
  const dim = Object.entries(DIM_WORDS).find(([, words]) => words.some(w => q.includes(w)));
  const signal = Object.entries(SIGNAL_WORDS).find(([, words]) => words.some(w => q.includes(w)));
  const lowest = /(lowest|worst|weakest|struggl|poorest|bottom|problem|risk)/.test(q);
  const highest = /(highest|best|strongest|top|doing well)/.test(q);
  const wantsDefinition = /(band\s*[1-7]|what does band|how (is|are|does).{0,30}(calculat|scored|score work|work out)|threshold|definition|scoring model|what is (the )?(vwbi|iwb|index|band)|coverage rule|minimum sample)/.test(q);
  const wantsFlags = /(flag|issue|concern|wrong|attention|priority action|problems? in)/.test(q);
  const wantsMatch = /(match|learn from|pair|who could help|best practice)/.test(q);
  const wantsPriorities = /(priorit|want most|ask(ed)? for|need most|demand)/.test(q);
  const wantsNotes = /(note|said|qualitative|why is|reason)/.test(q);
  const wantsIndicators = /(indicator|breakdown|drill|detail|which part)/.test(q);
  const wantsRanking = /(which villages?|rank|compare villages|list villages|where)/.test(q);
  const calls = [];

  if (wantsDefinition) {
    const bandAsked = q.match(/band\s*([1-7])/);
    calls.push({ tool: 'definitions', args: bandAsked ? { term: `Band ${bandAsked[1]}` }
      : dim ? { term: Q.DIMENSIONS.find(d => d.id === dim[0]).name } : {} });
  }
  if (named.length >= 2) calls.push({ tool: 'compare_villages', args: { villages: named } });
  if (signal) calls.push({ tool: 'signal_prevalence', args: { signal_id: signal[0], village: named[0], district } });
  if (wantsPriorities) calls.push({ tool: 'priorities', args: { village: named[0], district } });
  if (wantsFlags && named.length === 1) calls.push({ tool: 'village_flags', args: { village: named[0] } });
  if (wantsMatch) calls.push({ tool: 'matches', args: {} });
  if (wantsNotes && (named.length || /note/.test(q))) calls.push({ tool: 'field_notes', args: { village: named[0] } });
  if (wantsIndicators) calls.push({ tool: 'weakest_indicators', args: { village: named[0], district } });

  if (!calls.length) {
    if (named.length === 1) {
      calls.push({ tool: 'village_flags', args: { village: named[0] } });
      calls.push({ tool: 'dimension_scores', args: { village: named[0] } });
    } else if (dim || district || wantsRanking || lowest || highest) {
      calls.push({ tool: 'village_scores', args: { district, dimension: dim ? dim[0] : undefined,
        order: lowest ? 'lowest' : 'highest', limit: 6 } });
      if (dim) calls.push({ tool: 'weakest_indicators', args: { district, limit: 6 } });
    } else {
      // Nothing in the question matches anything this system holds.
      return { refuse: 'I could not match that question to any data this system holds.', calls: [] };
    }
  }
  return { refuse: null, calls: calls.slice(0, 3) };
}

const CAN_ANSWER = [
  'village scores and rankings, overall or by dimension',
  'how many households are affected by a named problem (water, toilets, bank accounts, schooling, and so on)',
  'what is flagged in a village, and what it does well',
  'comparisons between villages',
  'what households said their priorities are',
  'which villages could learn from each other',
  'how the scoring works — bands, thresholds, what a dimension contains',
];

/** Turns tool output into an answer without a model — plain, factual sentences. */
function ruleAnswer(question, evidence) {
  const parts = [];
  for (const e of evidence) {
    parts.push(e.result.summary);
    if (e.tool === 'village_scores' && e.result.rows.length) {
      const top = e.result.rows.slice(0, 3).map(r => `${r[0]} ${r[4]}`).join(', ');
      parts.push(`In order: ${top}${e.result.rows.length > 3 ? ', and others in the table below' : ''}.`);
      const low = e.result.rows.filter(r => r[6] === 'BELOW MINIMUM').map(r => r[0]);
      if (low.length) parts.push(`Treat ${low.join(', ')} with caution — below the minimum sample.`);
    }
    if (e.tool === 'signal_prevalence' && e.result.rows.length) {
      const worst = e.result.rows[0];
      parts.push(`Highest in ${worst[0]}: ${worst[1]} of ${worst[2]} households (${worst[3]}).`);
      if (e.result.note) parts.push(`Suggested response: ${e.result.note}`);
    }
    if (e.tool === 'village_flags' && e.result.rows.length) {
      const flags = e.result.rows.filter(r => r[0] === 'FLAG').slice(0, 3).map(r => r[1]);
      if (flags.length) parts.push(`Most pressing: ${flags.join('; ')}.`);
    }
    if (e.tool === 'dimension_scores' && e.result.rows.length) {
      const flagged = e.result.rows.filter(r => r[2]).map(r => `${r[0]} ${r[1]}`);
      parts.push(flagged.length ? `Flagged: ${flagged.join(', ')}.` : 'No dimension is below the 43% line in this selection.');
    }
    if (e.tool === 'matches' && e.result.rows.length) {
      parts.push(`Clearest pairing: ${e.result.rows[0][1]} could learn from ${e.result.rows[0][2]} on "${e.result.rows[0][0]}".`);
    }
    if (e.tool === 'priorities' && e.result.rows.length) {
      parts.push(`Top three: ${e.result.rows.slice(0, 3).map(r => r[1]).join(', ')}.`);
    }
    if (e.tool === 'definitions' && e.result.rows.length) {
      parts.push(e.result.rows.slice(0, 3).map(r => `${r[0]} = ${r[1]} — ${r[2]}`).join('. ') + '.');
    }
    if (e.tool === 'compare_villages' && e.result.rows.length > 2) {
      const names = e.result.columns.slice(1);
      const num = v => (typeof v === 'string' && v.endsWith('%') ? parseFloat(v) : NaN);
      const dimRows = e.result.rows.filter(r => !['Overall index', 'Band', 'Surveys'].includes(r[0]));
      const gaps = dimRows.map(r => ({ dim: r[0], a: num(r[1]), b: num(r[2]), gap: Math.abs(num(r[1]) - num(r[2])) }))
        .filter(g => isFinite(g.gap)).sort((x, y) => y.gap - x.gap);
      const overall = e.result.rows.find(r => r[0] === 'Overall index');
      if (overall) parts.push(`Overall: ${names[0]} ${overall[1]}, ${names[1]} ${overall[2]}.`);
      if (gaps.length) {
        const top = gaps[0], close = gaps[gaps.length - 1];
        parts.push(`Biggest difference is ${top.dim} (${names[0]} ${top.a}%, ${names[1]} ${top.b}% — ${top.gap.toFixed(0)} points apart); closest is ${close.dim}, ${close.gap.toFixed(0)} points apart.`);
      }
    }
  }
  if (!parts.length) parts.push('I could not find data for that question.');
  parts.push('Every number above comes from the tables below; nothing is estimated.');
  return parts.join(' ');
}

/* --------------------------------------------------------------- LLM plan */
const SYSTEM_PROMPT = `You answer questions about village well-being data for Project DYESKIT in Ladakh.

ABSOLUTE RULES:
1. You have no knowledge of this data. Every fact you state must come from a tool result in this conversation. Never state a number, village name, score, count or share that a tool did not return.
2. If the tools return no data, say plainly that there is no data for that question. Never estimate, extrapolate or illustrate with invented figures.
3. Quote numbers exactly as returned — do not round, convert or recompute them. You may not do arithmetic; if a question needs a calculation the tools do not provide, say so.
4. When a village is marked BELOW MINIMUM sample, say that its score is not yet reliable.
5. Never speculate about causes. You may repeat what a field note says, attributed to that note.
6. There is no household-level or personal data available, and you must not ask for any.

STYLE: answer in 2-5 sentences, plain English, no bullet lists unless comparing more than three things. Name the villages and the counts. The interface shows the evidence tables under your answer, so do not repeat whole tables — state what matters. If a useful follow-up question exists, offer exactly one.`;

async function llmPlan(question, ctx, history) {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch { return null; }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;

  const client = new Anthropic();
  const tools = Object.entries(TOOLS).map(([name, t]) => ({
    name, description: t.description, input_schema: t.schema, strict: true,
  }));
  const messages = [
    ...(history || []).slice(-6),
    { role: 'user', content: question },
  ];
  const evidence = [];

  for (let i = 0; i < 6; i++) {
    const response = await client.messages.create({
      model: MODEL, max_tokens: 4000, system: SYSTEM_PROMPT, tools, messages,
    });
    if (response.stop_reason === 'refusal') {
      return { answer: 'That question could not be answered.', evidence, planner: 'llm' };
    }
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (!toolUses.length) {
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { answer: text || 'No answer produced.', evidence, planner: 'llm', model: MODEL };
    }
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const use of toolUses) {
      const tool = TOOLS[use.name];
      let result;
      try {
        result = tool ? tool.run(use.input || {}, ctx) : { summary: `Unknown tool ${use.name}`, columns: [], rows: [] };
      } catch (err) {
        result = { summary: `Tool failed: ${err.message}`, columns: [], rows: [] };
      }
      evidence.push({ tool: use.name, args: use.input || {}, result });
      results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result).slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { answer: 'I could not complete that lookup. Try a narrower question.', evidence, planner: 'llm', model: MODEL };
}

/* ------------------------------------------------------------------- ask */
async function ask(question, ctx = {}, history) {
  const q = String(question || '').trim().slice(0, 600);
  if (!q) return { answer: 'Ask a question about the villages, their scores, or what is flagged.', evidence: [], planner: 'none' };

  const llm = await llmPlan(q, ctx, history).catch(err => ({ error: err.message }));
  if (llm && !llm.error) return llm;

  const plan = rulePlan(q, ctx);
  if (plan.refuse) {
    return {
      answer: `${plan.refuse} I can answer questions about: ${CAN_ANSWER.join('; ')}.`,
      evidence: [], planner: 'rules', refused: true,
    };
  }
  const evidence = plan.calls.map(c => {
    const tool = TOOLS[c.tool];
    let result;
    try { result = tool.run(c.args || {}, ctx); }
    catch (err) { result = { summary: `Tool failed: ${err.message}`, columns: [], rows: [] }; }
    return { tool: c.tool, args: c.args, result };
  });
  return {
    answer: ruleAnswer(q, evidence),
    evidence,
    planner: 'rules',
    note: llm && llm.error
      ? `The language model could not be reached (${llm.error}), so this answer was assembled by the rule-based planner.`
      : 'Answered by the rule-based planner. Set ANTHROPIC_API_KEY to enable free-form questions; the numbers come from the same tools either way.',
  };
}

const catalogue = () => Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description }));

module.exports = { ask, TOOLS, catalogue, clearCache, SYSTEM_PROMPT, MODEL };
