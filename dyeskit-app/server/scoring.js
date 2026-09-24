'use strict';
/**
 * DYESKIT scoring engine — scoring version SCORE_V2 (graduated 0–1 normalisation).
 *
 * Principles (questionnaire v2, Part 3):
 *   • every indicator scores in [0,1]
 *   • dimension score = arithmetic mean of valid indicator scores (never multiply)
 *   • IWB = mean of the 7 dimension scores (equal 1/7 weight)
 *   • DK / RF / PNA   -> 0.5 (conservative neutral)
 *   • NC (not collected) / NA -> excluded, denominator shrinks
 *   • a dimension resolves only if >= 50% of its indicators (min 2) carry real data
 *   • an individual resolves only if >= 5 of 7 dimensions resolve
 *
 * Raw answers are never modified here. Re-running this file reproduces every score.
 */

const { DIMENSIONS, BANDS, ITEMS } = require('./questionnaire');

const SCORING_VERSION = 'score-v2.0';
const MIN_SAMPLE_ABS = 10;          // village reports need max(30% of households, 10)
const MIN_SAMPLE_FRACTION = 0.3;
const FLAG_THRESHOLD = 0.43;        // below "Basic Well-Being Achieved"

const NEUTRAL = 0.5;                // DK / PNA
const isBlank = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const isPNA = v => v === 'PNA' || v === 'DK' || (Array.isArray(v) && v.length === 1 && (v[0] === 'PNA' || v[0] === 'DK'));

function optionPts(itemId, value) {
  const item = ITEMS[itemId];
  if (!item || !item.options) return null;
  const opt = item.options.find(op => op.v === value);
  return opt && typeof opt.pts === 'number' ? opt.pts : null;
}

/** ICMR / WHO Asia-Pacific BMI cut-offs — deliberately not the Western bands. */
function bmiScore(height_cm, weight_kg) {
  if (!height_cm || !weight_kg) return null;
  const m = Number(height_cm) / 100;
  const bmi = Number(weight_kg) / (m * m);
  if (!isFinite(bmi) || bmi <= 0) return null;
  let score;
  if (bmi >= 18.5 && bmi <= 22.9) score = 1.0;
  else if (bmi >= 23.0 && bmi <= 24.9) score = 0.7;
  else if (bmi >= 17.0 && bmi < 18.5) score = 0.6;
  else if (bmi >= 25.0 && bmi <= 29.9) score = 0.4;
  else if (bmi >= 16.0 && bmi < 17.0) score = 0.3;
  else score = 0.0;
  return { score, bmi: Math.round(bmi * 10) / 10 };
}

const countReal = (arr, ignore = ['none', 'PNA', 'DK']) =>
  (Array.isArray(arr) ? arr : []).filter(v => !ignore.includes(v)).length;

/** Indicators per dimension. Some indicators merge two questionnaire items. */
const INDICATORS = {
  phy: [
    { id: 'bmi', label: 'Nutritional status (BMI)', items: ['B1'] },
    { id: 'chronic', label: 'Chronic illness', items: ['B2'] },
    { id: 'altitude', label: 'Altitude symptoms', items: ['B3'] },
    { id: 'healthcare', label: 'Healthcare access', items: ['B4', 'B5'] },
    { id: 'activity', label: 'Physical activity', items: ['B6'] },
    { id: 'sleep', label: 'Sleep', items: ['B7'] },
    { id: 'toilet', label: 'Sanitation', items: ['B8'] },
    { id: 'self_health', label: 'Self-rated health', items: ['B11'] },
  ],
  env: [
    { id: 'water_quality', label: 'Drinking water quality', items: ['B10'] },
    { id: 'water_reliability', label: 'Water reliability', items: ['E1', 'E1a'] },
    { id: 'local_food', label: 'Local food', items: ['E3'] },
    { id: 'waste', label: 'Waste practice', items: ['E4'] },
    { id: 'fuel', label: 'Cooking / heating fuel', items: ['E5'] },
    { id: 'adaptation', label: 'Climate adaptation', items: ['E6'] },
  ],
  emo: [
    { id: 'state', label: 'Emotional state', items: ['C1'] },
    { id: 'support', label: 'Support system', items: ['C2'] },
    { id: 'stress', label: 'Stress recovery', items: ['C3'] },
    { id: 'hope', label: 'Hope', items: ['C4'] },
    { id: 'satisfaction', label: 'Life satisfaction', items: ['C5'] },
    { id: 'isolation', label: 'Winter isolation (reverse)', items: ['C6'] },
  ],
  soc: [
    { id: 'participation', label: 'Community participation', items: ['D1'] },
    { id: 'trust', label: 'Trust', items: ['D2'] },
    { id: 'conflict', label: 'Conflict level', items: ['D3'] },
    { id: 'inclusion', label: 'Gender & social inclusion', items: ['D4'] },
    { id: 'intergen', label: 'Intergenerational bond', items: ['D5'] },
    { id: 'institutions', label: 'Village institutions', items: ['D6'] },
    { id: 'emergency', label: 'Emergency support', items: ['D7'] },
  ],
  fin: [
    { id: 'income', label: 'Income level', items: ['F1'] },
    { id: 'sufficiency', label: 'Income sufficiency', items: ['F2'] },
    { id: 'savings', label: 'Savings / assets', items: ['F3'] },
    { id: 'diversity', label: 'Livelihood diversity', items: ['F4'] },
    { id: 'seasonality', label: 'Income spread over year', items: ['F6'] },
    { id: 'shock', label: 'Climate shock (reverse)', items: ['F7'] },
    { id: 'security', label: 'Felt financial security', items: ['F8'] },
    { id: 'scheme', label: 'Government scheme use', items: ['F9'] },
    { id: 'bank', label: 'Bank account', items: ['F10'] },
  ],
  int: [
    { id: 'education', label: 'Education attained', items: ['A13'] },
    { id: 'learning', label: 'Active learning', items: ['G1'] },
    { id: 'digital', label: 'Digital literacy', items: ['G2'] },
    { id: 'civic', label: 'Civic awareness', items: ['G3'] },
    { id: 'climate_aware', label: 'Climate awareness', items: ['G4'] },
    { id: 'barriers', label: 'Education barriers (reverse)', items: ['G5'] },
  ],
  spi: [
    { id: 'practice', label: 'Spiritual practice', items: ['H1'] },
    { id: 'purpose', label: 'Sense of purpose', items: ['H2'] },
    { id: 'ethics', label: 'Ethical living', items: ['H3'] },
    { id: 'peace', label: 'Inner peace', items: ['H4'] },
    { id: 'worship', label: 'Access to worship', items: ['H5'] },
    { id: 'festivals', label: 'Festival participation', items: ['H6'] },
    { id: 'continuity', label: 'Cultural continuity (reverse)', items: ['H7'] },
  ],
};

