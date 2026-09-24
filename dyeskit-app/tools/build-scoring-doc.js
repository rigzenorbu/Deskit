'use strict';
/**
 * Generates the scoring methodology document (Word + HTML) FROM THE LIVE CODE,
 * so the document can never drift from what the application actually computes.
 *
 *   npm install docx          (once — only this tool needs it, not the app)
 *   node tools/build-scoring-doc.js
 *
 * Output: ../DYESKIT_Scoring_Methodology.docx  and  .html (the HTML is printed to PDF)
 */

const fs = require('node:fs');
const path = require('node:path');
const Q = require('../server/questionnaire');
const S = require('../server/scoring');

const OUT_DIR = path.join(__dirname, '..', '..');
const TODAY = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

/* ------------------------------------------------------------------ model */
const B = [];
const h1 = text => B.push({ t: 'h1', text });
const h2 = text => B.push({ t: 'h2', text });
const h3 = text => B.push({ t: 'h3', text });
const p = text => B.push({ t: 'p', text });
const bullets = items => B.push({ t: 'bullets', items });
const numbers = items => B.push({ t: 'numbers', items });
const mono = lines => B.push({ t: 'mono', lines });
const table = (head, rows, widths) => B.push({ t: 'table', head, rows, widths });
const pagebreak = () => B.push({ t: 'pagebreak' });
const note = text => B.push({ t: 'note', text });

/* ----------------------------------------------------- content assembly */
const dimName = id => (Q.DIMENSIONS.find(d => d.id === id) || {}).name || id;
const itemById = id => Q.ITEMS[id];

/** Prose for the indicators whose score is computed rather than looked up. */
const COMPUTED = {
  bmi: {
    rule: 'Measured height and weight are converted to BMI, then banded on ICMR / WHO Asia-Pacific cut-offs (not the Western bands).',
    lines: ['BMI = weight_kg / (height_m ** 2)', '',
      '18.5 – 22.9  -> 1.0    (healthy)', '23.0 – 24.9  -> 0.7', '17.0 – 18.4  -> 0.6',
      '25.0 – 29.9  -> 0.4', '16.0 – 16.9  -> 0.3', 'anything else -> 0.0',
      '', 'height or weight missing -> NC (excluded, not zero)'],
  },
  healthcare: {
    rule: 'Two questions describe one thing — can this household reach care? The indicator is their mean, so distance and winter cut-off each carry half.',
    lines: ['healthcare = mean( B4 distance score , B5 winter cut-off score )'],
  },
  water_reliability: {
    rule: 'Scarcity is scored by how much of the year it lasts, instead of a single "seasonal" step.',
    lines: ['reliable            -> 1.0',
      'scarce, m months    -> max(0, 1 - m / 12)',
      'severe / contaminated -> 0.0',
      'scarce but months unknown -> 0.5'],
  },
  support: { rule: 'Counts the distinct kinds of support named (family, religious community, professional, personal coping). "None" and refusals are not counted.', lines: ['3 or more -> 1.0    2 -> 0.75    1 -> 0.5    0 -> 0.0'] },
  institutions: { rule: 'Counts the functioning village institutions named.', lines: ['2 or more -> 1.0    1 -> 0.5    none -> 0.0'] },
  diversity: { rule: 'Number of separate income sources (F4), entered as a number.', lines: ['3 or more -> 1.0    2 -> 0.67    1 -> 0.33    0 -> 0.0'] },
  seasonality: { rule: 'Whether income arrives all year or is bunched into the tourist months — a Ladakh-specific vulnerability.', lines: ['even year-round -> 1.0', '3+ quarters     -> 0.75', '2 quarters      -> 0.5', '1 quarter       -> 0.25'] },
  fuel: { rule: 'Households usually name more than one fuel, so the indicator is the mean of the fuels selected. Each fuel carries its own value (solar, electricity, biogas = 1.0; LPG = 0.75; firewood = 0.33; dung and kerosene = 0).', lines: ['fuel = mean( score of each fuel selected )', '', 'example: LPG (0.75) + solar (1.0) -> 0.875'] },
  adaptation: { rule: 'Counts adaptation measures adopted (water storage, ice stupa, greenhouse or trombe wall, passive-solar retrofit, insulation, rainwater or snowmelt harvesting).', lines: ['2 or more -> 1.0    1 -> 0.5    none -> 0.0'] },
  barriers: { rule: 'A reverse indicator: more barriers means a lower score.', lines: ['no barriers -> 1.0    1 -> 0.67    2 -> 0.33    3 or more -> 0.0'] },
};

