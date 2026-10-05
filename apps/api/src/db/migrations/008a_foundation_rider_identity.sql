-- 009 references rider_profiles.id before providing its required unique constraint.
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE rider_profiles ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_profiles_id ON rider_profiles(id);
