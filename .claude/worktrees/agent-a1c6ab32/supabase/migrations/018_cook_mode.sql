ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS step_photos jsonb NOT NULL DEFAULT '[]';
-- Shape: [{ "stepIndex": number, "imageUrl": string }]
-- stepIndex is 0-based line index of recipe.steps split by newline
