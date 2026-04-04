alter table user_preferences
  add constraint if not exists user_preferences_user_id_unique
  unique (user_id);
