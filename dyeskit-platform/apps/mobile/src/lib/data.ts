/** Review data for admins and supervisors: counts per district and village. */
import { useQuery } from '@tanstack/react-query';
import { api, qs } from './api';
import { useFilters } from './filters';

export interface Counts { surveys: number; waiting: number; rejected: number; self: number; flagged: number; lastAt: string | null }
export interface DataSummary {
  districts: (Counts & { id: string; name: string; letter: string; villages: number; villagesWithData: number })[];
  villages: (Counts & { id: number; name: string; code: string; district: string; households: number })[];
}

/** Counts for the round chosen in the filters (the current round unless another is picked). */
export function useDataSummary() {
  const { filters } = useFilters();
  return useQuery({ queryKey: ['data-summary', filters.round], queryFn: () => api<DataSummary>('/api/data/summary' + qs({ round: filters.round })) });
}
