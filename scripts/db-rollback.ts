// Applied migrations are immutable. No down migrations have a verified data-preserving rollback.
// In particular, deleting schema_migrations does not roll back a schema.
console.error('Rollback refused: no verified down migration. Apply a reviewed forward repair or restore a verified backup; migration history was not changed.');
process.exitCode = 1;
