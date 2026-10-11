-- Rider-owned safety attachments use private, verified objects.
-- Admin/Operations still controls incident investigation and resolution.
CREATE TABLE IF NOT EXISTS rider_incident_evidence (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id UUID NOT NULL REFERENCES operational_incidents(id) ON DELETE RESTRICT,
 media_object_id UUID NOT NULL REFERENCES media_objects(id) ON DELETE RESTRICT,
 added_by UUID NOT NULL REFERENCES users(id),
 description TEXT NOT NULL CHECK(length(btrim(description)) >= 5),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(incident_id,media_object_id)
);
CREATE INDEX IF NOT EXISTS rider_incident_evidence_case_idx ON rider_incident_evidence(incident_id,created_at DESC);
