/**
 * Writes docs/SCORING.md from the scoring tables themselves — run: npm run docs:scoring
 * Because it reads the same data the app and server score with, the document cannot
 * drift from what the software actually does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANDS, BMI_OTHER_POINTS, BMI_TABLE, CRITICAL_BELOW, DIMENSIONS, DIM_ITEMS, DIMENSION_MIN_QUESTIONS, DIMENSION_MIN_SHARE,
  FLAG_BELOW, HOUSEHOLD_MIN_DIMENSIONS, NEUTRAL_POINTS, QUESTIONNAIRE_VERSION, SCORING_VERSION, SEVERITY, SIGNALS,
  VILLAGE_MIN_HOUSEHOLDS, VILLAGE_MIN_SHARE, type Item,
} from '../src/index';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', '..', 'docs', 'SCORING.md');

const pointsTable = (item: Item) => {
  const rows: [string, number][] = item.bmi
    ? [...BMI_TABLE.map(r => [`BMI ${r.label}`, r.points] as [string, number]), ['BMI below 16.0, or 30.0 and above', BMI_OTHER_POINTS]]
    : item.countPoints
      ? item.countPoints.map((p, n) => [`${n}${n === item.countPoints!.length - 1 ? ' or more' : ''} ${item.counts ?? ''}`.trim(), p] as [string, number])
      : (item.options ?? []).filter(o => typeof o.points === 'number' || o.neutral).map(o => [o.label, o.neutral ? NEUTRAL_POINTS : o.points!] as [string, number]);
  return rows.map(([l, p]) => `| ${l} | ${p} |`).join('\n');
};

const md = `# How DYESKIT scores well-being

Scoring version \`${SCORING_VERSION}\` · questionnaire \`${QUESTIONNAIRE_VERSION}\`

*This file is generated from the scoring tables in \`packages/core\`. Do not edit it by hand —
change the tables and run \`npm run docs:scoring\`.*

## In one sentence

Every answer is worth **fixed points out of 100**; averages of those points give each dimension,
each household, and each village. There are no formulas anywhere — only look-up tables and averages.

## The five steps

1. **Each answer has fixed points.** Every scored question gives a set number of points from 0 to 100
   for the answer chosen. "Don't know" or "Prefer not to answer" gives **${NEUTRAL_POINTS}** (the middle).
   A question that was skipped is simply left out.
2. **Dimension score = the average of its answered questions.** A dimension counts only if at least
   ${DIMENSION_MIN_SHARE * 100}% of its questions (and at least ${DIMENSION_MIN_QUESTIONS}) were answered.
3. **Household score = the average of its seven dimension scores.** Every dimension weighs the same.
   A household gets a score only when at least ${HOUSEHOLD_MIN_DIMENSIONS} of the 7 dimensions count.
4. **The household score falls into one of seven bands** (table below).
5. **A village, a district, or any filtered group = the average of its household scores.**
   A village's result is called *reliable* once at least ${VILLAGE_MIN_SHARE * 100}% of its households
   (and at least ${VILLAGE_MIN_HOUSEHOLDS}) have been surveyed.

## Worked example — the Financial dimension of one household

| Question | Answer | Points |
|---|---|---|
| F1 Income | ₹1–3 lakh | 25 |
| F2 Income covers needs | Basics only | 50 |
| F3 Savings / assets | None | 0 |
| F4 Income sources | 1 | 50 |
| F6 Income through the year | Two seasons | 50 |
| F7 Weather damage, 5 years | Once | 50 |
| F8 "I feel financially secure" | Agree | 75 |
| F9 Government schemes | Aware, not using | 50 |
| F10 Bank account | Yes | 100 |
| **Total** | | **450** |

450 points ÷ 9 questions = **50** → Financial score 50, band 4 ("Basic Well-Being Achieved").
The household score is then the average of this and the other six dimension scores.

## The seven bands

| Band | Score | Meaning |
|---|---|---|
${BANDS.map(b => `| ${b.band} | ${b.min}–${b.band === 7 ? 100 : Math.floor(b.max)} | ${b.label} |`).join('\n')}

## Flags and warnings

- A **dimension** whose average is below **${FLAG_BELOW}** (below "Basic") is flagged; below **${CRITICAL_BELOW}** it is *critical*.
- A **warning sign** is a yes/no test on one household (for example "no bank account"). It is reported by the
  share of households where it applies: ${SEVERITY.map(s => `**${s.level}** from ${s.min * 100}%`).join(', ')}.

## What changed from the earlier method (v2)

Every rule that used a calculation now uses a fixed table:

| Before (v2) | Now (v3) |
|---|---|
| 1–5 agreement answers scored as (answer − 1) ÷ 4 | Fixed points 0 / 25 / 50 / 75 / 100 for each answer |
| Water reliability: 1 − (scarce months ÷ 12) | One question with fixed answers: reliable 100, 1–3 months 75, 4–6 months 50, 7+ months 25, severe 0 |
| Income spread: counted ticked quarters | One choice: even all year 100, three seasons 75, two 50, one 25 |
| Cooking fuel: average of all fuels used | The main fuel only, with fixed points |
| Healthcare distance and winter access averaged into one indicator | Two separate questions, each with fixed points |
| Income bands 0 / 0.33 / 0.67 / 0.85 / 1 | 0 / 25 / 50 / 75 / 100 |
| Education: primary 0.25 … | Same steps on the 0–100 scale |

## Every scored question and its points

${DIMENSIONS.map(d => `### ${d.name}

*${d.about}.* ${DIM_ITEMS[d.id].length} questions.

${DIM_ITEMS[d.id].map(item => `**${item.id} · ${item.indicator}** — ${item.q}

| Answer | Points |
|---|---|
${pointsTable(item)}
`).join('\n')}`).join('\n')}

## Warning signs (insights)

| Sign | Dimension | Suggested action |
|---|---|---|
${SIGNALS.map(s => `| ${s.label} | ${DIMENSIONS.find(d => d.id === s.dim)!.name} | ${s.action} |`).join('\n')}
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
