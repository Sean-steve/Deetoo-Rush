/**
 * Read-only migration diagnosis. Connects to the API's configured DATABASE_URL
 * but never creates tables or modifies migration history.
 */
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getDbPool, closeDbPool } from "../apps/api/src/db/client";

async function inspect() {
  const db = getDbPool();
  const result = await db.query(
    "SELECT to_regclass('schema_migrations') AS history_table, to_regclass('merchant_branch_policies') AS policies_table",
  );
  const {history_table,policies_table}=result.rows[0];
  const known=(await fs.readdir(fileURLToPath(new URL("../apps/api/src/db/migrations/",import.meta.url))))
    .filter(file=>file.endsWith(".sql")).sort();
  const applied: {version:string;checksum:string|null}[] = history_table
    ? (await db.query("SELECT version, checksum FROM schema_migrations")).rows
    : [];
  const recorded = new Set(applied.map(row=>row.version));
  const pending=known.filter(version=>!recorded.has(version));
  const unverified=applied.filter(row=>!row.checksum).map(row=>row.version);
  const policyMigration=applied.find(row=>row.version==="035_merchant_experience_capabilities.sql");
  console.log("DeeToo database schema status — read-only, using API DATABASE_URL");
  console.log(`Applied: ${applied.length} / ${known.length}; pending: ${pending.length}`);
  console.log(`Merchant migration 035: ${policyMigration?.checksum?"recorded and verified":"missing or unverified"}`);
  console.log(`merchant_branch_policies: ${policies_table?"present":"MISSING"}`);
  if(pending.length)console.log("Pending: "+pending.join(", "));
  if(unverified.length)console.log("Unverified checksums: "+unverified.join(", "));
  if(pending.length || unverified.length || !policies_table || !policyMigration?.checksum) {
    console.error("Database requires a reviewed migration/repair. Back up first, then run: pnpm db:migrate");
    process.exitCode=1;
  }else console.log("Migration state and required Merchant policy table are present.");
}
inspect().catch(error=>{
  console.error("Unable to inspect database:",error instanceof Error?error.message:String(error));
  process.exitCode=1;
}).finally(async()=>{await closeDbPool();});
