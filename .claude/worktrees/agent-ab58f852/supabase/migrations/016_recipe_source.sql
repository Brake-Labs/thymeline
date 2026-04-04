alter table recipes
  add column if not exists source text
    check (source in ('scraped', 'manual', 'generated'))
    default 'manual';
