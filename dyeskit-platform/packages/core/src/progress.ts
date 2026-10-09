/**
 * How much of the questionnaire a household has filled in — counted over the questions that
 * are showing for them (a follow-up only counts once its condition is met; free-text notes do
 * not count). Used for the progress bar while filling in, and for the minimum before finishing.
 */
import { SECTIONS, isShown, type Item } from './questionnaire';
import type { Answers } from './scoring';

/** A survey can be finished once this share of its questions is answered. */
export const MIN_FILLED_TO_FINISH = 50;

/** Encouragement shown at each point of the climb, lowest first. */
export const PROGRESS_MILESTONES = [
  { at: 0, title: 'A good start', text: 'Every answer helps paint a true picture of your village.' },
  { at: 25, title: 'A quarter of the way', text: `Keep going — at ${MIN_FILLED_TO_FINISH}% the survey can be finished, and every answer after that makes the score fairer.` },
  { at: 50, title: 'Half-way there!', text: 'The score now has enough to work with. Finish the rest so nothing important is missed.' },
  { at: 75, title: 'Almost at the summit', text: 'Only a few questions left — the last ones matter as much as the first.' },
  { at: 100, title: 'Every question answered', text: 'Thank you! A complete survey gives the fairest score.' },
] as const;

const answered = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
const counts = (it: Item) => it.type !== 'text';

export interface SectionProgress { id: string; answered: number; total: number; missing: string[] }
export interface SurveyProgress { answered: number; total: number; percent: number; left: number; sections: SectionProgress[] }

export function surveyProgress(answers: Answers): SurveyProgress {
  const sections = SECTIONS.map(s => {
    const items = s.items.filter(it => counts(it) && isShown(it, answers));
    const missing = items.filter(it => !answered(answers[it.id])).map(it => it.id);
    return { id: s.id, answered: items.length - missing.length, total: items.length, missing };
  });
  const total = sections.reduce((n, s) => n + s.total, 0);
  const done = sections.reduce((n, s) => n + s.answered, 0);
  // never show 100% while a question is still open
  const percent = total ? (done === total ? 100 : Math.min(99, Math.floor((done / total) * 100))) : 0;
  return { answered: done, total, percent, left: total - done, sections };
}

/** The encouragement for a given percentage. */
export const milestoneFor = (percent: number) => [...PROGRESS_MILESTONES].reverse().find(m => percent >= m.at)!;