/**
 * Score one indicator from the raw answer map.
 * Returns { score } | { pna: true } | null  (null = not collected, excluded).
 */
function scoreIndicator(ind, a) {
  const v = id => a[id];
  switch (ind.id) {
    case 'bmi': {
      const m = v('B1') || {};
      const r = bmiScore(m.height_cm, m.weight_kg);
      return r ? { score: r.score, detail: `BMI ${r.bmi}` } : null;
    }
    case 'healthcare': {
      const parts = [];
      for (const id of ['B4', 'B5']) {
        const val = v(id);
        if (isBlank(val)) continue;
        if (isPNA(val)) { parts.push(NEUTRAL); continue; }
        const p = optionPts(id, val);
        if (p !== null) parts.push(p);
      }
      if (!parts.length) return null;
      return { score: parts.reduce((s, x) => s + x, 0) / parts.length };
    }
    case 'water_reliability': {
      const val = v('E1');
      if (isBlank(val)) return null;
      if (val === 'reliable') return { score: 1 };
      if (val === 'severe') return { score: 0 };
      const months = Number(v('E1a'));
      if (!isFinite(months) || months <= 0) return { score: 0.5, detail: 'scarce, months unknown' };
      return { score: Math.max(0, 1 - months / 12), detail: `${months} scarce months` };
    }
    case 'support': {
      const val = v('C2');
      if (isBlank(val)) return null;
      if (isPNA(val)) return { pna: true };
      const n = countReal(val);
      return { score: n >= 3 ? 1 : n === 2 ? 0.75 : n === 1 ? 0.5 : 0, detail: `${n} support types` };
    }
    case 'institutions': {
      const val = v('D6');
      if (isBlank(val)) return null;
      const n = countReal(val);
      return { score: n >= 2 ? 1 : n === 1 ? 0.5 : 0, detail: `${n} institutions` };
    }
    case 'diversity': {
      const n = Number(v('F4'));
      if (!isFinite(n)) return null;
      return { score: n >= 3 ? 1 : n === 2 ? 0.67 : n === 1 ? 0.33 : 0, detail: `${n} sources` };
    }
    case 'seasonality': {
      const val = v('F6');
      if (isBlank(val)) return null;
      if (val.includes('even')) return { score: 1, detail: 'even year-round' };
      const q = countReal(val, ['none', 'PNA', 'DK', 'even']);
      return { score: q >= 3 ? 0.75 : q === 2 ? 0.5 : q === 1 ? 0.25 : 0, detail: `${q} quarters` };
    }
    case 'fuel': {
      const val = v('E5');
      if (isBlank(val)) return null;
      const pts = val.map(x => optionPts('E5', x)).filter(p => p !== null);
      if (!pts.length) return null;
      // Mixed fuels: mean of the selected fuels' scores (documented deviation from "primary fuel only").
      return { score: pts.reduce((s, x) => s + x, 0) / pts.length, detail: `${val.length} fuel(s)` };
    }
    case 'adaptation': {
      const val = v('E6');
      if (isBlank(val)) return null;
      const n = countReal(val);
      return { score: n >= 2 ? 1 : n === 1 ? 0.5 : 0, detail: `${n} measures` };
    }
    case 'barriers': {
      const val = v('G5');
      if (isBlank(val)) return null;
      const n = countReal(val);
      return { score: n === 0 ? 1 : n === 1 ? 0.67 : n === 2 ? 0.33 : 0, detail: `${n} barriers` };
    }
    default: {
      const id = ind.items[0];
      const item = ITEMS[id];
      const val = v(id);
      if (isBlank(val)) return null;
      if (isPNA(val)) return { pna: true };
      if (item.type === 'likert') {
        const x = Number(val);
        return isFinite(x) ? { score: (x - 1) / 4 } : null;
      }
      if (item.type === 'likert_rev') {
        const x = Number(val);
        return isFinite(x) ? { score: (5 - x) / 4 } : null;
      }
      const p = optionPts(id, val);
      return p === null ? null : { score: p };
    }
  }
}

