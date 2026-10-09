import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRICTS, OFFICIAL_VILLAGES, SECTIONS, ITEMS, SCORED_ITEMS, DIM_ITEMS, DIMENSIONS, BANDS,
  scoreHousehold, scoreGroup, scoreQuestion, bmiPoints, bandFor, householdCode, HOUSEHOLD_CODE_PATTERN,
  SIGNALS, computeDashboard,
} from './index';

/* ------------------------------------------------------------ districts */
test('every district has exactly the villages in the 27 April 2026 notification', () => {
  for (const d of DISTRICTS) {
    const official = OFFICIAL_VILLAGES.filter(v => v.district === d.id && !v.extra);
    assert.equal(official.length, d.gazetteVillages, d.name);
  }
  assert.equal(OFFICIAL_VILLAGES.filter(v => !v.extra).length, 250);
  assert.deepEqual(OFFICIAL_VILLAGES.filter(v => v.extra).map(v => v.name), ['Sankoo']);
});

test('district letters are unique; village codes are unique inside each district', () => {
  assert.equal(new Set(DISTRICTS.map(d => d.letter)).size, DISTRICTS.length);
  for (const d of DISTRICTS) {
    const codes = OFFICIAL_VILLAGES.filter(v => v.district === d.id).map(v => v.code);
    assert.equal(new Set(codes).size, codes.length, d.name);
    for (const c of codes) assert.match(c, /^[A-Z]{3}$/);
  }
});

test('villages moved by the notification sit in their new district', () => {
  const where = (name: string, block?: string) =>
    OFFICIAL_VILLAGES.find(v => v.name === name && (!block || v.block === block))?.district;
  assert.equal(where('Alchi'), 'sham');
  assert.equal(where('Garkone'), 'sham');            // was Kargil district
  assert.equal(where('Rangdom'), 'zanskar');         // was Kargil district
  assert.equal(where('Durbuk'), 'changthang');
  assert.equal(where('Disket'), 'nubra');
  assert.equal(where('Drass'), 'drass');
  assert.equal(where('Lingshet'), 'leh');
  assert.equal(where('Choskore', 'Kargil'), 'kargil');
  assert.equal(where('Choskore', 'Taisuru'), 'kargil');
});

test('household codes read DISTRICT_VILLAGE_NUMBER', () => {
  const chl = OFFICIAL_VILLAGES.find(v => v.name === 'Cholglamsar')!;
  assert.equal(householdCode(chl.district, chl.code, 1), 'L_CHL_001');
  assert.equal(householdCode('zanskar', 'PDM', 1234), 'Z_PDM_1234');
  assert.match(householdCode('drass', 'DRS', 7), HOUSEHOLD_CODE_PATTERN);
});

/* --------------------------------------------------------- questionnaire */
test('every scored answer has fixed points between 0 and 100', () => {
  for (const item of SCORED_ITEMS) {
    if (item.bmi) continue;
    if (item.countPoints) { for (const p of item.countPoints) assert.ok(p >= 0 && p <= 100, item.id); continue; }
    const scoredOpts = item.options!.filter(o => !o.neutral);
    assert.ok(scoredOpts.length > 1, item.id);
    for (const o of scoredOpts) assert.ok(typeof o.points === 'number' && o.points >= 0 && o.points <= 100, `${item.id} ${o.v}`);
  }
});

