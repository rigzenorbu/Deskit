/**
 * "Needs a look": plain checks that point a supervisor at surveys that may hold wrong or
 * careless data. They never change or remove anything — a person decides.
 */

import { ITEMS } from './questionnaire';
import { bmiPoints, type Answers, type HouseholdScore } from './scoring';
import { normalizePhone } from './phone';

export interface SurveyIssue { id: string; label: string }

export const QUALITY_RULES = {
  /** interviews shorter than this many minutes */
  shortMinutes: 10,
  /** BMI outside this range cannot be real: height or weight was mistyped */
  bmiMin: 12,
  bmiMax: 45,
  ageMin: 18,
  ageMax: 105,
  /** households larger than this are unusual enough to check */
  householdMax: 20,
  /** at least this many agreement questions answered, all with the same answer */
  straightLineMin: 8,
};

const SCALE_ITEMS = Object.values(ITEMS).filter(i => i.type === 'scale').map(i => i.id);

export function surveyIssues(s: { answers: Answers; score: HouseholdScore | null; durationMin: number | null }): SurveyIssue[] {
  const out: SurveyIssue[] = [];
  const a = s.answers;
  const R = QUALITY_RULES;

  if (s.durationMin !== null && s.durationMin !== undefined && s.durationMin < R.shortMinutes) {
    out.push({ id: 'short', label: `Interview took ${s.durationMin} minute${s.durationMin === 1 ? '' : 's'}` });
  }
  if (!s.score || s.score.score === null) out.push({ id: 'incomplete', label: 'Not enough answers for a score' });

  const m = a.B1 as { height_cm?: number; weight_kg?: number } | undefined;
  if (m?.height_cm && m?.weight_kg) {
    const bmi = bmiPoints(m.height_cm, m.weight_kg)?.bmi;
    if (bmi !== undefined && (bmi < R.bmiMin || bmi > R.bmiMax)) {
      out.push({ id: 'bmi', label: `Height/weight look wrong (${m.height_cm} cm, ${m.weight_kg} kg — BMI ${bmi})` });
    }
  }

  const age = Number(a.A5);
  if (a.A5 !== undefined && (!isFinite(age) || age < R.ageMin || age > R.ageMax)) out.push({ id: 'age', label: `Age looks wrong (${a.A5})` });

  const size = Number(a.A7);
  if (isFinite(size) && size > R.householdMax) out.push({ id: 'household', label: `Very large household (${size} people)` });

  const scale = SCALE_ITEMS.map(id => a[id]).filter(v => v !== undefined && v !== null && v !== '');
  if (scale.length >= R.straightLineMin && new Set(scale.map(String)).size === 1) {
    out.push({ id: 'same_answer', label: `Same answer to all ${scale.length} agreement questions` });
  }
  return out;
}

/* ------------------------------------------------------------ duplicates */

export interface DuplicateInput {
  id: string;
  villageId: number;
  roundId: number;
  householdId: number;
  householdCode: string;
  headName: string | null;
  /** the household's phone, or for a self-reported survey the member's own phone */
  phone: string | null;
}

/** "Tsering  Dolkar's household" → "tsering dolkar"; a single word is not a usable name. */
export function nameKey(name: string | null): string | null {
  if (!name) return null;
  const words = name.toLowerCase().replace(/['’]s\b/g, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)
    .filter(w => w && !['household', 'family', 'house', 'hh', 'the', 'of'].includes(w));
  return words.length >= 2 ? words.join(' ') : null;
}

/**
 * Likely duplicates: two different households in the same village and the same round with the
 * same phone number, or the same household head's full name — for example staff surveyed a
 * household that also filled in its own survey, or someone registered twice.
 */
export function findDuplicates(rows: DuplicateInput[]): Map<string, SurveyIssue[]> {
  const out = new Map<string, SurveyIssue[]>();
  const groups = new Map<string, DuplicateInput[]>();
  for (const r of rows) {
    const keys = [
      ...(normalizePhone(r.phone) ? [`p|${r.villageId}|${r.roundId}|${normalizePhone(r.phone)}`] : []),
      ...(nameKey(r.headName) ? [`n|${r.villageId}|${r.roundId}|${nameKey(r.headName)}`] : []),
    ];
    for (const k of keys) { if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  }
  for (const [key, list] of groups) {
    const households = new Set(list.map(r => r.householdId));
    if (households.size < 2) continue;
    const why = key.startsWith('p|') ? 'same phone number' : `same head of household: ${list[0].headName}`;
    for (const r of list) {
      const others = [...new Set(list.filter(o => o.householdId !== r.householdId).map(o => o.householdCode))];
      const issue = { id: 'duplicate', label: `Possible duplicate of ${others.join(', ')} (${why})` };
      const cur = out.get(r.id) ?? [];
      if (!cur.some(i => i.label === issue.label)) out.set(r.id, [...cur, issue]);
    }
  }
  return out;
}
