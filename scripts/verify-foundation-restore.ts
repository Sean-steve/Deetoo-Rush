import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const sourceUrl=process.env.SOURCE_DATABASE_URL!, restoredUrl=process.env.RESTORED_DATABASE_URL!;
assert.ok(sourceUrl && restoredUrl && sourceUrl!==restoredUrl, 'Two distinct isolated database URLs are required');
assert.ok(new URL(sourceUrl).pathname.includes('foundation') && new URL(restoredUrl).pathname.includes('foundation'), 'This verification is restricted to foundation test databases');
const source=new pg.Pool({connectionString:sourceUrl}),restored=new pg.Pool({connectionString:restoredUrl});
try {
  const tables=(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
  assert.deepEqual((await restored.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename),tables);
  const checks=[];
  for(const name of tables) {
    assert.match(name,/^[a-z_][a-z_0-9]*$/);
    const sql=`SELECT count(*)::text AS count,md5(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text))) AS digest FROM "${name}" t`;
    const expected=(await source.query(sql)).rows[0],actual=(await restored.query(sql)).rows[0];
    assert.deepEqual(actual,expected,`Restored table mismatch: ${name}`);
    checks.push({table:name,...actual});
  }
  const result={verifiedAt:new Date().toISOString(),restored:true,method:'pg_dump custom archive and pg_restore --exit-on-error into a separate database; every public table count and ordered row digest compared',sourceDatabase:new URL(sourceUrl).pathname.slice(1),restoredDatabase:new URL(restoredUrl).pathname.slice(1),tables:checks};
  await writeFile('docs/foundation-wave-1/restore-verification.json',JSON.stringify(result,null,2)+'\n');
  console.log(`PASS: ${checks.length} restored tables match source counts and row digests`);
} finally {await source.end();await restored.end();}
