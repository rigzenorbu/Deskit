'use strict';
/**
 * Rules engine — the "Village-Level AI Instructions" turned into code.
 *
 * This file contains NO machine learning and NO language model. Every output is a
 * deterministic consequence of the data and the thresholds below, so any number it
 * produces can be checked by hand. The assistant (assistant.js) is only allowed to
 * report what this engine computes.
 *
 * It produces four things, matching the source document's vocabulary:
 *   FLAG      something is below its threshold here
 *   SHOWCASE  something is notably good here, worth copying
 *   MATCH     a village with a problem paired with a village that has solved it
 *   COMPUTE   how many households are affected, stated as counts and shares
 */

const { db, getAnswers } = require('./db');
const S = require('./scoring');
const Q = require('./questionnaire');

/* ---------------------------------------------------------------- signals */
/**
 * A signal is a yes/no test applied to one household's answers.
 * `share` = proportion of surveyed households where the test is true.
 * Severity bands are deliberately blunt and identical across signals.
 */
const has = (v, x) => Array.isArray(v) && v.includes(x);
const count = (v, ignore = ['none', 'PNA', 'DK']) => (Array.isArray(v) ? v.filter(i => !ignore.includes(i)).length : 0);

const SIGNALS = [
  { id: 'water_unsafe', dim: 'env', label: 'Drinking water not safe as-is',
    test: a => ['needs_treatment', 'occasional', 'unsafe'].includes(a.B10),
    action: 'Test sources, then prioritise treatment or a protected source.' },
  { id: 'water_scarce', dim: 'env', label: 'Water scarce four months or more',
    test: a => a.E1 === 'severe' || (a.E1 === 'scarce' && Number(a.E1a) >= 4),
    action: 'Storage capacity and ice-stupa or snowmelt harvesting are the usual first steps.' },
  { id: 'no_adaptation', dim: 'env', label: 'No climate or water adaptation measure',
    test: a => count(a.E6) === 0,
    action: 'Village-level demonstration of storage, greenhouse or trombe wall.' },
  { id: 'dirty_fuel', dim: 'env', label: 'Cooking or heating on dung or kerosene',
    test: a => has(a.E5, 'dung') || has(a.E5, 'kerosene'),
    action: 'Indoor air quality and fuel cost both improve with LPG or solar; check scheme eligibility.' },
  { id: 'open_waste', dim: 'env', label: 'Waste burned or dumped openly',
    test: a => ['burned', 'dumping'].includes(a.E4),
    action: 'Collection point and segregation; tourism-season volumes need separate handling.' },

  { id: 'healthcare_far', dim: 'phy', label: 'Nearest health facility beyond 10 km',
    test: a => ['11_20', 'over_20'].includes(a.B4),
    action: 'Mobile health camp scheduling, or a trained village health worker.' },
  { id: 'winter_cutoff', dim: 'phy', label: 'Could not reach care last winter',
    test: a => ['once', 'more'].includes(a.B5),
    action: 'Winter medicine stocking and an evacuation plan before the passes close.' },
  { id: 'chronic_unmanaged', dim: 'phy', label: 'Chronic illness unmanaged',
    test: a => a.B2 === 'unmanaged',
    action: 'Medicine supply chain and follow-up; check what is unavailable locally.' },
  { id: 'altitude_frequent', dim: 'phy', label: 'Frequent altitude symptoms',
    test: a => a.B3 === 'frequently',
    action: 'Screening at the next health camp; look for a pattern by altitude and age.' },
  { id: 'no_toilet', dim: 'phy', label: 'No toilet, or no proper disposal',
    test: a => ['none', 'no_disposal'].includes(a.B8),
    action: 'Note: dry-compost toilets count as adequate; this signal excludes them.' },

  { id: 'income_insufficient', dim: 'fin', label: 'Income does not cover the year',
    test: a => a.F2 === 'no',
    action: 'The gap is a balance-sheet liability: size it before designing support.' },
  { id: 'income_one_season', dim: 'fin', label: 'Income earned in one quarter only',
    test: a => Array.isArray(a.F6) && !a.F6.includes('even') && count(a.F6) <= 1,
    action: 'Off-season work or storage-based income smooths the year.' },
  { id: 'no_savings', dim: 'fin', label: 'No savings or assets, or in debt',
    test: a => a.F3 === 'none',
    action: 'SHG membership and a first savings product; debt needs separate handling.' },
  { id: 'no_bank', dim: 'fin', label: 'No bank account',
    test: a => a.F10 === 'no',
    action: 'Blocks most government transfers — usually the cheapest thing to fix.' },
  { id: 'scheme_unaware', dim: 'fin', label: 'Unaware of livelihood schemes',
    test: a => a.F9 === 'not_aware',
    action: 'A scheme camp in the village; awareness is the binding constraint, not eligibility.' },
  { id: 'climate_shock', dim: 'fin', label: 'Extreme weather damage in last 5 years',
    test: a => ['once', 'more'].includes(a.F7),
    action: 'Livestock and crop insurance uptake; check what was damaged.' },

  { id: 'emotional_challenges', dim: 'emo', label: 'Facing frequent stress or anxiety',
    test: a => a.C1 === 'challenges',
    action: 'Sensitive: report at village level only, and pair with support availability.' },
  { id: 'no_support', dim: 'emo', label: 'No one to turn to for support',
    test: a => count(a.C2) === 0,
    action: 'Isolation risk, sharpest among elderly households and in winter.' },
  { id: 'high_stress', dim: 'emo', label: 'High stress, difficult recovery',
    test: a => a.C3 === 'high',
    action: 'Look at what co-occurs: income seasonality, isolation, health access.' },
  { id: 'winter_isolation', dim: 'emo', label: 'Feels cut off in winter (agrees strongly)',
    test: a => Number(a.C6) >= 4,
    action: 'Connectivity and winter activity both matter; ask what they do in winter.' },

  { id: 'no_institution', dim: 'soc', label: 'No functioning village institution',
    test: a => count(a.D6) === 0,
    action: 'Nothing to build community action on — usually the first thing to rebuild.' },
  { id: 'exclusion', dim: 'soc', label: 'Women or marginalised groups excluded',
    test: a => a.D4 === 'exclusion',
    action: 'Check against who attends meetings, not only who is invited.' },
  { id: 'youth_left', dim: 'soc', label: 'Young people left for work or study',
    test: a => a.D8 === 'yes',
    action: 'Not automatically bad — check whether it reads as opportunity or loss.' },

  { id: 'digital_excluded', dim: 'int', label: 'Cannot use phone or internet for information',
    test: a => a.G2 === 'no',
    action: 'Limits every digital service, including this platform reaching them.' },
  { id: 'education_barriers', dim: 'int', label: 'Two or more barriers to education',
    test: a => count(a.G5) >= 2,
    action: 'Distance, cost, winter closure and teacher absence need different responses.' },
  { id: 'unaware_climate', dim: 'int', label: 'Unaware of climate change impact',
    test: a => a.G4 === 'not',
    action: 'Matters here because adaptation depends on it.' },

  { id: 'worship_far', dim: 'spi', label: 'Place of worship far or seasonal only',
    test: a => ['beyond_10', 'seasonal'].includes(a.H5),
    action: 'Access is partly a winter-road question.' },
  { id: 'culture_loss', dim: 'spi', label: 'Sees young people losing the language and practices',
    test: a => ['strongly_agree', 'agree'].includes(a.H7),
    action: 'Pairs with youth migration; a cultural programme is the usual response.' },
];

