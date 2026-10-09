/**
 * One-time sign-in codes sent by text message.
 *   • 6 digits, valid for 10 minutes, usable once, at most 5 tries each
 *   • at most 3 codes per phone number per 15 minutes
 *   • only a hash of the code is stored
 * A verified number that has no account yet gets a short-lived "ticket" to finish registering.
 */
import crypto from 'node:crypto';
import type { Queryable } from './db';

const SECRET = process.env.OTP_SECRET || crypto.randomBytes(32).toString('hex');
const hash = (phone: string, purpose: string, code: string) =>
  crypto.createHash('sha256').update(`${phone}|${purpose}|${code}|${SECRET}`).digest('hex');

export const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const MAX_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;
const TICKET_MINUTES = 30;

export type Purpose = 'signin' | 'reset';

const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export async function createCode(q: Queryable, phone: string, purpose: Purpose) {
  const recent = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM otp_codes WHERE phone=$1 AND purpose=$2 AND created_at > now() - interval '${WINDOW_MINUTES} minutes'`, [phone, purpose]);
  if (recent.rows[0].n >= MAX_PER_WINDOW) throw fail(429, `Too many codes sent to this number. Please wait ${WINDOW_MINUTES} minutes.`);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await q.query(`INSERT INTO otp_codes (phone, purpose, code_hash, expires_at) VALUES ($1,$2,$3, now() + interval '${CODE_MINUTES} minutes')`,
    [phone, purpose, hash(phone, purpose, code)]);
  return code;
}

/** True when the code is right; each wrong try counts, and a used code cannot be used again. */
export async function checkCode(q: Queryable, phone: string, purpose: Purpose, code: string) {
  // only the newest code sent to this number works; asking for a new one replaces the old
  const { rows } = await q.query<{ id: number; code_hash: string; attempts: number; used_at: unknown; expired: boolean }>(
    `SELECT id, code_hash, attempts, used_at, expires_at <= now() AS expired FROM otp_codes WHERE phone=$1 AND purpose=$2
     ORDER BY created_at DESC, id DESC LIMIT 1`, [phone, purpose]);
  const row = rows[0];
  if (!row || row.expired) throw fail(400, 'This code has expired. Please ask for a new one.');
  if (row.used_at) throw fail(400, 'This code has already been used. Please ask for a new one.');
  if (row.attempts >= MAX_TRIES) throw fail(429, 'Too many wrong codes. Please ask for a new one.');
  const given = hash(phone, purpose, String(code ?? '').replace(/\D/g, ''));
  const ok = given.length === row.code_hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash));
  if (!ok) {
    await q.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=$1', [row.id]);
    throw fail(400, 'That code is not correct.');
  }
  await q.query('UPDATE otp_codes SET used_at = now() WHERE id=$1', [row.id]);
}

/** After a verified code for a number with no account: a ticket to finish registering. */
export async function createTicket(q: Queryable, phone: string) {
  const ticket = crypto.randomBytes(24).toString('base64url');
  await q.query(`INSERT INTO otp_codes (phone, purpose, code_hash, expires_at, used_at) VALUES ($1,'ticket',$2, now() + interval '${TICKET_MINUTES} minutes', NULL)`,
    [phone, hash('', 'ticket', ticket)]);
  return ticket;
}

/** The phone number a ticket was issued for (and the ticket is used up). */
export async function redeemTicket(q: Queryable, ticket: string) {
  const { rows } = await q.query<{ id: number; phone: string }>(
    `SELECT id, phone FROM otp_codes WHERE purpose='ticket' AND code_hash=$1 AND used_at IS NULL AND expires_at > now()`,
    [hash('', 'ticket', String(ticket))]);
  const row = rows[0];
  if (!row) throw fail(400, 'Please verify your phone number again.');
  await q.query('UPDATE otp_codes SET used_at = now() WHERE id=$1', [row.id]);
  return row.phone;
}
