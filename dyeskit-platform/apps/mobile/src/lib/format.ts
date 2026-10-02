import { BANDS, DIMENSIONS, ITEMS, districtName } from '@dyeskit/core';

export const fmtScore = (s: number | null | undefined) => (s === null || s === undefined ? '—' : s.toFixed(1));
export const fmtInt = (s: number | null | undefined) => (s === null || s === undefined ? '—' : String(Math.round(s)));
export const fmtPct = (share: number | null | undefined) => (share === null || share === undefined ? '—' : `${Math.round(share * 100)}%`);
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtMonth = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' });
export const bandShort = (b: number | null | undefined) => BANDS.find(x => x.band === b)?.short ?? 'No score';
export const bandLabel = (b: number | null | undefined) => BANDS.find(x => x.band === b)?.label ?? 'Not enough answers';
export const dimName = (id: string) => DIMENSIONS.find(d => d.id === id)?.name ?? id;
export { districtName };

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export const firstName = (name: string) => name.split(/\s+/)[0];

/** An answer as words, e.g. "Agree", "Family / friends, Youth group", "165 cm · 58 kg". */
export function answerText(itemId: string, v: unknown): string {
  const item = ITEMS[itemId];
  if (v === undefined || v === null || v === '') return '—';
  if (item?.type === 'measure') { const m = v as Record<string, unknown>; return `${m.height_cm ?? '?'} cm · ${m.weight_kg ?? '?'} kg`; }
  const label = (x: unknown) => item?.options?.find(o => o.v === String(x))?.label ?? String(x);
  return Array.isArray(v) ? v.map(label).join(', ') : label(v);
}