function bandFor(pct) {
  if (pct === null || pct === undefined || !isFinite(pct)) return null;
  return BANDS.find(b => pct >= b.min && pct <= b.max) || BANDS[BANDS.length - 1];
}

/** Score one submission. `answers` is the raw answer map { itemId: value }. */
function scoreSubmission(answers) {
  const a = answers || {};
  const dims = {};
  const indicatorDetail = {};

  for (const d of DIMENSIONS) {
    const list = INDICATORS[d.id];
    const scores = [];
    let collected = 0;
    for (const ind of list) {
      const r = scoreIndicator(ind, a);
      if (r === null) { indicatorDetail[ind.id] = { dim: d.id, label: ind.label, score: null, status: 'NC' }; continue; }
      const s = r.pna ? NEUTRAL : r.score;
      if (!r.pna) collected++;
      scores.push(s);
      indicatorDetail[ind.id] = { dim: d.id, label: ind.label, score: round(s), status: r.pna ? 'PNA' : 'ok', detail: r.detail || null };
    }
    const needed = Math.max(2, Math.ceil(list.length * 0.5));
    const valid = scores.length >= needed;
    dims[d.id] = {
      score: scores.length ? round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      answered: scores.length,
      total: list.length,
      collected,
      valid,
    };
  }

  const validDims = DIMENSIONS.filter(d => dims[d.id].valid);
  const valid = validDims.length >= 5;
  // Band from the UNROUNDED mean; rounding is for display only. Rounding first would
  // promote a household at 70.9996% into the next band.
  const iwbRaw = validDims.length ? validDims.reduce((s, d) => s + dims[d.id].score, 0) / validDims.length : null;
  const iwb = iwbRaw === null ? null : round(iwbRaw);
  const pct = iwbRaw === null ? null : round(iwbRaw * 100, 1);
  const band = bandFor(iwbRaw === null ? null : iwbRaw * 100);

  return {
    scoring_version: SCORING_VERSION,
    dims,
    indicators: indicatorDetail,
    iwb,
    pct,
    band: band ? band.band : null,
    band_label: band ? band.label : 'Insufficient data',
    valid,
    valid_dimensions: validDims.length,
  };
}

/** Aggregate many scored submissions (a village, a district, or any filtered set). */
function aggregate(scored, opts = {}) {
  const rows = scored.filter(s => s && s.iwb !== null);
  const dimMeans = {};
  for (const d of DIMENSIONS) {
    const vals = rows.map(r => r.dims[d.id] && r.dims[d.id].score).filter(v => v !== null && v !== undefined);
    dimMeans[d.id] = vals.length ? round(vals.reduce((s, x) => s + x, 0) / vals.length) : null;
  }
  const iwbVals = rows.map(r => r.iwb);
  const vwbiRaw = iwbVals.length ? iwbVals.reduce((s, x) => s + x, 0) / iwbVals.length : null;
  const vwbi = vwbiRaw === null ? null : round(vwbiRaw);
  const pct = vwbiRaw === null ? null : round(vwbiRaw * 100, 1);
  const band = bandFor(vwbiRaw === null ? null : vwbiRaw * 100);

  const bandCounts = BANDS.map(b => ({ band: b.band, label: b.label, count: rows.filter(r => r.band === b.band).length }));
  const flags = DIMENSIONS
    .filter(d => dimMeans[d.id] !== null && dimMeans[d.id] < FLAG_THRESHOLD)
    .map(d => ({ dim: d.id, name: d.name, score: dimMeans[d.id], severity: dimMeans[d.id] < 0.29 ? 'critical' : 'serious' }));

  let coverage = null;
  if (opts.households && opts.households > 0) {
    const required = Math.max(MIN_SAMPLE_ABS, Math.ceil(opts.households * MIN_SAMPLE_FRACTION));
    coverage = {
      surveyed: rows.length,
      households: opts.households,
      required,
      percent: round((rows.length / opts.households) * 100, 1),
      sufficient: rows.length >= required,
    };
  }

  return { n: rows.length, dims: dimMeans, vwbi, pct, band: band ? band.band : null,
    band_label: band ? band.label : 'Insufficient data', bands: bandCounts, flags, coverage };
}

function round(x, dp = 3) {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

module.exports = {
  SCORING_VERSION, INDICATORS, FLAG_THRESHOLD, MIN_SAMPLE_ABS, MIN_SAMPLE_FRACTION,
  scoreSubmission, aggregate, bandFor, bmiScore, round,
};
