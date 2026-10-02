/**
 * Insights rules engine. No machine learning and no language model: every output is a
 * plain consequence of the answers and the fixed thresholds below, so any number can be
 * checked by hand.
 *
 *   SIGNAL    a yes/no test on one household's answers ("no bank account")
 *   FLAG      a dimension below 43, or a signal affecting a large share of households
 *   SHOWCASE  something notably good in a village, worth copying elsewhere
 *   MATCH     a village with a problem paired with a village that has largely solved it
 *   ACTION    signals ranked by how many households they affect, with the villages named
 */

import { countChoices, CRITICAL_BELOW, FLAG_BELOW, scoreGroup, type Answers, type HouseholdScore } from './scoring';
import { DIMENSIONS, type DimensionId } from './questionnaire';

export interface Signal {
  id: string;
  dim: DimensionId;
  label: string;
  test: (a: Answers) => boolean;
  action: string;
}

const isIn = (v: unknown, list: string[]) => list.includes(String(v));

export const SIGNALS: Signal[] = [
  { id: 'water_unsafe', dim: 'env', label: 'Drinking water not safe as it is', test: a => isIn(a.B10, ['needs_treatment', 'occasional', 'unsafe']), action: 'Test the sources, then prioritise treatment or a protected source.' },
  { id: 'water_scarce', dim: 'env', label: 'Water scarce 4 months or more', test: a => isIn(a.E1, ['scarce_4_6', 'scarce_7_plus', 'severe']), action: 'Storage capacity and ice-stupa or snowmelt harvesting are the usual first steps.' },
  { id: 'no_adaptation', dim: 'env', label: 'No climate or water adaptation measure', test: a => Array.isArray(a.E6) && countChoices(a.E6) === 0, action: 'A village-level demonstration of storage, greenhouse or trombe wall.' },
  { id: 'dirty_fuel', dim: 'env', label: 'Main fuel is dung or kerosene', test: a => isIn(a.E5, ['dung', 'kerosene']), action: 'Indoor air and fuel cost both improve with LPG or solar; check scheme eligibility.' },
  { id: 'open_waste', dim: 'env', label: 'Waste burned or dumped in the open', test: a => isIn(a.E4, ['burned', 'dumping']), action: 'A collection point and segregation; tourist-season volumes need separate handling.' },

  { id: 'healthcare_far', dim: 'phy', label: 'Nearest health facility beyond 10 km', test: a => isIn(a.B4, ['11_20', 'over_20']), action: 'Mobile health camp scheduling, or a trained village health worker.' },
  { id: 'winter_cutoff', dim: 'phy', label: 'Could not reach care last year', test: a => isIn(a.B5, ['once', 'more']), action: 'Winter medicine stocking and an evacuation plan before the passes close.' },
  { id: 'chronic_unmanaged', dim: 'phy', label: 'Chronic illness not managed', test: a => a.B2 === 'unmanaged', action: 'Medicine supply and follow-up; check what is unavailable locally.' },
  { id: 'altitude_frequent', dim: 'phy', label: 'Frequent altitude symptoms', test: a => a.B3 === 'frequently', action: 'Screening at the next health camp; look for a pattern by altitude and age.' },
  { id: 'no_toilet', dim: 'phy', label: 'No toilet, or no proper disposal', test: a => isIn(a.B8, ['none', 'no_disposal']), action: 'Dry-compost toilets count as adequate; this signal leaves them out.' },

  { id: 'income_insufficient', dim: 'fin', label: 'Income does not cover the year', test: a => a.F2 === 'no', action: 'Size the gap before designing support.' },
  { id: 'income_one_season', dim: 'fin', label: 'Income earned in one season only', test: a => a.F6 === 'one', action: 'Off-season work or storage-based income smooths the year.' },
  { id: 'no_savings', dim: 'fin', label: 'No savings or assets, or in debt', test: a => a.F3 === 'none', action: 'SHG membership and a first savings product; debt needs separate handling.' },
  { id: 'no_bank', dim: 'fin', label: 'No bank account', test: a => a.F10 === 'no', action: 'Blocks most government transfers — usually the cheapest thing to fix.' },
  { id: 'scheme_unaware', dim: 'fin', label: 'Unaware of livelihood schemes', test: a => a.F9 === 'not_aware', action: 'A scheme camp in the village; awareness is the constraint, not eligibility.' },
  { id: 'climate_shock', dim: 'fin', label: 'Extreme-weather damage in the last 5 years', test: a => isIn(a.F7, ['once', 'more']), action: 'Livestock and crop insurance uptake; check what was damaged.' },

  { id: 'emotional_challenges', dim: 'emo', label: 'Facing emotional challenges', test: a => a.C1 === 'challenges', action: 'Sensitive: report at village level only, and pair with support available.' },
  { id: 'no_support', dim: 'emo', label: 'No one to turn to for support', test: a => Array.isArray(a.C2) && countChoices(a.C2) === 0 && !isIn(a.C2, ['PNA']), action: 'Isolation risk, sharpest among elderly households and in winter.' },
  { id: 'high_stress', dim: 'emo', label: 'High stress, hard to recover', test: a => a.C3 === 'high', action: 'Look at what goes with it: income seasonality, isolation, health access.' },
  { id: 'winter_isolation', dim: 'emo', label: 'Feels cut off in winter', test: a => isIn(a.C6, ['4', '5']), action: 'Connectivity and winter activities both matter.' },

  { id: 'no_institution', dim: 'soc', label: 'No functioning village institution', test: a => Array.isArray(a.D6) && countChoices(a.D6) === 0, action: 'Nothing to build community action on — usually the first thing to rebuild.' },
  { id: 'exclusion', dim: 'soc', label: 'Women or marginalised groups excluded', test: a => a.D4 === 'exclusion', action: 'Check who actually attends meetings, not only who is invited.' },
  { id: 'youth_left', dim: 'soc', label: 'Young people left for work or study', test: a => a.D8 === 'yes', action: 'Not automatically bad — ask whether it reads as opportunity or loss.' },

  { id: 'digital_excluded', dim: 'int', label: 'Cannot use a phone or internet for information', test: a => a.G2 === 'no', action: 'Limits every digital service, including this one reaching them.' },
  { id: 'education_barriers', dim: 'int', label: 'Two or more barriers to education', test: a => countChoices(a.G5) >= 2, action: 'Distance, cost, winter closure and teacher absence need different responses.' },
  { id: 'unaware_climate', dim: 'int', label: 'Unaware of climate change impact', test: a => a.G4 === 'not', action: 'Matters here because adaptation depends on it.' },

  { id: 'worship_far', dim: 'spi', label: 'Place of worship far or seasonal only', test: a => isIn(a.H5, ['beyond_10', 'seasonal']), action: 'Access is partly a winter-road question.' },
  { id: 'culture_loss', dim: 'spi', label: 'Sees young people losing language and practices', test: a => isIn(a.H7, ['4', '5']), action: 'Pairs with youth migration; a cultural programme is the usual response.' },
];