const SIGNAL_BY_ID = Object.fromEntries(SIGNALS.map(s => [s.id, s]));

/** Share thresholds, applied identically to every signal. */
const SEVERITY = [
  { min: 0.50, level: 'critical', word: 'more than half of households' },
  { min: 0.30, level: 'serious', word: 'about a third of households' },
  { min: 0.15, level: 'watch', word: 'a noticeable minority' },
];
const severityFor = share => (SEVERITY.find(s => share >= s.min) || null);

const SHOWCASE_DIM = 0.71;    // band 6 and above
const SHOWCASE_SIGNAL = 0.05; // signal almost absent
const MATCH_GAP = 0.20;       // difference in share worth pairing villages over

/* ------------------------------------------------------------- collection */
function loadVillageData(filterVillageIds) {
  const where = filterVillageIds && filterVillageIds.length
    ? `AND su.village_id IN (${filterVillageIds.map(() => '?').join(',')})` : '';
  const rows = db.prepare(`
    SELECT su.id, su.village_id, v.name AS village, v.district, v.households,
           sc.iwb, sc.pct, sc.band, sc.dims
    FROM submissions su
    JOIN villages v ON v.id = su.village_id
    LEFT JOIN scores sc ON sc.submission_id = su.id
    WHERE su.deleted_at IS NULL ${where}`).all(...(filterVillageIds || []));

  const byVillage = new Map();
  for (const r of rows) {
    if (!byVillage.has(r.village_id)) {
      byVillage.set(r.village_id, {
        village_id: r.village_id, village: r.village, district: r.district,
        households: r.households, submissions: [], scores: [],
      });
    }
    const v = byVillage.get(r.village_id);
    v.submissions.push(r.id);
    if (r.iwb !== null && r.iwb !== undefined) {
      v.scores.push({ iwb: r.iwb, pct: r.pct, band: r.band, dims: JSON.parse(r.dims || '{}') });
    }
  }
  return byVillage;
}