test('question ids are unique and every dimension has questions', () => {
  const ids = SECTIONS.flatMap(s => s.items.map(i => i.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DIMENSIONS) assert.ok(DIM_ITEMS[d.id].length >= 6, d.id);
});

/* --------------------------------------------------------------- scoring */
test('agreement scale: fixed 0 / 25 / 50 / 75 / 100, reversed where agreeing is bad', () => {
  assert.deepEqual(['1', '2', '3', '4', '5'].map(v => scoreQuestion(ITEMS.F8, { F8: v })!.points), [0, 25, 50, 75, 100]);
  assert.deepEqual(['1', '2', '3', '4', '5'].map(v => scoreQuestion(ITEMS.C6, { C6: v })!.points), [100, 75, 50, 25, 0]);
  assert.deepEqual(['1', '2', '3', '4', '5'].map(v => scoreQuestion(ITEMS.H7, { H7: v })!.points), [100, 75, 50, 25, 0]);
});

test('count questions use their fixed table, "or more" at the end', () => {
  assert.equal(scoreQuestion(ITEMS.C2, { C2: ['none'] })!.points, 0);
  assert.equal(scoreQuestion(ITEMS.C2, { C2: ['family'] })!.points, 50);
  assert.equal(scoreQuestion(ITEMS.C2, { C2: ['family', 'religious', 'coping', 'professional'] })!.points, 100);
  assert.equal(scoreQuestion(ITEMS.F4, { F4: 2 })!.points, 75);
  assert.equal(scoreQuestion(ITEMS.G5, { G5: ['none'] })!.points, 100);
  assert.equal(scoreQuestion(ITEMS.G5, { G5: ['cost', 'winter'] })!.points, 33);
});

test("don't know / prefer not to answer = 50; skipped = left out", () => {
  assert.deepEqual(scoreQuestion(ITEMS.F1, { F1: 'PNA' })!.points, 50);
  assert.equal(scoreQuestion(ITEMS.F1, {}), null);
});

test('BMI uses the fixed Asian table', () => {
  assert.equal(bmiPoints(170, 63)!.points, 100);   // 21.8
  assert.equal(bmiPoints(170, 70)!.points, 70);    // 24.2
  assert.equal(bmiPoints(170, 80)!.points, 40);    // 27.7
  assert.equal(bmiPoints(170, 100)!.points, 0);    // 34.6
});

test('bands: a score belongs to the band whose range contains it', () => {
  assert.equal(bandFor(0)!.band, 1);
  assert.equal(bandFor(42.99)!.band, 3);
  assert.equal(bandFor(43)!.band, 4);
  assert.equal(bandFor(70.999)!.band, 5);
  assert.equal(bandFor(100)!.band, 7);
  assert.equal(BANDS.length, 7);
});

/** A household that answers every scored question with the option worth `pts` (or the closest). */
function household(target: number) {
  const a: Record<string, unknown> = { B1: { height_cm: 165, weight_kg: 58 } };
  for (const item of SCORED_ITEMS) {
    if (item.bmi) continue;
    if (item.countPoints) {
      const idx = item.countPoints.reduce((best, p, i) => Math.abs(p - target) < Math.abs(item.countPoints![best] - target) ? i : best, 0);
      a[item.id] = item.type === 'number' ? idx : item.options!.filter(o => !o.neutral && o.v !== 'none').slice(0, idx).map(o => o.v);
      if (item.type !== 'number' && idx === 0) a[item.id] = ['none'];
      continue;
    }
    const opts = item.options!.filter(o => typeof o.points === 'number');
    a[item.id] = opts.reduce((best, o) => Math.abs(o.points! - target) < Math.abs(best.points! - target) ? o : best).v;
  }
  return a;
}

test('dimension = average of its questions; household = average of dimensions', () => {
  const s = scoreHousehold(household(100));
  for (const d of DIMENSIONS) assert.equal(s.dims[d.id].score, 100, d.id);
  assert.equal(s.score, 100);
  assert.equal(s.band, 7);

  const fin = { F1: '1_3', F2: 'basics', F3: 'none', F4: 1, F6: 'two', F7: 'once', F8: '4', F9: 'aware', F10: 'yes' };
  // 25 + 50 + 0 + 50 + 50 + 50 + 75 + 50 + 100 = 450 → 450 / 9 = 50
  assert.equal(scoreHousehold(fin).dims.fin.score, 50);
});

test('a dimension needs half its questions; a household needs 5 of 7 dimensions', () => {
  const partial = scoreHousehold({ F1: 'gt10', F2: 'surplus', F3: 'yes', F10: 'yes' });  // 4 of 9 financial
  assert.equal(partial.dims.fin.counted, false);
  assert.equal(partial.score, null);
  const full = household(50);
  for (const id of DIM_ITEMS.spi.map(i => i.id)) delete full[id];
  for (const id of DIM_ITEMS.int.map(i => i.id)) delete full[id];
  const s = scoreHousehold(full);
  assert.equal(s.countedDimensions, 5);
  assert.notEqual(s.score, null);
});

test('a group score is the average of household scores', () => {
  const g = scoreGroup([scoreHousehold(household(100)), scoreHousehold(household(0))], { households: 50 });
  assert.equal(g.n, 2);
  assert.ok(g.score! > 40 && g.score! < 60);
  assert.equal(g.coverage!.required, 15);  // 30% of 50
  assert.equal(g.coverage!.reliable, false);
});

/* --------------------------------------------------------------- signals */
test('every signal only refers to answers that exist', () => {
  const src = SIGNALS.map(s => s.test.toString()).join('\n');
  let checked = 0;
  // matches  a.B10 === "x"  and  isIn(a.B10, ["x", "y"])  in either quote style
  for (const [, item, list] of src.matchAll(/a\.([A-Z]\d+a?)\s*(?:===|,)\s*(\[[^\]]*\]|["'][^"']*["'])/g)) {
    const vals = [...list.matchAll(/["']([^"']*)["']/g)].map(m => m[1]);
    for (const v of vals) { assert.ok(ITEMS[item]?.options?.some(o => o.v === v), `${item} has no option ${v}`); checked++; }
  }
  assert.ok(checked > 30, `only ${checked} answer values checked`);
});

