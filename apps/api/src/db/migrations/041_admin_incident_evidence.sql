-- Audited incident attachments; object storage remains private and requires signed URLs.
CREATE TABLE IF NOT EXISTS admin_incident_evidence(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id UUID NOT NULL REFERENCES operational_incidents(id) ON DELETE RESTRICT,
 media_object_id UUID NOT NULL REFERENCES media_objects(id) ON DELETE RESTRICT,
 added_by UUID NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL CHECK(length(btrim(reason))>=5),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(incident_id,media_object_id)
);
CREATE INDEX IF NOT EXISTS admin_incident_evidence_incident_idx ON admin_incident_evidence(incident_id,created_at DESC);
