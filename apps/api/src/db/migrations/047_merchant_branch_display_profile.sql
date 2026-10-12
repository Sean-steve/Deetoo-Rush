-- Preserve editable branch display name and description independently of the
-- canonical branch name. Both were present in the approved Merchant UI but
-- previously discarded during Save branch settings.
ALTER TABLE merchant_branches
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description VARCHAR(1000);

UPDATE merchant_branches
SET display_name = name
WHERE display_name IS NULL;
