-- Barkada Hub schema. Only "hosts" (verified, non-guest accounts) can create rooms.
create table public.hosts (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.rooms (
  code text primary key,
  host_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.hosts enable row level security;
alter table public.rooms enable row level security;

create function public.is_host() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hosts where user_id = (select auth.uid()))
$$;

-- Any signed-in account with a verified email (or Google) can host. Guests are anonymous and can't.
create function public.claim_host() returns boolean
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

-- Guests check a code without being able to list rooms.
create function public.room_exists(room_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms where code = upper(room_code))
$$;

revoke execute on function public.is_host(), public.claim_host(), public.room_exists(text) from public, anon;
grant execute on function public.is_host(), public.claim_host(), public.room_exists(text) to authenticated;

create policy "host reads own row" on public.hosts
  for select to authenticated using (user_id = (select auth.uid()));

create policy "hosts create rooms" on public.rooms
  for insert to authenticated
  with check (host_id = (select auth.uid()) and public.is_host());
create policy "host reads own rooms" on public.rooms
  for select to authenticated using (host_id = (select auth.uid()));
create policy "host deletes own rooms" on public.rooms
  for delete to authenticated using (host_id = (select auth.uid()));