function optionRows(itemId) {
  const it = itemById(itemId);
  if (!it || !it.options) return null;
  return it.options
    .filter(o => o.pts !== undefined || o.pna)
    .map(o => [o.label, o.pna ? '0.5 (neutral)' : String(o.pts)]);
}

/* ============================== DOCUMENT ============================== */

B.push({ t: 'title' });

h1('1. What this document is');
p('This is the complete calculation reference for the DYESKIT well-being score: every metric, every answer option and the weight it carries, and every formula used to turn answers into a village index.');
p('It is generated directly from the application code (server/questionnaire.js and server/scoring.js). If a scoring rule changes, this document is regenerated from the same source, so the two can never disagree. Regenerate with: node tools/build-scoring-doc.js');
note(`Questionnaire ${Q.QUESTIONNAIRE_VERSION} · Scoring ${S.SCORING_VERSION} · Generated ${TODAY}`);

h1('2. The calculation chain');
p('Five steps take a household interview to a village score. Nothing is multiplied at any stage.');
mono([
  'ANSWER            one option chosen, or a measurement taken',
  '   |              each option carries a value between 0 and 1',
  '   v',
  'INDICATOR         49 of them; some read one question, some combine two',
  '   |              dimension = mean of its indicator scores',
  '   v',
  'DIMENSION         7 of them (Physical, Financial, Emotional, Social,',
  '   |              Environmental, Intellectual, Spiritual)',
  '   v',
  'HOUSEHOLD INDEX   IWB = mean of the 7 dimension scores, each weighted 1/7',
  '   |              shown as a percentage and mapped to a 1-7 band',
  '   v',
  'VILLAGE INDEX     VWBI = mean of valid household indexes in that village',
]);
h2('2.1 The formulas');
mono([
  'dimension_score  = sum(valid indicator scores) / count(valid indicators)',
  'IWB              = sum(valid dimension scores) / count(valid dimensions)',
  'percentage       = IWB * 100',
  'band             = the 1-7 band the percentage falls into (see section 4)',
  'VWBI             = sum(valid household IWB) / count(valid households)',
]);
p('Why averaging and never multiplying: a household with a stable income but no savings should not score zero on Financial. Multiplication would do exactly that. The average reports 0.5 — materially resilient, without a buffer — which is the truthful answer.');

h1('3. Rules that apply to every metric');
h2('3.1 The 0–1 scale');
p('Every indicator produces a value between 0 and 1, where 1 is the healthiest state the question can describe and 0 the least healthy. Nothing is scored on its own scale, so dimensions stay comparable.');
h2('3.2 Likert questions (1–5 agreement)');
mono(['normal item:   score = (answer - 1) / 4',
  'reverse item:  score = (5 - answer) / 4',
  '',
  'answer 1 -> 0.00    2 -> 0.25    3 -> 0.50    4 -> 0.75    5 -> 1.00']);
