-- Draft only: not applied to LIVE. Save a name only for the caller's linked,
-- verified customer or pending rider profile. Never accept a user ID or role.
create or replace function public.save_signup_name(p_name text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_name text := trim(p_name);
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users a where a.id = auth.uid() and a.email_confirmed_at is not null
  ) then raise exception 'Verified sign-in required' using errcode = '42501'; end if;
  if v_name is null or length(v_name) not between 1 and 120 then
    raise exception 'Name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  update public.users u set name = v_name
  where u.auth_user_id = auth.uid()
    and (u.role = 'customer' or (u.role = 'rider' and u.status = 'pending'));
  if not found then raise exception 'Eligible linked profile required' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.save_signup_name(text) from public, anon;
grant execute on function public.save_signup_name(text) to authenticated;
