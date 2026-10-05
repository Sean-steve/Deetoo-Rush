-- Legacy API role name is a taxonomy alias; membership is still mandatory. No user grants.
INSERT INTO roles(id,code,name) VALUES(gen_random_uuid(),'merchant','Merchant membership role') ON CONFLICT(code) DO NOTHING;
-- Refuse ambiguous legacy duplicates rather than discarding registrations/sessions.
CREATE UNIQUE INDEX foundation_rider_vehicle ON rider_vehicles(rider_id);
CREATE UNIQUE INDEX foundation_rider_active_session ON rider_availability_sessions(rider_id) WHERE ended_at IS NULL;
-- Legacy deliveries referenced rider user IDs. Translate them to the canonical profile ID.
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_assigned_rider_id_fkey;
UPDATE deliveries d SET assigned_rider_id=r.id FROM rider_profiles r
WHERE d.assigned_rider_id=r.user_id AND NOT EXISTS(SELECT 1 FROM rider_profiles own WHERE own.id=d.assigned_rider_id);
ALTER TABLE deliveries ADD CONSTRAINT deliveries_assigned_rider_id_fkey FOREIGN KEY(assigned_rider_id) REFERENCES rider_profiles(id);
