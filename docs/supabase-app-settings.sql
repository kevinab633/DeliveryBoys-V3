-- Run once in the Supabase SQL editor.
-- Stores app-wide settings (currently the fuel price) shared by all devices.

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- Everyone can read the settings (customers need the price to see fares).
drop policy if exists "app_settings readable" on app_settings;
create policy "app_settings readable" on app_settings
  for select using (true);

-- TEMPORARY: the app does not yet check manager identity on the server, so
-- this lets the app's key write settings. Restrict this policy to managers
-- once Supabase Auth is in place.
drop policy if exists "app_settings writable" on app_settings;
create policy "app_settings writable" on app_settings
  for all using (true) with check (true);
