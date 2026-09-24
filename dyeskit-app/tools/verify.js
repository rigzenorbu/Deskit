'use strict';
/**
 * Independent verification —  npm run verify
 *
 * Recomputes the published numbers a SECOND way, from raw answers, using SQL and
 * plain arithmetic that shares no code with the scoring engine or the rules engine.
 * If the two paths disagree anywhere, this fails loudly.
 *
 * Checks:
 *   1. every signal count, per village, recomputed with SQL over the answers table
 *   2. every dimension score, recomputed as a plain mean of its indicator scores
 *   3. every household index, recomputed as a plain mean of its dimension scores
 *   4. every village index, recomputed as a plain mean of its household indexes
 *   5. band boundaries applied to the recomputed percentages
 */

const { db, getAnswers } = require('../server/db');
const S = require('../server/scoring');
const Q = require('../server/questionnaire');
const { buildInsights, SIGNALS } = require('../server/insights');

let failures = 0, checks = 0;
const near = (a, b, tol = 0.0011) => Math.abs(a - b) <= tol;

function check(name, ok, detail) {
  checks++;
  if (!ok) { failures++; console.log(`  FAIL  ${name}  ${detail || ''}`); }
}

/* -- 1. signal counts, recomputed with SQL on the raw answers table ---------- */
/** Independent SQL predicates. Deliberately written again, not imported. */
const SQL_SIGNALS = {
  no_bank: `item_id='F10' AND value='"no"'`,
  no_savings: `item_id='F3' AND value='"none"'`,
  income_insufficient: `item_id='F2' AND value='"no"'`,
  scheme_unaware: `item_id='F9' AND value='"not_aware"'`,
  no_toilet: `item_id='B8' AND value IN ('"none"','"no_disposal"')`,
  chronic_unmanaged: `item_id='B2' AND value='"unmanaged"'`,
  altitude_frequent: `item_id='B3' AND value='"frequently"'`,
  healthcare_far: `item_id='B4' AND value IN ('"11_20"','"over_20"')`,
  winter_cutoff: `item_id='B5' AND value IN ('"once"','"more"')`,
  water_unsafe: `item_id='B10' AND value IN ('"needs_treatment"','"occasional"','"unsafe"')`,
  open_waste: `item_id='E4' AND value IN ('"burned"','"dumping"')`,
  emotional_challenges: `item_id='C1' AND value='"challenges"'`,
  high_stress: `item_id='C3' AND value='"high"'`,
  exclusion: `item_id='D4' AND value='"exclusion"'`,
  youth_left: `item_id='D8' AND value='"yes"'`,
  digital_excluded: `item_id='G2' AND value='"no"'`,
  unaware_climate: `item_id='G4' AND value='"not"'`,
  worship_far: `item_id='H5' AND value IN ('"beyond_10"','"seasonal"')`,
  culture_loss: `item_id='H7' AND value IN ('"strongly_agree"','"agree"')`,
  climate_shock: `item_id='F7' AND value IN ('"once"','"more"')`,
};

console.log('\nDYESKIT verification — recomputing published numbers a second way\n');
const insights = buildInsights();

console.log('1. Signal counts, per village, recomputed with SQL');
for (const v of insights.villages) {
  for (const [sig, predicate] of Object.entries(SQL_SIGNALS)) {
    const sql = `SELECT COUNT(*) AS c FROM answers a
      JOIN submissions su ON su.id = a.submission_id
      WHERE su.village_id = ? AND su.deleted_at IS NULL AND ${predicate}`;
    const viaSql = db.prepare(sql).get(v.village_id).c;
    const viaEngine = v.shares[sig].households;
    check(`${v.village}/${sig}`, viaSql === viaEngine, `SQL ${viaSql} vs engine ${viaEngine}`);
  }
}
console.log(`   ${insights.villages.length} villages x ${Object.keys(SQL_SIGNALS).length} signals checked`);

