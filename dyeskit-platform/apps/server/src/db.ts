/**
 * Database access.
 *
 *   DATABASE_URL set   → a real PostgreSQL server (production: Render, Supabase, Neon, AWS RDS…)
 *   DATABASE_URL unset → PGlite, PostgreSQL compiled to WebAssembly, stored in ./data
 *                        (local use and tests; nothing to install)
 *
 * Both speak the same SQL, so every query below runs unchanged on either.
 *
 * Storage principles carried over from the original platform:
 *   • answers are stored one row per answer, so new questions need no schema change
 *   • nothing is overwritten: corrections write answer_history, deletes are soft
 *   • household names and phone numbers live in `households` and never reach analysts
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizePhone } from '@dyeskit/core';

export interface Queryable {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Queryable {
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'postgres' | 'pglite';
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Encrypt the connection for databases reached over the internet. Local databases and
 * private-network names without a dot (e.g. Render's internal "dpg-…-a") connect without it.
 * An explicit ?sslmode=… in the URL, or PGSSL=off, always wins.
 */
function wantsSsl(url: string) {
  if (process.env.PGSSL === 'off') return undefined;
  let host = '';
  try {
    const u = new URL(url);
    const mode = u.searchParams.get('sslmode');
    if (mode === 'disable') return undefined;
    if (mode) return { rejectUnauthorized: false };
    host = u.hostname || u.searchParams.get('host') || '';
  } catch { return undefined; }
  if (!host || host.startsWith('/') || host === 'localhost' || host === '127.0.0.1' || !host.includes('.')) return undefined;
  return { rejectUnauthorized: false };
}

export async function openDb(url = process.env.DATABASE_URL, dataDir = process.env.DYESKIT_DATA_DIR): Promise<Db> {
  if (url) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: url, ssl: wantsSsl(url), max: 10 });
    return {
      kind: 'postgres',
      query: (sql, params) => pool.query(sql, params as unknown[]) as any,
      exec: async sql => { await pool.query(sql); },
      tx: async fn => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn({ query: (s, p) => client.query(s, p as unknown[]) as any });
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  let dir: string | undefined;
  if (dataDir !== 'memory') {
    dir = dataDir || path.join(HERE, '..', 'data', 'pglite');
    fs.mkdirSync(dir, { recursive: true });
  }
  const lite = dir ? new PGlite(dir) : new PGlite();
  await lite.waitReady;
  return {
    kind: 'pglite',
    query: (sql, params) => lite.query(sql, params as unknown[]) as any,
    exec: async sql => { await lite.exec(sql); },
    tx: fn => lite.transaction(t => fn({ query: (s, p) => t.query(s, p as unknown[]) as any })),
    close: () => lite.close(),
  };
}

/* --------------------------------------------------------------- schema */
/**
 * Migrations run in order, once each; their numbers are recorded in schema_migrations.
 * Add new ones at the end — never edit one that has already shipped.
 */
