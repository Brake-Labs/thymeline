-- Fix RLS policies for meal_plans and meal_plan_entries.
-- The original "for all" policy with only a USING clause does not reliably
-- apply to INSERT (which requires WITH CHECK). Replace with explicit per-operation
-- policies that include both USING and WITH CHECK where needed.

DROP POLICY IF EXISTS "owner access meal_plans" ON meal_plans;
DROP POLICY IF EXISTS "owner access meal_plan_entries" ON meal_plan_entries;

CREATE POLICY "meal_plans select"
  ON meal_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "meal_plans insert"
  ON meal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "meal_plans update"
  ON meal_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "meal_plans delete"
  ON meal_plans FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "meal_plan_entries select"
  ON meal_plan_entries FOR SELECT
  USING (
    meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "meal_plan_entries insert"
  ON meal_plan_entries FOR INSERT
  WITH CHECK (
    meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "meal_plan_entries update"
  ON meal_plan_entries FOR UPDATE
  USING (
    meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "meal_plan_entries delete"
  ON meal_plan_entries FOR DELETE
  USING (
    meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid())
  );

-- Remove custom tags that duplicate first-class tags (e.g. Irish, Asian added
-- before the API-level validation existed). These cause duplicate pills in the UI.
DELETE FROM custom_tags
WHERE LOWER(name) IN (
  'comfort','entertain','favorite','garden','gluten-free','grill','healthy',
  'one pot','pizza','quick','seafood','sheet pan','slow cooker',
  'soup','sourdough','spicy','vegetarian',
  'autumn','spring','summer','winter',
  'american','asian','chinese','french','greek','hungarian',
  'indian','irish','italian','japanese','mediterranean','mexican',
  'middle eastern','thai',
  'chicken','beef','pork','sausage','lamb','turkey','shrimp',
  'salmon','fish','tofu','tempeh','seitan','beans','lentils',
  'chickpeas','eggs'
);