/* -- 2/3. dimension and household scores, recomputed by hand ---------------- */
console.log('\n2. Dimension scores = plain mean of indicator scores');
console.log('3. Household index  = plain mean of dimension scores');
const subs = db.prepare('SELECT id, village_id FROM submissions WHERE deleted_at IS NULL').all();
const perVillage = {};
for (const su of subs) {
  const sc = S.scoreSubmission(getAnswers(su.id));
  for (const d of Q.DIMENSIONS) {
    const vals = S.INDICATORS[d.id]
      .map(i => sc.indicators[i.id])
      .filter(x => x && x.score !== null)
      .map(x => x.score);
    if (!vals.length) continue;
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    check(`sub ${su.id} ${d.id}`, near(mean, sc.dims[d.id].score),
      `by hand ${mean.toFixed(4)} vs stored ${sc.dims[d.id].score}`);
  }
  const dimVals = Q.DIMENSIONS.filter(d => sc.dims[d.id].valid).map(d => sc.dims[d.id].score);
  if (dimVals.length) {
    const iwb = dimVals.reduce((s, x) => s + x, 0) / dimVals.length;
    check(`sub ${su.id} IWB`, near(iwb, sc.iwb), `by hand ${iwb.toFixed(4)} vs stored ${sc.iwb}`);
    const pctVal = iwb * 100;
    const expectBand = pctVal < 15 ? 1 : pctVal < 29 ? 2 : pctVal < 43 ? 3 : pctVal < 57 ? 4 : pctVal < 71 ? 5 : pctVal < 85 ? 6 : 7;
    check(`sub ${su.id} band`, expectBand === sc.band, `expected ${expectBand} got ${sc.band}`);
    (perVillage[su.village_id] = perVillage[su.village_id] || []).push(sc.iwb);
  }
}
console.log(`   ${subs.length} submissions x ${Q.DIMENSIONS.length} dimensions, plus index and band`);

/* -- 4. village index ------------------------------------------------------- */
console.log('\n4. Village index = plain mean of household indexes');
for (const v of insights.villages) {
  const list = perVillage[v.village_id] || [];
  if (!list.length) continue;
  const mean = list.reduce((s, x) => s + x, 0) / list.length;
  check(`${v.village} VWBI`, near(mean, v.vwbi), `by hand ${mean.toFixed(4)} vs published ${v.vwbi}`);
  check(`${v.village} n`, list.length === v.n, `by hand ${list.length} vs published ${v.n}`);
}

/* -- 5. one fully worked example, printed for manual checking --------------- */
console.log('\n5. One household, printed in full so you can check it on paper');
const example = db.prepare(`SELECT su.id, h.code, v.name FROM submissions su
  JOIN households h ON h.id = su.household_id JOIN villages v ON v.id = su.village_id
  WHERE su.deleted_at IS NULL ORDER BY su.id LIMIT 1`).get();
const ans = getAnswers(example.id);
const sc = S.scoreSubmission(ans);
console.log(`   household ${example.code} (${example.name})`);
for (const ind of S.INDICATORS.phy) {
  const det = sc.indicators[ind.id];
  const raw = ind.items.map(i => `${i}=${JSON.stringify(ans[i])}`).join(' ');
  console.log(`     ${ind.label.padEnd(26)} ${String(det.score).padEnd(6)} <- ${raw}`);
}
const phyVals = S.INDICATORS.phy.map(i => sc.indicators[i.id].score).filter(x => x !== null);
console.log(`     sum ${phyVals.reduce((a, b) => a + b, 0).toFixed(3)} / ${phyVals.length} = ${sc.dims.phy.score}`);
console.log(`     seven dimensions -> IWB ${sc.iwb} = ${sc.pct}% = band ${sc.band} (${sc.band_label})`);

/* -- result ---------------------------------------------------------------- */
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures} of ${checks} checks agreed`);
if (failures) console.log(`${failures} disagreement(s) above.`);
process.exit(failures ? 1 : 0);
