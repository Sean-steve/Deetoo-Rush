-- Phase 3 hardening: provider callback identity must resolve to exactly one disbursement attempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_disbursement_provider_request
  ON disbursement_attempts(provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;
