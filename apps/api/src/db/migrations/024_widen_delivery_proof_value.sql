-- delivery_proofs.proof_value was VARCHAR(255), sized for OTP/CONTACTLESS values only.
-- SIGNATURE proof was consequently storing just options.signature_data.length in metadata
-- instead of the signature itself -- a delivery dispute had no actual evidence to check,
-- only a number (audit-flagged: proof-of-delivery is self-satisfiable). signature_data is
-- capped at 10000 chars at the API boundary (RiderCompleteDeliverySchema); TEXT accommodates
-- that without an artificial ceiling that silently truncates real evidence.
ALTER TABLE delivery_proofs ALTER COLUMN proof_value TYPE TEXT;
