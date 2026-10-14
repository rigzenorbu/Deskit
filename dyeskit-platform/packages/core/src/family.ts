/**
 * The family roster (A7): how many males and females live in the household, and each one's age.
 * Height and weight (B1) are then asked per family member, by the same list.
 *
 * Surveys from questionnaire v3.0 hold A7 as a plain number and B1 as one person's
 * { height_cm, weight_kg }; every helper here reads both forms.
 */
import type { Answers } from './scoring';

export type Sex = 'male' | 'female';

export interface Family {
  male: number;
  female: number;
  /** ages in years, one per person, in order; null = not given */
  ages: { male: (number | null)[]; female: (number | null)[] };
}

export interface FamilyMember {
  /** stable key, e.g. "m1", "f2" — B1 stores height and weight under it */
  key: string;
  sex: Sex;
  label: string;
  age: number | null;
}

export interface Measure { height_cm?: number; weight_kg?: number }

/** The most people of one sex the roster takes. */
export const FAMILY_MAX_PER_SEX = 25;

const num = (v: unknown) => (v === undefined || v === null || v === '' || !isFinite(Number(v)) ? null : Number(v));

/** A7 as a roster, or null for a v3.0 number or no answer. */
export function familyOf(v: unknown): Family | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const f = v as Partial<Family>;
  const male = Math.max(0, Math.floor(num(f.male) ?? 0)), female = Math.max(0, Math.floor(num(f.female) ?? 0));
  const ages = (xs: unknown, n: number) => Array.from({ length: n }, (_, i) => num(Array.isArray(xs) ? xs[i] : null));
  return { male, female, ages: { male: ages(f.ages?.male, male), female: ages(f.ages?.female, female) } };
}

/** Everyone on the roster: "Male 1", "Male 2", "Female 1"… */
export function familyMembers(answers: Answers): FamilyMember[] {
  const f = familyOf(answers.A7);
  if (!f) return [];
  const list = (sex: Sex, n: number) => Array.from({ length: n }, (_, i) => ({
    key: `${sex[0]}${i + 1}`, sex, label: `${sex === 'male' ? 'Male' : 'Female'} ${i + 1}`, age: f.ages[sex][i] ?? null,
  }));
  return [...list('male', f.male), ...list('female', f.female)];
}

/** Household size: males + females, or the v3.0 number. Null when not answered. */
export function householdSize(answers: Answers): number | null {
  const f = familyOf(answers.A7);
  if (f) return f.male + f.female || null;
  const n = num(answers.A7);
  return n !== null && n > 0 ? n : null;
}

/** The roster as words: "2 male (45, 12) · 3 female (40, ?, 8)". */
export function familyText(v: unknown): string {
  const f = familyOf(v);
  if (!f) return v === undefined || v === null || v === '' ? '—' : `${v} people`;
  const part = (sex: Sex, n: number) => n ? `${n} ${sex}${f.ages[sex].some(a => a !== null) ? ` (${f.ages[sex].map(a => a ?? '?').join(', ')})` : ''}` : '';
  return [part('male', f.male), part('female', f.female)].filter(Boolean).join(' · ') || '—';
}

/**
 * Every height and weight recorded in B1, with who it belongs to. A v3.0 answer is one person
 * (the respondent); a v3.1 answer is keyed by roster member.
 */
export function measuresOf(answers: Answers): (FamilyMember & Measure)[] {
  const v = answers.B1;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  const m = v as Record<string, unknown>;
  if ('height_cm' in m || 'weight_kg' in m) {
    return [{ key: 'respondent', sex: answers.A6 === 'female' ? 'female' : 'male', label: 'Respondent', age: num(answers.A5),
      height_cm: num(m.height_cm) ?? undefined, weight_kg: num(m.weight_kg) ?? undefined }];
  }
  // only people still on the roster: someone taken off A7 takes their measurements along
  return familyMembers(answers).filter(p => m[p.key] && typeof m[p.key] === 'object').map(p => {
    const r = m[p.key] as Measure;
    return { ...p, height_cm: num(r.height_cm) ?? undefined, weight_kg: num(r.weight_kg) ?? undefined };
  });
}
