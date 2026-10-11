-- Self-service Rider contact and emergency records, kept separate from public auth identity.
CREATE TABLE IF NOT EXISTS rider_contact_details(
 rider_id UUID PRIMARY KEY REFERENCES rider_profiles(id) ON DELETE RESTRICT,
 address_text TEXT NOT NULL CHECK(length(btrim(address_text))>=5),
 emergency_contact_name TEXT NOT NULL CHECK(length(btrim(emergency_contact_name))>=3),
 emergency_contact_phone TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
