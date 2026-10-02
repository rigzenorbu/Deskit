/**
 * Start the DYESKIT server.
 *
 *   PORT            default 4000
 *   DATABASE_URL    PostgreSQL connection string (unset = embedded PGlite in ./data)
 *   SEED_DEMO       true/false — demo accounts and surveys on first run (default: true locally, false with DATABASE_URL)
 *   ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME   first admin when SEED_DEMO=false
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, migrate } from './db';
import { buildApp } from './app';
import { rescoreOutdated, syncVillages } from './data';
import { seedIfEmpty } from './seed';

// settings from apps/server/.env, if present (a host's dashboard settings take precedence)
const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const db = await openDb();
await migrate(db);
const villages = await syncVillages(db);
const seed = await seedIfEmpty(db);
const rescored = await rescoreOutdated(db);

const app = await buildApp(db, { logger: process.env.NODE_ENV === 'production' });
const port = Number(process.env.PORT || 4000);
await app.listen({ port, host: process.env.HOST || '0.0.0.0' });

console.log(`\n  DYESKIT server  http://localhost:${port}   (database: ${db.kind})`);
if (villages.added) console.log(`  villages: added ${villages.added} from the official list`);
if (villages.archived.length) console.log(`  villages: archived ${villages.archived.join(', ')}`);
if (seed.seeded === 'demo') console.log(`  demo data: ${seed.surveys} surveys — sign in as admin@dyeskit.org / Admin@123`);
if (seed.seeded === 'admin') console.log('  created the first admin account from ADMIN_EMAIL');
if (rescored) console.log(`  rescored ${rescored} surveys with the current scoring version`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { await app.close(); await db.close(); process.exit(0); });