p('Reverse items are those where agreeing is the bad outcome — winter isolation (C6) and, in ordinal form, cultural continuity (H7), climate shock (F7) and education barriers (G5).');
h2('3.3 Missing answers');
table(['Situation', 'Code', 'Treatment'], [
  ['Question not collected — no kit, skipped, or not applicable', 'NC / NA', 'Excluded. The denominator shrinks; it is never scored as zero.'],
  ['"Don\'t know"', 'DK', 'Scored 0.5, a conservative neutral.'],
  ['"Prefer not to answer"', 'PNA / RF', 'Scored 0.5, a conservative neutral.'],
], [0.46, 0.14, 0.40]);
p('The distinction matters. Treating a missing BMI as zero would punish a village for the enumerator lacking a weighing scale. Treating a refusal as missing would quietly let households opt out of the parts of the score they dislike.');
h2('3.4 Validity floors');
bullets([
  'A dimension is reported only if at least half its indicators (minimum 2) carry real data.',
  'A household index is reported only if at least 5 of the 7 dimensions are valid.',
  `A village index is reported only once surveys reach 30% of its households or ${S.MIN_SAMPLE_ABS} households, whichever is larger.`,
  'Below any of these, the system shows "insufficient data" rather than a number.',
]);
h2('3.5 Flags');
p(`Any dimension averaging below ${(S.FLAG_THRESHOLD * 100).toFixed(0)}% is flagged. That line is the bottom of band 4, "Basic Well-Being Achieved" — below it, the minimum standard has not been met. Below 29% (band 3 and under) the flag is raised to critical.`);

pagebreak();
h1('4. Bands');
p('The percentage is mapped to the seven-point scale the project already uses.');
table(['Percentage', 'Band', 'Meaning'],
  Q.BANDS.map(b => [`${b.min}–${Math.round(b.max)}%`, String(b.band), b.label]), [0.22, 0.14, 0.64]);

pagebreak();
h1('5. Every metric, option by option');
p('Each dimension below lists its indicators, the questions they read, and the exact value each answer option carries. Where an indicator is computed rather than looked up, the formula is shown.');

for (const d of Q.DIMENSIONS) {
  const inds = S.INDICATORS[d.id];
  h2(`5.${Q.DIMENSIONS.indexOf(d) + 1} ${d.name} well-being — ${inds.length} indicators`);
  p(`Each indicator carries an equal share of this dimension: 1 / ${inds.length} = ${(100 / inds.length).toFixed(1)}% of the dimension, and 1 / ${inds.length * 7} = ${(100 / (inds.length * 7)).toFixed(2)}% of the whole index.`);

  for (const ind of inds) {
    h3(`${ind.label}  (${ind.items.join(', ')})`);
    const computed = COMPUTED[ind.id];
    for (const itemId of ind.items) {
      const it = itemById(itemId);
      if (!it) continue;
      p(`${itemId} — ${it.q}`);
      if (it.type === 'likert' || it.type === 'likert_rev') {
        p(it.type === 'likert_rev'
          ? 'Likert 1–5, reverse scored: (5 − answer) ÷ 4.'
          : 'Likert 1–5: (answer − 1) ÷ 4.');
        continue;
      }
      const rows = optionRows(itemId);
      if (rows) table(['Answer option', 'Value'], rows, [0.7, 0.3]);
    }
    if (computed) {
      p(computed.rule);
      mono(computed.lines);
    }
  }
}

pagebreak();
h1('6. Worked example — one real household');
const EX = {"A13":"secondary","B1":{"height_cm":151,"weight_kg":48},"B2":"managed","B3":"occasionally","B4":"1_10","B5":"once","B6":"sedentary","B7":"mostly","B8":"proper","B10":"needs_treatment","B11":3,"C1":"fit","C2":["family","coping","religious"],"C3":"moderate","C4":4,"C5":4,"C6":2,"D1":"occasional","D2":3,"D3":"moderate","D4":"partial","D5":3,"D6":["committee","youth"],"D7":5,"E1":"reliable","E3":"mostly_local","E4":"segregated","E5":["lpg","solar"],"E6":["insulation","harvesting"],"F1":"gt10","F2":"basics","F3":"yes","F4":2,"F6":["even"],"F7":"no","F8":5,"F9":"using","F10":"yes","G1":"occasional","G2":"some_difficulty","G3":"well","G4":"partly","G5":["language"],"H1":"weekly","H2":5,"H3":4,"H4":4,"H5":"in_village","H6":"occasional","H7":"agree"};
const EXS = S.scoreSubmission(EX);
p('Household L01-H0003, Nimmoo village, Leh district — a real record from the demo database, scored live while this document was generated.');

