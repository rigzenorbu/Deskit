/** Review data for admins and supervisors: counts per district and village. */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Counts { surveys: number; waiting: number; rejected: number; self: number; flagged: number; lastAt: string | null }
export interface DataSummary {
  districts: (Counts & { id: string; name: string; letter: string; villages: number; villagesWithData: number })[];
  villages: (Counts & { id: number; name: string; code: string; district: string; households: number })[];
}

export const useDataSummary = () => useQuery({ queryKey: ['data-summary'], queryFn: () => api<DataSummary>('/api/data/summary') });
