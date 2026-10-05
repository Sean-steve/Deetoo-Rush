import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getDbPool, closeDbPool } from '../apps/api/src/db/client';

export async function runMigrations(directory = fileURLToPath(new URL('../apps/api/src/db/migrations/', import.meta.url))) {
  const client = await getDbPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('deetoo.schema.migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY, version TEXT NOT NULL UNIQUE, checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
    const files = (await fs.readdir(directory)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await fs.readFile(path.join(directory, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [file]);
      if (rows.length) {
        if (rows[0].checksum && rows[0].checksum !== checksum) throw new Error(`Applied migration checksum changed: ${file}`);
        if (!rows[0].checksum) throw new Error(`Unverified legacy migration checksum: ${file}. Verify the originally applied source before recording a checksum.`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);
        await client.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed: ${file}`, { cause: error });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('deetoo.schema.migrations'))").catch(() => {});
    client.release();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations().catch(error => { console.error(error); process.exitCode=1; }).finally(closeDbPool);
}
