-- System remedies have a policy actor, not a fabricated privileged user account.
ALTER TABLE refunds ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE refunds ADD CONSTRAINT refund_policy_actor CHECK (
  policy IS NULL OR
  (policy='MANUAL_MAKER_CHECKER' AND requested_by IS NOT NULL AND (approved_at IS NULL OR (approved_by IS NOT NULL AND approved_by<>requested_by))) OR
  (policy='SYSTEM_FULL_REFUND' AND requested_by IS NULL AND approved_at IS NOT NULL)
);
