import { getDbPool, closeDbPool } from '../apps/api/src/db/client';

const email =
  process.argv[2]?.trim().toLowerCase() ||
  process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();

if (!email) {
  throw new Error(
    'Provide an existing admin email: pnpm governance:bootstrap-super-admin admin@example.com',
  );
}

const db = getDbPool();
try {
  const existing = await db.query(
    `SELECT u.id,u.email
     FROM users u
     JOIN user_roles ur ON ur.user_id=u.id
     JOIN roles r ON r.id=ur.role_id
     WHERE r.code='super_admin'
     LIMIT 1`,
  );
  if (existing.rowCount) {
    console.log(`Super Admin already exists: ${existing.rows[0].email || existing.rows[0].id}`);
    process.exitCode = 0;
  } else {
    const target = await db.query(
      `SELECT u.id,u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id=u.id
       JOIN roles r ON r.id=ur.role_id
       WHERE lower(u.email)=lower($1) AND r.code='admin'
       LIMIT 1`,
      [email],
    );
    if (!target.rowCount) {
      throw new Error('Bootstrap target must already exist and hold the admin role');
    }
    const role = await db.query(`SELECT id FROM roles WHERE code='super_admin'`);
    if (!role.rowCount) {
      throw new Error('super_admin role is not installed. Run pnpm db:migrate first.');
    }
    await db.query(
      `INSERT INTO user_roles(user_id,role_id)
       VALUES($1,$2)
       ON CONFLICT(user_id,role_id) DO NOTHING`,
      [target.rows[0].id, role.rows[0].id],
    );
    console.log(`Granted super_admin to ${target.rows[0].email}`);
  }
} finally {
  await closeDbPool();
}
