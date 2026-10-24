-- Run once in the Supabase SQL editor (after supabase-app-settings.sql).
-- Adds the rider commission columns used by the rider and manager screens.

alter table users add column if not exists commission_settled_at timestamptz;
alter table users add column if not exists commission_payment_request jsonb;