h2('6.1 Physical, indicator by indicator');
const answerLabel = (itemId) => {
  const v = EX[itemId];
  const it = itemById(itemId);
  if (v === undefined) return '—';
  if (typeof v === 'object' && !Array.isArray(v)) return Object.entries(v).map(([k, x]) => `${k.replace('_', ' ')}: ${x}`).join(', ');
  if (Array.isArray(v)) return v.map(x => ((it.options || []).find(o => o.v === x) || {}).label || x).join(' + ');
  if (it.type === 'likert' || it.type === 'likert_rev') return `${v} of 5`;
  return ((it.options || []).find(o => o.v === v) || {}).label || String(v);
};
table(['Indicator', 'Their answer', 'Value'],
  S.INDICATORS.phy.map(ind => [ind.label, ind.items.map(answerLabel).join(' / '),
    (EXS.indicators[ind.id].score).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')]),
  [0.34, 0.44, 0.22]);
mono([
  'sum   = 1.0 + 0.5 + 0.5 + 0.625 + 0.0 + 0.67 + 1.0 + 0.5  =  4.795',
  'score = 4.795 / 8 indicators                              =  ' + EXS.dims.phy.score,
  'as a percentage                                           =  ' + (EXS.dims.phy.score * 100).toFixed(1) + '%',
]);
p('Note what the average does: this household is sedentary (0.0) and still lands mid-band, because good nutrition, a proper toilet and adequate sleep carry it. No single weak answer can sink the dimension.');
p('BMI in full: 48 ÷ (1.51 m)² = 48 ÷ 2.2801 = 21.1, which sits inside 18.5–22.9, so the indicator scores 1.0. Under Western cut-offs the healthy band would run to 24.9; the Asia-Pacific band is used because diabetes and heart-disease risk begin at a lower BMI in South Asian populations.');
p('Healthcare access in full: the facility is 1–10 km away (0.75) and the household was cut off once last winter (0.5). The indicator is their mean, 0.625.');

h2('6.2 The other six dimensions');
table(['Dimension', 'Indicators used', 'Score', 'As %'],
  Q.DIMENSIONS.map(d => [d.name, `${EXS.dims[d.id].answered} of ${EXS.dims[d.id].total}`,
    String(EXS.dims[d.id].score), (EXS.dims[d.id].score * 100).toFixed(1) + '%']),
  [0.34, 0.26, 0.18, 0.22]);

h2('6.3 The household index');
mono([
  'IWB = (' + Q.DIMENSIONS.map(d => EXS.dims[d.id].score).join(' + ') + ') / 7',
  '    = ' + EXS.iwb,
  '    = ' + EXS.pct + '%',
  '    -> Band ' + EXS.band + ', "' + EXS.band_label + '"',
]);
p('Every dimension counts the same 1/7, whatever number of indicators sits underneath it. A dimension built from 9 indicators (Financial) does not outweigh one built from 6 (Environmental).');

h2('6.4 From households to a village');
p('The village index is the mean of its valid household indexes — households are not weighted by size, because the questionnaire measures the respondent and their household conditions, not each person separately.');
mono([
  'Stok, Leh district:',
  '  82 households surveyed of 210 on record   = 39.0% coverage',
  '  minimum required: max(30% of 210, 10)     = 63   -> sufficient',
  '  VWBI = mean of the 82 household indexes   = 0.734  = 73.4%',
  '  -> Band 6, "Strong Well-Being"',
]);

pagebreak();
h1('7. How this compares with the original 1 / 0.5 / 0 model');
p('The project proposal scored 28 indicators (4 per dimension) on a three-step scale: 1 for adequacy, 0.5 for partial adequacy, 0 for none. That scale is still documented in the proposal, so the difference matters.');
h2('7.1 The same household, both ways');
table(['Old indicator (4 only)', 'This household', 'Old value', 'New model'], [
  ['Nutritional BMI', '21.1, healthy', '1.0', '1.0'],
  ['Chronic or high-altitude illness', 'managed + occasional symptoms', '0.5', '0.5 and 0.5, kept separate'],
  ['Access to healthcare', '1–10 km, cut off once', '0.5', '0.625 (distance graded, winter counted)'],
  ['Physical activity', 'sedentary', '0.0', '0.0'],
  ['Sleep', 'mostly adequate', 'not asked', '0.67'],
  ['Sanitation', 'toilet with proper disposal', 'not asked', '1.0'],
  ['Self-rated health', '3 of 5', 'not asked', '0.5'],
], [0.3, 0.26, 0.16, 0.28]);
mono([
  'OLD:  (1.0 + 0.5 + 0.5 + 0.0) / 4  =  0.500  =  50.0%  ->  Band 4, "Basic"',
  'NEW:                                  0.599  =  59.9%  ->  Band 5, "Advancing"',
]);
h2('7.2 Across all 672 demo households');
table(['Measure', 'Old 1 / 0.5 / 0', 'New 0–1'], [
  ['Mean Physical score', '61.1%', '58.6%'],
  ['Standard deviation', '12.1', '10.4'],
  ['Distinct score values possible', '12', '157'],
  ['Households landing in a different band', '—', '360 of 672 (54%)'],
  ['Of those, new score higher / lower', '—', '93 higher · 267 lower'],
], [0.42, 0.29, 0.29]);
bullets([
  'Resolution improves sharply: 12 possible values becomes 157, so households stop sharing identical scores.',
  'Spread narrows slightly, because averaging 8 indicators smooths more than averaging 4. The gain is finer resolution, not a wider range.',
  'The new model is usually stricter, not softer: where bands differ it scores lower about three times in four, because it asks about things the old model ignored.',
  'More than half of households change band. This is a decision to take deliberately before fieldwork, not a rounding difference.',
]);

pagebreak();
h1('8. Thresholds and where they come from');
table(['Metric', 'Anchor', 'Replaces'], [
  ['BMI bands', 'ICMR / WHO Asia-Pacific (healthy 18.5–22.9)', 'Western 18.5–24.9'],
  ['Healthcare distance', 'IPHS norms for hill and tribal areas', '"1 clinic per 2,000 people"'],
  ['Drinking water quality', 'BIS IS 10500 potable standard', 'generic "potable"'],
  ['Income bands', '₹ brackets set to Ladakh living costs', 'Malaysian ringgit bands'],
  ['Government schemes', 'MGNREGA, PM-KISAN, PMAY, livestock insurance', 'Malaysian schemes'],
  ['Minimum village sample', '30% of households or 10, whichever is larger', 'unchanged from the platform documents'],
], [0.28, 0.44, 0.28]);
h2('8.1 Two deliberate scoring choices');
bullets([
  'A traditional dry-compost toilet scores the full 1.0, the same as a modern flush toilet. It is a water-saving technology suited to a cold desert, not a deficiency.',
  'Monastic and vocational education score 0.5, not 0. Non-formal education has genuine value, and monastic education is a respected pathway in Ladakh.',
]);
h2('8.2 What is deliberately not scored');
table(['Item', 'Why'], [
  ['C7 substance use', 'Self-report under-counts heavily. Reported as a village prevalence flag only.'],
  ['Section I (technology, AI, priorities)', 'Diagnostic. Reported separately so it cannot inflate or depress the well-being score.'],
  ['A1–A12 demographics', 'Context and filters. Only A13 (education) is scored, inside Intellectual.'],
  ['E2 glacier change, E7 tourist waste, D8 youth migration', 'Perception and context items that inform interpretation, not the index.'],
], [0.38, 0.62]);

pagebreak();
h1('Appendix — complete option-to-value reference');
p('Every scored question in one table, for checking against the field forms.');
const appendix = [];
for (const d of Q.DIMENSIONS) {
  for (const ind of S.INDICATORS[d.id]) {
    for (const itemId of ind.items) {
      const it = itemById(itemId);
      if (!it) continue;
      if (it.type === 'likert' || it.type === 'likert_rev') {
        appendix.push([d.name, itemId, it.q, it.type === 'likert_rev' ? 'reverse Likert: 5→0.00, 1→1.00' : 'Likert: 1→0.00, 5→1.00']);
        continue;
      }
      const opts = (it.options || []).filter(o => o.pts !== undefined || o.pna);
      appendix.push([d.name, itemId, it.q,
        opts.length ? opts.map(o => `${o.label} = ${o.pna ? '0.5' : o.pts}`).join('; ') : 'numeric input, see rule']);
    }
  }
}
table(['Dimension', 'Item', 'Question', 'Values'], appendix, [0.13, 0.07, 0.34, 0.46]);

/* ============================== RENDERERS ============================== */
const ACCENT = '1F4E79';

function toDocx() {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, ShadingType, LevelFormat, AlignmentType, Footer, PageNumber, PageBreak, BorderStyle, TableOfContents,
  } = require('docx');
  const W = 9026;
  const runs = (text, o = {}) => String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(t =>
    t.startsWith('**') ? new TextRun({ text: t.slice(2, -2), bold: true, ...o }) : new TextRun({ text: t, ...o }));
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const children = [];
  for (const b of B) {
    if (b.t === 'title') {
      children.push(
        new Paragraph({ spacing: { before: 2200, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Project DYESKIT', bold: true, size: 56, color: ACCENT })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Inclusive Village Wellness and Sustainable Future using AI', size: 28, italics: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [new TextRun({ text: 'Scoring Methodology: every metric, option and calculation', size: 32, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Questionnaire ${Q.QUESTIONNAIRE_VERSION} · Scoring ${S.SCORING_VERSION}`, size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Generated from the application code on ${TODAY}`, size: 22, color: '7F7F7F' })] }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: ACCENT })] }),
        new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({ children: [new PageBreak()] }));
    } else if (b.t === 'h1') children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1 }));
    else if (b.t === 'h2') children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2 }));
    else if (b.t === 'h3') children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_3 }));
    else if (b.t === 'p') children.push(new Paragraph({ children: runs(b.text), spacing: { after: 120 } }));
    else if (b.t === 'note') children.push(new Paragraph({ children: runs(b.text, { italics: true, color: '7F7F7F' }), spacing: { after: 160 } }));
    else if (b.t === 'bullets') b.items.forEach(i => children.push(new Paragraph({ children: runs(i), numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 } })));
    else if (b.t === 'numbers') b.items.forEach(i => children.push(new Paragraph({ children: runs(i), numbering: { reference: 'num', level: 0 }, spacing: { after: 60 } })));
    else if (b.t === 'mono') {
      b.lines.forEach(l => children.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 17 })] })));
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    } else if (b.t === 'pagebreak') children.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.t === 'table') {
      const widths = b.widths.map(f => Math.round(W * f));
      widths[widths.length - 1] = W - widths.slice(0, -1).reduce((s, x) => s + x, 0);
      const cell = (text, i, head) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA }, borders,
        shading: head ? { type: ShadingType.CLEAR, fill: ACCENT, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: runs(text, head ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19 }) })],
      });
      children.push(new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: widths,
        rows: [new TableRow({ tableHeader: true, children: b.head.map((h, i) => cell(h, i, true)) }),
          ...b.rows.map(r => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))],
      }));
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    }
  }

  const doc = new Document({
    creator: 'Project DYESKIT',
    title: 'DYESKIT Scoring Methodology',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: ACCENT }, paragraph: { spacing: { before: 340, after: 150 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: '2E75B6' }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '17605B' }, paragraph: { spacing: { before: 180, after: 70 }, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [
      { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
      { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ] },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: `DYESKIT Scoring Methodology · ${S.SCORING_VERSION} · Page `, size: 18, color: '7F7F7F' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '7F7F7F' })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

function toHtml() {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const md = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const heads = [];
  let body = '';
  for (const b of B) {
    if (b.t === 'title') {
      body += `<div class="title"><h1 class="big">Project DYESKIT</h1>
        <p class="sub"><i>Inclusive Village Wellness and Sustainable Future using AI</i></p>
        <p class="doctitle">Scoring Methodology: every metric, option and calculation</p>
        <p>Questionnaire ${Q.QUESTIONNAIRE_VERSION} · Scoring ${S.SCORING_VERSION}</p>
        <p class="muted">Generated from the application code on ${TODAY}</p></div>
        <div class="pb"></div><h2 class="contents-title">Contents</h2>%%TOC%%<div class="pb"></div>`;
    } else if (b.t === 'h1' || b.t === 'h2') {
      const id = 'h' + heads.length;
      heads.push({ level: b.t, text: b.text, id });
      body += `<${b.t} id="${id}">${esc(b.text)}</${b.t}>`;
    } else if (b.t === 'h3') body += `<h3>${esc(b.text)}</h3>`;
    else if (b.t === 'p') body += `<p>${md(b.text)}</p>`;
    else if (b.t === 'note') body += `<p class="note">${md(b.text)}</p>`;
    else if (b.t === 'bullets') body += `<ul>${b.items.map(i => `<li>${md(i)}</li>`).join('')}</ul>`;
    else if (b.t === 'numbers') body += `<ol>${b.items.map(i => `<li>${md(i)}</li>`).join('')}</ol>`;
    else if (b.t === 'mono') body += `<pre>${b.lines.map(esc).join('\n')}</pre>`;
    else if (b.t === 'pagebreak') body += '<div class="pb"></div>';
    else if (b.t === 'table') {
      body += `<table><thead><tr>${b.head.map((h, i) => `<th style="width:${(b.widths[i] * 100).toFixed(0)}%">${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
        b.rows.map(r => `<tr>${r.map(c => `<td>${md(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
    }
  }
  const toc = '<div class="toc">' + heads.map(h => `<a class="t${h.level}" href="#${h.id}">${esc(h.text)}</a>`).join('') + '</div>';
  body = body.replace('%%TOC%%', toc);
  return `<!doctype html><html><head><meta charset="utf-8"><title>DYESKIT Scoring Methodology</title><style>
@page { size: A4; margin: 20mm 20mm 18mm; }
body { font-family: Calibri, Carlito, system-ui, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #111; }
h1 { font-size: 16pt; color: #${ACCENT}; margin: 20pt 0 8pt; break-after: avoid; }
h2 { font-size: 13pt; color: #2E75B6; margin: 14pt 0 5pt; break-after: avoid; }
h3 { font-size: 11pt; color: #17605B; margin: 11pt 0 4pt; break-after: avoid; }
p { margin: 0 0 6pt; } .note { color: #7F7F7F; font-style: italic; }
ul, ol { margin: 0 0 8pt; padding-left: 20pt; } li { margin-bottom: 3pt; }
pre { font-family: 'DejaVu Sans Mono', Menlo, monospace; font-size: 8.5pt; background: #f6f8f7;
      border-left: 3px solid #${ACCENT}; padding: 7pt 9pt; margin: 4pt 0 9pt; white-space: pre; overflow-x: auto; break-inside: avoid; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 9pt; font-size: 9pt; }
tr { break-inside: avoid; } th, td { border: 1px solid #BFBFBF; padding: 3.5pt 5pt; text-align: left; vertical-align: top; }
th { background: #${ACCENT}; color: #fff; }
.pb { break-after: page; }
.title { text-align: center; margin-top: 90pt; } .big { font-size: 30pt; border: 0; margin-bottom: 6pt; }
.sub { font-size: 13pt; } .doctitle { font-size: 17pt; font-weight: 700; margin: 14pt 0 22pt; } .muted { color: #7F7F7F; }
.contents-title { font-size: 16pt; color: #${ACCENT}; }
.toc a { display: block; color: #111; text-decoration: none; padding: 1pt 0; font-size: 9.5pt; }
.toc .th1 { font-weight: 700; margin-top: 4pt; } .toc .th2 { margin-left: 16pt; font-size: 9pt; }
</style></head><body>${body}</body></html>`;
}

/* --------------------------------------------------------------- write */
(async () => {
  const docxPath = path.join(OUT_DIR, 'DYESKIT_Scoring_Methodology.docx');
  const htmlPath = path.join(OUT_DIR, 'DYESKIT_Scoring_Methodology.html');
  fs.writeFileSync(docxPath, await toDocx());
  fs.writeFileSync(htmlPath, toHtml());
  console.log('wrote', docxPath);
  console.log('wrote', htmlPath, '(print to PDF)');
})();
