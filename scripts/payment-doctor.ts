import { config } from '@deetoo/config';
import { getDbPool, closeDbPool } from '../apps/api/src/db/client';

if (config.storage.mode !== 'postgres') {
  throw new Error('payment:doctor requires PostgreSQL storage');
}

const db = getDbPool();

try {
  const summary = await db.query(`
    SELECT
      (SELECT count(*)::int FROM payments WHERE status IN ('INITIATED','PENDING')) AS unresolved_payments,
      (SELECT count(*)::int FROM payment_commands WHERE status='PENDING') AS pending_commands,
      (SELECT count(*)::int FROM payment_commands WHERE status='RUNNING') AS running_commands,
      (SELECT count(*)::int FROM payment_commands WHERE status='REVIEW') AS review_commands
  `);

  console.log('DeeToo payment diagnostics');
  console.log(JSON.stringify({
    environment: config.environment,
    storageMode: config.storage.mode,
    localWorkflow: config.localWorkflow,
    ...summary.rows[0],
  }, null, 2));

  const recent = await db.query(`
    SELECT
      p.id AS payment_id,
      p.status AS payment_status,
      p.provider,
      p.provider_payment_id,
      p.captured_minor,
      o.id AS order_id,
      o.status AS order_status,
      c.id AS command_id,
      c.kind,
      c.status AS command_status,
      c.attempts,
      c.last_error,
      c.available_at,
      c.created_at AS command_created_at
    FROM payments p
    JOIN orders o ON o.id=p.order_id
    LEFT JOIN payment_commands c ON c.payment_id=p.id
    WHERE p.status IN ('INITIATED','PENDING')
       OR c.status IN ('PENDING','RUNNING','REVIEW')
    ORDER BY COALESCE(c.created_at,p.created_at) DESC
    LIMIT 30
  `);

  if (!recent.rows.length) {
    console.log('No unresolved payment work found.');
  } else {
    console.table(recent.rows);
  }

  if (!config.localWorkflow) {
    console.warn('DEETOO_LOCAL_WORKFLOW is false. Local synthetic payments will not be used.');
  }

  const reviewErrors = recent.rows
    .filter((row) => row.command_status === 'REVIEW')
    .map((row) => row.last_error)
    .filter(Boolean);
  if (reviewErrors.length) {
    console.warn('Commands in REVIEW require attention:', [...new Set(reviewErrors)]);
  }
} finally {
  await closeDbPool();
}