export const SIGNAL_BY_ID = Object.fromEntries(SIGNALS.map(s => [s.id, s]));

/** Share bands, the same for every signal. */
export const SEVERITY = [
  { min: 0.5, level: 'critical' as const, words: 'more than half of households' },
  { min: 0.3, level: 'serious' as const, words: 'about a third of households or more' },
  { min: 0.15, level: 'watch' as const, words: 'a noticeable minority' },
];
export type Severity = (typeof SEVERITY)[number]['level'];
export const severityFor = (share: number | null) => (share === null ? null : SEVERITY.find(s => share >= s.min) ?? null);

export const SHOWCASE_DIMENSION = 71;   // band 6 and above
export const SHOWCASE_SIGNAL_SHARE = 0.05;
export const MATCH_GAP = 0.2;
const MIN_HOUSEHOLDS_FOR_COMPARISON = 10;

export interface SignalShare { id: string; label: string; dim: DimensionId; action: string; households: number; of: number; share: number | null }

export function signalShares(answerSets: Answers[]): Record<string, SignalShare> {
  const out: Record<string, SignalShare> = {};
  for (const s of SIGNALS) {
    let hits = 0;
    for (const a of answerSets) { try { if (s.test(a)) hits++; } catch { /* malformed answer: not a hit */ } }
    out[s.id] = { id: s.id, label: s.label, dim: s.dim, action: s.action, households: hits, of: answerSets.length,
      share: answerSets.length ? Math.round((hits / answerSets.length) * 1000) / 1000 : null };
  }
  return out;
}