const MIGRATIONS: (string | ((q: Queryable) => Promise<void>))[] = [
  /* 1 — initial schema */ `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','supervisor','collector','analyst','viewer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX users_email ON users (lower(email));

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE villages (
    id SERIAL PRIMARY KEY,
    district TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    gazette_name TEXT,
    subdivision TEXT,
    block TEXT,
    households INTEGER NOT NULL DEFAULT 0,
    altitude_m INTEGER,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    official BOOLEAN NOT NULL DEFAULT true,
    next_household INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (district, code)
  );

  CREATE TABLE assignments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    village_id INTEGER NOT NULL REFERENCES villages(id),
    PRIMARY KEY (user_id, village_id)
  );

  CREATE TABLE households (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    village_id INTEGER NOT NULL REFERENCES villages(id),
    seq INTEGER NOT NULL,
    head_name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by INTEGER REFERENCES users(id),
    UNIQUE (village_id, seq)
  );

  CREATE TABLE submissions (
    id UUID PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id),
    village_id INTEGER NOT NULL REFERENCES villages(id),
    collector_id INTEGER REFERENCES users(id),
    questionnaire_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
    consent BOOLEAN NOT NULL,
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    duration_min INTEGER,
    review_note TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by INTEGER REFERENCES users(id),
    delete_reason TEXT
  );
  CREATE INDEX submissions_village ON submissions (village_id);

  CREATE TABLE answers (
    submission_id UUID NOT NULL REFERENCES submissions(id),
    item_id TEXT NOT NULL,
    value JSONB NOT NULL,
    PRIMARY KEY (submission_id, item_id)
  );

  CREATE TABLE answer_history (
    id SERIAL PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES submissions(id),
    item_id TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by INTEGER REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT
  );

  CREATE TABLE scores (
    submission_id UUID PRIMARY KEY REFERENCES submissions(id),
    score DOUBLE PRECISION,
    band INTEGER,
    valid BOOLEAN NOT NULL,
    version TEXT NOT NULL,
    detail JSONB NOT NULL
  );

  CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    village_id INTEGER NOT NULL REFERENCES villages(id),
    dim TEXT,
    note TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE audit (
    id SERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id INTEGER,
    user_name TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    detail JSONB
  );
  CREATE INDEX audit_at ON audit (at DESC);
  `,
  /* 2 — household members register and fill in their own survey */ `
  ALTER TABLE users DROP CONSTRAINT users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','supervisor','collector','analyst','viewer','respondent'));
  ALTER TABLE submissions ADD COLUMN source TEXT NOT NULL DEFAULT 'researcher' CHECK (source IN ('researcher','self'));
  `,
  /* 3 — sign in with a phone number and a one-time code; privacy consent */ `
  ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
  CREATE TABLE otp_codes (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
  );
  CREATE INDEX otp_codes_phone ON otp_codes (phone, purpose, created_at DESC);
  `,
  /* 4 — one account per phone number. Existing numbers are first written in one form (+91…);
     where two accounts share a number, the older account keeps it and the other loses it
     (recorded in the audit log). Then the rule is enforced. */
  async q => {
    const { rows } = await q.query<{ id: number; name: string; phone: string }>(
      'SELECT id, name, phone FROM users WHERE phone IS NOT NULL AND deleted_at IS NULL ORDER BY created_at, id');
    const seen = new Set<string>();
    for (const u of rows) {
      const phone = normalizePhone(u.phone) ?? u.phone.trim();
      if (seen.has(phone)) {
        await q.query('UPDATE users SET phone = NULL WHERE id = $1', [u.id]);
        await audit(q, null, 'phone_removed_duplicate', 'user', u.id, { phone, kept_by_older_account: true });
      } else {
        seen.add(phone);
        if (phone !== u.phone) await q.query('UPDATE users SET phone = $1 WHERE id = $2', [phone, u.id]);
      }
    }
    await q.query('CREATE UNIQUE INDEX users_phone ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL');
  },
  /* 5 — survey rounds (2026, 2027…): every survey belongs to one; existing surveys form the first,
     named after the year the earliest was collected */
  async q => {
    await q.query(`CREATE TABLE rounds (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ
    )`);
    const first = await q.query<{ y: number | null }>('SELECT extract(year from min(submitted_at))::int AS y FROM submissions');
    const name = String(first.rows[0].y ?? new Date().getFullYear());
    const r = await q.query<{ id: number }>('INSERT INTO rounds (name) VALUES ($1) RETURNING id', [name]);
    await q.query('ALTER TABLE submissions ADD COLUMN round_id INTEGER REFERENCES rounds(id)');
    await q.query('UPDATE submissions SET round_id = $1', [r.rows[0].id]);
    await q.query('ALTER TABLE submissions ALTER COLUMN round_id SET NOT NULL');
    await q.query('CREATE INDEX submissions_household_round ON submissions (household_id, round_id)');
  },
  /* 6 — where a village's map position came from: 'osm' (looked up, approximate) or 'manual'.
     Positions before this came only from demo data, so they are not protected. */
  `ALTER TABLE villages ADD COLUMN location_source TEXT;
  `,
];

export async function migrate(db: Db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (n INTEGER PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ n: number }>('SELECT n FROM schema_migrations')).rows.map(r => r.n));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (done.has(i + 1)) continue;
    const m = MIGRATIONS[i];
    await db.tx(async q => {
      if (typeof m === 'function') await m(q);
      else for (const stmt of m.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await q.query(stmt);
      await q.query('INSERT INTO schema_migrations (n) VALUES ($1)', [i + 1]);
    });
  }
}

export async function audit(db: Queryable, user: { id: number; name: string } | null, action: string,
  entity?: string | null, entityId?: string | number | null, detail?: unknown) {
  await db.query('INSERT INTO audit (user_id, user_name, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6)',
    [user?.id ?? null, user?.name ?? 'system', action, entity ?? null, entityId === undefined || entityId === null ? null : String(entityId),
      detail === undefined ? null : JSON.stringify(detail)]);
}
