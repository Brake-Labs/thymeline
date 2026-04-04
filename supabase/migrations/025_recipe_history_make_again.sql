ALTER TABLE recipe_history
  ADD COLUMN IF NOT EXISTS make_again boolean;
  -- null = not answered, true = make again, false = not for us
