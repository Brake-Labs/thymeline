CREATE OR REPLACE FUNCTION swap_meal_plan_entries(entry_id_a uuid, entry_id_b uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  date_a date;
  date_b date;
BEGIN
  SELECT planned_date INTO date_a FROM meal_plan_entries WHERE id = entry_id_a FOR UPDATE;
  SELECT planned_date INTO date_b FROM meal_plan_entries WHERE id = entry_id_b FOR UPDATE;

  UPDATE meal_plan_entries SET planned_date = date_b WHERE id = entry_id_a;
  UPDATE meal_plan_entries SET planned_date = date_a WHERE id = entry_id_b;
END;
$$;
