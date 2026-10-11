-- Persist optional rider UI preferences without allowing opt-out of safety/dispatch/security alerts.
CREATE TABLE IF NOT EXISTS rider_ui_preferences(
 rider_id UUID PRIMARY KEY REFERENCES rider_profiles(id) ON DELETE RESTRICT,
 preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT rider_ui_preferences_object CHECK(jsonb_typeof(preferences)='object')
);