test('dashboard analytics run on an empty and a small set', () => {
  assert.equal(computeDashboard([], []).overall.n, 0);
  const rows = [0, 50, 100].map((t, i) => ({
    id: String(i), villageId: 1, village: 'Stok', district: 'leh', households: 20,
    submittedAt: '2026-09-01T10:00:00Z', durationMin: 25, status: 'approved',
    answers: { ...household(t), A6: i % 2 ? 'male' : 'female', A5: 30 + i * 15 }, score: scoreHousehold(household(t)),
  }));
  const d = computeDashboard(rows, [{ id: 1, name: 'Stok', district: 'leh', households: 20 }]);
  assert.equal(d.overall.n, 3);
  assert.equal(d.districts.find(x => x.id === 'leh')!.n, 3);
  assert.equal(d.groups.gender.length, 2);
  assert.equal(d.histogram.reduce((s, h) => s + h.count, 0), 3);
});

/* --------------------------------------------------------------- quality */
import { surveyIssues } from './index';

test('quality checks flag likely wrong or careless surveys, and nothing else', () => {
  // a realistic household: varied answers to the agreement questions
  const scaleIds = SECTIONS.flatMap(s => s.items).filter(i => i.type === 'scale').map(i => i.id);
  const good: Record<string, unknown> = { ...household(60), ...Object.fromEntries(scaleIds.map((id, i) => [id, String(2 + (i % 4))])) };
  const ok = surveyIssues({ answers: { ...good, A5: 40, A7: 5 }, score: scoreHousehold(good), durationMin: 25 });
  assert.deepEqual(ok, []);

  const ids = (a: Record<string, unknown>, minutes: number | null = 25) =>
    surveyIssues({ answers: a, score: scoreHousehold(a), durationMin: minutes }).map(i => i.id);
  assert.ok(ids(good, 6).includes('short'));
  assert.ok(ids({ A5: 40 }).includes('incomplete'));
  assert.ok(ids({ ...good, B1: { height_cm: 165, weight_kg: 580 } }).includes('bmi'));   // typed 580 for 58
  assert.ok(ids({ ...good, A5: 7 }).includes('age'));
  assert.ok(ids({ ...good, A7: 45 }).includes('household'));
  const allFives = Object.fromEntries(SECTIONS.flatMap(s => s.items).filter(i => i.type === 'scale').map(i => [i.id, '5']));
  assert.ok(ids({ ...good, ...allFives }).includes('same_answer'));
});

/* ----------------------------------------------------------------- phone */
import { normalizePhone, maskPhone } from './index';

test('phone numbers are stored in one form however they are typed', () => {
  for (const typed of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', '+919876543210']) {
    assert.equal(normalizePhone(typed), '+919876543210', typed);
  }
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('1234567890'), null);        // Indian mobiles start with 6–9
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(maskPhone('+919876543210'), '+91 ••••• 43210');
});

/* ------------------------------------------------------------ duplicates */
import { findDuplicates, nameKey } from './index';

test('duplicates: same village and round, same phone or same full head name', () => {
  assert.equal(nameKey("Tsering  Dolkar's household"), 'tsering dolkar');
  assert.equal(nameKey('Tsering household'), null);                 // one name is not enough
  const base = { villageId: 1, roundId: 1, headName: null, phone: null };
  const rows = [
    { ...base, id: 'a', householdId: 1, householdCode: 'L_CHL_001', headName: 'Tsering Dolkar', phone: '98765 43210' },
    { ...base, id: 'b', householdId: 2, householdCode: 'L_CHL_002', headName: 'tsering dolkar' },                  // same name
    { ...base, id: 'c', householdId: 3, householdCode: 'L_CHL_003', phone: '+919876543210' },                       // same phone
    { ...base, id: 'd', householdId: 4, householdCode: 'L_CHL_004', headName: 'Tsering Dolkar', villageId: 2 },    // other village
    { ...base, id: 'e', householdId: 1, householdCode: 'L_CHL_001', headName: 'Tsering Dolkar', roundId: 2 },      // next round: fine
    { ...base, id: 'f', householdId: 5, householdCode: 'L_CHL_005', headName: 'Tsering household' },
  ];
  const d = findDuplicates(rows);
  assert.match(d.get('a')!.map(i => i.label).join(' | '), /L_CHL_002.*same head/);
  assert.match(d.get('a')!.map(i => i.label).join(' | '), /L_CHL_003.*same phone/);
  assert.ok(d.get('b') && d.get('c'));
  assert.equal(d.get('d'), undefined);
  assert.equal(d.get('e'), undefined);
  assert.equal(d.get('f'), undefined);
});
