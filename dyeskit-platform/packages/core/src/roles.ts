/**
 * Roles and what each may do — the same access model as the original platform.
 *
 * New registrations are always Field Researchers with status "pending"; an admin
 * approves them (and can change the role) before they can sign in.
 */

export type Role = 'admin' | 'supervisor' | 'collector' | 'analyst' | 'viewer';
export type UserStatus = 'pending' | 'active' | 'disabled';

export interface Rights {
  /** which surveys the role can see: everything, or only the villages assigned to the user */
  read: 'all' | 'assigned';
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
};

export const ROLES: { id: Role; name: string; about: string }[] = [
  { id: 'admin', name: 'Admin', about: 'Full access: users, villages, data, exports and the audit log' },
  { id: 'supervisor', name: 'Supervisor', about: 'Reviews, approves and corrects surveys; manages villages' },
  { id: 'collector', name: 'Field Researcher', about: 'Collects surveys in the villages assigned to them' },
  { id: 'analyst', name: 'Analyst', about: 'Dashboards and anonymised exports' },
  { id: 'viewer', name: 'Viewer', about: 'Read-only dashboards' },
];

export const roleName = (r: string) => ROLES.find(x => x.id === r)?.name ?? r;
