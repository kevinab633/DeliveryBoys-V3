-- Run once in the Supabase SQL editor (safe to run again).
-- Stores app-wide settings (petrol and diesel prices) shared by all devices.

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- Everyone can read the settings (customers need the prices to see fares).
do $$ begin
  create policy "app_settings readable" on app_settings
    for select using (true);
exception when duplicate_object then null;
end $$;

-- TEMPORARY: the app does not yet check manager identity on the server, so
-- this lets the app's key write settings. Restrict this policy to managers
-- once Supabase Auth is in place.
do $$ begin
  create policy "app_settings writable" on app_settings
    for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
