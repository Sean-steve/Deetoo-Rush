-- New riders require reviewed evidence; existing accounts retain grandfathered status.
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rider_profiles ALTER COLUMN verification_required SET DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS rider_verification_documents(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
 media_object_id UUID NOT NULL UNIQUE REFERENCES media_objects(id) ON DELETE RESTRICT,
 document_type TEXT NOT NULL CHECK(document_type IN ('NATIONAL_ID_FRONT','NATIONAL_ID_BACK','SELFIE','DRIVING_LICENCE','VEHICLE_INSURANCE','VEHICLE_LOGBOOK')),
 status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
 expires_on DATE,
 rejection_reason TEXT,
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rider_verification_docs_lookup_idx ON rider_verification_documents(rider_id,document_type,created_at DESC);
CREATE TABLE IF NOT EXISTS rider_equipment_reviews(
 rider_id UUID PRIMARY KEY REFERENCES rider_profiles(id) ON DELETE RESTRICT,
 delivery_bag BOOLEAN NOT NULL DEFAULT FALSE,
 reflective_vest BOOLEAN NOT NULL DEFAULT FALSE,
 helmet BOOLEAN NOT NULL DEFAULT FALSE,
 status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
 rejection_reason TEXT,
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
