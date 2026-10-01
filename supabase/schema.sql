-- Dragon Ball Daima Cards: usuarios, colecciones y comparación
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_uq
  on public.profiles (lower(username));

create table if not exists public.collections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_number integer not null check (card_number between 1 and 207),
  variant text not null check (variant in ('basic','crystal','rainbow')),
  owned boolean not null default false,
  duplicates integer not null default 0 check (duplicates >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_number, variant),
  check ((card_number <= 100) or variant = 'basic')
);

alter table public.profiles enable row level security;
alter table public.collections enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Authenticated users can read collections" on public.collections;
create policy "Authenticated users can read collections"
on public.collections for select
to authenticated
using (true);

drop policy if exists "Users can insert own collection" on public.collections;
create policy "Users can insert own collection"
on public.collections for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own collection" on public.collections;
create policy "Users can update own collection"
on public.collections for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own collection" on public.collections;
create policy "Users can delete own collection"
on public.collections for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := nullif(trim(new.raw_user_meta_data->>'username'),'');
  if requested_username is null then
    requested_username := 'usuario-' || left(new.id::text, 8);
  end if;
  insert into public.profiles(id, username)
  values(new.id, requested_username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.collections to authenticated;
