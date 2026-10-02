import { useQuery } from '@tanstack/react-query';
import type { Dashboard, computeInsights } from '@dyeskit/core';
import { api, qs } from './api';
import { filterQuery, useFilters, type Filters } from './filters';

export type Insights = ReturnType<typeof computeInsights>;

/** Dashboard numbers for the current filters (or an override, e.g. one village). */
export function useDashboard(override?: Partial<Filters>) {
  const { filters } = useFilters();
  const f = { ...filters, ...override };
  return useQuery({ queryKey: ['dashboard', f], queryFn: () => api<Dashboard>('/api/dashboard' + qs(filterQuery(f))) });
}

export function useInsights(override?: Partial<Filters>) {
  const { filters } = useFilters();
  const f = { ...filters, ...override };
  return useQuery({ queryKey: ['insights', f], queryFn: () => api<Insights>('/api/insights' + qs(filterQuery(f))) });
}
