/** The dashboard filters, shared by every analysis screen so a choice made once applies everywhere. */
import React, { createContext, useContext, useMemo, useState } from 'react';

export interface Filters {
  district: string;
  village_id: string;
  period: '' | '30' | '90' | '180' | '365' | 'year';
  gender: string;
  age_group: string;
  religion: string;
  band: string;
  status: string;
  /** a round id, "all", or '' for the current round */
  round: string;
}
export const EMPTY_FILTERS: Filters = { district: '', village_id: '', period: '', gender: '', age_group: '', religion: '', band: '', status: '', round: '' };

export const PERIODS: { id: Filters['period']; label: string }[] = [
  { id: '', label: 'All time' }, { id: '30', label: '30 days' }, { id: '90', label: '3 months' },
  { id: '180', label: '6 months' }, { id: '365', label: '12 months' }, { id: 'year', label: 'This year' },
];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Filters → the query the server understands. */
export function filterQuery(f: Filters) {
  const from = f.period === 'year' ? `${new Date().getFullYear()}-01-01`
    : f.period ? isoDay(new Date(Date.now() - (Number(f.period) - 1) * 864e5)) : '';
  return { district: f.district, village_id: f.village_id, from, gender: f.gender, age_group: f.age_group, religion: f.religion, band: f.band, status: f.status, round: f.round };
}

interface FilterState { filters: Filters; set: (patch: Partial<Filters>) => void; reset: () => void; active: number }
const Ctx = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const value = useMemo<FilterState>(() => ({
    filters,
    set: patch => setFilters(f => {
      const next = { ...f, ...patch };
      // choosing another district clears a village from a different district
      if (patch.district !== undefined && patch.district !== f.district && patch.village_id === undefined) next.village_id = '';
      return next;
    }),
    reset: () => setFilters(EMPTY_FILTERS),
    active: Object.values(filters).filter(Boolean).length,
  }), [filters]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFilters outside FilterProvider');
  return v;
}
