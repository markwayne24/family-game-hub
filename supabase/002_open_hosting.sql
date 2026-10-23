-- Run once on an existing database (SQL editor) to let every verified account host, not just the first one.
-- New databases get this from migration.sql.
create or replace function public.claim_host() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    return false;
  end if;
  insert into public.hosts (user_id) values (auth.uid()) on conflict do nothing;
  return true;
end $$;
