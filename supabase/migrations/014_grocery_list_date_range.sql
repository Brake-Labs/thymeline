alter table grocery_lists
  add column if not exists date_from date,
  add column if not exists date_to   date;
