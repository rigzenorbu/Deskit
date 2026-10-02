import crypto from 'node:crypto';
import { ROLE_RIGHTS, type Rights, type Role } from '@dyeskit/core';
import type { Queryable } from './db';

/** scrypt, stored as "scrypt$salt$hash". */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const want = Buffer.from(hash, 'hex');
  return test.length === want.length && crypto.timingSafeEqual(test, want);
}

export const PASSWORD_RULE = 'At least 8 characters, with a letter and a number.';
export const passwordOk = (p: string) => p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);

const SESSION_DAYS = 30;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** A new session. Only the token's hash is stored, so a database leak does not leak sessions. */
export async function createSession(db: Queryable, userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  return token;
}

export async function endSession(db: Queryable, token: string) {
  await db.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
}

export interface SessionUser { id: number; name: string; email: string; phone: string | null; role: Role; status: string }

export async function userFromToken(db: Queryable, token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  const { rows } = await db.query<SessionUser>(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active' AND u.deleted_at IS NULL`, [sha256(token)]);
  return rows[0] ?? null;
}

export const bearer = (header: string | undefined) => (header?.startsWith('Bearer ') ? header.slice(7).trim() : null);

export const rightsOf = (user: SessionUser): Rights => ROLE_RIGHTS[user.role];

export async function assignedVillageIds(db: Queryable, userId: number) {
  return (await db.query<{ village_id: number }>('SELECT village_id FROM assignments WHERE user_id=$1', [userId])).rows.map(r => r.village_id);
}

/** Village ids the user may see, or null for "everything". */
export async function scopeOf(db: Queryable, user: SessionUser) {
  return rightsOf(user).read === 'assigned' ? assignedVillageIds(db, user.id) : null;
}