/** Signal shares for one village (or any set of submission ids). */
function signalShares(submissionIds) {
  const counts = Object.fromEntries(SIGNALS.map(s => [s.id, 0]));
  let n = 0;
  for (const id of submissionIds) {
    const a = getAnswers(id);
    n++;
    for (const s of SIGNALS) {
      let hit = false;
      try { hit = !!s.test(a); } catch { hit = false; }
      if (hit) counts[s.id]++;
    }
  }
  const out = {};
  for (const s of SIGNALS) {
    out[s.id] = { id: s.id, label: s.label, dim: s.dim, action: s.action,
      households: counts[s.id], of: n, share: n ? S.round(counts[s.id] / n, 3) : null };
  }
  return out;
}

/* ------------------------------------------------------------- the engine */
function buildInsights(filterVillageIds) {
  const byVillage = loadVillageData(filterVillageIds);
  const villages = [];

  for (const v of byVillage.values()) {
    const agg = S.aggregate(v.scores, { households: v.households });
    const shares = signalShares(v.submissions);

    // FLAG — dimensions below the threshold, and signals above their share bands
    const dimFlags = Q.DIMENSIONS
      .filter(d => agg.dims[d.id] !== null && agg.dims[d.id] < S.FLAG_THRESHOLD)
      .map(d => ({ type: 'dimension', dim: d.id, name: d.name, score: agg.dims[d.id],
        level: agg.dims[d.id] < 0.29 ? 'critical' : 'serious',
        why: `${d.name} averages ${(agg.dims[d.id] * 100).toFixed(0)}%, below the 43% "Basic" line.` }));

    const signalFlags = Object.values(shares)
      .map(s => ({ s, sev: severityFor(s.share) }))
      .filter(x => x.sev)
      .sort((a, b) => b.s.share - a.s.share)
      .map(x => ({ type: 'signal', id: x.s.id, dim: x.s.dim, name: x.s.label,
        share: x.s.share, households: x.s.households, of: x.s.of,
        level: x.sev.level, why: `${x.s.households} of ${x.s.of} households (${(x.s.share * 100).toFixed(0)}%) — ${x.sev.word}.`,
        action: x.s.action }));

    // SHOWCASE — dimensions at band 6+, and signals that are almost absent
    const showcases = [
      ...Q.DIMENSIONS.filter(d => agg.dims[d.id] !== null && agg.dims[d.id] >= SHOWCASE_DIM)
        .map(d => ({ type: 'dimension', dim: d.id, name: d.name, score: agg.dims[d.id],
          why: `${d.name} at ${(agg.dims[d.id] * 100).toFixed(0)}% — band 6 or above.` })),
      ...Object.values(shares).filter(s => s.share !== null && s.share <= SHOWCASE_SIGNAL && s.of >= 10)
        .map(s => ({ type: 'signal', id: s.id, dim: s.dim, name: s.label,
          share: s.share, why: `Rare here — only ${s.households} of ${s.of} households affected.` })),
    ];

    villages.push({
      village_id: v.village_id, village: v.village, district: v.district,
      households: v.households, n: agg.n, vwbi: agg.vwbi, pct: agg.pct,
      band: agg.band, band_label: agg.band_label, coverage: agg.coverage,
      dims: agg.dims, shares,
      flags: [...dimFlags, ...signalFlags],
      showcases,
    });
  }

  // MATCH — pair a village that has a problem with one that does not
  const matches = [];
  for (const s of SIGNALS) {
    const withData = villages.filter(v => v.shares[s.id].share !== null && v.n >= 10);
    if (withData.length < 2) continue;
    const worst = [...withData].sort((a, b) => b.shares[s.id].share - a.shares[s.id].share)[0];
    const best = [...withData].sort((a, b) => a.shares[s.id].share - b.shares[s.id].share)[0];
    const gap = worst.shares[s.id].share - best.shares[s.id].share;
    if (gap < MATCH_GAP || !severityFor(worst.shares[s.id].share)) continue;
    matches.push({
      signal: s.id, name: s.label, dim: s.dim, gap: S.round(gap, 3),
      needs: { village: worst.village, village_id: worst.village_id, share: worst.shares[s.id].share, households: worst.shares[s.id].households, of: worst.shares[s.id].of },
      has: { village: best.village, village_id: best.village_id, share: best.shares[s.id].share, households: best.shares[s.id].households, of: best.shares[s.id].of },
      why: `${worst.village}: ${(worst.shares[s.id].share * 100).toFixed(0)}% of households affected. ` +
           `${best.village}: ${(best.shares[s.id].share * 100).toFixed(0)}%. Worth asking what ${best.village} does differently.`,
      action: s.action,
    });
  }
  matches.sort((a, b) => b.gap - a.gap);

  // COMPUTE — totals across the whole set in view
  const allSubs = [...byVillage.values()].flatMap(v => v.submissions);
  const overallShares = signalShares(allSubs);
  const totals = Object.values(overallShares)
    .filter(s => s.share !== null && s.share > 0)
    .sort((a, b) => b.share - a.share);

  // priority actions: signals ranked by households affected, with the villages named
  const actions = totals.filter(s => severityFor(s.share)).slice(0, 10).map(s => {
    const worstVillages = villages
      .filter(v => v.shares[s.id].share !== null && severityFor(v.shares[s.id].share))
      .sort((a, b) => b.shares[s.id].share - a.shares[s.id].share)
      .slice(0, 4)
      .map(v => `${v.village} ${(v.shares[s.id].share * 100).toFixed(0)}%`);
    return { id: s.id, name: s.label, dim: s.dim, households: s.households, of: s.of, share: s.share,
      level: severityFor(s.share).level, villages: worstVillages, action: s.action };
  });

  return {
    generated_at: new Date().toISOString(),
    scoring_version: S.SCORING_VERSION,
    villages: villages.sort((a, b) => (b.pct || 0) - (a.pct || 0)),
    matches: matches.slice(0, 12),
    totals,
    actions,
    thresholds: {
      flag_dimension: S.FLAG_THRESHOLD,
      signal_bands: SEVERITY.map(s => ({ level: s.level, min_share: s.min })),
      showcase_dimension: SHOWCASE_DIM,
      match_gap: MATCH_GAP,
      min_village_sample: `max(30% of households, ${S.MIN_SAMPLE_ABS})`,
    },
    signal_catalogue: SIGNALS.map(s => ({ id: s.id, label: s.label, dim: s.dim, action: s.action })),
  };
}

module.exports = { buildInsights, signalShares, SIGNALS, SIGNAL_BY_ID, severityFor };