export interface InsightInputVillage {
  id: number;
  name: string;
  district: string;
  households: number;
  surveys: { answers: Answers; score: HouseholdScore | null }[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildInsights(input: InsightInputVillage[]) {
  const villages = input.filter(v => v.surveys.length).map(v => {
    const group = scoreGroup(v.surveys.map(s => s.score), { households: v.households });
    const shares = signalShares(v.surveys.map(s => s.answers));
    const dimFlags = DIMENSIONS.filter(d => group.dims[d.id] !== null && group.dims[d.id]! < FLAG_BELOW).map(d => ({
      type: 'dimension' as const, dim: d.id, name: d.name, score: group.dims[d.id]!,
      level: (group.dims[d.id]! < CRITICAL_BELOW ? 'critical' : 'serious') as Severity,
      why: `${d.name} averages ${Math.round(group.dims[d.id]!)} out of 100, below the ${FLAG_BELOW} "Basic" line.`,
    }));
    const signalFlags = Object.values(shares)
      .map(s => ({ s, sev: severityFor(s.share) }))
      .filter(x => x.sev)
      .sort((a, b) => b.s.share! - a.s.share!)
      .map(({ s, sev }) => ({
        type: 'signal' as const, id: s.id, dim: s.dim, name: s.label, share: s.share!, households: s.households, of: s.of,
        level: sev!.level, why: `${s.households} of ${s.of} households (${pct(s.share!)}) — ${sev!.words}.`, action: s.action,
      }));
    const showcases = [
      ...DIMENSIONS.filter(d => group.dims[d.id] !== null && group.dims[d.id]! >= SHOWCASE_DIMENSION).map(d => ({
        type: 'dimension' as const, dim: d.id, name: d.name, why: `${d.name} at ${Math.round(group.dims[d.id]!)} — band 6 or above.` })),
      ...Object.values(shares).filter(s => s.share !== null && s.share <= SHOWCASE_SIGNAL_SHARE && s.of >= MIN_HOUSEHOLDS_FOR_COMPARISON).map(s => ({
        type: 'signal' as const, dim: s.dim, name: s.label, why: `Rare here — only ${s.households} of ${s.of} households.` })),
    ];
    return { id: v.id, name: v.name, district: v.district, ...group, shares, flags: [...dimFlags, ...signalFlags], showcases };
  });

  const matches = SIGNALS.flatMap(s => {
    const withData = villages.filter(v => v.shares[s.id].share !== null && v.n >= MIN_HOUSEHOLDS_FOR_COMPARISON);
    if (withData.length < 2) return [];
    const sorted = [...withData].sort((a, b) => b.shares[s.id].share! - a.shares[s.id].share!);
    const worst = sorted[0], best = sorted[sorted.length - 1];
    const gap = worst.shares[s.id].share! - best.shares[s.id].share!;
    if (gap < MATCH_GAP || !severityFor(worst.shares[s.id].share)) return [];
    return [{
      signal: s.id, name: s.label, dim: s.dim, gap: Math.round(gap * 1000) / 1000, action: s.action,
      needs: { id: worst.id, name: worst.name, share: worst.shares[s.id].share! },
      has: { id: best.id, name: best.name, share: best.shares[s.id].share! },
      why: `${worst.name}: ${pct(worst.shares[s.id].share!)} of households. ${best.name}: ${pct(best.shares[s.id].share!)}. Worth asking what ${best.name} does differently.`,
    }];
  }).sort((a, b) => b.gap - a.gap).slice(0, 12);

  const overall = signalShares(input.flatMap(v => v.surveys.map(s => s.answers)));
  const totals = Object.values(overall).filter(s => s.share).sort((a, b) => b.share! - a.share!);
  const actions = totals.filter(s => severityFor(s.share)).slice(0, 10).map(s => ({
    ...s, level: severityFor(s.share)!.level,
    villages: villages.filter(v => severityFor(v.shares[s.id].share))
      .sort((a, b) => b.shares[s.id].share! - a.shares[s.id].share!).slice(0, 4)
      .map(v => ({ id: v.id, name: v.name, share: v.shares[s.id].share! })),
  }));

  return {
    villages: villages.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(({ shares, ...v }) => v),
    matches, totals, actions,
    thresholds: {
      flagBelow: FLAG_BELOW, criticalBelow: CRITICAL_BELOW, showcaseAt: SHOWCASE_DIMENSION, matchGap: MATCH_GAP,
      severity: SEVERITY.map(s => ({ level: s.level, minShare: s.min, words: s.words })),
    },
  };
}

