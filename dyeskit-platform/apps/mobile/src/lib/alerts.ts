/** What needs the signed-in person's attention; refreshed every minute. */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Alerts {
  pendingUsers: number;
  waitingReview: number;
  needsLook: number;
  sentBack: { id: string; householdCode: string; village: string; note: string | null }[];
}

export const useAlerts = () => useQuery({
  queryKey: ['alerts'], queryFn: () => api<Alerts>('/api/alerts'), refetchInterval: 60_000, staleTime: 20_000,
});

/** True when the More tab should carry a red dot. */
export const hasAlerts = (a: Alerts | undefined) => !!a && (a.pendingUsers > 0 || a.needsLook > 0 || a.sentBack.length > 0);
