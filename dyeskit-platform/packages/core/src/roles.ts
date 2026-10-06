/**
 * Roles and what each may do — the same access model as the original platform.
 *
 * Two ways to register in the app:
 *   • a household member filling in their own household's survey — active straight away,
 *     sees only their own survey and the overall dashboard
 *   • project staff — registered as a Field Researcher with status "pending"; an admin
 *     approves them (and can change the role) before they can sign in
 */

export type Role = 'admin' | 'supervisor' | 'collector' | 'analyst' | 'viewer' | 'respondent';
export type UserStatus = 'pending' | 'active' | 'disabled';

export interface Rights {
  /**
   * which surveys the role can see: everything, only the villages assigned to the user, or
   * only the user's own survey (household members — who see the overall dashboard, never
   * village-level or other households' data)
   */
  read: 'all' | 'assigned' | 'own';
  addData: boolean;
  editAny: boolean;
  delete: boolean;
  review: boolean;
  manageUsers: boolean;
  manageVillages: boolean;
  /** full = with household names and phone numbers, anon = without */
  export: 'full' | 'anon' | 'none';
  /** may see household head names and phone numbers */
  pii: boolean;
  audit: boolean;
}

export const ROLE_RIGHTS: Record<Role, Rights> = {
  admin:      { read: 'all', addData: true, editAny: true, delete: true, review: true, manageUsers: true, manageVillages: true, export: 'full', pii: true, audit: true },
  supervisor: { read: 'all', addData: true, editAny: true, delete: false, review: true, manageUsers: false, manageVillages: true, export: 'full', pii: true, audit: true },
  collector:  { read: 'assigned', addData: true, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'none', pii: true, audit: false },
  analyst:    { read: 'all', addData: false, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'anon', pii: false, audit: false },
  viewer:     { read: 'all', addData: false, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'none', pii: false, audit: false },
  respondent: { read: 'own', addData: true, editAny: false, delete: false, review: false, manageUsers: false, manageVillages: false, export: 'none', pii: false, audit: false },
};

/** Surveys one household member may submit from their account. */
export const RESPONDENT_SURVEY_LIMIT = 1;

export const ROLES: { id: Role; name: string; about: string }[] = [
  { id: 'admin', name: 'Admin', about: 'Full access: users, villages, data, exports and the audit log' },
  { id: 'supervisor', name: 'Supervisor', about: 'Reviews, approves and corrects surveys; manages villages' },
  { id: 'collector', name: 'Field Researcher', about: 'Collects surveys in the villages assigned to them' },
  { id: 'analyst', name: 'Analyst', about: 'Dashboards and anonymised exports' },
  { id: 'viewer', name: 'Viewer', about: 'Read-only dashboards' },
  { id: 'respondent', name: 'Household member', about: 'Fills in their own household’s survey and sees the overall Ladakh picture' },
];

/** Roles that are project staff (everyone except household members). */
export const isStaff = (role: string) => role !== 'respondent';

export const roleName = (r: string) => ROLES.find(x => x.id === r)?.name ?? r;
