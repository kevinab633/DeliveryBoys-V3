-- DRAFT ONLY. Not applied. A caller may see only their own pending application.
create function public.my_pending_step2_rider_user_id() returns text
language sql stable security definer set search_path=pg_catalog as $$
  select a.app_user_id from deliveryboys_private.step2_rider_applications a
  join public.users u on u.id=a.app_user_id and u.auth_user_id=a.auth_user_id
  where a.auth_user_id=auth.uid() and a.status='pending'
    and exists (select 1 from auth.users au where au.id=auth.uid() and au.email_confirmed_at is not null);
$$;
revoke all on function public.my_pending_step2_rider_user_id() from public,anon;
grant execute on function public.my_pending_step2_rider_user_id() to authenticated;
