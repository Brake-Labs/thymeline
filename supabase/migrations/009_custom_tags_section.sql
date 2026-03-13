-- Add section column to custom_tags so each custom tag knows which group it belongs to
ALTER TABLE custom_tags
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'cuisine';
